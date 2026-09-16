from coral_lint.checks import ad_hoc_errors
from coral_lint.conftest import FEATURE_CFG

TAXONOMY_CFG = FEATURE_CFG + 'error_types = ["errors.validation", "errors.not_found"]\n'


def test_skips_without_feature_dirs(make_layout):
    result = ad_hoc_errors.run(make_layout({"app/feat/add.py": ""}))
    assert not result.ran and "feature_dirs" in result.skipped


def test_skips_and_says_why_without_a_declared_taxonomy(make_layout):
    result = ad_hoc_errors.run(make_layout({"app/feat/add.py": ""}, coral_toml=FEATURE_CFG))
    assert not result.ran and "error_types" in result.skipped


def test_flags_a_bare_builtin_exception(make_layout):
    lay = make_layout(
        {"app/feat/add.py": "def run():\n    raise ValueError('nope')\n"},
        coral_toml=TAXONOMY_CFG,
    )

    findings = ad_hoc_errors.run(lay).findings
    assert len(findings) == 1
    assert "ValueError" in findings[0].message and findings[0].line == 2


def test_accepts_a_declared_taxonomy_constructor(make_layout):
    lay = make_layout(
        {"app/feat/add.py": "def run():\n    raise errors.validation('bad', 'nope')\n"},
        coral_toml=TAXONOMY_CFG,
    )
    assert ad_hoc_errors.run(lay).findings == ()


def test_accepts_a_bare_reference_the_module_actually_imported(make_layout):
    # `from errors import validation` binds the module the constructor came from,
    # so the raise resolves to `errors.validation` even though the call spells one
    # word. Matching the spelling alone would accept any `validation` in reach.
    lay = make_layout(
        {
            "app/feat/add.py":
                "from errors import validation\n\ndef run():\n    raise validation('bad', 'nope')\n"
        },
        coral_toml=TAXONOMY_CFG,
    )
    assert ad_hoc_errors.run(lay).findings == ()


def test_a_bare_reference_with_no_import_is_a_finding(make_layout):
    # A locally defined `validation()` is an ad-hoc error type. Its spelling
    # matching the declared taxonomy is a coincidence, not provenance.
    lay = make_layout(
        {
            "app/feat/add.py":
                "def validation(code, message):\n    return RuntimeError(message)\n\n"
                "def run():\n    raise validation('bad', 'nope')\n"
        },
        coral_toml=TAXONOMY_CFG,
    )
    findings = ad_hoc_errors.run(lay).findings
    assert len(findings) == 1 and "validation" in findings[0].message


def test_a_bare_reraise_is_not_a_new_error(make_layout):
    lay = make_layout(
        {"app/feat/add.py": "def run():\n    try:\n        pass\n    except Exception:\n        raise\n"},
        coral_toml=TAXONOMY_CFG,
    )
    assert ad_hoc_errors.run(lay).findings == ()


# ── [ERR-1]'s per-unit grain ─────────────────────────────────────────────────
#
# [ERR-1] scopes the error model to each app or published package, not to the repository. A
# check that unions every declared constructor into one allowlist passes a backend
# slice that raised the CLI's constructor — a boundary violation reported clean.
# These pin the two halves: scoped config decides per unit, and the flat form
# refuses to answer for a repo it cannot scope.

TWO_APPS_CFG = """[coral]
feature_dirs = ["a/feat", "b/feat"]
app_dirs = ["a", "b"]

[[coral.error_models]]
path = "a"
types = ["a_errors.validation", "a_errors.not_found"]

[[coral.error_models]]
path = "b"
types = ["b_errors.usage"]
"""

TWO_APPS_TREE = {
    "a/feat/add.py": "",
    "b/feat/run.py": "",
    "a/errors.py": "",
    "b/errors.py": "",
}


def test_a_slice_raising_its_own_app_taxonomy_passes(make_layout):
    tree = dict(TWO_APPS_TREE)
    tree["a/feat/add.py"] = "def run():\n    raise a_errors.validation('bad', 'nope')\n"
    assert ad_hoc_errors.run(make_layout(tree, coral_toml=TWO_APPS_CFG)).findings == ()


def test_a_slice_raising_a_SIBLING_apps_taxonomy_is_a_finding(make_layout):
    # The regression this whole split exists for. `b_errors.usage` is a declared
    # taxonomy constructor — just not one app A declared — so a repo-wide allowlist
    # would pass it.
    tree = dict(TWO_APPS_TREE)
    tree["a/feat/add.py"] = "def run():\n    raise b_errors.usage('bad', 'nope')\n"

    result = ad_hoc_errors.run(make_layout(tree, coral_toml=TWO_APPS_CFG))
    assert len(result.findings) == 1
    assert "b_errors.usage" in result.findings[0].message
    assert result.findings[0].path == "a/feat/add.py"


