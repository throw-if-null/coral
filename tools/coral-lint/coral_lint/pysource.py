"""Crosscut: exact Python facts, via the AST.

Every check that inspects code content goes through here. The point is
precision: a regex for "reads the environment" also matches the word `environ`
in a comment, and one false positive on a blocking gate teaches everyone to pass
`--no-verify`. So these helpers parse, and where they cannot be exact they return
nothing rather than guessing.
"""

from __future__ import annotations

import ast
import re
from dataclasses import dataclass
from pathlib import Path

# Deliberately DML only. DDL is excluded because a slice legitimately owns its
# own CREATE TABLE under [STATE-5], and flagging that would punish conformance.
_SQL_WRITE = re.compile(
    r"\b(insert\s+into|insert\s+or\s+\w+\s+into|update\s+\w|delete\s+from|"
    r"replace\s+into|upsert\b|merge\s+into|truncate\s+table)\b",
    re.IGNORECASE,
)

_MUTABLE_FACTORIES = frozenset({
    "list", "dict", "set", "defaultdict", "OrderedDict", "deque", "Counter", "ChainMap",
})
_MUTATING_METHODS = frozenset({
    "append", "extend", "insert", "add", "update", "pop", "clear",
    "setdefault", "remove", "discard", "popitem", "sort",
})
# Precise enough to gate on. Broader mutation reached through several calls is a
# [review] concern by [IDEM-2]'s own wording, not something to guess at here.
_WRITE_METHODS = frozenset({"commit", "save", "executescript"})


@dataclass(frozen=True)
class Hit:
    """One located fact about a source file."""

    label: str
    line: int


def parse(path: Path) -> ast.Module | None:
    """Parse a Python file, or return None if it is not parseable Python.

    A syntax error is the repo's problem to report, not this tool's to crash on.
    """
    try:
        return ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
    except (SyntaxError, UnicodeDecodeError, OSError):
        return None


def _dotted(node: ast.expr) -> str | None:
    parts: list[str] = []
    while isinstance(node, ast.Attribute):
        parts.append(node.attr)
        node = node.value
    if isinstance(node, ast.Name):
        parts.append(node.id)
        return ".".join(reversed(parts))
    return None


def module_level_state(tree: ast.Module) -> list[Hit]:
    """Module-level names that are both mutable and actually mutated.  [CONC-1]

    Both halves are required. A module-level `ROUTES = {...}` that nobody mutates
    is a constant and not a finding; a `_CACHE = {}` that a function writes into
    is cross-trigger state. Testing only for a mutable literal would flag every
    lookup table in the repo.
    """
    candidates: dict[str, int] = {}
    for node in tree.body:
        targets: list[ast.expr] = []
        value: ast.expr | None = None
        if isinstance(node, ast.Assign):
            targets, value = list(node.targets), node.value
        elif isinstance(node, ast.AnnAssign):
            targets, value = [node.target], node.value
        for target in targets:
            if not isinstance(target, ast.Name) or value is None:
                continue
            mutable = isinstance(value, (ast.List, ast.Dict, ast.Set, ast.ListComp, ast.DictComp, ast.SetComp))
            if isinstance(value, ast.Call):
                name = _dotted(value.func) or ""
                mutable = mutable or name.split(".")[-1] in _MUTABLE_FACTORIES
            if mutable:
                candidates.setdefault(target.id, target.lineno)

    scalars: dict[str, int] = {}
    for node in tree.body:
        if isinstance(node, ast.Assign):
            for target in node.targets:
                if isinstance(target, ast.Name):
                    scalars.setdefault(target.id, target.lineno)

    mutated: set[str] = set()
    for node in ast.walk(tree):
        # `global x` inside a function is unambiguous cross-call state.
        if isinstance(node, ast.Global):
            mutated.update(node.names)
        elif isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute):
            if node.func.attr in _MUTATING_METHODS and isinstance(node.func.value, ast.Name):
                mutated.add(node.func.value.id)
        elif isinstance(node, ast.AugAssign) and isinstance(node.target, ast.Name):
            mutated.add(node.target.id)
        elif isinstance(node, ast.Assign):
            for target in node.targets:
                if isinstance(target, ast.Subscript) and isinstance(target.value, ast.Name):
                    mutated.add(target.value.id)

    hits = [Hit(name, line) for name, line in candidates.items() if name in mutated]
    hits += [
        Hit(name, line) for name, line in scalars.items()
        if name in mutated and name not in candidates
    ]
    return sorted(hits, key=lambda h: h.line)


