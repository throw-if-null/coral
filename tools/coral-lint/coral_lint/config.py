"""Horizontal: configuration. Resolved once, validated here, injected.  [CONFIG-1] [CONFIG-3]

Every layout-dependent check reads its inputs from here, so "this repo's slices
live in X" is stated once, in the audited repo, rather than guessed per check.
Guessing is how a linter earns false positives, and a gate that flakily passes a
forbidden bucket loses all credibility.
"""

from __future__ import annotations

import tomllib
from dataclasses import dataclass, field
from pathlib import Path

from . import errors

CONFIG_NAME = "coral.toml"

DEFAULT_IGNORE = (
    ".git", ".venv", "venv", "node_modules", "vendor", "dist", "build",
    "__pycache__", ".vitepress", ".mypy_cache", ".pytest_cache", ".ruff_cache",
)

DEFAULT_READ_VERBS = ("show", "list", "get", "find", "summary", "report", "search", "read")

_KNOWN_KEYS = {
    "ignore", "app_dirs", "feature_dirs", "roots", "horizontals",
    "grandfathered", "read_verbs", "error_types",
}


@dataclass(frozen=True)
class Config:
    """The audited repo's declared layout."""

    ignore: tuple[str, ...] = DEFAULT_IGNORE
    app_dirs: tuple[str, ...] = ()       # dirs whose direct children are top-level modules
    feature_dirs: tuple[str, ...] = ()   # dirs whose direct children are slices
    roots: tuple[str, ...] = ()          # composition-root files
    horizontals: frozenset[str] = field(default_factory=frozenset)
    grandfathered: frozenset[str] = field(default_factory=frozenset)
    read_verbs: tuple[str, ...] = DEFAULT_READ_VERBS
    error_types: frozenset[str] = field(default_factory=frozenset)
    source: str = "defaults"             # where this came from, for the report

    @property
    def declares_slices(self) -> bool:
        return bool(self.feature_dirs)

    @property
    def declares_horizontals(self) -> bool:
        return bool(self.app_dirs) and bool(self.horizontals)


def _strs(raw: object, key: str) -> tuple[str, ...]:
    if not isinstance(raw, list) or not all(isinstance(v, str) for v in raw):
        raise errors.validation("bad_config_type", f"{CONFIG_NAME}: [coral].{key} must be a list of strings")
    return tuple(raw)


def load(repo: Path) -> Config:
    """Read and validate the repo's config, or return defaults if it has none.

    Validation happens here rather than at first use, so a malformed config
    fails before any check runs.  [CONFIG-3]
    """
    path = repo / CONFIG_NAME
    if not path.is_file():
        return Config()

    try:
        data = tomllib.loads(path.read_text(encoding="utf-8"))
    except tomllib.TOMLDecodeError as exc:
        raise errors.validation("bad_config", f"{CONFIG_NAME} is not valid TOML: {exc}")
    except OSError as exc:
        raise errors.infrastructure("config_unreadable", f"cannot read {CONFIG_NAME}: {exc}")

    section = data.get("coral", data)
    if not isinstance(section, dict):
        raise errors.validation("bad_config", f"{CONFIG_NAME}: [coral] must be a table")

    unknown = sorted(set(section) - _KNOWN_KEYS)
    if unknown:
        raise errors.validation(
            "unknown_config_key",
            f"{CONFIG_NAME}: unknown key(s) {', '.join(unknown)}; "
            f"known keys are {', '.join(sorted(_KNOWN_KEYS))}",
        )

    cfg = Config(
        ignore=DEFAULT_IGNORE + _strs(section.get("ignore", []), "ignore"),
        app_dirs=_strs(section.get("app_dirs", []), "app_dirs"),
        feature_dirs=_strs(section.get("feature_dirs", []), "feature_dirs"),
        roots=_strs(section.get("roots", []), "roots"),
        horizontals=frozenset(_strs(section.get("horizontals", []), "horizontals")),
        grandfathered=frozenset(_strs(section.get("grandfathered", []), "grandfathered")),
        read_verbs=_strs(section.get("read_verbs", list(DEFAULT_READ_VERBS)), "read_verbs"),
        error_types=frozenset(_strs(section.get("error_types", []), "error_types")),
        source=CONFIG_NAME,
    )

    for key, values in (("app_dirs", cfg.app_dirs), ("feature_dirs", cfg.feature_dirs)):
        for value in values:
            if not (repo / value).is_dir():
                raise errors.validation(
                    "config_path_missing",
                    f"{CONFIG_NAME}: [coral].{key} names {value!r}, which is not a directory",
                )
    for value in cfg.roots:
        if not (repo / value).exists():
            raise errors.validation(
                "config_path_missing",
                f"{CONFIG_NAME}: [coral].roots names {value!r}, which does not exist",
            )
    return cfg
