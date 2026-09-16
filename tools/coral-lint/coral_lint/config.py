"""Crosscut: configuration. Resolved once, validated here, injected.  [CONFIG-1] [CONFIG-3]

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

# Exactly the read-only verbs [IDEM-1] names, across its CLI and library columns.
# `report`, `search` and `read` were invented here and have been removed: widening
# a rule inside a tool makes the tool an unversioned authority. Extend the list per
# project via [coral].read_verbs, or amend [IDEM-1].
DEFAULT_READ_VERBS = ("show", "list", "summary", "get", "find")

_KNOWN_KEYS = {
    "ignore", "app_dirs", "feature_dirs", "library_dirs", "roots", "crosscuts",
    "grandfathered", "read_verbs", "error_types", "error_models",
}


@dataclass(frozen=True)
class ErrorModel:
    """One app or published package, and the error constructors it declares.  [ERR-1] [ERR-2]

    `[ERR-1]` binds at the app or published package, not at the repository: a repo holding a
    backend and a CLI holds two error models, and a backend slice raising the CLI's
    constructor has reached across a boundary rather than satisfied the rule. So the
    tool has to know which declared constructors belong to which unit, and `path` is
    how the audited repo says it.

    `path` is repo-relative and names the unit's directory. `types` are the
    constructors declared for that unit alone.
    """

    path: str
    types: frozenset[str]

    def owns(self, rel: str) -> bool:
        """Does this unit contain the repo-relative path `rel`?"""
        if self.path in ("", "."):
            return True
        return rel == self.path or rel.startswith(f"{self.path}/")


@dataclass(frozen=True)
class Config:
    """The audited repo's declared layout."""

    ignore: tuple[str, ...] = DEFAULT_IGNORE
    app_dirs: tuple[str, ...] = ()       # dirs whose direct children are top-level modules
    feature_dirs: tuple[str, ...] = ()   # dirs whose direct children are slices
    library_dirs: tuple[str, ...] = ()   # dirs that ARE a published library ([LIB-*])
    roots: tuple[str, ...] = ()          # composition-root files
    crosscuts: frozenset[str] = field(default_factory=frozenset)
    grandfathered: frozenset[str] = field(default_factory=frozenset)
    read_verbs: tuple[str, ...] = DEFAULT_READ_VERBS
    error_types: frozenset[str] = field(default_factory=frozenset)
    error_models: tuple[ErrorModel, ...] = ()  # per app/package taxonomies ([ERR-1] grain)
    source: str = "defaults"             # where this came from, for the report

    @property
    def declared_units(self) -> frozenset[str]:
        """The app/package boundaries this config names, if any.

        `app_dirs` and `library_dirs` are the only keys that say *this directory is
        one unit*. `feature_dirs` does not: one app routinely declares several
        feature packages, so counting them would call every ordinary app ambiguous.
        """
        return frozenset(self.app_dirs) | frozenset(self.library_dirs)

    def error_model_for(self, rel: str) -> ErrorModel | None:
        """The error model owning a repo-relative path, or None if none does.

        Longest path wins, so a package nested inside an app resolves to the
        package. Returning None is a real answer — the caller must not fall back to
        some other unit's constructors, which is the false pass this exists to
        prevent.
        """
        best: ErrorModel | None = None
        for model in self.error_models:
            if model.owns(rel) and (best is None or len(model.path) > len(best.path)):
                best = model
        return best

    @property
    def declares_slices(self) -> bool:
        return bool(self.feature_dirs)

    @property
    def declares_library(self) -> bool:
        """[LIB-*] apply only where the repo says it publishes a library.

        Never inferred. A CLI legitimately prints to stdout and a service
        legitimately configures logging at boot, so running [LIB-5] against
        anything that did not declare itself a library would be pure noise.
        """
        return bool(self.library_dirs)

    @property
    def declares_crosscuts(self) -> bool:
        return bool(self.app_dirs) and bool(self.crosscuts)


def _strs(raw: object, key: str) -> tuple[str, ...]:
    if not isinstance(raw, list) or not all(isinstance(v, str) for v in raw):
        raise errors.validation("bad_config_type", f"{CONFIG_NAME}: [coral].{key} must be a list of strings")
    return tuple(raw)