def ambient_config_uses(tree: ast.Module) -> list[Hit]:
    """Reads of process environment or config files.  [CONFIG-2]"""
    hits: list[Hit] = []
    bare_environ = False

    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                top = alias.name.split(".")[0]
                if top in {"dotenv", "configparser"}:
                    hits.append(Hit(f"import {alias.name}", node.lineno))
        elif isinstance(node, ast.ImportFrom):
            module = node.module or ""
            top = module.split(".")[0]
            if top in {"dotenv", "configparser"}:
                hits.append(Hit(f"from {module} import ...", node.lineno))
            if module == "os":
                for alias in node.names:
                    if alias.name in {"environ", "getenv"}:
                        bare_environ = True
                        hits.append(Hit(f"from os import {alias.name}", node.lineno))
        elif isinstance(node, ast.Attribute):
            dotted = _dotted(node)
            if dotted in {"os.environ", "os.getenv", "os.environb", "os.putenv"}:
                hits.append(Hit(dotted, node.lineno))
        elif isinstance(node, ast.Name) and bare_environ and node.id in {"environ", "getenv"}:
            if isinstance(getattr(node, "ctx", None), ast.Load):
                hits.append(Hit(f"os.{node.id}", node.lineno))

    unique: dict[tuple[str, int], Hit] = {(h.label, h.line): h for h in hits}
    return sorted(unique.values(), key=lambda h: (h.line, h.label))


def write_evidence(tree: ast.Module) -> list[Hit]:
    """Evidence that this module mutates state.  [IDEM-2]"""
    hits: list[Hit] = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Constant) and isinstance(node.value, str):
            if _REGEX_SOURCE.search(node.value):
                continue  # a pattern about SQL, not SQL
            match = _SQL_WRITE.search(node.value)
            if match:
                hits.append(Hit(f"SQL {match.group(0).upper()}", node.lineno))
        elif isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute):
            if node.func.attr in _WRITE_METHODS:
                hits.append(Hit(f".{node.func.attr}()", node.lineno))
    unique: dict[tuple[str, int], Hit] = {(h.label, h.line): h for h in hits}
    return sorted(unique.values(), key=lambda h: (h.line, h.label))


# Shape-based, so prose cannot match: "select the right option" has no FROM after
# it, and every branch demands real whitespace where SQL has real whitespace.
# Broader than _SQL_WRITE because a module full of SELECTs is still a shared query
# layer under [STATE-2].
_SQL_ANY = re.compile(
    r"\binsert\s+into\s|\bdelete\s+from\s|\bupdate\s+\w+\s+set\s|\breplace\s+into\s"
    r"|\bupsert\s|\bmerge\s+into\s|\bselect\s[\s\S]{0,300}?\sfrom\s",
    re.IGNORECASE,
)

# A string carrying regex metacharacters is a *pattern*, not a statement. Without
# this guard, any module that processes SQL rather than executing it — a linter, a
# query builder, a migration tool — reads as a data-access layer. This tool's own
# pysource.py was the first false positive it produced, which is the argument for
# running a checker against itself.
_REGEX_SOURCE = re.compile(r"\\[bBsSdDwWA]|\(\?[:aiLmsux#=!<]|\[\\[sSdDwW]")


@dataclass(frozen=True)
class ImportRef:
    """One import, unresolved. Resolution needs layout, so it happens in the check."""

    module: str | None  # dotted module for `from X import ...`; None for `from . import ...`
    level: int  # 0 absolute, 1 `.`, 2 `..`
    names: tuple[str, ...]
    line: int


def imports(tree: ast.Module) -> list[ImportRef]:
    refs: list[ImportRef] = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                refs.append(ImportRef(alias.name, 0, (), node.lineno))
        elif isinstance(node, ast.ImportFrom):
            refs.append(
                ImportRef(node.module, node.level, tuple(a.name for a in node.names), node.lineno)
            )
    return sorted(refs, key=lambda r: r.line)


# How a raise site came by the name it spells.  [ERR-2]
IMPORTED = "imported"      # one definite import binding reaches the raise
LOCAL_DEF = "local_def"    # a `def` or `class` of that name shadows it
REBOUND = "rebound"        # a parameter, assignment or other rebinding shadows it
AMBIGUOUS = "ambiguous"    # more than one binding could reach the raise
UNBOUND = "unbound"        # nothing in scope binds it


