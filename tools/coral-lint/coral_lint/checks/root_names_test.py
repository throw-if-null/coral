from coral_lint.checks import root_names


def test_skips_and_says_why_without_config(make_layout):
    lay = make_layout({"app/mystery.py": ""})

    result = root_names.run(lay)
    assert not result.ran
    assert "app_dirs" in result.skipped


def test_flags_an_undeclared_top_level_module(make_layout):
    lay = make_layout(
        {"app/errors.py": "", "app/mystery.py": ""},
        coral_toml='[coral]\napp_dirs = ["app"]\nhorizontals = ["errors"]\n',
    )
    assert [f.path for f in root_names.run(lay).findings] == ["app/mystery.py"]


def test_declared_horizontals_pass(make_layout):
    lay = make_layout(
        {"app/errors.py": "", "app/money.py": "", "app/db.py": ""},
        coral_toml='[coral]\napp_dirs = ["app"]\nhorizontals = ["errors", "money", "db"]\n',
    )
    assert root_names.run(lay).findings == ()


def test_feature_dirs_and_roots_are_not_top_level_modules(make_layout):
    lay = make_layout(
        {"app/feat/add.py": "", "app/main.py": "", "app/errors.py": ""},
        coral_toml=(
            '[coral]\napp_dirs = ["app"]\nfeature_dirs = ["app/feat"]\n'
            'roots = ["app/main.py"]\nhorizontals = ["errors"]\n'
        ),
    )
    assert root_names.run(lay).findings == ()
