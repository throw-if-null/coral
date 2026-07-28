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
