from coral_lint.checks import slice_state
from coral_lint.conftest import FEATURE_CFG


def _lay(make_layout, src):
    return make_layout({"app/feat/add.py": src}, coral_toml=FEATURE_CFG)


def test_flags_a_mutated_module_level_dict(make_layout):
    lay = _lay(make_layout, "_CACHE = {}\n\n\ndef put(k, v):\n    _CACHE[k] = v\n")

    findings = slice_state.run(lay).findings
    assert len(findings) == 1
    assert "_CACHE" in findings[0].message and findings[0].line == 1


def test_flags_a_module_level_list_that_is_appended_to(make_layout):
    lay = _lay(make_layout, "_SEEN = []\n\n\ndef note(x):\n    _SEEN.append(x)\n")
    assert len(slice_state.run(lay).findings) == 1


def test_flags_a_global_counter(make_layout):
    lay = _lay(make_layout, "_n = 0\n\n\ndef bump():\n    global _n\n    _n += 1\n")
    assert len(slice_state.run(lay).findings) == 1


def test_ignores_an_unmutated_lookup_table(make_layout):
    # The half of the rule that prevents false positives: a mutable literal
    # nobody mutates is a constant, and flagging it would hit every repo.
    lay = _lay(make_layout, "ROUTES = {'a': 1}\n\n\ndef get(k):\n    return ROUTES[k]\n")
    assert slice_state.run(lay).findings == ()


def test_ignores_immutable_constants(make_layout):
    lay = _lay(make_layout, "SCHEMA = 'CREATE TABLE t (id int)'\nVERBS = ('a', 'b')\n")
    assert slice_state.run(lay).findings == ()


def test_ignores_local_state(make_layout):
    lay = _lay(make_layout, "def run():\n    seen = {}\n    seen['a'] = 1\n    return seen\n")
    assert slice_state.run(lay).findings == ()