def test_each_app_is_checked_against_its_own_model_in_one_pass(make_layout):
    tree = dict(TWO_APPS_TREE)
    tree["a/feat/add.py"] = "def run():\n    raise a_errors.not_found('x', 'no')\n"
    tree["b/feat/run.py"] = "def run():\n    raise a_errors.not_found('x', 'no')\n"

    result = ad_hoc_errors.run(make_layout(tree, coral_toml=TWO_APPS_CFG))
    assert [f.path for f in result.findings] == ["b/feat/run.py"]


def test_a_slice_outside_every_declared_model_skips_the_check(make_layout):
    # A note beside an otherwise clean result is not a verdict: the run would still
    # report `ran` with zero findings and exit 0 while a slice was never checked.
    # Ownership is undeclared, so the check says it cannot decide.
    cfg = """[coral]
feature_dirs = ["a/feat", "c/feat"]
app_dirs = ["a"]

[[coral.error_models]]
path = "a"
types = ["a_errors.validation"]
"""
    tree = {
        "a/feat/add.py": "def run():\n    raise a_errors.validation('ok', 'fine')\n",
        "c/feat/orphan.py": "def run():\n    raise ValueError('nope')\n",
        "a/errors.py": "",
    }
    result = ad_hoc_errors.run(make_layout(tree, coral_toml=cfg))
    assert not result.ran
    assert result.findings == ()
    assert "c/feat/orphan.py" in result.skipped
    assert "[[coral.error_models]]" in result.skipped


# ── qualified names are compared qualified ───────────────────────────────────
#
# Two units routinely give one category the same name. Matching a raise site by
# final segment alone then accepts either unit's constructor in either unit, which
# is the exact cross-boundary pass [ERR-1] forbids and the earlier sibling test did
# not catch, because it used two DIFFERENT category names.

SAME_TAIL_CFG = """[coral]
feature_dirs = ["a/feat", "b/feat"]
app_dirs = ["a", "b"]

[[coral.error_models]]
path = "a"
types = ["a_errors.validation"]

[[coral.error_models]]
path = "b"
types = ["b_errors.validation"]
"""

SAME_TAIL_TREE = {"a/feat/add.py": "", "b/feat/run.py": "", "a/errors.py": "", "b/errors.py": ""}


def test_a_sibling_constructor_with_the_SAME_final_name_is_still_a_finding(make_layout):
    tree = dict(SAME_TAIL_TREE)
    tree["a/feat/add.py"] = "def run():\n    raise b_errors.validation('bad', 'nope')\n"

    result = ad_hoc_errors.run(make_layout(tree, coral_toml=SAME_TAIL_CFG))
    assert len(result.findings) == 1
    assert "b_errors.validation" in result.findings[0].message
    assert result.findings[0].path == "a/feat/add.py"


def test_the_same_final_name_from_its_OWN_unit_still_passes(make_layout):
    # The other half: narrowing the match must not start failing correct code.
    tree = dict(SAME_TAIL_TREE)
    tree["a/feat/add.py"] = "def run():\n    raise a_errors.validation('ok', 'fine')\n"
    tree["b/feat/run.py"] = "def run():\n    raise b_errors.validation('ok', 'fine')\n"

    assert ad_hoc_errors.run(make_layout(tree, coral_toml=SAME_TAIL_CFG)).findings == ()


# ── bare and aliased references are resolved, not spelled ────────────────────
#
# The harder half of the same collision. Comparing final segments made every form
# below indistinguishable: app A importing ITS `validation`, app A importing app
# B's, and a slice defining its own function of that name. Provenance is in the
# module's imports, so the check reads them.


def _a(body: str) -> dict[str, str]:
    tree = dict(SAME_TAIL_TREE)
    tree["a/feat/add.py"] = body
    return tree


def test_an_imported_bare_constructor_from_its_OWN_unit_passes(make_layout):
    lay = make_layout(
        _a("from a_errors import validation\n\ndef run():\n    raise validation('ok', 'fine')\n"),
        coral_toml=SAME_TAIL_CFG,
    )
    assert ad_hoc_errors.run(lay).findings == ()


def test_an_imported_bare_constructor_from_a_SIBLING_unit_is_a_finding(make_layout):
    # Same spelling, same final segment, different unit. This is the case the
    # final-segment match could not see at all.
    lay = make_layout(
        _a("from b_errors import validation\n\ndef run():\n    raise validation('bad', 'nope')\n"),
        coral_toml=SAME_TAIL_CFG,
    )
    findings = ad_hoc_errors.run(lay).findings
    assert len(findings) == 1
    assert findings[0].path == "a/feat/add.py"