def _error_models(raw: object) -> tuple[ErrorModel, ...]:
    """Parse `[[coral.error_models]]`: one entry per app or published package.

    Validated here rather than at first use, like everything else in this file, so a
    malformed declaration fails before any check runs.  [CONFIG-3]
    """
    if not isinstance(raw, list) or not all(isinstance(v, dict) for v in raw):
        raise errors.validation(
            "bad_config_type",
            f"{CONFIG_NAME}: [[coral.error_models]] must be a list of tables, each with"
            " `path` and `types`",
        )
    models: list[ErrorModel] = []
    seen: set[str] = set()
    for entry in raw:
        unknown = sorted(set(entry) - {"path", "types"})
        if unknown:
            raise errors.validation(
                "unknown_config_key",
                f"{CONFIG_NAME}: [[coral.error_models]] has unknown key(s) {', '.join(unknown)};"
                " known keys are path, types",
            )
        path = entry.get("path")
        if not isinstance(path, str) or not path:
            raise errors.validation(
                "bad_config_type",
                f"{CONFIG_NAME}: every [[coral.error_models]] needs a `path` naming the app or"
                " package it declares the taxonomy for",
            )
        path = path.rstrip("/")
        if path in seen:
            raise errors.validation(
                "duplicate_error_model",
                f"{CONFIG_NAME}: [[coral.error_models]] declares {path!r} twice. One unit has one"
                " error model ([ERR-1]); two entries leave no answer for which one owns a slice",
            )
        seen.add(path)
        types = _strs(entry.get("types", []), "error_models.types")
        if not types:
            raise errors.validation(
                "bad_config_type",
                f"{CONFIG_NAME}: [[coral.error_models]] for {path!r} declares no `types`. An empty"
                " model would fail every raise in that unit rather than checking it",
            )
        # A bare `validation` names no module, so it cannot say WHOSE `validation`
        # it is — which is the whole question this form exists to answer. Two units
        # naming one category the same thing would then each accept the other's
        # constructor, and the per-unit check would claim an exactness it does not
        # have. The flat `error_types` form keeps accepting bare entries: one unit
        # has nothing to be ambiguous against.
        bare = sorted(t for t in types if "." not in t)
        if bare:
            raise errors.validation(
                "ambiguous_error_constructor",
                f"{CONFIG_NAME}: [[coral.error_models]] for {path!r} declares"
                f" {', '.join(repr(b) for b in bare)} without a module. A per-unit taxonomy is"
                f" matched on constructor identity, so each entry must be qualified"
                f" (`errors.validation`, not `validation`) — a bare name cannot say which unit"
                f" the constructor belongs to",
            )
        models.append(ErrorModel(path=path, types=frozenset(types)))
    return tuple(models)


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
        library_dirs=_strs(section.get("library_dirs", []), "library_dirs"),
        roots=_strs(section.get("roots", []), "roots"),
        crosscuts=frozenset(_strs(section.get("crosscuts", []), "crosscuts")),
        grandfathered=frozenset(_strs(section.get("grandfathered", []), "grandfathered")),
        read_verbs=_strs(section.get("read_verbs", list(DEFAULT_READ_VERBS)), "read_verbs"),
        error_types=frozenset(_strs(section.get("error_types", []), "error_types")),
        error_models=_error_models(section.get("error_models", [])),
        source=CONFIG_NAME,
    )

    # Two ways to say the same thing is two sources of truth, and the check would have
    # to pick one silently. Refuse instead.  [XCUT-4]
    if cfg.error_types and cfg.error_models:
        raise errors.validation(
            "conflicting_error_declaration",
            f"{CONFIG_NAME}: declare either [coral].error_types (one error model for the whole"
            " repo) or [[coral.error_models]] (one per app or published package), not both",
        )
    # An error model belongs to an app or a published package, and to nothing else.
    # `longest path wins` resolution means an unconstrained path would let a FEATURE
    # package under an app carry its own taxonomy, which is a second model inside one
    # unit — the opposite of what [ERR-1] asks for. So a scoped path must name a unit
    # the config already declared as one.
    units = cfg.declared_units
    for model in cfg.error_models:
        if not (repo / model.path).is_dir():
            raise errors.validation(
                "config_path_missing",
                f"{CONFIG_NAME}: [[coral.error_models]] names {model.path!r}, which is not a"
                " directory",
            )
        if model.path not in units:
            known = ", ".join(sorted(units)) if units else "none are declared"
            raise errors.validation(
                "error_model_not_a_unit",
                f"{CONFIG_NAME}: [[coral.error_models]] names {model.path!r}, which is not a"
                f" declared app or published package. [ERR-1] scopes one error model to each app"
                f" or published package, so a feature package or other subtree cannot carry a"
                f" taxonomy of its own. Declare {model.path!r} in [coral].app_dirs or"
                f" [coral].library_dirs first (declared units: {known})",
            )

    for key, values in (("app_dirs", cfg.app_dirs), ("feature_dirs", cfg.feature_dirs),
                        ("library_dirs", cfg.library_dirs)):
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
