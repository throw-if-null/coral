from coral_lint.checks import ad_hoc_errors
from coral_lint.conftest import FEATURE_CFG

TAXONOMY_CFG = FEATURE_CFG + 'error_types = ["errors.validation", "errors.not_found"]\n'


def test_skips_without_feature_dirs(make_layout):
    result = ad_hoc_errors.run(make_layout({"app/feat/add.py": ""}))
    assert not result.ran and "feature_dirs" in result.skipped


def test_skips_and_says_why_without_a_declared_taxonomy(make_layout):
    result = ad_hoc_errors.run(make_layout({"app/feat/add.py": ""}, coral_toml=FEATURE_CFG))
    assert not result.ran and "error_types" in result.skipped


def test_flags_a_bare_builtin_exception(make_layout):
    lay = make_layout(
        {"app/feat/add.py": "def run():\n    raise ValueError('nope')\n"},
        coral_toml=TAXONOMY_CFG,
    )

    findings = ad_hoc_errors.run(lay).findings
    assert len(findings) == 1
    assert "ValueError" in findings[0].message and findings[0].line == 2


def test_accepts_an_imported_qualified_constructor(make_layout):
    # `import errors` binds the head, so `errors.validation` has provenance.
    lay = make_layout(
        {
            "app/feat/add.py":
                "import errors\n\ndef run():\n    raise errors.validation('bad', 'nope')\n"
        },
        coral_toml=TAXONOMY_CFG,
    )
    assert ad_hoc_errors.run(lay).findings == ()


def test_an_unbound_qualified_spelling_is_not_provenance(make_layout):
    # Nothing binds `errors` here, so at runtime this is a NameError. Matching the
    # text of a declaration proves nothing about where the constructor came from.
    lay = make_layout(
        {"app/feat/add.py": "def run():\n    raise errors.validation('bad', 'nope')\n"},
        coral_toml=TAXONOMY_CFG,
    )
    result = ad_hoc_errors.run(lay)
    assert result.ran and len(result.findings) == 1


def test_an_arbitrary_qualified_name_cannot_be_laundered_by_the_config(make_layout):
    # The same shortcut from the other side: declaring the text does not make an
    # unbound spelling of it the declared constructor.
    lay = make_layout(
        {"app/feat/add.py": "def run():\n    raise whatever.errors.validation('b', 'n')\n"},
        coral_toml=TAXONOMY_CFG,
    )
    result = ad_hoc_errors.run(lay)
    assert result.ran and len(result.findings) == 1


def test_accepts_a_bare_reference_the_module_actually_imported(make_layout):
    # `from errors import validation` binds the module the constructor came from,
    # so the raise resolves to `errors.validation` even though the call spells one
    # word. Matching the spelling alone would accept any `validation` in reach.
    lay = make_layout(
        {
            "app/feat/add.py":
                "from errors import validation\n\ndef run():\n    raise validation('bad', 'nope')\n"
        },
        coral_toml=TAXONOMY_CFG,
    )
    assert ad_hoc_errors.run(lay).findings == ()


def test_a_bare_reference_with_no_import_is_a_finding(make_layout):
    # A locally defined `validation()` is an ad-hoc error type. Its spelling
    # matching the declared taxonomy is a coincidence, not provenance.
    lay = make_layout(
        {
            "app/feat/add.py":
                "def validation(code, message):\n    return RuntimeError(message)\n\n"
                "def run():\n    raise validation('bad', 'nope')\n"
        },
        coral_toml=TAXONOMY_CFG,
    )
    findings = ad_hoc_errors.run(lay).findings
    assert len(findings) == 1 and "validation" in findings[0].message


def test_a_bare_reraise_is_not_a_new_error(make_layout):
    lay = make_layout(
        {"app/feat/add.py": "def run():\n    try:\n        pass\n    except Exception:\n        raise\n"},
        coral_toml=TAXONOMY_CFG,
    )
    assert ad_hoc_errors.run(lay).findings == ()


# ── [ERR-1]'s per-unit grain ─────────────────────────────────────────────────
#
# [ERR-1] scopes the error model to each app or published package, not to the repository. A
# check that unions every declared constructor into one allowlist passes a backend
# slice that raised the CLI's constructor — a boundary violation reported clean.
# These pin the two halves: scoped config decides per unit, and the flat form
# refuses to answer for a repo it cannot scope.

TWO_APPS_CFG = """[coral]
feature_dirs = ["a/feat", "b/feat"]
app_dirs = ["a", "b"]

[[coral.error_models]]
path = "a"
types = ["a_errors.validation", "a_errors.not_found"]

[[coral.error_models]]
path = "b"
types = ["b_errors.usage"]
"""

