from coral_lint.checks import root_imports as check

CFG = (
    "[coral]\n"
    'app_dirs = ["app"]\n'
    'feature_dirs = ["app/feat"]\n'
    'roots = ["app/main.py"]\n'
    'horizontals = ["db", "errors"]\n'
)


def _lay(make_layout, files, coral_toml=CFG):
    base = {"app/db.py": "", "app/errors.py": "", "app/feat/add.py": ""}
    return make_layout({**base, **files}, coral_toml=coral_toml)


def test_skips_without_roots(make_layout):
    result = check.run(make_layout({"app/feat/add.py": ""}, coral_toml='[coral]\nfeature_dirs=["app/feat"]\n'))
    assert not result.ran and "roots" in result.skipped


def test_skips_when_it_cannot_classify_imports(make_layout):
    result = check.run(
        make_layout({"app/main.py": ""}, coral_toml='[coral]\nroots = ["app/main.py"]\n')
    )
    assert not result.ran and "classify" in result.skipped


def test_a_thin_root_passes(make_layout):
    src = (
        "import argparse\nimport json\n\n"
        "from . import db, errors\n"
        "from .feat import add\n\n\n"
        "def main():\n"
        "    add.register(db.Db('x'))\n"
    )
    assert check.run(_lay(make_layout, {"app/main.py": src})).findings == ()


def test_stdlib_and_third_party_imports_are_never_flagged(make_layout):
    src = "import argparse\nimport requests\nfrom pathlib import Path\n"
    assert check.run(_lay(make_layout, {"app/main.py": src})).findings == ()


def test_flags_an_undeclared_first_party_import(make_layout):
    src = "from . import queries\n"
    findings = check.run(_lay(make_layout, {"app/main.py": src, "app/queries.py": ""})).findings
    assert len(findings) == 1
    assert "neither a declared horizontal nor a slice" in findings[0].message


def _dir_slice_lay(make_layout, main_src):
    """A directory slice, so there is an "inside" to reach into."""
    return make_layout(
        {
            "app/db.py": "",
            "app/errors.py": "",
            "app/main.py": main_src,
            "app/feat/add/__init__.py": "",
            "app/feat/add/sql.py": "",
        },
        coral_toml=CFG,
    )


def test_flags_a_reach_into_slice_internals(make_layout):
    lay = _dir_slice_lay(make_layout, "from .feat.add import sql\n")

    findings = check.run(lay).findings
    assert len(findings) == 1
    assert "reaches into slice internals" in findings[0].message
    assert "app/feat/add/sql.py" in findings[0].message


def test_importing_a_slice_entry_point_is_fine(make_layout):
    # Registering a slice is the root's job; the slice itself is allowed.
    lay = _dir_slice_lay(make_layout, "from .feat import add\n")
    assert check.run(lay).findings == ()


def test_flags_sql_in_the_root(make_layout):
    src = 'def main(conn):\n    conn.execute("SELECT id FROM expenses")\n'
    findings = check.run(_lay(make_layout, {"app/main.py": src})).findings
    assert len(findings) == 1
    assert "state access" in findings[0].message and findings[0].line == 2


def test_prose_is_not_mistaken_for_sql(make_layout):
    src = 'HELP = "select the report you want, then press enter"\n'
    assert check.run(_lay(make_layout, {"app/main.py": src})).findings == ()
