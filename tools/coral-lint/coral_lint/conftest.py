"""One fixture: build a throwaway repo and resolve its layout.

Shared because the convention "checks are exercised against a real tree, not a
mocked layout" must not diverge between check tests.  [XCUT-1]
"""

from __future__ import annotations

import pytest

from coral_lint import config as config_module, layout as layout_module

FEATURE_CFG = '[coral]\nfeature_dirs = ["app/feat"]\n'


@pytest.fixture
def make_layout(tmp_path):
    def _make(files: dict[str, str], coral_toml: str | None = None):
        for rel, content in files.items():
            path = tmp_path / rel
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(content, encoding="utf-8")
        if coral_toml is not None:
            (tmp_path / "coral.toml").write_text(coral_toml, encoding="utf-8")
        return layout_module.discover(tmp_path, config_module.load(tmp_path))

    return _make