TWO_APPS_TREE = {
    "a/feat/add.py": "",
    "b/feat/run.py": "",
    "a/errors.py": "",
    "b/errors.py": "",
}


def test_a_slice_raising_its_own_app_taxonomy_passes(make_layout):
    tree = dict(TWO_APPS_TREE)
    tree["a/feat/add.py"] = (
        "import a_errors\n\ndef run():\n    raise a_errors.validation('bad', 'nope')\n"
    )
    assert ad_hoc_errors.run(make_layout(tree, coral_toml=TWO_APPS_CFG)).findings == ()


def test_a_slice_raising_a_SIBLING_apps_taxonomy_is_a_finding(make_layout):
    # The regression this whole split exists for. `b_errors.usage` is a declared
    # taxonomy constructor — just not one app A declared — so a repo-wide allowlist
    # would pass it.
    tree = dict(TWO_APPS_TREE)
    tree["a/feat/add.py"] = "def run():\n    raise b_errors.usage('bad', 'nope')\n"

    result = ad_hoc_errors.run(make_layout(tree, coral_toml=TWO_APPS_CFG))
    assert len(result.findings) == 1
    assert "b_errors.usage" in result.findings[0].message
    assert result.findings[0].path == "a/feat/add.py"


def test_each_app_is_checked_against_its_own_model_in_one_pass(make_layout):
    tree = dict(TWO_APPS_TREE)
    body = "import a_errors\n\ndef run():\n    raise a_errors.not_found('x', 'no')\n"
    tree["a/feat/add.py"] = body
    tree["b/feat/run.py"] = body

    result = ad_hoc_errors.run(make_layout(tree, coral_toml=TWO_APPS_CFG))
    assert [f.path for f in result.findings] == ["b/feat/run.py"]


def test_a_slice_outside_every_declared_model_skips_the_check(make_layout):
    # A note beside an otherwise clean result is not a verdict: the run would still
    # report `ran` with zero findings and exit 0 while a slice was never checked.
    # Ownership is undeclared, so the check says it cannot decide.
    cfg = """[coral]
feature_dirs = ["a/feat", "c/feat"]
app_dirs = ["a"]

[[coral.error_models]]
path = "a"
types = ["a_errors.validation"]
"""
    tree = {
        "a/feat/add.py": "def run():\n    raise a_errors.validation('ok', 'fine')\n",
        "c/feat/orphan.py": "def run():\n    raise ValueError('nope')\n",
        "a/errors.py": "",
    }
    result = ad_hoc_errors.run(make_layout(tree, coral_toml=cfg))
    assert not result.ran
    assert result.findings == ()
    assert "c/feat/orphan.py" in result.skipped
    assert "[[coral.error_models]]" in result.skipped


# ── qualified names are compared qualified ───────────────────────────────────
#
# Two units routinely give one category the same name. Matching a raise site by
# final segment alone then accepts either unit's constructor in either unit, which
# is the exact cross-boundary pass [ERR-1] forbids and the earlier sibling test did
# not catch, because it used two DIFFERENT category names.

SAME_TAIL_CFG = """[coral]
feature_dirs = ["a/feat", "b/feat"]
app_dirs = ["a", "b"]

[[coral.error_models]]
path = "a"
types = ["a_errors.validation"]

[[coral.error_models]]
path = "b"
types = ["b_errors.validation"]
"""

SAME_TAIL_TREE = {"a/feat/add.py": "", "b/feat/run.py": "", "a/errors.py": "", "b/errors.py": ""}


def test_a_sibling_constructor_with_the_SAME_final_name_is_still_a_finding(make_layout):
    tree = dict(SAME_TAIL_TREE)
    tree["a/feat/add.py"] = "def run():\n    raise b_errors.validation('bad', 'nope')\n"

    result = ad_hoc_errors.run(make_layout(tree, coral_toml=SAME_TAIL_CFG))
    assert len(result.findings) == 1
    assert "b_errors.validation" in result.findings[0].message
    assert result.findings[0].path == "a/feat/add.py"


def test_the_same_final_name_from_its_OWN_unit_still_passes(make_layout):
    # The other half: narrowing the match must not start failing correct code.
    tree = dict(SAME_TAIL_TREE)
    tree["a/feat/add.py"] = (
        "import a_errors\n\ndef run():\n    raise a_errors.validation('ok', 'fine')\n"
    )
    tree["b/feat/run.py"] = (
        "import b_errors\n\ndef run():\n    raise b_errors.validation('ok', 'fine')\n"
    )

    assert ad_hoc_errors.run(make_layout(tree, coral_toml=SAME_TAIL_CFG)).findings == ()