@dataclass(frozen=True)
class Constructor:
    """One `raise X(...)`, with the provenance of the name it spells.

    The call node carries a spelling; the taxonomy is declared in terms of where
    the constructor lives. `from b_errors import validation` then
    `raise validation(...)` spells one word, and the part that says it came from
    `b_errors` is in the `ImportFrom`. So provenance is resolved here, with the
    rest of the AST facts, rather than in each check.

    Resolution is **lexical and in source order**, because Python is both. An
    import inside another function binds nothing at this raise site; a local `def`,
    a parameter or an assignment shadows one that would otherwise be visible; an
    import written *after* the raise has not run yet; and a name imported
    differently on two branches is not one identity. Anything that is not a single
    definite binding at the raise is AMBIGUOUS rather than a guess.

    `level` and `module` are kept unreduced for relative imports. `from .errors`
    and `from ...errors` spell the same canonical `errors.validation` and can name
    different packages, so the caller — which has the repository layout — resolves
    the path and decides whether it stayed inside the owning unit.
    """

    label: str              # as spelled: "validation", "errors.validation"
    line: int
    origin: str
    target: str = ""        # canonical spelling when IMPORTED: "a_errors.validation"
    level: int = 0          # relative-import depth; 0 for absolute
    module: str | None = None   # the `from X import` module; None for `from . import x`
    attr: str | None = None     # the imported attribute, for `from X import n`
    star: bool = False      # a star import could have supplied this name


@dataclass(frozen=True)
class _Bound:
    kind: str
    target: str = ""
    level: int = 0
    module: str | None = None
    attr: str | None = None


_AMBIGUOUS_BOUND = _Bound(AMBIGUOUS)
_SCOPES = (ast.FunctionDef, ast.AsyncFunctionDef, ast.Lambda, ast.ClassDef)


@dataclass(frozen=True)
class _Frame:
    """One enclosing scope's summary, and whether it is a class body."""

    names: dict[str, _Bound]
    star: bool
    is_class: bool


class _State:
    """Binding state at one point in one scope, carried forward in source order."""

    __slots__ = ("names", "star")

    def __init__(self, names: dict[str, _Bound] | None = None, star: bool = False) -> None:
        self.names = dict(names or {})
        self.star = star

    def copy(self) -> "_State":
        return _State(self.names, self.star)

    def bind(self, name: str, bound: _Bound) -> None:
        self.names[name] = bound

    def go_star(self) -> None:
        """A `from X import *` ran here.

        It rebinds whatever that module exports, and the AST does not say what
        that is. So every name this scope had bound might now be something else,
        and a name it never bound might now exist.
        """
        self.star = True
        self.names = {n: _AMBIGUOUS_BOUND for n in self.names}


def _merge(states: list[_State]) -> _State:
    """Join branch outcomes conservatively.

    Agreement survives; disagreement degrades to AMBIGUOUS. A name bound on some
    paths and not others is ambiguous too, because the raise might see the outer
    scope's binding instead. This is deliberately not data-flow analysis — it does
    not need to be, since the only alternative to "one definite identity" is "do
    not answer".
    """
    merged = _State(star=any(s.star for s in states))
    every: set[str] = set()
    for state in states:
        every.update(state.names)
    for name in every:
        values = [s.names.get(name) for s in states]
        first = values[0]
        merged.names[name] = first if first is not None and all(v == first for v in values) else _AMBIGUOUS_BOUND
    return merged


def _targets(node: ast.expr, state: _State) -> None:
    """Bind every plain name an assignment target introduces."""
    if isinstance(node, ast.Name):
        state.bind(node.id, _Bound(REBOUND))
    elif isinstance(node, (ast.Tuple, ast.List)):
        for element in node.elts:
            _targets(element, state)
    elif isinstance(node, ast.Starred):
        _targets(node.value, state)


def _params(scope: ast.AST, state: _State) -> None:
    if not isinstance(scope, (ast.FunctionDef, ast.AsyncFunctionDef, ast.Lambda)):
        return
    args = scope.args
    for arg in [*args.posonlyargs, *args.args, *args.kwonlyargs]:
        state.bind(arg.arg, _Bound(REBOUND))
    for optional in (args.vararg, args.kwarg):
        if optional is not None:
            state.bind(optional.arg, _Bound(REBOUND))


