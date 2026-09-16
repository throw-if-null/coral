"""The root's own observable contract: exit code, channel separation, --json."""

from __future__ import annotations

import io
import json

from coral_lint import app, applicability


def _run(argv, cwd=None):
    """Invoke the root. Advisory by default, because these tests are about the ROOT.

    Applicability is checked before any check runs ([VER-6]), and a throwaway tmp_path
    has no `CORAL.md` — so without the override every one of these would exercise the
    gate instead of the thing it is testing. The gate has its own tests below, which
    pass no override and assert exactly that.
    """
    argv = [applicability.OVERRIDE_FLAG] + list(argv)
    out, err = io.StringIO(), io.StringIO()
    code = app.main([str(cwd)] + argv if cwd else argv, out=out, err=err)
    return code, out.getvalue(), err.getvalue()


def _run_raw(argv, cwd=None):
    """Invoke the root with nothing added — for the applicability gate's own tests."""
    out, err = io.StringIO(), io.StringIO()
    code = app.main([str(cwd)] + list(argv) if cwd else list(argv), out=out, err=err)
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


def test_declaring_both_error_forms_is_rejected(tmp_path):
    # One error model per unit ([ERR-1]) has one declaration. Two shapes saying it
    # would make the check pick a winner silently.
    repo = _repo(
        tmp_path,
        {"app/feat/add.py": ""},
        coral_toml=(
            '[coral]\nfeature_dirs = ["app/feat"]\nerror_types = ["e.v"]\n\n'
            '[[coral.error_models]]\npath = "app"\ntypes = ["e.v"]\n'
        ),
    )
    code, out, err = _run([], repo)
    assert code == 2
    assert out == ""
    assert "conflicting_error_declaration" in err


def test_an_error_model_without_types_is_rejected(tmp_path):
    repo = _repo(
        tmp_path,
        {"app/feat/add.py": ""},
        coral_toml=(
            '[coral]\nfeature_dirs = ["app/feat"]\n\n'
            '[[coral.error_models]]\npath = "app"\ntypes = []\n'
        ),
    )
    code, _, err = _run([], repo)
    assert code == 2
    assert "bad_config_type" in err


def test_an_error_model_naming_a_missing_directory_is_rejected(tmp_path):
    repo = _repo(
        tmp_path,
        {"app/feat/add.py": ""},
        coral_toml=(
            '[coral]\nfeature_dirs = ["app/feat"]\n\n'
            '[[coral.error_models]]\npath = "nope"\ntypes = ["e.v"]\n'
        ),
    )
    code, _, err = _run([], repo)
    assert code == 2
    assert "config_path_missing" in err


def test_two_error_models_for_one_path_are_rejected(tmp_path):
    repo = _repo(
        tmp_path,
        {"app/feat/add.py": ""},
        coral_toml=(
            '[coral]\nfeature_dirs = ["app/feat"]\n\n'
            '[[coral.error_models]]\npath = "app"\ntypes = ["e.v"]\n\n'
            '[[coral.error_models]]\npath = "app"\ntypes = ["e.w"]\n'
        ),
    )
    code, _, err = _run([], repo)
    assert code == 2
    assert "duplicate_error_model" in err


def test_a_feature_directory_cannot_become_its_own_error_model_unit(tmp_path):
    # [ERR-1] scopes one model to each app or published package. `a/expense` is a
    # feature package inside app `a`, and longest-path-wins resolution would give it
    # a second taxonomy inside one unit if any existing directory were accepted.
    repo = _repo(
        tmp_path,
        {"a/expense/add.py": "", "a/errors.py": ""},
        coral_toml=(
            '[coral]\napp_dirs = ["a"]\nfeature_dirs = ["a/expense"]\n\n'
            '[[coral.error_models]]\npath = "a"\ntypes = ["app_errors.validation"]\n\n'
            '[[coral.error_models]]\npath = "a/expense"\ntypes = ["expense_errors.validation"]\n'
        ),
    )
    code, out, err = _run([], repo)
    assert code == 2
    assert out == ""  # not one finding was reported  [CONFIG-3]
    assert "error_model_not_a_unit" in err