# ── bare and aliased references are resolved, not spelled ────────────────────
#
# The harder half of the same collision. Comparing final segments made every form
# below indistinguishable: app A importing ITS `validation`, app A importing app
# B's, and a slice defining its own function of that name. Provenance is in the
# module's imports, so the check reads them.


def _a(body: str) -> dict[str, str]:
    tree = dict(SAME_TAIL_TREE)
    tree["a/feat/add.py"] = body
    return tree


def test_an_imported_bare_constructor_from_its_OWN_unit_passes(make_layout):
    lay = make_layout(
        _a("from a_errors import validation\n\ndef run():\n    raise validation('ok', 'fine')\n"),
        coral_toml=SAME_TAIL_CFG,
    )
    assert ad_hoc_errors.run(lay).findings == ()


def test_an_imported_bare_constructor_from_a_SIBLING_unit_is_a_finding(make_layout):
    # Same spelling, same final segment, different unit. This is the case the
    # final-segment match could not see at all.
    lay = make_layout(
        _a("from b_errors import validation\n\ndef run():\n    raise validation('bad', 'nope')\n"),
        coral_toml=SAME_TAIL_CFG,
    )
    findings = ad_hoc_errors.run(lay).findings
    assert len(findings) == 1
    assert findings[0].path == "a/feat/add.py"


def test_a_locally_defined_constructor_does_not_pass_by_name(make_layout):
    lay = make_layout(
        _a(
            "def validation(code, message):\n    return RuntimeError(message)\n\n"
            "def run():\n    raise validation('bad', 'nope')\n"
        ),
        coral_toml=SAME_TAIL_CFG,
    )
    assert len(ad_hoc_errors.run(lay).findings) == 1


def test_an_aliased_from_import_resolves_to_the_declared_constructor(make_layout):
    lay = make_layout(
        _a(
            "from a_errors import validation as invalid\n\n"
            "def run():\n    raise invalid('ok', 'fine')\n"
        ),
        coral_toml=SAME_TAIL_CFG,
    )
    assert ad_hoc_errors.run(lay).findings == ()


def test_an_aliased_module_import_resolves_too(make_layout):
    lay = make_layout(
        _a("import a_errors as errors\n\ndef run():\n    raise errors.validation('ok', 'fine')\n"),
        coral_toml=SAME_TAIL_CFG,
    )
    assert ad_hoc_errors.run(lay).findings == ()


def test_an_aliased_module_import_of_a_SIBLING_unit_is_still_a_finding(make_layout):
    # The alias must not launder provenance either.
    lay = make_layout(
        _a("import b_errors as errors\n\ndef run():\n    raise errors.validation('bad', 'nope')\n"),
        coral_toml=SAME_TAIL_CFG,
    )
    assert len(ad_hoc_errors.run(lay).findings) == 1


def test_a_star_import_skips_rather_than_reporting_clean(make_layout):
    # `from a_errors import *` could legitimately be where `validation` came from,
    # and the tool cannot tell. A note would leave the check reporting `ran` with
    # zero findings, so it skips instead.
    lay = make_layout(
        _a("from a_errors import *\n\ndef run():\n    raise validation('ok', 'fine')\n"),
        coral_toml=SAME_TAIL_CFG,
    )
    result = ad_hoc_errors.run(lay)
    assert not result.ran
    assert result.findings == ()
    assert "cannot bind" in result.skipped


# ── binding is lexically scoped, because Python is ───────────────────────────
#
# A file-wide union of imports treats an import anywhere as if it bound every
# raise site. It does not: an import inside another function binds nothing here,
# and a local def, a parameter or an assignment shadows one that would be visible.


def test_a_module_level_import_binds_a_raise_inside_a_function(make_layout):
    lay = make_layout(
        _a("from a_errors import validation\n\ndef run():\n    raise validation('ok', 'fine')\n"),
        coral_toml=SAME_TAIL_CFG,
    )
    assert ad_hoc_errors.run(lay).findings == ()


def test_a_local_def_shadowing_that_import_does_not_pass(make_layout):
    lay = make_layout(
        _a(
            "from a_errors import validation\n\n"
            "def run():\n"
            "    def validation(code, message):\n        return RuntimeError(message)\n\n"
            "    raise validation('bad', 'nope')\n"
        ),
        coral_toml=SAME_TAIL_CFG,
    )
    result = ad_hoc_errors.run(lay)
    assert result.ran and len(result.findings) == 1


