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


# What a raise site's constructor name could be proved to be.  [ERR-2]
#
# Three answers, and the third is a first-class one. `[ERR-2]` claims a project
# raises through its declared taxonomy, so the only safe reading of "this tool did
# not find a contradiction" is *not* "conformant". Accepted means proved; rejected
# means proved to be something else; anything this model cannot settle is
# AMBIGUOUS, and the check reports it rather than passing it.
#
# That boundary is deliberate. Proving which object a name holds in general is
# running the program, and a linter that tries earns false confidence instead of
# precision — the property these checks exist to have.
IMPORTED = "imported"      # exactly one import binds it, and they agree
LOCAL_DEF = "local_def"    # a `def`/`class` of that name owns it here
UNBOUND = "unbound"        # nothing in any visible scope binds it
AMBIGUOUS = "ambiguous"    # not provable: rebinding, disagreement, or a star import


@dataclass(frozen=True)
class Constructor:
    """One `raise X(...)`, with what could be proved about the name it spells.

    The call node carries a spelling; the taxonomy is declared in terms of where
    the constructor lives. `from b_errors import validation` then
    `raise validation(...)` spells one word, and the part saying it came from
    `b_errors` is in the `ImportFrom`. So provenance is resolved here, with the
    rest of the AST facts, rather than in each check.

    **A name is proved only when it has one meaning.** Every binding site for it in
    the scope that owns it must be an import, and they must agree. One `def` owning
    it is the other provable answer: a locally defined constructor. Everything else
    — a parameter, an assignment, a `match` capture, a walrus, `del`, `global`, an
    `except ... as` target, two imports that disagree, a `from x import *` that
    could have supplied it — is AMBIGUOUS, because settling it means knowing which
    assignment ran, and that is execution rather than analysis.

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


@dataclass(frozen=True)
class _Site:
    """One place a name is bound, and what it was bound to."""

    kind: str               # IMPORTED, LOCAL_DEF, or AMBIGUOUS for everything else
    line: int
    target: str = ""
    level: int = 0
    module: str | None = None
    attr: str | None = None

    @property
    def identity(self) -> tuple:
        return (self.kind, self.target, self.level, self.module, self.attr)


@dataclass
class _Scope:
    """One lexical scope: every binding site in it, and whether a star import is."""

    node: ast.AST
    is_class: bool
    sites: dict[str, list[_Site]] = field(default_factory=dict)
    star: bool = False

    def add(self, name: str, site: _Site) -> None:
        self.sites.setdefault(name, []).append(site)


_SCOPES = (ast.FunctionDef, ast.AsyncFunctionDef, ast.Lambda, ast.ClassDef)


def _pattern_names(pattern: ast.AST | None) -> set[str]:
    """Names a `match` pattern captures.

    Every nesting form can capture, not just `case x:` — `case [a, *rest]`,
    `case {"k": v, **rest}`, `case C(x, attr=y)` and `case a | b` all bind through
    their sub-patterns.
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


def _bound_names(node: ast.expr) -> set[str]:
    """Plain names an assignment or deletion target binds.

    `holder.attr` and `holder[key]` name an object, not a binding, so the head is
    untouched by them.
    """
    found: set[str] = set()
    stack: list[ast.expr] = [node]
    while stack:
        target = stack.pop()
        if isinstance(target, ast.Name):
            found.add(target.id)
        elif isinstance(target, (ast.Tuple, ast.List)):
            stack.extend(target.elts)
        elif isinstance(target, ast.Starred):
            stack.append(target.value)
    return found