def test_a_declared_library_may_carry_its_own_error_model(tmp_path):
    # The other direction: a published package nested in an app IS a unit, so it
    # legitimately overrides its host.
    repo = _repo(
        tmp_path,
        {"a/feat/add.py": "", "a/pkg/feat/parse.py": "", "a/errors.py": ""},
        coral_toml=(
            '[coral]\napp_dirs = ["a"]\nlibrary_dirs = ["a/pkg"]\n'
            'feature_dirs = ["a/feat", "a/pkg/feat"]\n\n'
            '[[coral.error_models]]\npath = "a"\ntypes = ["a_errors.validation"]\n\n'
            '[[coral.error_models]]\npath = "a/pkg"\ntypes = ["pkg_errors.invalid"]\n'
        ),
    )
    # Asserted on [ERR-2] rather than on the exit code, which unrelated checks in
    # this synthetic tree also move.
    _, out, _ = _run(["--json"], repo)
    err2 = next(c for c in json.loads(out)["checks"] if c["rule"] == "ERR-2")
    assert err2["ran"] is True and err2["skipped"] is None
    assert [f for f in json.loads(out)["findings"] if f["rule"] == "ERR-2"] == []


def test_a_bare_constructor_in_a_scoped_error_model_is_rejected(tmp_path):
    # A per-unit taxonomy is matched on constructor identity, and `validation`
    # carries none: it cannot say which unit owns it. Accepting it would let the
    # check claim an exactness it does not have.
    repo = _repo(
        tmp_path,
        {"app/feat/add.py": ""},
        coral_toml=(
            '[coral]\napp_dirs = ["app"]\nfeature_dirs = ["app/feat"]\n\n'
            '[[coral.error_models]]\npath = "app"\ntypes = ["validation"]\n'
        ),
    )
    code, out, err = _run([], repo)
    assert code == 2
    assert out == ""  # not one finding was reported  [CONFIG-3]
    assert "ambiguous_error_constructor" in err


def test_a_bare_constructor_in_the_flat_form_is_rejected_too(tmp_path):
    # Constructors are matched on identity everywhere. A bare `CoralError` would
    # never match `errors.CoralError`, which is what `from errors import CoralError`
    # resolves to, so accepting the config would configure an unsatisfiable check.
    repo = _repo(
        tmp_path,
        {"app/feat/add.py": ""},
        coral_toml='[coral]\nfeature_dirs = ["app/feat"]\nerror_types = ["CoralError"]\n',
    )
    code, out, err = _run([], repo)
    assert code == 2
    assert out == ""  # not one finding was reported  [CONFIG-3]
    assert "ambiguous_error_constructor" in err


def test_a_qualified_flat_constructor_is_checked_against_the_actual_raise(tmp_path):
    # The replacement for the parse-only test: the configured identity is exercised
    # by a real raise, in both directions.
    repo = _repo(
        tmp_path,
        {
            "app/feat/add.py":
                "from errors import CoralError\n\ndef run():\n    raise CoralError('b', 'n')\n",
            "app/feat/other.py":
                "from bespoke import CoralError\n\ndef run():\n    raise CoralError('b', 'n')\n",
        },
        coral_toml='[coral]\nfeature_dirs = ["app/feat"]\nerror_types = ["errors.CoralError"]\n',
    )
    _, out, _ = _run(["--json"], repo)
    payload = json.loads(out)
    err2 = next(c for c in payload["checks"] if c["rule"] == "ERR-2")
    assert err2["ran"] is True
    assert [f["path"] for f in payload["findings"] if f["rule"] == "ERR-2"] == ["app/feat/other.py"]


def test_an_uncovered_slice_is_not_presented_as_a_clean_ERR_2_run(tmp_path):
    # The root-level half of the unit test in ad_hoc_errors_test.py. Every analyzed
    # slice here is clean, so before this fix the run exited 0 with [ERR-2] counted
    # among the checks that ran, while `c/feat` was never checked at all.
    repo = _repo(
        tmp_path,
        {
            "a/feat/add.py": "def run():\n    raise a_errors.validation('ok', 'fine')\n",
            "c/feat/orphan.py": "def run():\n    raise ValueError('nope')\n",
            "a/errors.py": "",
        },
        coral_toml=(
            '[coral]\napp_dirs = ["a"]\nfeature_dirs = ["a/feat", "c/feat"]\n\n'
            '[[coral.error_models]]\npath = "a"\ntypes = ["a_errors.validation"]\n'
        ),
    )
    _, out, err = _run(["--json"], repo)
    err2 = next(c for c in json.loads(out)["checks"] if c["rule"] == "ERR-2")
    assert err2["ran"] is False
    assert "c/feat/orphan.py" in err2["skipped"]

    _, _, text_err = _run([], repo)
    assert "skipped [ERR-2]" in text_err


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


