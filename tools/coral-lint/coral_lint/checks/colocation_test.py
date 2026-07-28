from coral_lint.checks import colocation
from coral_lint.conftest import FEATURE_CFG


def test_skips_and_says_why_without_config(make_layout):
    result = colocation.run(make_layout({"app/feat/add.py": ""}))
    assert not result.ran and "feature_dirs" in result.skipped


def test_flags_a_slice_with_no_test(make_layout):
    lay = make_layout({"app/feat/add.py": ""}, coral_toml=FEATURE_CFG)
    assert [f.path for f in colocation.run(lay).findings] == ["app/feat/add.py"]


def test_accepts_a_colocated_test(make_layout):
    lay = make_layout(
        {"app/feat/add.py": "", "app/feat/add_test.py": ""}, coral_toml=FEATURE_CFG
    )
    assert colocation.run(lay).findings == ()


def test_accepts_a_mirrored_test(make_layout):
    # [STRUCT-1] allows a mirror where the language forbids colocation, so a
    # matching stem elsewhere in the tree must satisfy the check.
    lay = make_layout(
        {"app/feat/add.py": "", "tests/feat/test_add.py": ""}, coral_toml=FEATURE_CFG
    )
    assert colocation.run(lay).findings == ()


def test_accepts_any_test_inside_a_directory_slice(make_layout):
    lay = make_layout(
        {"app/feat/add/behavior.py": "", "app/feat/add/test_the_whole_thing.py": ""},
        coral_toml=FEATURE_CFG,
    )
    assert colocation.run(lay).findings == ()


def test_reports_each_untested_slice_once(make_layout):
    lay = make_layout(
        {"app/feat/add.py": "", "app/feat/edit.py": "", "app/feat/list.py": "",
         "app/feat/list_test.py": ""},
        coral_toml=FEATURE_CFG,
    )
    assert [f.path for f in colocation.run(lay).findings] == [
        "app/feat/add.py",
        "app/feat/edit.py",
    ]
