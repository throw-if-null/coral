"""The root's own observable contract: exit code, channel separation, --json."""

from __future__ import annotations

import io
import json

from coral_lint import app


def _run(argv, cwd=None):
    out, err = io.StringIO(), io.StringIO()
    code = app.main([str(cwd)] + argv if cwd else argv, out=out, err=err)
    return code, out.getvalue(), err.getvalue()


def _repo(tmp_path, files, coral_toml=None):
    for rel, content in files.items():
        path = tmp_path / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding="utf-8")
    if coral_toml:
        (tmp_path / "coral.toml").write_text(coral_toml, encoding="utf-8")
    return tmp_path


def test_a_clean_repo_exits_zero(tmp_path):
    repo = _repo(tmp_path, {"app/pricing/quote.py": ""})
    code, out, _ = _run([], repo)
    assert code == 0
    assert "0 error(s)" in out


def test_findings_exit_one(tmp_path):
    repo = _repo(tmp_path, {"app/utils/x.py": ""})
    code, out, _ = _run([], repo)
    assert code == 1
    assert "[BUCKET-1]" in out


def test_warnings_alone_do_not_fail_by_default(tmp_path):
    repo = _repo(tmp_path, {"app/models/order.py": ""})
    assert _run([], repo)[0] == 0
    assert _run(["--warnings-as-errors"], repo)[0] == 1


def test_json_is_the_machine_contract(tmp_path):
    repo = _repo(tmp_path, {"app/utils/x.py": ""})
    code, out, err = _run(["--json"], repo)

    assert code == 1
    payload = json.loads(out)  # stdout is pure JSON  [CLI-3] [CLI-4]
    assert payload["findings"][0]["rule"] == "BUCKET-1"
    assert payload["findings"][0]["path"] == "app/utils"
    assert set(payload["findings"][0]) == {
        "rule", "severity", "path", "line", "message", "remedy",
    }
    assert payload["coverage"]["implemented_count"] == len(app.IMPLEMENTED)


def test_diagnostics_never_pollute_stdout(tmp_path):
    # [OBS-3]: skip notices and coverage go to stderr, so --json stays parseable.
    repo = _repo(tmp_path, {"app/pricing/quote.py": ""})
    _, out, err = _run([], repo)
    assert "skipped" in err and "coverage:" in err
    assert "skipped" not in out


def test_a_missing_path_is_a_usage_error(tmp_path):
    code, out, err = _run([str(tmp_path / "nope")])
    assert code == 2
    assert out == ""
    assert "path_not_found" in err


def test_an_unknown_rule_is_a_usage_error(tmp_path):
    code, _, err = _run(["--rule", "NOPE-1"], tmp_path)
    assert code == 2
    assert "unknown_rule" in err


def test_a_bad_config_fails_before_any_check_runs(tmp_path):
    repo = _repo(tmp_path, {"app/utils/x.py": ""}, coral_toml="[coral]\nignore = 3\n")
    code, out, err = _run([], repo)
    assert code == 2
    assert out == ""  # not one finding was reported  [CONFIG-3]
    assert "bad_config_type" in err


def test_an_unknown_config_key_is_rejected(tmp_path):
    repo = _repo(tmp_path, {}, coral_toml='[coral]\nfeatur_dirs = ["app"]\n')
    code, _, err = _run([], repo)
    assert code == 2
    assert "unknown_config_key" in err


def test_rule_filter_runs_only_that_check(tmp_path):
    repo = _repo(tmp_path, {"app/utils/x.py": ""})
    _, out, _ = _run(["--json", "--rule", "BUCKET-1"], repo)
    assert [c["rule"] for c in json.loads(out)["checks"]] == ["BUCKET-1"]


def test_coverage_is_reported_and_machine_readable(tmp_path):
    code, out, _ = _run(["--coverage", "--json"], tmp_path)
    payload = json.loads(out)
    assert code == 0
    assert payload["implemented_count"] == len(app.IMPLEMENTED)
    assert payload["auto_rule_count"] > payload["implemented_count"]