def test_a_parameter_shadowing_that_import_does_not_pass(make_layout):
    # The value comes from the caller, so neither answer is provable. Not clean.
    lay = make_layout(
        _a("from a_errors import validation\n\ndef run(validation):\n    raise validation('b', 'n')\n"),
        coral_toml=SAME_TAIL_CFG,
    )
    result = ad_hoc_errors.run(lay)
    assert not result.ran and result.findings == ()


def test_an_assignment_shadowing_that_import_does_not_pass(make_layout):
    lay = make_layout(
        _a(
            "from a_errors import validation\n\n"
            "def run():\n    validation = make_custom_error\n    raise validation('b', 'n')\n"
        ),
        coral_toml=SAME_TAIL_CFG,
    )
    result = ad_hoc_errors.run(lay)
    assert not result.ran and result.findings == ()


def test_an_import_in_another_function_establishes_no_provenance(make_layout):
    # `helper`'s import binds `helper`'s scope, not the module's and not `run`'s.
    lay = make_layout(
        _a(
            "def helper():\n    from a_errors import validation\n\n"
            "def run():\n    raise validation('bad', 'nope')\n"
        ),
        coral_toml=SAME_TAIL_CFG,
    )
    result = ad_hoc_errors.run(lay)
    assert result.ran and len(result.findings) == 1


# ── a relative import must stay inside the unit that owns the slice ──────────
#
# `from .errors import validation` and `from ...errors import validation` spell the
# same canonical name and can name different packages. Two units may legitimately
# each call their own constructor `errors.validation`, so spelling cannot decide
# it; the module is resolved against the repository instead.

NESTED_CFG = """[coral]
app_dirs = ["a"]
library_dirs = ["a/pkg"]
feature_dirs = ["a/feat", "a/pkg/feat"]

[[coral.error_models]]
path = "a"
types = ["errors.validation"]

[[coral.error_models]]
path = "a/pkg"
types = ["errors.validation"]
"""

NESTED_TREE = {
    "a/__init__.py": "",
    "a/errors.py": "",
    "a/feat/__init__.py": "",
    "a/feat/add.py": "",
    "a/pkg/__init__.py": "",
    "a/pkg/errors.py": "",
    "a/pkg/feat/__init__.py": "",
    "a/pkg/feat/parse.py": "",
}


def test_two_units_may_declare_the_same_local_constructor_spelling(make_layout):
    tree = dict(NESTED_TREE)
    tree["a/feat/add.py"] = "from ..errors import validation\n\ndef run():\n    raise validation('a', 'b')\n"
    tree["a/pkg/feat/parse.py"] = (
        "from ..errors import validation\n\ndef run():\n    raise validation('a', 'b')\n"
    )
    result = ad_hoc_errors.run(make_layout(tree, coral_toml=NESTED_CFG))
    assert result.ran and result.findings == ()


def test_a_relative_import_escaping_into_the_parent_app_is_a_finding(make_layout):
    # `a/pkg` is a published package with its own model. Climbing to `a/errors.py`
    # is the host app's constructor, which spells identically and is not the
    # package's.
    tree = dict(NESTED_TREE)
    tree["a/pkg/feat/parse.py"] = (
        "from ...errors import validation\n\ndef run():\n    raise validation('a', 'b')\n"
    )
    result = ad_hoc_errors.run(make_layout(tree, coral_toml=NESTED_CFG))
    assert result.ran
    assert [f.path for f in result.findings] == ["a/pkg/feat/parse.py"]


def test_the_flat_form_still_works_for_a_single_unit_repo(make_layout):
    # Backward compatibility: one app, one `error_types` list, unchanged behavior.
    cfg = '[coral]\nfeature_dirs = ["app/feat"]\napp_dirs = ["app"]\nerror_types = ["errors.validation"]\n'
    tree = {
        "app/feat/add.py":
            "import errors\n\ndef run():\n    raise errors.validation('bad', 'nope')\n",
        "app/errors.py": "",
    }
    result = ad_hoc_errors.run(make_layout(tree, coral_toml=cfg))
    assert result.ran and result.findings == ()