def _import_binds(node: ast.Import | ast.ImportFrom, state: _State) -> None:
    if isinstance(node, ast.Import):
        for alias in node.names:
            local = alias.asname or alias.name.split(".")[0]
            target = alias.name if alias.asname else alias.name.split(".")[0]
            state.bind(local, _Bound(IMPORTED, target=target, module=alias.name))
        return
    base = node.module or ""
    for alias in node.names:
        if alias.name == "*":
            state.go_star()
            continue
        local = alias.asname or alias.name
        target = f"{base}.{alias.name}" if base else alias.name
        state.bind(
            local,
            _Bound(IMPORTED, target=target, level=node.level, module=node.module, attr=alias.name),
        )


def _lookup(head: str, state: _State, chain: list[_Frame]) -> tuple[_Bound | None, bool]:
    star = state.star or any(frame.star for frame in chain)
    if head in state.names:
        return state.names[head], star
    for frame in reversed(chain):
        if head in frame.names:
            return frame.names[head], star
    return None, star


def raised_constructors(tree: ast.Module) -> list[Constructor]:
    """Every `raise <Something>(...)`, with the provenance of its name.  [ERR-2]

    A bare `raise` (re-raise) and `raise` of a caught name are not new errors, so
    they are not reported.
    """
    out: list[Constructor] = []

    def record(node: ast.Raise, state: _State, chain: list[_Frame]) -> None:
        if not isinstance(node.exc, ast.Call):
            return
        label = _dotted(node.exc.func)
        if not label:
            return
        bound, star = _lookup(label.partition(".")[0], state, chain)
        if bound is None:
            out.append(Constructor(label, node.lineno, UNBOUND, star=star))
        elif bound.kind == IMPORTED:
            rest = label.partition(".")[2]
            target = f"{bound.target}.{rest}" if rest else bound.target
            out.append(Constructor(
                label, node.lineno, IMPORTED, target=target, level=bound.level,
                module=bound.module, attr=bound.attr, star=star,
            ))
        else:
            out.append(Constructor(label, node.lineno, bound.kind, star=star))

    def run_scope(scope: ast.AST, chain: list[_Frame], is_class: bool) -> None:
        """Walk one scope in source order, then descend into the scopes it defines.

        Nested scopes are visited afterwards, against a summary of this one: a
        closure runs later, so it sees whatever this scope ended up binding, and a
        name this scope bound more than once is not one identity by then.
        """
        state = _State()
        _params(scope, state)
        nested: list[ast.AST] = []
        multi: set[str] = set()

        def bind_watched(name: str, bound: _Bound) -> None:
            if name in state.names and state.names[name] != bound:
                multi.add(name)
            state.bind(name, bound)

        def step(node: ast.AST, state: _State) -> _State:
            """Apply one statement, returning the state that follows it."""
            if isinstance(node, (ast.Import, ast.ImportFrom)):
                before = dict(state.names)
                _import_binds(node, state)
                for name, bound in state.names.items():
                    if name in before and before[name] != bound:
                        multi.add(name)
                return state
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
                for decorator in node.decorator_list:
                    walk_expr(decorator, state)
                bind_watched(node.name, _Bound(LOCAL_DEF))
                nested.append(node)
                return state
            if isinstance(node, ast.Assign):
                walk_expr(node.value, state)
                for target in node.targets:
                    _targets(target, state)
                return state
            if isinstance(node, (ast.AnnAssign, ast.AugAssign)):
                if node.value is not None:
                    walk_expr(node.value, state)
                _targets(node.target, state)
                return state
            if isinstance(node, (ast.Global, ast.Nonlocal)):
                for name in node.names:
                    state.bind(name, _Bound(REBOUND))
                return state
            if isinstance(node, ast.Raise):
                record(node, state, chain)
                walk_expr(node, state, skip_raise=True)
                return state
            if isinstance(node, ast.If):
                taken, other = state.copy(), state.copy()
                walk_expr(node.test, state)
                return _merge([run_block(node.body, taken), run_block(node.orelse, other)])
            if isinstance(node, (ast.For, ast.AsyncFor)):
                walk_expr(node.iter, state)
                looped = state.copy()
                _targets(node.target, looped)
                # The body may run zero times, so the state before it also reaches
                # whatever follows.
                after = _merge([state.copy(), run_block(node.body, looped)])
                return _merge([after, run_block(node.orelse, after.copy())])
            if isinstance(node, ast.While):
                walk_expr(node.test, state)
                after = _merge([state.copy(), run_block(node.body, state.copy())])
                return _merge([after, run_block(node.orelse, after.copy())])
            if isinstance(node, (ast.With, ast.AsyncWith)):
                for item in node.items:
                    walk_expr(item.context_expr, state)
                    if item.optional_vars is not None:
                        _targets(item.optional_vars, state)
                return run_block(node.body, state)
            if isinstance(node, ast.Try) or (
                hasattr(ast, "TryStar") and isinstance(node, ast.TryStar)
            ):
                # Any statement in the body may be where it failed, so a handler
                # sees somewhere between none and all of the body's bindings.
                after_body = run_block(node.body, state.copy())
                outcomes = [_merge([state.copy(), after_body])]
                for handler in node.handlers:
                    caught = _merge([state.copy(), after_body])
                    if handler.name:
                        caught.bind(handler.name, _Bound(REBOUND))
                    outcomes.append(run_block(handler.body, caught))
                outcomes.append(run_block(node.orelse, after_body.copy()))
                joined = _merge(outcomes)
                return run_block(node.finalbody, joined)
            if hasattr(ast, "Match") and isinstance(node, ast.Match):
                walk_expr(node.subject, state)
                arms = [run_block(case.body, state.copy()) for case in node.cases]
                return _merge([state.copy(), *arms]) if arms else state
            walk_expr(node, state)
            return state

        def run_block(stmts: list[ast.stmt], state: _State) -> _State:
            for stmt in stmts:
                state = step(stmt, state)
            return state

        def walk_expr(node: ast.AST, state: _State, skip_raise: bool = False) -> None:
            """Catch raises and nested scopes inside an expression or statement."""
            for child in ast.iter_child_nodes(node):
                if isinstance(child, _SCOPES):
                    if isinstance(child, ast.Lambda):
                        nested.append(child)
                    continue
                if isinstance(child, ast.Raise) and not skip_raise:
                    record(child, state, chain)
                walk_expr(child, state)

        final = run_block(list(getattr(scope, "body", [])), state) if not isinstance(scope, ast.Lambda) else state
        if isinstance(scope, ast.Lambda):
            walk_expr(scope, state)

        summary = _Frame(
            names={
                name: (_AMBIGUOUS_BOUND if name in multi else bound)
                for name, bound in final.names.items()
            },
            star=final.star,
            is_class=is_class,
        )
        # A function defined in a class body does not see the class namespace, but
        # does see every scope outside it — a method may close over the function a
        # class was defined in. Class bodies do not nest into each other either, so
        # one filter over the whole chain, this scope's own frame included, is the
        # rule on both paths.
        visible = [frame for frame in [*chain, summary] if not frame.is_class]
        for child in nested:
            run_scope(child, visible, isinstance(child, ast.ClassDef))

    run_scope(tree, [], False)
    return sorted(out, key=lambda c: c.line)


