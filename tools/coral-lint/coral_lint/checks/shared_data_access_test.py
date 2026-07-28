from coral_lint.checks import shared_data_access as check

CFG = '[coral]\napp_dirs = ["app"]\nfeature_dirs = ["app/feat"]\n'

QUERIES = (
    'def get(conn, i):\n    return conn.execute("SELECT id FROM t WHERE id = ?", (i,))\n\n\n'
    'def put(conn, i):\n    conn.execute("INSERT INTO t VALUES (?)", (i,))\n'
)


def test_skips_and_says_why_without_config(make_layout):
    result = check.run(make_layout({"app/feat/add.py": ""}))
    assert not result.ran and "feature_dirs" in result.skipped


def test_flags_a_query_module_two_slices_import(make_layout):
    lay = make_layout(
        {
            "app/queries.py": QUERIES,
            "app/feat/add.py": "from .. import queries\n\n\ndef run(c):\n    queries.put(c, 1)\n",
            "app/feat/show.py": "from .. import queries\n\n\ndef run(c):\n    return queries.get(c, 1)\n",
        },
        coral_toml=CFG,
    )

    findings = check.run(lay).findings
    assert len(findings) == 1
    assert findings[0].path == "app/queries.py"
    assert "imported by 2 slices" in findings[0].message
    assert "add" in findings[0].message and "show" in findings[0].message


def test_one_importing_slice_is_not_yet_a_shared_layer(make_layout):
    # [XCUT-1]'s floor is two consumers, and one slice keeping its own query module
    # is [STATE-1] working.
    lay = make_layout(
        {
            "app/queries.py": QUERIES,
            "app/feat/add.py": "from .. import queries\n\n\ndef run(c):\n    queries.put(c, 1)\n",
            "app/feat/show.py": "def run(c):\n    return 1\n",
        },
        coral_toml=CFG,
    )
    assert check.run(lay).findings == ()


def test_an_adapter_that_imports_slices_passes(make_layout):
    # The interface-ownership test, made observable: the arrow runs store -> slice,
    # no slice imports store, so it is an adapter and not a repository. This is the
    # Go example's generated `store` package.
    lay = make_layout(
        {
            "app/store.py": "from .feat import add\n\n" + QUERIES,
            "app/feat/add.py": "class Store:\n    def put(self, i): ...\n",
            "app/feat/show.py": "class Reader:\n    def get(self, i): ...\n",
        },
        coral_toml=CFG,
    )
    assert check.run(lay).findings == ()


def test_a_db_horizontal_without_queries_passes(make_layout):
    lay = make_layout(
        {
            "app/db.py": "import sqlite3\n\n\nclass Db:\n    def tx(self):\n        return sqlite3.connect(':memory:')\n",
            "app/feat/add.py": "from .. import db\n\n\ndef run():\n    return db.Db()\n",
            "app/feat/show.py": "from .. import db\n\n\ndef run():\n    return db.Db()\n",
        },
        coral_toml=CFG,
    )
    assert check.run(lay).findings == ()


def test_a_shared_package_counts_too(make_layout):
    lay = make_layout(
        {
            "app/store/__init__.py": "",
            "app/store/pg.py": QUERIES,
            "app/feat/add.py": "from ..store import pg\n\n\ndef run(c):\n    pg.put(c, 1)\n",
            "app/feat/show.py": "from ..store import pg\n\n\ndef run(c):\n    return pg.get(c, 1)\n",
        },
        coral_toml=CFG,
    )
    findings = check.run(lay).findings
    assert len(findings) == 1 and findings[0].path == "app/store"


def test_slices_owning_their_own_queries_pass(make_layout):
    lay = make_layout(
        {
            "app/feat/add.py": 'def run(c):\n    c.execute("INSERT INTO t VALUES (1)")\n',
            "app/feat/show.py": 'def run(c):\n    return c.execute("SELECT id FROM t")\n',
        },
        coral_toml=CFG,
    )
    assert check.run(lay).findings == ()


def test_a_module_holding_sql_shaped_regexes_is_not_a_data_access_layer(make_layout):
    # The first false positive this tool produced was against its own pysource.py:
    # a module that *processes* SQL rather than executing it. A linter, a query
    # builder or a migration tool must not read as a repository.
    lay = make_layout(
        {
            "app/sqlparse.py": 'PATTERN = r"\\bselect\\s[\\s\\S]{0,300}?\\sfrom\\s|\\binsert\\s+into\\s"\n',
            "app/feat/add.py": "from .. import sqlparse\n\n\ndef run():\n    return sqlparse.PATTERN\n",
            "app/feat/show.py": "from .. import sqlparse\n\n\ndef run():\n    return sqlparse.PATTERN\n",
        },
        coral_toml=CFG,
    )
    assert check.run(lay).findings == ()