def test_the_flat_form_skips_with_a_reason_when_the_repo_has_several_units(make_layout):
    # The conservative half. One repo-wide allowlist cannot decide a per-unit rule,
    # so the check says so rather than reporting a clean run it did not earn.
    cfg = (
        '[coral]\nfeature_dirs = ["a/feat", "b/feat"]\napp_dirs = ["a", "b"]\n'
        'error_types = ["a_errors.validation"]\n'
    )
    tree = {
        "a/feat/add.py": "def run():\n    raise b_errors.usage('bad', 'nope')\n",
        "b/feat/run.py": "",
    }
    result = ad_hoc_errors.run(make_layout(tree, coral_toml=cfg))
    assert not result.ran
    assert "[[coral.error_models]]" in result.skipped and "[ERR-1]" in result.skipped
    assert result.findings == ()


def test_a_library_nested_in_an_app_resolves_to_the_nearer_model(make_layout):
    # Longest path wins, so a published package inside an app is checked against its
    # own declared model rather than its host's.
    cfg = """[coral]
feature_dirs = ["a/feat", "a/pkg/feat"]
app_dirs = ["a"]
library_dirs = ["a/pkg"]

[[coral.error_models]]
path = "a"
types = ["a_errors.validation"]

[[coral.error_models]]
path = "a/pkg"
types = ["pkg_errors.invalid"]
"""
    tree = {
        "a/feat/add.py":
            "import a_errors\n\ndef run():\n    raise a_errors.validation('ok', 'fine')\n",
        "a/pkg/feat/parse.py":
            "import pkg_errors\n\ndef run():\n    raise pkg_errors.invalid('ok', 'fine')\n",
        "a/errors.py": "",
    }
    assert ad_hoc_errors.run(make_layout(tree, coral_toml=cfg)).findings == ()


# ── one definite binding AT the raise, not somewhere in its scope ────────────
#
# A scope-wide binding map answers "was this name ever imported here", which is a
# different question. Execution order and branching decide what reaches the raise,
# and where they do not decide it exactly, neither does this check.


def test_an_import_after_the_raise_does_not_bind_it(make_layout):
    # The later import has not run. Reducing the scope to one map picked it anyway.
    lay = make_layout(
        _a(
            "def run():\n"
            "    from b_errors import validation\n"
            "    raise validation('bad', 'nope')\n"
            "    from a_errors import validation\n"
        ),
        coral_toml=SAME_TAIL_CFG,
    )
    result = ad_hoc_errors.run(lay)
    assert result.ran and len(result.findings) == 1


def test_branches_importing_different_modules_do_not_pass(make_layout):
    # Both branches bind a valid local; one of them violates [ERR-2]. Choosing
    # either is a guess.
    lay = make_layout(
        _a(
            "def run(flag):\n"
            "    if flag:\n        from a_errors import validation\n"
            "    else:\n        from b_errors import validation\n"
            "    raise validation('bad', 'nope')\n"
        ),
        coral_toml=SAME_TAIL_CFG,
    )
    result = ad_hoc_errors.run(lay)
    assert not result.ran and result.findings == ()


def test_branches_importing_the_same_module_still_pass(make_layout):
    # The conservative join must not reject agreement.
    lay = make_layout(
        _a(
            "def run(flag):\n"
            "    if flag:\n        from a_errors import validation\n"
            "    else:\n        from a_errors import validation\n"
            "    raise validation('ok', 'fine')\n"
        ),
        coral_toml=SAME_TAIL_CFG,
    )
    result = ad_hoc_errors.run(lay)
    assert result.ran and result.findings == ()


def test_a_later_star_import_unsettles_an_explicit_binding(make_layout):
    # `from b_errors import *` may re-export `validation` over the explicit one.
    lay = make_layout(
        _a(
            "from a_errors import validation\nfrom b_errors import *\n\n"
            "def run():\n    raise validation('ok', 'fine')\n"
        ),
        coral_toml=SAME_TAIL_CFG,
    )
    result = ad_hoc_errors.run(lay)
    assert not result.ran and result.findings == ()


def test_an_explicit_import_after_a_star_is_definite_again(make_layout):
    lay = make_layout(
        _a(
            "from b_errors import *\nfrom a_errors import validation\n\n"
            "def run():\n    raise validation('ok', 'fine')\n"
        ),
        coral_toml=SAME_TAIL_CFG,
    )
    result = ad_hoc_errors.run(lay)
    assert result.ran and result.findings == ()


# ── a class namespace is not an enclosing scope for its methods ──────────────


def test_a_constructor_imported_into_a_class_does_not_bind_a_bare_method_name(make_layout):
    # `Handler.validation` is an attribute, not a name `run()` can see bare.
    lay = make_layout(
        _a(
            "class Handler:\n    from a_errors import validation\n\n"
            "    def run(self):\n        raise validation('bad', 'nope')\n"
        ),
        coral_toml=SAME_TAIL_CFG,
    )
    result = ad_hoc_errors.run(lay)
    assert result.ran and len(result.findings) == 1