def sql_literals(tree: ast.Module) -> list[Hit]:
    """String constants that are SQL statements, read or write."""
    hits: list[Hit] = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Constant) and isinstance(node.value, str):
            if _REGEX_SOURCE.search(node.value):
                continue
            match = _SQL_ANY.search(node.value)
            if match:
                verb = match.group(0).split()[0].upper()
                hits.append(Hit(f"SQL {verb}", node.lineno))
    unique: dict[tuple[str, int], Hit] = {(h.label, h.line): h for h in hits}
    return sorted(unique.values(), key=lambda h: (h.line, h.label))


_IO_CALLS = frozenset({"open", "input"})
_IO_PREFIXES = (
    "subprocess.", "socket.", "requests.", "urllib.", "http.client.",
    "os.system", "os.popen", "shutil.copy", "shutil.rmtree", "pathlib.Path.write",
)

_CONSOLE_CALLS = frozenset({
    "print",
    "sys.stdout.write", "sys.stderr.write",
    "sys.stdout.writelines", "sys.stderr.writelines",
    "sys.stdout.flush", "sys.stderr.flush",
})
_CONSOLE_STREAMS = frozenset({"sys.stdout", "sys.stderr"})
_GLOBAL_HANDLER_CALLS = frozenset({
    "logging.basicConfig", "logging.disable", "logging.captureWarnings",
    "signal.signal", "signal.setitimer", "signal.alarm",
    "sys.settrace", "sys.setprofile", "sys.setrecursionlimit",
    "atexit.register", "faulthandler.enable",
    "warnings.filterwarnings", "warnings.simplefilter", "warnings.resetwarnings",
    "locale.setlocale",
})
_GLOBAL_HANDLER_TARGETS = frozenset({
    "sys.excepthook", "sys.unraisablehook", "sys.displayhook", "logging.root",
})