# ── applicability: the tool may not decide what a project owes  [VER-6] ──────
#
# Every rule this tool implements is production-baseline or app-profile. None of them
# binds a project that has not adopted that layer, so running them regardless would
# make a rule effective because the tool contains a check for it. Until the
# declaration can be resolved, the honest output is a configuration error.


def test_a_repo_with_no_coral_md_gets_a_configuration_error_not_findings(tmp_path):
    repo = _repo(tmp_path, {"app/utils/x.py": ""})  # a real [BUCKET-1] violation
    code, out, err = _run_raw([], repo)
    assert code == app.EXIT_USAGE, "a configuration problem must not look like findings"
    assert code != app.EXIT_FINDINGS
    assert "undeclared_applicability" in err
    assert "VER-6" in err
    assert out == "", "no findings channel output at all"
    assert "BUCKET-1" not in out + err


def test_a_declared_but_unresolvable_project_also_refuses(tmp_path):
    repo = _repo(
        tmp_path,
        {
            "app/utils/x.py": "",
            "CORAL.md": '```yaml coral\ntargets: "0.7.0"\nscales: [app]\nadopts: {}\n```\n',
        },
    )
    code, out, err = _run_raw([], repo)
    assert code == app.EXIT_USAGE
    assert "unsupported_applicability" in err
    assert out == ""
    assert "BUCKET-1" not in out + err


def test_a_kernel_only_project_is_not_failed_on_baseline_rules(tmp_path):
    # The case PO-04 names: `adopts: {}` is explicitly kernel-only, and [BUCKET-1] is a
    # production-baseline rule. Whatever this tool does, it must not report that as a
    # conformance failure. Today it declines to answer; it must never answer wrongly.
    repo = _repo(
        tmp_path,
        {
            "app/utils/x.py": "",
            "CORAL.md": '```yaml coral\ntargets: "0.7.0"\nscales: [app]\nadopts: {}\n```\n',
        },
    )
    code, out, err = _run_raw([], repo)
    assert code != app.EXIT_FINDINGS
    assert "[BUCKET-1]" not in out


def test_selecting_a_rule_explicitly_does_not_bypass_the_gate(tmp_path):
    # --rule narrows the run; it does not decide applicability. A named check still
    # produces a finding presented as conformance.
    repo = _repo(tmp_path, {"app/utils/x.py": ""})
    code, out, err = _run_raw(["--rule", "BUCKET-1"], repo)
    assert code == app.EXIT_USAGE
    assert "BUCKET-1" not in out


def test_the_gate_does_not_fall_back_to_the_static_check_registry(tmp_path):
    # The failure mode in one assertion: no check ran, so nothing in CHECKS reached the
    # output, however the project is shaped.
    repo = _repo(tmp_path, {"app/utils/x.py": "", "app/shared/y.py": ""})
    code, out, err = _run_raw(["--json"], repo)
    assert code == app.EXIT_USAGE
    assert out == ""
    for rule in app.IMPLEMENTED:
        assert rule not in out


def test_coverage_still_works_without_a_declaration(tmp_path):
    # --coverage reports what this tool implements. It is not a verdict about a project,
    # so it needs no declaration — and gating it would be gating the wrong thing.
    code, out, _ = _run_raw(["--coverage"], tmp_path)
    assert code == app.EXIT_OK
    assert "[BUCKET-1]" in out


def test_the_override_is_advisory_and_says_so_on_both_channels(tmp_path):
    repo = _repo(tmp_path, {"app/utils/x.py": ""})
    code, out, err = _run_raw([applicability.OVERRIDE_FLAG], repo)
    assert code == app.EXIT_FINDINGS
    assert "[BUCKET-1]" in out
    assert "ADVISORY ONLY" in err
    assert "not a Coral conformance verdict" in err


def test_the_override_marks_json_output_as_non_conformance(tmp_path):
    repo = _repo(tmp_path, {"app/utils/x.py": ""})
    _, out, _ = _run_raw([applicability.OVERRIDE_FLAG, "--json"], repo)
    payload = json.loads(out)
    assert payload["conformance"] is False
    assert "ADVISORY ONLY" in payload["advisory_notice"]


def test_the_tools_own_record_resolves_far_enough_to_name_the_limitation(tmp_path):
    # coral-lint keeps a real CORAL.md, so its own run hits the "this tool cannot resolve
    # it yet" branch rather than the "nobody declared one" branch. The distinction is the
    # whole point: one is the project's gap, the other is this tool's.
    from pathlib import Path

    here = Path(__file__).resolve().parents[1]
    assert (here / "CORAL.md").is_file()
    assert applicability.resolve(here).code == "unsupported_applicability"