def test_a_module_binding_wins_over_a_same_named_class_attribute(make_layout):
    # The method sees the module's `validation`, which here is app B's.
    lay = make_layout(
        _a(
            "from b_errors import validation\n\n"
            "class Handler:\n    from a_errors import validation\n\n"
            "    def run(self):\n        raise validation('bad', 'nope')\n"
        ),
        coral_toml=SAME_TAIL_CFG,
    )
    result = ad_hoc_errors.run(lay)
    assert result.ran and len(result.findings) == 1


def test_a_method_still_closes_over_the_function_the_class_sits_in(make_layout):
    # Only the class frame is skipped. Scopes outside it stay visible.
    lay = make_layout(
        _a(
            "def outer():\n    from a_errors import validation\n\n"
            "    class Handler:\n        def run(self):\n"
            "            raise validation('ok', 'fine')\n\n    return Handler\n"
        ),
        coral_toml=SAME_TAIL_CFG,
    )
    result = ad_hoc_errors.run(lay)
    assert result.ran and result.findings == ()


def test_a_class_body_still_sees_its_own_bindings(make_layout):
    lay = make_layout(
        _a(
            "class Handler:\n    from a_errors import validation\n"
            "    raise validation('ok', 'fine')\n"
        ),
        coral_toml=SAME_TAIL_CFG,
    )
    result = ad_hoc_errors.run(lay)
    assert result.ran and result.findings == ()


# ── the flat form owns only the unit it declared ─────────────────────────────


def test_the_flat_form_skips_a_slice_outside_its_one_declared_unit(make_layout):
    # `app_dirs = ["a"]` states an ownership boundary. `b/feat` sits outside it, so
    # handing it `a`'s taxonomy is the unowned-slice false pass in the flat form.
    cfg = (
        '[coral]\napp_dirs = ["a"]\nfeature_dirs = ["a/feat", "b/feat"]\n'
        'error_types = ["errors.validation"]\n'
    )
    tree = {
        "a/feat/add.py": "from ..errors import validation\n\ndef run():\n    raise validation('a', 'b')\n",
        "b/feat/run.py": "",
        "a/errors.py": "",
    }
    result = ad_hoc_errors.run(make_layout(tree, coral_toml=cfg))
    assert not result.ran
    assert result.findings == ()
    assert "b/feat/run.py" in result.skipped and "a" in result.skipped


def test_the_flat_form_with_no_declared_unit_keeps_its_legacy_reach(make_layout):
    # No app_dirs or library_dirs means no boundary was stated, so nothing is
    # outside one. This is the ordinary single-app configuration.
    cfg = '[coral]\nfeature_dirs = ["app/feat"]\nerror_types = ["errors.validation"]\n'
    tree = {
        "app/feat/add.py":
            "from errors import validation\n\ndef run():\n    raise validation('a', 'b')\n",
    }
    result = ad_hoc_errors.run(make_layout(tree, coral_toml=cfg))
    assert result.ran and result.findings == ()


# ── function locals are decided at compile time, not by execution order ──────
#
# Binding a name anywhere in a function body makes it local to all of it. A raise
# above that statement reads an unset local — UnboundLocalError — and must not be
# resolved to the module's binding of the same name.


def test_a_later_assignment_makes_the_name_local_from_function_entry(make_layout):
    lay = make_layout(
        _a(
            "from a_errors import validation\n\n"
            "def run():\n    raise validation('bad', 'nope')\n    validation = custom\n"
        ),
        coral_toml=SAME_TAIL_CFG,
    )
    result = ad_hoc_errors.run(lay)
    assert not result.ran and result.findings == ()


def test_a_later_import_makes_the_name_local_from_function_entry(make_layout):
    lay = make_layout(
        _a(
            "from a_errors import validation\n\n"
            "def run():\n    raise validation('bad', 'nope')\n"
            "    from b_errors import validation\n"
        ),
        coral_toml=SAME_TAIL_CFG,
    )
    result = ad_hoc_errors.run(lay)
    assert not result.ran and result.findings == ()


def test_a_later_nested_def_makes_the_name_local_from_function_entry(make_layout):
    lay = make_layout(
        _a(
            "from a_errors import validation\n\n"
            "def run():\n    raise validation('bad', 'nope')\n\n"
            "    def validation(code, message):\n        return RuntimeError(message)\n"
        ),
        coral_toml=SAME_TAIL_CFG,
    )
    result = ad_hoc_errors.run(lay)
    assert not result.ran and result.findings == ()


