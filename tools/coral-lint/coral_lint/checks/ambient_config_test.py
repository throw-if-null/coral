from coral_lint.checks import ambient_config
from coral_lint.conftest import FEATURE_CFG


def test_skips_and_says_why_without_config(make_layout):
    result = ambient_config.run(make_layout({"app/feat/add.py": ""}))
    assert not result.ran and "feature_dirs" in result.skipped


def test_flags_os_getenv_in_a_slice(make_layout):
    lay = make_layout(
        {"app/feat/add.py": "import os\n\n\ndef run():\n    return os.getenv('DB')\n"},
        coral_toml=FEATURE_CFG,
    )

    findings = ambient_config.run(lay).findings
    assert len(findings) == 1
    assert findings[0].line == 5
    assert "os.getenv" in findings[0].message


def test_flags_a_bare_environ_import(make_layout):
    lay = make_layout(
        {"app/feat/add.py": "from os import environ\n\n\ndef run():\n    return environ['DB']\n"},
        coral_toml=FEATURE_CFG,
    )
    assert len(ambient_config.run(lay).findings) == 2  # the import and the use


def test_flags_dotenv(make_layout):
    lay = make_layout({"app/feat/add.py": "import dotenv\n"}, coral_toml=FEATURE_CFG)
    assert len(ambient_config.run(lay).findings) == 1


def test_an_injected_slice_passes(make_layout):
    lay = make_layout(
        {"app/feat/add.py": "def run(args, db):\n    return db.tx()\n"},
        coral_toml=FEATURE_CFG,
    )
    assert ambient_config.run(lay).findings == ()


def test_the_root_may_read_the_environment(make_layout):
    # [CONFIG-1] puts config resolution AT the root, so the root must not be
    # flagged for doing its job. It is not a slice, so it is never scanned.
    lay = make_layout(
        {"app/main.py": "import os\nDB = os.getenv('DB')\n", "app/feat/add.py": ""},
        coral_toml=FEATURE_CFG + 'roots = ["app/main.py"]\n',
    )
    assert ambient_config.run(lay).findings == ()


def test_reports_unanalyzed_non_python_sources(make_layout):
    lay = make_layout({"app/feat/add.go": "package add\n"}, coral_toml=FEATURE_CFG)

    result = ambient_config.run(lay)
    assert result.findings == ()
    assert result.notes and "not analyzed" in result.notes[0]
