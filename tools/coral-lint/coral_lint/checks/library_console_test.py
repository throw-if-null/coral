from coral_lint.checks import library_console as check

LIB_CFG = '[coral]\nlibrary_dirs = ["mylib"]\n'


def _findings(make_layout, src, coral_toml=LIB_CFG):
    lay = make_layout({"mylib/client.py": src}, coral_toml=coral_toml)
    return check.run(lay).findings


def test_skips_and_says_why_unless_the_repo_declares_a_library(make_layout):
    result = check.run(make_layout({"mylib/client.py": "print('hi')\n"}))
    assert not result.ran and "library_dirs" in result.skipped


def test_flags_a_print(make_layout):
    findings = _findings(make_layout, "def build():\n    print('building')\n")
    assert len(findings) == 1
    assert "console" in findings[0].message and findings[0].line == 2


def test_flags_a_stderr_write(make_layout):
    findings = _findings(make_layout, "import sys\n\n\ndef warn(m):\n    sys.stderr.write(m)\n")
    assert findings and all("console" in f.message for f in findings)


def test_flags_file_equals_stderr(make_layout):
    # The sneaky form: not a write call, but unmistakably a write.
    findings = _findings(make_layout, "import sys\n\n\ndef warn(m):\n    print(m, file=sys.stderr)\n")
    assert len(findings) == 2  # the print, and the stream it targets


def test_flags_global_logging_configuration(make_layout):
    findings = _findings(make_layout, "import logging\n\n\ndef setup():\n    logging.basicConfig()\n")
    assert len(findings) == 1
    assert "process-wide handler" in findings[0].message


def test_flags_a_signal_handler(make_layout):
    findings = _findings(
        make_layout, "import signal\n\n\ndef setup(h):\n    signal.signal(signal.SIGTERM, h)\n"
    )
    assert len(findings) == 1
    assert "process-wide handler" in findings[0].message


def test_flags_an_excepthook_install(make_layout):
    findings = _findings(make_layout, "import sys\n\n\ndef setup(h):\n    sys.excepthook = h\n")
    assert len(findings) == 1


def test_flags_atexit_registration(make_layout):
    findings = _findings(make_layout, "import atexit\n\n\ndef setup(f):\n    atexit.register(f)\n")
    assert len(findings) == 1


def test_an_injected_logger_passes(make_layout):
    src = (
        "class NullLog:\n"
        "    def info(self, msg):\n"
        "        pass\n\n\n"
        "def build(log=None):\n"
        "    log = log or NullLog()\n"
        "    log.info('built')\n"
        "    return object()\n"
    )
    assert _findings(make_layout, src) == ()


def test_getlogger_alone_is_not_global_configuration(make_layout):
    # Naming a logger is fine; configuring the root for the whole process is not.
    src = "import logging\n\n_log = logging.getLogger(__name__)\n\n\ndef build():\n    return 1\n"
    assert _findings(make_layout, src) == ()


def test_a_declared_root_may_render(make_layout):
    # [ERR-3] puts rendering at the root, so a library shipping a CLI is not
    # penalised for printing there.
    lay = make_layout(
        {"mylib/client.py": "def build():\n    return 1\n",
         "mylib/cli.py": "def main():\n    print('done')\n"},
        coral_toml=LIB_CFG + 'roots = ["mylib/cli.py"]\n',
    )
    assert check.run(lay).findings == ()
