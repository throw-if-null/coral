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
from dataclasses import dataclass, field
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
LOCAL_UNSET = "local_unset"  # a function local, not yet given a value at this point
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

    Function locals are decided at **compile** time, not by execution order, and
    that is a separate fact from which binding has run. A name assigned or imported
    anywhere in a function body is local to the whole of it, so a raise above that
    statement reads an unset local — `UnboundLocalError` — rather than the module's
    binding of the same name. LOCAL_UNSET is that case, and it is deliberately not
    resolved to the enclosing scope.

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


def _pattern_names(pattern: ast.AST | None) -> set[str]:
    """Names a `match` pattern captures.

    A capture is an ordinary local binding holding arbitrary runtime data, so it
    never carries a constructor identity. Every nesting form can capture, not just
    `case x:` — `case [a, *rest]`, `case {"k": v, **rest}`, `case C(x, attr=y)` and
    `case a | b` all bind through their sub-patterns.
    """
    if pattern is None:
        return set()
    found: set[str] = set()
    stack: list[ast.AST] = [pattern]
    while stack:
        node = stack.pop()
        name = getattr(node, "name", None)
        if isinstance(node, (ast.MatchAs, ast.MatchStar)) and isinstance(name, str):
            found.add(name)
        rest = getattr(node, "rest", None)
        if isinstance(node, ast.MatchMapping) and isinstance(rest, str):
            found.add(rest)
        stack.extend(ast.iter_child_nodes(node))
    return found


def _deleted_names(node: ast.Delete) -> set[str]:
    """Plain names a `del` unbinds.

    `del holder.attr` and `del holder[key]` touch an object, not a name, so the
    head is neither newly local nor unbound by them.
    """
    found: set[str] = set()
    stack: list[ast.expr] = list(node.targets)
    while stack:
        target = stack.pop()
        if isinstance(target, ast.Name):
            found.add(target.id)
        elif isinstance(target, (ast.Tuple, ast.List)):
            stack.extend(target.elts)
    return found


def _local_names(scope: ast.AST) -> set[str]:
    """Names Python makes local to this function, whatever the execution order.

    The compile-time rule, not the runtime one: binding a name anywhere in a
    function body makes it local to all of it, so a read above that statement is an
    unset local rather than the enclosing scope's binding. Names declared `global`
    or `nonlocal` are explicitly not local and are removed.

    Deliberately not a symbol table. It covers the binding forms this resolver
    already models — assignment, import, `def`/`class`, loop and `with` targets,
    `except ... as`, `del`, and `match` captures — and it is used only to stop a
    fall-through, never to claim an identity.
    """
    names: set[str] = set()
    declared: set[str] = set()

    def targets(node: ast.expr) -> None:
        if isinstance(node, ast.Name):
            names.add(node.id)
        elif isinstance(node, (ast.Tuple, ast.List)):
            for element in node.elts:
                targets(element)
        elif isinstance(node, ast.Starred):
            targets(node.value)

    stack: list[ast.AST] = list(getattr(scope, "body", []))
    while stack:
        node = stack.pop()
        if isinstance(node, ast.Import):
            for alias in node.names:
                names.add(alias.asname or alias.name.split(".")[0])
        elif isinstance(node, ast.ImportFrom):
            for alias in node.names:
                if alias.name != "*":
                    names.add(alias.asname or alias.name)
        elif isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            names.add(node.name)
            continue  # its body binds its own scope, not this one
        elif isinstance(node, ast.Lambda):
            continue
        elif isinstance(node, ast.Assign):
            for target in node.targets:
                targets(target)
        elif isinstance(node, (ast.AnnAssign, ast.AugAssign, ast.NamedExpr)):
            targets(node.target)
        elif isinstance(node, (ast.For, ast.AsyncFor)):
            targets(node.target)
        elif isinstance(node, (ast.With, ast.AsyncWith)):
            for item in node.items:
                if item.optional_vars is not None:
                    targets(item.optional_vars)
        elif isinstance(node, ast.ExceptHandler) and node.name:
            names.add(node.name)
        elif isinstance(node, ast.Delete):
            # `del x` makes `x` local too, and leaves it unbound from that point.
            names.update(_deleted_names(node))
        elif hasattr(ast, "match_case") and isinstance(node, ast.match_case):
            names.update(_pattern_names(node.pattern))
        elif isinstance(node, (ast.Global, ast.Nonlocal)):
            declared.update(node.names)
        stack.extend(ast.iter_child_nodes(node))
    return names - declared


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


def _lookup(
    head: str, state: _State, chain: list[_Frame], locals_: frozenset[str]
) -> tuple[_Bound | None, bool]:
    star = state.star or any(frame.star for frame in chain)
    if head in state.names:
        return state.names[head], star
    # A function local with no value yet is not the enclosing scope's name. Reading
    # it raises UnboundLocalError, so falling through to an outer frame would
    # resolve to a binding this code can never see.
    if head in locals_:
        return _Bound(LOCAL_UNSET), star
    for frame in reversed(chain):
        if head in frame.names:
            return frame.names[head], star
    return None, star