def test_a_free_name_still_resolves_to_the_enclosing_scope(make_layout):
    # The rule must not swallow the ordinary case: nothing in `run` binds the
    # name, so it is free and the module's import is what it reads.
    lay = make_layout(
        _a("from a_errors import validation\n\ndef run():\n    raise validation('ok', 'fine')\n"),
        coral_toml=SAME_TAIL_CFG,
    )
    result = ad_hoc_errors.run(lay)
    assert result.ran and result.findings == ()


def test_a_global_declaration_opts_out_of_the_local_rule(make_layout):
    # `global` says the name is not local, so the compile-time rule does not apply.
    # It is still a rebinding this check cannot follow, so it stays undecidable.
    lay = make_layout(
        _a(
            "from a_errors import validation\n\n"
            "def run():\n    global validation\n    raise validation('b', 'n')\n"
        ),
        coral_toml=SAME_TAIL_CFG,
    )
    result = ad_hoc_errors.run(lay)
    assert not result.ran and result.findings == ()


# ── the flat form's sole unit also bounds relative imports ───────────────────

SOLE_PKG_CFG = """[coral]
library_dirs = ["a/pkg"]
feature_dirs = ["a/pkg/feat"]
error_types = ["errors.validation"]
"""

SOLE_PKG_TREE = {
    "a/__init__.py": "",
    "a/errors.py": "",
    "a/pkg/__init__.py": "",
    "a/pkg/errors.py": "",
    "a/pkg/feat/__init__.py": "",
}


def test_the_flat_form_bounds_a_relative_import_by_its_sole_unit(make_layout):
    # `from ...errors` escapes the one published package the config declares and
    # reaches the host app's error module. Its spelling is identical, so only the
    # resolved path distinguishes them.
    tree = dict(SOLE_PKG_TREE)
    tree["a/pkg/feat/parse.py"] = (
        "from ...errors import validation\n\ndef run():\n    raise validation('b', 'n')\n"
    )
    result = ad_hoc_errors.run(make_layout(tree, coral_toml=SOLE_PKG_CFG))
    assert result.ran
    assert [f.path for f in result.findings] == ["a/pkg/feat/parse.py"]


def test_the_flat_form_accepts_a_relative_import_inside_its_sole_unit(make_layout):
    tree = dict(SOLE_PKG_TREE)
    tree["a/pkg/feat/parse.py"] = (
        "from ..errors import validation\n\ndef run():\n    raise validation('o', 'k')\n"
    )
    result = ad_hoc_errors.run(make_layout(tree, coral_toml=SOLE_PKG_CFG))
    assert result.ran and result.findings == ()


# ── match captures are runtime data, never an identity ──────────────────────


def test_a_match_capture_used_as_the_constructor_does_not_pass(make_layout):
    # `validation` here is whatever the subject held, not the imported one.
    lay = make_layout(
        _a(
            "from a_errors import validation\n\n"
            "def run(value):\n    match value:\n"
            "        case {'error': validation}:\n            raise validation('b', 'n')\n"
        ),
        coral_toml=SAME_TAIL_CFG,
    )
    result = ad_hoc_errors.run(lay)
    assert not result.ran and result.findings == ()


def test_a_later_match_capture_makes_the_name_a_function_local(make_layout):
    # The capture binds somewhere in the body, so the earlier read is an unset
    # local rather than the module's import.
    lay = make_layout(
        _a(
            "from a_errors import validation\n\n"
            "def run(value):\n    raise validation('b', 'n')\n\n"
            "    match value:\n        case {'error': validation}:\n            pass\n"
        ),
        coral_toml=SAME_TAIL_CFG,
    )
    result = ad_hoc_errors.run(lay)
    assert not result.ran and result.findings == ()


def test_a_nested_rest_capture_is_collected_too(make_layout):
    # Captures nest: sequence, star, mapping `**rest`, class and or-patterns all
    # bind through their sub-patterns.
    lay = make_layout(
        _a(
            "from a_errors import validation\n\n"
            "def run(value):\n    match value:\n"
            "        case [1, *validation]:\n            raise validation('b', 'n')\n"
        ),
        coral_toml=SAME_TAIL_CFG,
    )
    result = ad_hoc_errors.run(lay)
    assert not result.ran and result.findings == ()


