from coral_lint.checks import buckets


def test_flags_a_utils_package(make_layout):
    lay = make_layout({"app/utils/thing.py": "x = 1\n"})

    findings = buckets.run(lay).findings
    assert [(f.rule, f.path, f.severity) for f in findings] == [
        ("BUCKET-1", "app/utils", "error")
    ]


def test_flags_a_utils_module_too(make_layout):
    lay = make_layout({"app/utils.py": ""})
    assert [f.path for f in buckets.run(lay).findings] == ["app/utils.py"]


def test_models_and_core_are_warnings_not_errors(make_layout):
    # The rule itself hedges on these, and the backend-review example says
    # renaming a cohesive `models` would be cosmetic. So: warn, never fail.
    lay = make_layout({"app/models/order.py": "", "app/core/engine.py": ""})

    severities = {f.path: f.severity for f in buckets.run(lay).findings}
    assert severities == {"app/models": "warning", "app/core": "warning"}


def test_grandfathered_paths_are_exempt(make_layout):
    lay = make_layout(
        {"app/core/engine.py": ""},
        coral_toml='[coral]\ngrandfathered = ["app/core"]\n',
    )
    assert buckets.run(lay).findings == ()


def test_a_capability_named_package_passes(make_layout):
    lay = make_layout({"app/pricing/quote.py": "", "app/expense/add.py": ""})
    assert buckets.run(lay).findings == ()


def test_runs_with_no_config_at_all(make_layout):
    # The one check that must work on an unconfigured repo, so `coral-lint .`
    # gives value on first contact.
    lay = make_layout({"a/helpers/x.py": ""})
    result = buckets.run(lay)
    assert result.ran and len(result.findings) == 1


def test_ignores_vendored_trees(make_layout):
    lay = make_layout({"node_modules/dep/utils.py": "", "app/pricing/quote.py": ""})
    assert buckets.run(lay).findings == ()


def test_ignores_non_source_files(make_layout):
    lay = make_layout({"docs/utils.md": "", "app/pricing/quote.py": ""})
    assert buckets.run(lay).findings == ()