def _collect(scope: _Scope) -> None:
    """Record every binding site in this scope, without descending into others.

    Source order is not tracked, and does not need to be: a name with one binding
    has one meaning wherever it is read, and a name with several is not proved by
    picking one of them.
    """
    node = scope.node

    if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.Lambda)):
        args = node.args
        for arg in [*args.posonlyargs, *args.args, *args.kwonlyargs]:
            scope.add(arg.arg, _Site(AMBIGUOUS, arg.lineno))
        for optional in (args.vararg, args.kwarg):
            if optional is not None:
                scope.add(optional.arg, _Site(AMBIGUOUS, optional.lineno))

    body: list[ast.AST] = (
        [node.body] if isinstance(node, ast.Lambda) else list(getattr(node, "body", []))
    )
    stack: list[ast.AST] = list(body)
    while stack:
        current = stack.pop()
        line = getattr(current, "lineno", 0)
        if isinstance(current, ast.Import):
            for alias in current.names:
                local = alias.asname or alias.name.split(".")[0]
                target = alias.name if alias.asname else alias.name.split(".")[0]
                scope.add(local, _Site(IMPORTED, line, target=target, module=alias.name))
        elif isinstance(current, ast.ImportFrom):
            base = current.module or ""
            for alias in current.names:
                if alias.name == "*":
                    scope.star = True
                    continue
                local = alias.asname or alias.name
                target = f"{base}.{alias.name}" if base else alias.name
                scope.add(local, _Site(
                    IMPORTED, line, target=target, level=current.level,
                    module=current.module, attr=alias.name,
                ))
        elif isinstance(current, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            scope.add(current.name, _Site(LOCAL_DEF, line))
            continue  # its body is a scope of its own
        elif isinstance(current, ast.Lambda):
            continue
        elif isinstance(current, ast.Assign):
            for target_node in current.targets:
                for name in _bound_names(target_node):
                    scope.add(name, _Site(AMBIGUOUS, line))
        elif isinstance(current, (ast.AnnAssign, ast.AugAssign, ast.NamedExpr)):
            for name in _bound_names(current.target):
                scope.add(name, _Site(AMBIGUOUS, line))
        elif isinstance(current, (ast.For, ast.AsyncFor)):
            for name in _bound_names(current.target):
                scope.add(name, _Site(AMBIGUOUS, line))
        elif isinstance(current, (ast.With, ast.AsyncWith)):
            for item in current.items:
                if item.optional_vars is not None:
                    for name in _bound_names(item.optional_vars):
                        scope.add(name, _Site(AMBIGUOUS, line))
        elif isinstance(current, ast.ExceptHandler) and current.name:
            # Python also deletes this name when the handler exits, so it is never
            # a stable binding for anything after it either.
            scope.add(current.name, _Site(AMBIGUOUS, line))
        elif isinstance(current, ast.Delete):
            for target_node in current.targets:
                for name in _bound_names(target_node):
                    scope.add(name, _Site(AMBIGUOUS, line))
        elif isinstance(current, (ast.Global, ast.Nonlocal)):
            # The binding lives in another scope and anything may rewrite it.
            for name in current.names:
                scope.add(name, _Site(AMBIGUOUS, line))
        elif hasattr(ast, "match_case") and isinstance(current, ast.match_case):
            for name in _pattern_names(current.pattern):
                scope.add(name, _Site(AMBIGUOUS, line))
        stack.extend(ast.iter_child_nodes(current))


def _resolve(head: str, line: int, chain: list[_Scope]) -> _Site | None:
    """What `head` is proved to be at a raise on `line`, or None if unbound.

    The innermost scope with a binding site owns the name — in a function that is
    Python's compile-time local rule, and it is why a later assignment does not let
    the read fall outward. Within the owning scope every site must agree, and a
    site in the raise's *own* scope must also be textually above it: an import
    below the raise has not run, whatever it names.
    """
    if any(scope.star for scope in chain):
        return _Site(AMBIGUOUS, line)

    own = chain[-1] if chain else None
    for scope in reversed(chain):
        sites = scope.sites.get(head)
        if not sites:
            continue
        if scope is own and any(site.line > line for site in sites):
            # A binding written below the read, in the same scope, cannot be what
            # the read sees — and if it is the only one, the read is unbound.
            return _Site(AMBIGUOUS, line)
        first = sites[0]
        if any(site.identity != first.identity for site in sites[1:]):
            return _Site(AMBIGUOUS, line)
        return first
    return None


def raised_constructors(tree: ast.Module) -> list[Constructor]:
    """Every `raise <Something>(...)`, with what its name is proved to be.  [ERR-2]

    A bare `raise` (re-raise) and `raise` of a caught name are not new errors, so
    they are not reported. Every statement is inspected, including one after a
    `return` or inside a `finally`, because a raise there is as real as any other.
    """
    out: list[Constructor] = []

    def visit(node: ast.AST, chain: list[_Scope]) -> None:
        for child in ast.iter_child_nodes(node):
            if isinstance(child, _SCOPES):
                is_class = isinstance(child, ast.ClassDef)
                scope = _Scope(child, is_class)
                _collect(scope)
                # A function defined in a class body does not see the class
                # namespace, though it still sees every scope outside it — a method
                # may close over the function its class was defined in. Class bodies
                # do not nest into each other either, so one filter serves both.
                visible = [frame for frame in chain if not frame.is_class]
                visit(child, [*visible, scope])
                continue
            if isinstance(child, ast.Raise) and isinstance(child.exc, ast.Call):
                label = _dotted(child.exc.func)
                if label:
                    site = _resolve(label.partition(".")[0], child.lineno, chain)
                    if site is None:
                        out.append(Constructor(label, child.lineno, UNBOUND))
                    elif site.kind == IMPORTED:
                        rest = label.partition(".")[2]
                        target = f"{site.target}.{rest}" if rest else site.target
                        out.append(Constructor(
                            label, child.lineno, IMPORTED, target=target, level=site.level,
                            module=site.module, attr=site.attr,
                        ))
                    else:
                        out.append(Constructor(label, child.lineno, site.kind))
            visit(child, chain)

    module = _Scope(tree, False)
    _collect(module)
    visit(tree, [module])
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