def _is_guard(node: ast.stmt) -> bool:
    """`if __name__ == "__main__":` and `if TYPE_CHECKING:` do not run on a plain import."""
    if not isinstance(node, ast.If):
        return False
    test = node.test
    if isinstance(test, ast.Compare) and isinstance(test.left, ast.Name):
        return test.left.id == "__name__"
    if isinstance(test, ast.Name):
        return test.id == "TYPE_CHECKING"
    if isinstance(test, ast.Attribute):
        return test.attr == "TYPE_CHECKING"
    return False


def _io_label(name: str) -> str | None:
    if name in _IO_CALLS:
        return f"{name}()"
    if any(name.startswith(prefix) for prefix in _IO_PREFIXES):
        return f"{name}()"
    return None


def import_time_effects(tree: ast.Module) -> list[Hit]:
    """Work a plain `import` would perform.  [LIB-3]

    Two exact signals. A **discarded call** at module level — `logging.basicConfig()`,
    `register(...)` — was evaluated for its effect by definition, since its value goes
    nowhere. And an **I/O call** outside any function body runs when the module is
    imported rather than when the consumer asks for it.

    Function and class bodies are skipped: code there runs on call, not on import.
    """
    hits: list[Hit] = []
    for node in tree.body:
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            continue
        if _is_guard(node):
            continue

        if isinstance(node, ast.Expr) and isinstance(node.value, ast.Call):
            name = _dotted(node.value.func) or "<call>"
            hits.append(Hit(f"{name}() at import time", node.lineno))
            continue

        for inner in ast.walk(node):
            if not isinstance(inner, ast.Call):
                continue
            label = _io_label(_dotted(inner.func) or "")
            if label:
                hits.append(Hit(f"{label} at import time", inner.lineno))

    unique: dict[tuple[str, int], Hit] = {(h.label, h.line): h for h in hits}
    return sorted(unique.values(), key=lambda h: (h.line, h.label))


def console_and_global_handlers(tree: ast.Module) -> list[Hit]:
    """Console writes and process-wide handler installs.  [LIB-5]"""
    hits: list[Hit] = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Call):
            name = _dotted(node.func) or ""
            if name in _CONSOLE_CALLS:
                hits.append(Hit(name, node.lineno))
            elif name in _GLOBAL_HANDLER_CALLS:
                hits.append(Hit(name, node.lineno))
            elif node.func is not None and isinstance(node.func, ast.Attribute):
                receiver = _dotted(node.func.value) or ""
                if node.func.attr in {"addHandler", "removeHandler"} and receiver.startswith("logging"):
                    hits.append(Hit(f"logging {node.func.attr}", node.lineno))
        elif isinstance(node, ast.Attribute):
            name = _dotted(node)
            if name in _CONSOLE_STREAMS:
                hits.append(Hit(name, node.lineno))
            elif name in _GLOBAL_HANDLER_TARGETS:
                hits.append(Hit(name, node.lineno))

    unique: dict[tuple[str, int], Hit] = {(h.label, h.line): h for h in hits}
    return sorted(unique.values(), key=lambda h: (h.line, h.label))


def raised_types(tree: ast.Module) -> list[Hit]:
    """Every `raise <Something>(...)`, as a dotted name.  [ERR-2]

    A bare `raise` (re-raise) and `raise` of a caught name are not new errors, so
    they are not reported.
    """
    hits: list[Hit] = []
    for node in ast.walk(tree):
        if not isinstance(node, ast.Raise) or node.exc is None:
            continue
        exc = node.exc
        if isinstance(exc, ast.Call):
            dotted = _dotted(exc.func)
            if dotted:
                hits.append(Hit(dotted, node.lineno))
    return sorted(hits, key=lambda h: h.line)
