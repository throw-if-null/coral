"""Horizontal: the audited repo's structure, resolved once.

Turns a Config plus a filesystem into the four categories `[MODEL-1]` names —
slices, top-level modules (candidate horizontals), composition roots, and
everything else — so no check has to re-derive them.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from .config import Config

SOURCE_SUFFIXES = frozenset({
    ".py", ".go", ".ts", ".tsx", ".js", ".jsx", ".rb", ".rs", ".java", ".kt", ".cs", ".php",
})


def _is_test(name: str) -> bool:
    stem = Path(name).stem
    return (
        stem.startswith("test_")
        or stem.endswith(("_test", "_tests", ".test", ".spec"))
        or stem in {"conftest", "tests"}
    )


def _is_private(name: str) -> bool:
    return name.startswith((".", "_")) and name != "__main__.py"


@dataclass(frozen=True)
class Unit:
    """One slice, or one top-level module. A file or a directory."""

    path: Path
    rel: str
    name: str  # the stem: "add", "errors"

    @property
    def is_dir(self) -> bool:
        return self.path.is_dir()

    def source_files(self) -> tuple[Path, ...]:
        """Non-test source files belonging to this unit."""
        if self.path.is_file():
            return (self.path,)
        found = [
            p for p in sorted(self.path.rglob("*"))
            if p.is_file() and p.suffix in SOURCE_SUFFIXES and not _is_test(p.name)
        ]
        return tuple(found)

    def contains(self, path: Path) -> bool:
        return path == self.path or self.path in path.parents


@dataclass(frozen=True)
class Layout:
    repo: Path
    config: Config
    paths: tuple[Path, ...]      # every non-ignored path, files and dirs
    slices: tuple[Unit, ...]
    top_level: tuple[Unit, ...]  # candidate horizontals
    roots: tuple[Path, ...]

    def rel(self, path: Path) -> str:
        return path.relative_to(self.repo).as_posix()


def _walk(repo: Path, ignore: frozenset[str]) -> list[Path]:
    out: list[Path] = []
    stack = [repo]
    while stack:
        current = stack.pop()
        try:
            entries = sorted(current.iterdir())
        except OSError:
            continue
        for entry in entries:
            if entry.name in ignore:
                continue
            out.append(entry)
            if entry.is_dir():
                stack.append(entry)
    return out


def discover(repo: Path, config: Config) -> Layout:
    repo = repo.resolve()
    ignore = frozenset(config.ignore)
    paths = tuple(_walk(repo, ignore))
    root_paths = tuple((repo / r).resolve() for r in config.roots)

    slices: list[Unit] = []
    for feature_dir in config.feature_dirs:
        base = repo / feature_dir
        for child in sorted(base.iterdir()):
            if _is_private(child.name) or _is_test(child.name):
                continue
            if child.is_file() and child.suffix not in SOURCE_SUFFIXES:
                continue
            if child.resolve() in root_paths:
                continue
            slices.append(Unit(child, child.relative_to(repo).as_posix(), child.stem))

    feature_abs = {(repo / d).resolve() for d in config.feature_dirs}
    top_level: list[Unit] = []
    for app_dir in config.app_dirs:
        base = repo / app_dir
        for child in sorted(base.iterdir()):
            if _is_private(child.name) or _is_test(child.name):
                continue
            if child.is_file() and child.suffix not in SOURCE_SUFFIXES:
                continue
            if child.resolve() in feature_abs or child.resolve() in root_paths:
                continue
            top_level.append(Unit(child, child.relative_to(repo).as_posix(), child.stem))

    return Layout(
        repo=repo,
        config=config,
        paths=paths,
        slices=tuple(slices),
        top_level=tuple(top_level),
        roots=root_paths,
    )
