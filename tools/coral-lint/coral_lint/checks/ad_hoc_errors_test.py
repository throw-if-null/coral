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


def test_accepts_a_declaration_by_final_segment(make_layout):
    lay = make_layout(
        {"app/feat/add.py": "def run():\n    raise validation('bad', 'nope')\n"},
        coral_toml=TAXONOMY_CFG,
    )
    assert ad_hoc_errors.run(lay).findings == ()


def test_a_bare_reraise_is_not_a_new_error(make_layout):
    lay = make_layout(
        {"app/feat/add.py": "def run():\n    try:\n        pass\n    except Exception:\n        raise\n"},
        coral_toml=TAXONOMY_CFG,
    )
    assert ad_hoc_errors.run(lay).findings == ()


# ── [ERR-1]'s per-unit grain ─────────────────────────────────────────────────
#
# [ERR-1] scopes the error model to each app or package, not to the repository. A
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


def test_a_slice_outside_every_declared_model_is_noted_not_silently_passed(make_layout):
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
    assert result.findings == ()
    assert any("outside every [[coral.error_models]] path" in n for n in result.notes)
    assert any("c/feat/orphan.py" in n for n in result.notes)


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
    cfg = '[coral]\nfeature_dirs = ["a/feat", "b/feat"]\napp_dirs = ["a", "b"]\nerror_types = ["a_errors.validation"]\n'
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