@dataclass
class _Flow:
    """How a block can leave, and what a handler could have seen inside it.

    `normal` is None where the block cannot fall through — every path ended in
    `break`, `continue`, `return` or `raise`. `brk` and `cont` carry the state at
    those exits, because the statement after the loop sees them and the statements
    between them and the loop's end never run.

    `seen` is every state observable *inside* the block: an exception can be raised
    at any point, so a `try` handler may run with any prefix of its body applied.
    Joining the endpoints alone hides a binding that only some prefixes have.
    """

    normal: _State | None
    brk: _State | None = None
    cont: _State | None = None
    seen: list[_State] = field(default_factory=list)


def _join(*states: _State | None) -> _State | None:
    live = [s for s in states if s is not None]
    if not live:
        return None
    return _merge(live) if len(live) > 1 else live[0].copy()


def raised_constructors(tree: ast.Module) -> list[Constructor]:
    """Every `raise <Something>(...)`, with the provenance of its name.  [ERR-2]

    A bare `raise` (re-raise) and `raise` of a caught name are not new errors, so
    they are not reported.
    """
    out: list[Constructor] = []

    def record(
        node: ast.Raise, state: _State, chain: list[_Frame], locals_: frozenset[str]
    ) -> None:
        if not isinstance(node.exc, ast.Call):
            return
        label = _dotted(node.exc.func)
        if not label:
            return
        bound, star = _lookup(label.partition(".")[0], state, chain, locals_)
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
        # Only functions get the compile-time local rule. A class body uses the
        # fall-through lookup, so a name it has not bound yet is the enclosing
        # scope's, not an unset local.
        locals_ = (
            frozenset(_local_names(scope))
            if isinstance(scope, (ast.FunctionDef, ast.AsyncFunctionDef))
            else frozenset()
        )
        nested: list[ast.AST] = []
        multi: set[str] = set()

        def bind_watched(name: str, bound: _Bound) -> None:
            if name in state.names and state.names[name] != bound:
                multi.add(name)
            state.bind(name, bound)

        def step(node: ast.AST, state: _State) -> _Flow:
            """Apply one statement, returning how it can leave and what it exposes."""
            if isinstance(node, (ast.Import, ast.ImportFrom)):
                before = dict(state.names)
                _import_binds(node, state)
                for name, bound in state.names.items():
                    if name in before and before[name] != bound:
                        multi.add(name)
                return _Flow(state, seen=[state.copy()])
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
                for decorator in node.decorator_list:
                    walk_expr(decorator, state)
                bind_watched(node.name, _Bound(LOCAL_DEF))
                nested.append(node)
                return _Flow(state, seen=[state.copy()])
            if isinstance(node, ast.Assign):
                walk_expr(node.value, state)
                for target in node.targets:
                    _targets(target, state)
                return _Flow(state, seen=[state.copy()])
            if isinstance(node, (ast.AnnAssign, ast.AugAssign)):
                if node.value is not None:
                    walk_expr(node.value, state)
                _targets(node.target, state)
                return _Flow(state, seen=[state.copy()])
            if isinstance(node, ast.Delete):
                walk_expr(node, state)
                for name in _deleted_names(node):
                    # The name is unbound from here. Inside a function it stays
                    # local — reading it is UnboundLocalError, not the enclosing
                    # scope's binding — which `locals_` carries for the lookup.
                    state.names.pop(name, None)
                return _Flow(state, seen=[state.copy()])
            if isinstance(node, (ast.Global, ast.Nonlocal)):
                for name in node.names:
                    state.bind(name, _Bound(REBOUND))
                return _Flow(state, seen=[state.copy()])
            if isinstance(node, ast.Raise):
                record(node, state, chain, locals_)
                walk_expr(node, state, skip_raise=True)
                # An exception leaves this block, so nothing after it runs.
                return _Flow(None, seen=[state.copy()])
            if isinstance(node, ast.Return):
                if node.value is not None:
                    walk_expr(node.value, state)
                return _Flow(None, seen=[state.copy()])
            if isinstance(node, ast.Break):
                return _Flow(None, brk=state, seen=[state.copy()])
            if isinstance(node, ast.Continue):
                return _Flow(None, cont=state, seen=[state.copy()])
            if isinstance(node, ast.If):
                walk_expr(node.test, state)
                taken = run_block(node.body, state.copy())
                other = run_block(node.orelse, state.copy())
                return _Flow(
                    _join(taken.normal, other.normal),
                    brk=_join(taken.brk, other.brk),
                    cont=_join(taken.cont, other.cont),
                    seen=[state.copy(), *taken.seen, *other.seen],
                )
            if isinstance(node, (ast.For, ast.AsyncFor, ast.While)):
                entry = state.copy()
                if isinstance(node, (ast.For, ast.AsyncFor)):
                    walk_expr(node.iter, state)
                    entry = state.copy()
                    _targets(node.target, entry)
                else:
                    walk_expr(node.test, state)
                body = run_block(node.body, entry)
                # `continue` returns to the header, so its state also reaches the
                # loop's end on a later iteration. Zero iterations reach it too.
                no_break = _join(state.copy(), body.normal, body.cont)
                after = run_block(node.orelse, no_break.copy()) if no_break else _Flow(None)
                return _Flow(
                    _join(after.normal, body.brk),
                    brk=_join(after.brk),
                    cont=_join(after.cont),
                    seen=[state.copy(), *body.seen, *after.seen],
                )
            if isinstance(node, (ast.With, ast.AsyncWith)):
                for item in node.items:
                    walk_expr(item.context_expr, state)
                    if item.optional_vars is not None:
                        _targets(item.optional_vars, state)
                inner = run_block(node.body, state)
                return _Flow(inner.normal, inner.brk, inner.cont, [state.copy(), *inner.seen])
            if isinstance(node, ast.Try) or (
                hasattr(ast, "TryStar") and isinstance(node, ast.TryStar)
            ):
                body = run_block(node.body, state.copy())
                # A handler runs from wherever the body failed, which is any point
                # in it. Joining only the endpoints hides a binding that exists
                # after some prefixes and not others.
                entry = _join(state.copy(), *body.seen)
                outcomes: list[_Flow] = []
                if body.normal is not None:
                    outcomes.append(run_block(node.orelse, body.normal))
                for handler in node.handlers:
                    caught = entry.copy() if entry else state.copy()
                    if handler.name:
                        caught.bind(handler.name, _Bound(REBOUND))
                    outcomes.append(run_block(handler.body, caught))
                joined = _join(*(o.normal for o in outcomes))
                after = run_block(node.finalbody, joined.copy()) if joined else _Flow(None)
                return _Flow(
                    after.normal,
                    brk=_join(body.brk, after.brk, *(o.brk for o in outcomes)),
                    cont=_join(body.cont, after.cont, *(o.cont for o in outcomes)),
                    seen=[state.copy(), *body.seen, *after.seen,
                          *(s for o in outcomes for s in o.seen)],
                )
            if hasattr(ast, "Match") and isinstance(node, ast.Match):
                walk_expr(node.subject, state)
                arms: list[_Flow] = []
                for case in node.cases:
                    armed = state.copy()
                    # A capture holds arbitrary matched data, never an identity.
                    for name in _pattern_names(case.pattern):
                        armed.bind(name, _Bound(REBOUND))
                    if case.guard is not None:
                        walk_expr(case.guard, armed)
                    arms.append(run_block(case.body, armed))
                return _Flow(
                    _join(state.copy(), *(a.normal for a in arms)),
                    brk=_join(*(a.brk for a in arms)),
                    cont=_join(*(a.cont for a in arms)),
                    seen=[state.copy(), *(s for a in arms for s in a.seen)],
                )
            walk_expr(node, state)
            return _Flow(state, seen=[state.copy()])

        def run_block(stmts: list[ast.stmt], state: _State) -> _Flow:
            """Run statements in source order, carrying exits forward."""
            normal: _State | None = state
            last = state
            brk: _State | None = None
            cont: _State | None = None
            seen: list[_State] = [state.copy()]
            for stmt in stmts:
                if normal is None:
                    # Unreachable. Its raises are still reported, against the last
                    # live state, but it cannot change how this block exits.
                    step(stmt, last.copy())
                    continue
                last = normal
                flow = step(stmt, normal)
                seen.extend(flow.seen)
                brk = _join(brk, flow.brk)
                cont = _join(cont, flow.cont)
                normal = flow.normal
            return _Flow(normal, brk, cont, seen)

        def walk_expr(node: ast.AST, state: _State, skip_raise: bool = False) -> None:
            """Catch raises and nested scopes inside an expression or statement."""
            for child in ast.iter_child_nodes(node):
                if isinstance(child, _SCOPES):
                    if isinstance(child, ast.Lambda):
                        nested.append(child)
                    continue
                if isinstance(child, ast.Raise) and not skip_raise:
                    record(child, state, chain, locals_)
                walk_expr(child, state)

        if isinstance(scope, ast.Lambda):
            walk_expr(scope, state)
            final = state
        else:
            flow = run_block(list(getattr(scope, "body", [])), state)
            # A closure runs later, so it sees whatever this scope ended up with on
            # any path out of it.
            final = _join(flow.normal, flow.brk, flow.cont) or state

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