def test_a_locally_defined_constructor_does_not_pass_by_name(make_layout):
    lay = make_layout(
        _a(
            "def validation(code, message):\n    return RuntimeError(message)\n\n"
            "def run():\n    raise validation('bad', 'nope')\n"
        ),
        coral_toml=SAME_TAIL_CFG,
    )
    assert len(ad_hoc_errors.run(lay).findings) == 1


def test_an_aliased_from_import_resolves_to_the_declared_constructor(make_layout):
    lay = make_layout(
        _a(
            "from a_errors import validation as invalid\n\n"
            "def run():\n    raise invalid('ok', 'fine')\n"
        ),
        coral_toml=SAME_TAIL_CFG,
    )
    assert ad_hoc_errors.run(lay).findings == ()


def test_an_aliased_module_import_resolves_too(make_layout):
    lay = make_layout(
        _a("import a_errors as errors\n\ndef run():\n    raise errors.validation('ok', 'fine')\n"),
        coral_toml=SAME_TAIL_CFG,
    )
    assert ad_hoc_errors.run(lay).findings == ()


def test_an_aliased_module_import_of_a_SIBLING_unit_is_still_a_finding(make_layout):
    # The alias must not launder provenance either.
    lay = make_layout(
        _a("import b_errors as errors\n\ndef run():\n    raise errors.validation('bad', 'nope')\n"),
        coral_toml=SAME_TAIL_CFG,
    )
    assert len(ad_hoc_errors.run(lay).findings) == 1


def test_a_star_import_is_unanalyzed_rather_than_guessed_clean(make_layout):
    # `from a_errors import *` could legitimately be where `validation` came from,
    # and the tool cannot tell. It says so instead of answering either way.
    lay = make_layout(
        _a("from a_errors import *\n\ndef run():\n    raise validation('ok', 'fine')\n"),
        coral_toml=SAME_TAIL_CFG,
    )
    result = ad_hoc_errors.run(lay)
    assert result.findings == ()
    assert any("cannot bind exactly" in n for n in result.notes)


def test_the_flat_form_still_works_for_a_single_unit_repo(make_layout):
    # Backward compatibility: one app, one `error_types` list, unchanged behavior.
    cfg = '[coral]\nfeature_dirs = ["app/feat"]\napp_dirs = ["app"]\nerror_types = ["errors.validation"]\n'
    tree = {
        "app/feat/add.py": "def run():\n    raise errors.validation('bad', 'nope')\n",
        "app/errors.py": "",
    }
    result = ad_hoc_errors.run(make_layout(tree, coral_toml=cfg))
    assert result.ran and result.findings == ()


def test_the_flat_form_skips_with_a_reason_when_the_repo_has_several_units(make_layout):
    # The conservative half. One repo-wide allowlist cannot decide a per-unit rule,
    # so the check says so rather than reporting a clean run it did not earn.
    cfg = (
        '[coral]\nfeature_dirs = ["a/feat", "b/feat"]\napp_dirs = ["a", "b"]\n'
        'error_types = ["a_errors.validation"]\n'
    )
    tree = {
        "a/feat/add.py": "def run():\n    raise b_errors.usage('bad', 'nope')\n",
        "b/feat/run.py": "",
    }
    result = ad_hoc_errors.run(make_layout(tree, coral_toml=cfg))
    assert not result.ran
    assert "[[coral.error_models]]" in result.skipped and "[ERR-1]" in result.skipped
    assert result.findings == ()


def test_a_library_nested_in_an_app_resolves_to_the_nearer_model(make_layout):
    # Longest path wins, so a published package inside an app is checked against its
    # own declared model rather than its host's.
    cfg = """[coral]
feature_dirs = ["a/feat", "a/pkg/feat"]
app_dirs = ["a"]
library_dirs = ["a/pkg"]

[[coral.error_models]]
path = "a"
types = ["a_errors.validation"]

[[coral.error_models]]
path = "a/pkg"
types = ["pkg_errors.invalid"]
"""
    tree = {
        "a/feat/add.py": "def run():\n    raise a_errors.validation('ok', 'fine')\n",
        "a/pkg/feat/parse.py": "def run():\n    raise pkg_errors.invalid('ok', 'fine')\n",
        "a/errors.py": "",
    }
    assert ad_hoc_errors.run(make_layout(tree, coral_toml=cfg)).findings == ()
