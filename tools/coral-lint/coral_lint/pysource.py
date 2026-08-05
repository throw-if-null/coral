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
