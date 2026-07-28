from coral_lint.checks import read_only
from coral_lint.conftest import FEATURE_CFG


def test_skips_and_says_why_without_config(make_layout):
    result = read_only.run(make_layout({"app/feat/add.py": ""}))
    assert not result.ran and "feature_dirs" in result.skipped


def test_flags_an_insert_in_a_list_slice(make_layout):
    lay = make_layout(
        {"app/feat/list.py": 'def run(db):\n    db.execute("INSERT INTO t VALUES (1)")\n'},
        coral_toml=FEATURE_CFG,
    )

    findings = read_only.run(lay).findings
    assert len(findings) == 1
    assert "INSERT INTO" in findings[0].message and findings[0].line == 2


def test_flags_a_commit_in_a_read_slice(make_layout):
    lay = make_layout(
        {"app/feat/show.py": "def run(db):\n    db.commit()\n"}, coral_toml=FEATURE_CFG
    )
    assert len(read_only.run(lay).findings) == 1


def test_a_read_slice_that_only_selects_passes(make_layout):
    lay = make_layout(
        {"app/feat/list.py": 'def run(db):\n    return db.execute("SELECT id FROM t")\n'},
        coral_toml=FEATURE_CFG,
    )
    assert read_only.run(lay).findings == ()


def test_a_write_named_slice_is_not_checked(make_layout):
    # `add` truthfully signals its effect, so writing is exactly what it should do.
    lay = make_layout(
        {"app/feat/add.py": 'def run(db):\n    db.execute("INSERT INTO t VALUES (1)")\n'},
        coral_toml=FEATURE_CFG,
    )
    result = read_only.run(lay)
    assert result.findings == ()
    assert result.notes[0].startswith("0 of 1")


def test_the_feature_package_name_can_make_a_slice_read_named(make_layout):
    # `summary/month` is a read even though "month" is not a verb.
    lay = make_layout(
        {"app/summary/month.py": 'def run(db):\n    db.execute("DELETE FROM t")\n'},
        coral_toml='[coral]\nfeature_dirs = ["app/summary"]\n',
    )
    assert len(read_only.run(lay).findings) == 1


def test_ddl_owned_by_a_slice_is_not_a_write(make_layout):
    # [STATE-5] makes a slice the owner of its table's schema, so CREATE TABLE in
    # a slice is conformance. Flagging it would punish the correct shape.
    lay = make_layout(
        {"app/feat/list.py": 'SCHEMA = "CREATE TABLE IF NOT EXISTS t (id int)"\n'},
        coral_toml=FEATURE_CFG,
    )
    assert read_only.run(lay).findings == ()