def test_a_non_capturing_pattern_does_not_shadow_the_outer_binding(make_layout):
    # `case 1:` binds nothing, so the import is still what the arm reads.
    lay = make_layout(
        _a(
            "from a_errors import validation\n\n"
            "def run(value):\n    match value:\n"
            "        case 1:\n            raise validation('o', 'k')\n"
        ),
        coral_toml=SAME_TAIL_CFG,
    )
    result = ad_hoc_errors.run(lay)
    assert result.ran and result.findings == ()


# ── `del` unbinds, and makes the name local ─────────────────────────────────


def test_a_deleted_name_is_no_longer_the_imported_constructor(make_layout):
    lay = make_layout(
        _a(
            "def run():\n    from a_errors import validation\n    del validation\n"
            "    raise validation('b', 'n')\n"
        ),
        coral_toml=SAME_TAIL_CFG,
    )
    result = ad_hoc_errors.run(lay)
    assert not result.ran and result.findings == ()


def test_a_later_del_makes_the_name_local_from_function_entry(make_layout):
    lay = make_layout(
        _a(
            "from a_errors import validation\n\n"
            "def run():\n    raise validation('b', 'n')\n    del validation\n"
        ),
        coral_toml=SAME_TAIL_CFG,
    )
    result = ad_hoc_errors.run(lay)
    assert not result.ran and result.findings == ()


def test_deleting_an_attribute_does_not_unset_the_constructor(make_layout):
    # `del holder.validation` touches an object, not the name.
    lay = make_layout(
        _a(
            "from a_errors import validation\n\n"
            "def run(holder):\n    del holder.validation\n    raise validation('o', 'k')\n"
        ),
        coral_toml=SAME_TAIL_CFG,
    )
    result = ad_hoc_errors.run(lay)
    assert result.ran and result.findings == ()


# ── a handler sees any prefix of the body; break and continue skip the rest ──


def test_a_handler_sees_the_bindings_of_a_partly_executed_body(make_layout):
    # The state before the try and after the whole body are both `a_errors`, but
    # if the middle call throws, the handler runs with `b_errors`. Joining the
    # endpoints hides that path.
    lay = make_layout(
        _a(
            "def run():\n    from a_errors import validation\n\n    try:\n"
            "        from b_errors import validation\n        operation()\n"
            "        from a_errors import validation\n"
            "    except Exception:\n        raise validation('b', 'n')\n"
        ),
        coral_toml=SAME_TAIL_CFG,
    )
    result = ad_hoc_errors.run(lay)
    assert not result.ran and result.findings == ()


def test_a_handler_where_every_prefix_agrees_still_passes(make_layout):
    # The conservative join must not make ordinary try/except undecidable.
    lay = make_layout(
        _a(
            "def run():\n    from a_errors import validation\n\n    try:\n"
            "        operation()\n"
            "    except Exception:\n        raise validation('o', 'k')\n"
        ),
        coral_toml=SAME_TAIL_CFG,
    )
    result = ad_hoc_errors.run(lay)
    assert result.ran and result.findings == ()


def test_a_break_carries_its_binding_past_the_rest_of_the_loop_body(make_layout):
    # After one iteration the binding is `b_errors`; the import after `break`
    # never runs. Walking straight through the body restores `a_errors`.
    lay = make_layout(
        _a(
            "def run(items):\n    from a_errors import validation\n\n"
            "    for item in items:\n        from b_errors import validation\n"
            "        break\n        from a_errors import validation\n\n"
            "    raise validation('b', 'n')\n"
        ),
        coral_toml=SAME_TAIL_CFG,
    )
    result = ad_hoc_errors.run(lay)
    assert not result.ran and result.findings == ()


def test_a_continue_does_the_same(make_layout):
    lay = make_layout(
        _a(
            "def run(items):\n    from a_errors import validation\n\n"
            "    for item in items:\n        from b_errors import validation\n"
            "        continue\n        from a_errors import validation\n\n"
            "    raise validation('b', 'n')\n"
        ),
        coral_toml=SAME_TAIL_CFG,
    )
    result = ad_hoc_errors.run(lay)
    assert not result.ran and result.findings == ()


def test_a_loop_that_rebinds_nothing_leaves_the_constructor_alone(make_layout):
    lay = make_layout(
        _a(
            "def run(items):\n    from a_errors import validation\n\n"
            "    for item in items:\n        operation(item)\n\n"
            "    raise validation('o', 'k')\n"
        ),
        coral_toml=SAME_TAIL_CFG,
    )
    result = ad_hoc_errors.run(lay)
    assert result.ran and result.findings == ()
