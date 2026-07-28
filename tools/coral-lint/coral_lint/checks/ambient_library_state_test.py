from coral_lint.checks import ambient_library_state as check

LIB_CFG = '[coral]\nlibrary_dirs = ["mylib"]\n'


def _lay(make_layout, src, coral_toml=LIB_CFG, name="mylib/client.py"):
    return make_layout({name: src}, coral_toml=coral_toml)


def test_skips_and_says_why_unless_the_repo_declares_a_library(make_layout):
    result = check.run(make_layout({"mylib/client.py": "print('hi')\n"}))
    assert not result.ran and "library_dirs" in result.skipped


def test_flags_a_lazily_assigned_singleton(make_layout):
    src = (
        "_client = None\n\n\n"
        "def get_client(cfg):\n"
        "    global _client\n"
        "    if _client is None:\n"
        "        _client = object()\n"
        "    return _client\n"
    )
    findings = check.run(_lay(make_layout, src)).findings
    assert len(findings) == 1
    assert "_client" in findings[0].message and "singleton" in findings[0].message


def test_flags_a_module_level_registry(make_layout):
    src = "_REGISTRY = {}\n\n\ndef register(k, v):\n    _REGISTRY[k] = v\n"
    assert len(check.run(_lay(make_layout, src)).findings) == 1


def test_flags_a_discarded_call_at_import_time(make_layout):
    src = "import logging\n\nlogging.basicConfig(level=logging.INFO)\n"
    findings = check.run(_lay(make_layout, src)).findings
    assert len(findings) == 1
    assert "import performs work" in findings[0].message and findings[0].line == 3


def test_flags_a_file_read_at_import_time(make_layout):
    src = "DEFAULTS = open('defaults.json').read()\n"
    findings = check.run(_lay(make_layout, src)).findings
    assert len(findings) == 1
    assert "open()" in findings[0].message


def test_flags_a_network_call_at_import_time(make_layout):
    src = "import requests\n\n_TOKEN = requests.get('https://example.test/t').text\n"
    assert len(check.run(_lay(make_layout, src)).findings) == 1


def test_io_inside_a_function_is_fine(make_layout):
    # It runs when the consumer asks, which is the whole point.
    src = "def load(path):\n    return open(path).read()\n"
    assert check.run(_lay(make_layout, src)).findings == ()


def test_definitions_and_constants_are_fine(make_layout):
    src = (
        '"""A docstring."""\n'
        "from dataclasses import dataclass\n\n"
        "__all__ = ['Client']\n"
        "TIMEOUT = 30\n"
        "VERBS = ('get', 'put')\n"
        "ROUTES = {'a': 1}\n\n\n"
        "@dataclass\n"
        "class Client:\n"
        "    timeout: int = TIMEOUT\n\n\n"
        "def build(timeout=TIMEOUT):\n"
        "    return Client(timeout)\n"
    )
    assert check.run(_lay(make_layout, src)).findings == ()


def test_the_main_guard_is_not_an_import_time_effect(make_layout):
    src = "def main():\n    return 0\n\n\nif __name__ == '__main__':\n    main()\n"
    assert check.run(_lay(make_layout, src)).findings == ()


def test_a_type_checking_block_is_not_an_import_time_effect(make_layout):
    src = (
        "from typing import TYPE_CHECKING\n\n"
        "if TYPE_CHECKING:\n"
        "    from collections.abc import Iterator\n"
    )
    assert check.run(_lay(make_layout, src)).findings == ()


def test_tests_and_declared_roots_are_not_library_files(make_layout):
    lay = make_layout(
        {
            "mylib/client.py": "def build():\n    return 1\n",
            "mylib/client_test.py": "_CACHE = {}\n\n\ndef t():\n    _CACHE['a'] = 1\n",
            "mylib/cli.py": "import logging\n\nlogging.basicConfig()\n",
        },
        coral_toml=LIB_CFG + 'roots = ["mylib/cli.py"]\n',
    )
    assert check.run(lay).findings == ()
