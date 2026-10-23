# Worked example: a Go API capability slice (one endpoint, end to end)

> Written against **Coral 0.6.0**.
>
> **"Written against" names the latest *released* Coral.** The error-model citations below are
> **unreleased** and ship in 0.7.0: `[ERR-1]` becomes a kernel rule that names no categories, and
> `[ERR-5]` becomes the recommended six-category vocabulary. In 0.6.0, `[ERR-1]` is a
> production-baseline rule that fixes those six names. The project's `CORAL.md` targets `0.7.0`,
> because the contract generator first ships there. Delete this note when 0.7.0 is cut.

The [CLI example](./cli-slice) shows a slice in a language that imposes nothing, so each slice is one
file. This one is in Go, where import cycles and single-package code generation shape the tree. It is **a
complete Coral slice, built and tested**: one read endpoint wired through, with its tests and the
crosscuts it uses. The code is an executable project at
[`examples/go-api-slice/`](https://github.com/throw-if-null/coral/tree/main/examples/go-api-slice),
and this page excerpts it. Every Go and SQL fence below is a verbatim excerpt of a project file, and
the build fails when one is not. The [third example](./backend-review) goes the other direction and
*reviews* a real service for where it drifts.

The example is deliberately tiny: one slice, two roots, and the crosscuts a second slice would share.
It shows the N-slice shape at N=1, and the shape stays the same as the service grows.

The capability: **fetch one document, scoped to the caller's tenant.** `GET /v1/documents/{id}`. The
`/v1` prefix is the API versioning strategy, the URL prefix `[BE-7]` defaults to, and the project's
[`README.md`](https://github.com/throw-if-null/coral/blob/main/examples/go-api-slice/README.md)
writes it down.

## The shape

A capability is one **slice**, in one package, plus the **crosscuts** it uses and the **adapter** that
implements its persistence port. Two **roots** wire the same packages: one serves, one migrates.

```text
cmd/
  api/main.go          ← the root that serves: config, crosscuts, adapter, slice; then runs
  migrate/main.go      ← the root that migrates: applies the migrations the slice package defines
internal/
  document/            ← the slice: body and HTTP edge of one capability, in one package
    document.go        ←   the entity, the Store port, the migrations it owns, Register
    get.go             ←   the get operation: body (Get) and edge (getHandler)
    get_test.go        ←   behavior tests at the HTTP boundary, against an in-memory Store
    migrations/        ←   the documents table, defined here and nowhere else
      0001_create_documents.sql
  errs/                ← crosscut: the error model, and the handler the root registers to render it
  reqctx/              ← crosscut: who is calling (tenant), established at the trust boundary
  db/                  ← crosscut: the connection pool, and the runner that applies migrations
    db.go
    migrate_test.go    ←   migrations apply once, against a real Postgres, when DATABASE_URL is set
  config/              ← crosscut: every setting the app reads, resolved and validated once
  store/               ← adapter: implements document.Store with pgx (sqlc output in a real service)
    postgres.go
    postgres_test.go   ←   tenant isolation against a real Postgres, when DATABASE_URL is set
  pgtest/              ← test support: a disposable Postgres schema; only tests import it
```

The dependency arrows point one way: `store → document → errs, reqctx`. The slice imports no `pgx`,
the adapter imports the slice's port, and the roots import all of them in order to wire them. `db`
and `config` are consumed by the two roots and by no slice.

`[BE-1]` names the slice for the singular capability plus its effect verb, `document/get`, and makes it a
file inside the capability's package while the capability holds one operation. This package holds one,
so the slice is `get.go` in package `document`. With a second operation, each operation becomes a
package of its own under `document/`.

## The crosscuts

Errors are a **crosscut** (`[XCUT-3]`, `[ERR-1]`): one small model, declared once, raised by slices,
rendered by the root. `[ERR-3]` states the division: *slices raise, the root renders, nothing else
renders.*

**This model is three categories, not Coral's recommended six.** `[ERR-1]` asks for one small, stable,
declared model and fixes neither the count nor the names, so `internal` / `not_found` / `invalid` is
conformant as long as the root maps all of it (`[BE-5]`). `[ERR-5]`'s six-category vocabulary is the
default a project takes when it has no reason to differ; this example shows what the other choice looks
like.

[`internal/errs/errs.go`](https://github.com/throw-if-null/coral/blob/main/examples/go-api-slice/internal/errs/errs.go)
declares the categories, the error slices raise, and two constructors. `code` is a parameter of both,
so every code is minted by the slice that raises it (`[ERR-2]`):

```go
// Category is one of the app's declared error categories. The set is closed: adding a
// category changes this declaration and Status, and no slice.
type Category string

const (
	Internal Category = "internal"
	NotFound Category = "not_found"
	Invalid  Category = "invalid"
)

// Error is the failure a slice raises. Code is minted by the raising slice.
type Error struct {
	Category Category
	Code     string
	Message  string
	cause    error
}

func (e *Error) Error() string { return e.Message }

// Unwrap exposes the cause to the log line, never to the response body.
func (e *Error) Unwrap() error { return e.cause }

// New constructs a raised failure.
func New(category Category, code, message string) *Error {
	return &Error{Category: category, Code: code, Message: message}
}

// Wrap classifies an unexpected cause as Internal. The message is fixed so the cause
// cannot reach the client.
func Wrap(code string, cause error) *Error {
	return &Error{Category: Internal, Code: code, Message: "internal error", cause: cause}
}
```

The same file maps every category to a status and holds the handler the root registers. Adding a
category touches the declaration and `Status`, and no slice (`[BE-5]`). Fiber's own errors, for an
unmatched route or method, keep their status and carry no slice-owned `code`, because no slice raised
them. Anything else that reaches the handler bypassed the model and is caught here, once (`[ERR-3]`):

```go
// Status maps every declared category to an HTTP status.
func Status(c Category) int {
	switch c {
	case NotFound:
		return http.StatusNotFound
	case Invalid:
		return http.StatusBadRequest
	case Internal:
		return http.StatusInternalServerError
	}
	// A value outside the declared set is a defect. It renders as an internal failure
	// rather than falling through to a handler.
	return http.StatusInternalServerError
}

type body struct {
	Category Category `json:"category"`
	Code     string   `json:"code"`
	Message  string   `json:"message"`
}

// ErrorHandler renders every error a handler returns as {category, code, message}. The
// root registers it as the app's one error handler, and nothing else renders.
func ErrorHandler(log *slog.Logger) fiber.ErrorHandler {
	return func(c *fiber.Ctx, err error) error {
		var e *Error
		if !errors.As(err, &e) {
			// Fiber raises its own errors for an unmatched route or method. No slice raised
			// them, so they keep Fiber's status and carry no slice-owned code.
			var fe *fiber.Error
			if errors.As(err, &fe) {
				return c.Status(fe.Code).JSON(fiber.Map{"message": fe.Message})
			}
			// Anything else bypassed the model. The root catches it once, here.
			e = Wrap("unhandled", err)
		}
		if e.Category == Internal {
			log.Error("request failed", "path", c.Path(), "code", e.Code, "error", e.cause)
		}
		return c.Status(Status(e.Category)).JSON(body{Category: e.Category, Code: e.Code, Message: e.Message})
	}
}
```

Identity is the other crosscut the slice consumes. The tenant is established at the **trust boundary**
by middleware that reads a gateway-verified header (`[TRUST-1]`, `[BE-6]`). A request without a
well-formed header is unauthenticated, and the middleware rejects it with `401` and a minimal body,
never through the error model (`[BE-8]`). The trust boundary is stated (`[TRUST-2]`): the service
trusts the gateway and nothing in front of it.
[`internal/reqctx/reqctx.go`](https://github.com/throw-if-null/coral/blob/main/examples/go-api-slice/internal/reqctx/reqctx.go):

```go
// Header carries the tenant the gateway verified. The service trusts the gateway and
// nothing in front of it; a client that reaches the service directly is outside the trust
// boundary.
const Header = "X-Tenant-ID"

type ctxKey struct{}

// WithTenant records the verified tenant on the context.
func WithTenant(ctx context.Context, tenantID uuid.UUID) context.Context {
	return context.WithValue(ctx, ctxKey{}, tenantID)
}

// TenantID reads the verified tenant. ok is false when Authenticate did not run.
func TenantID(ctx context.Context) (uuid.UUID, bool) {
	id, ok := ctx.Value(ctxKey{}).(uuid.UUID)
	return id, ok
}

// Authenticate is the middleware the root registers before every route. A request without
// a well-formed tenant header is unauthenticated and is rejected here with 401 and a
// minimal body, outside the error model: no slice raised it.
func Authenticate(c *fiber.Ctx) error {
	id, err := uuid.Parse(c.Get(Header))
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"message": "unauthenticated"})
	}
	c.SetUserContext(WithTenant(c.UserContext(), id))
	return c.Next()
}
```

There is no `403` path. Every verified tenant may call `GET /v1/documents/{id}`, so coarse capability
authorization has nothing to decide. Resource-level authorization is the scoped query, below.

Two more crosscuts serve the roots. `config` resolves and validates every setting the app reads
(`[CONFIG-1]`, `[CONFIG-3]`); both roots consume it, which is the second consumer `[XCUT-1]` asks
for. `db` owns the connection pool and runs migrations, and is described with the schema below.

## The slice

The capability is one package, `document`.
[`document.go`](https://github.com/throw-if-null/coral/blob/main/examples/go-api-slice/internal/document/document.go)
holds what every operation of the capability shares: the entity, the persistence port, the migrations,
and `Register`. The port lists exactly what this capability needs, and the adapter implements it
(`[STATE-2]`). The `documents` table has one owning package, so its migrations live here
(`[STATE-5]`):

```go
// Document is the entity this capability owns. TenantID is part of the record because
// resource-level authorization is the scoped query.
type Document struct {
	ID       uuid.UUID
	TenantID uuid.UUID
	Title    string
	Body     string
}

// Store is the persistence port this capability declares. It lists only the operations
// the capability uses, and the adapter in internal/store implements it.
type Store interface {
	// GetByID returns the document only when it belongs to tenantID, and ErrNoRows
	// otherwise. A document of another tenant is a miss, not a denial.
	GetByID(ctx context.Context, tenantID, id uuid.UUID) (Document, error)
}

// ErrNoRows is what a Store returns when the scoped query matches nothing.
var ErrNoRows = errors.New("no rows")

//go:embed migrations/*.sql
var migrationFiles embed.FS

// Migrations holds this package's schema migrations, one SQL file each, which the db
// crosscut applies in file-name order. This package owns the documents table, so its schema
// is defined here and nowhere else.
var Migrations, _ = fs.Sub(migrationFiles, "migrations")

// Register mounts the capability's triggers on r. The root passes r already versioned.
func Register(r fiber.Router, s Store) {
	r.Get("/documents/:id", getHandler(s))
}
```

[`get.go`](https://github.com/throw-if-null/coral/blob/main/examples/go-api-slice/internal/document/get.go)
is the operation. The **body**, `Get`, is domain logic: it threads the tenant through for isolation
and translates the port's "no rows" into the model's missing-resource category. A document of another
tenant and a document that does not exist are the same miss, and the slice makes no misstatement of its
own (`[BE-6]`, `[BE-8]`). An unexpected failure is wrapped with a slice-owned code:

```go
// Get returns one document scoped to the caller's tenant. A scoped miss is raised as
// NotFound whether the document does not exist or belongs to another tenant.
func Get(ctx context.Context, s Store, tenantID, id uuid.UUID) (Document, error) {
	doc, err := s.GetByID(ctx, tenantID, id)
	if errors.Is(err, ErrNoRows) {
		return Document{}, errs.New(errs.NotFound, "document_not_found", "document not found")
	}
	if err != nil {
		return Document{}, errs.Wrap("document_store", err)
	}
	return doc, nil
}
```

The **edge**, `getHandler`, reads the tenant, parses the id, calls the body, and writes the success
status (`[BE-2]`). A failure is *returned*, and the root renders it. No status for a failure is written
here (`[BE-5]`). The middleware guarantees a tenant, so its absence is a wiring defect, raised as
`internal` rather than rendered as a `400`:

```go
type getResponse struct {
	ID    uuid.UUID `json:"id"`
	Title string    `json:"title"`
	Body  string    `json:"body"`
}

// getHandler is the HTTP edge of get. It reads the tenant, parses the id, calls the body,
// and writes the success status. A failure is returned for the root to render.
func getHandler(s Store) fiber.Handler {
	return func(c *fiber.Ctx) error {
		tenantID, ok := reqctx.TenantID(c.UserContext())
		if !ok {
			// reqctx.Authenticate guarantees a tenant. Its absence is a wiring defect.
			return errs.Wrap("document_no_tenant", errors.New("no tenant on the request context"))
		}
		id, err := uuid.Parse(c.Params("id"))
		if err != nil {
			return errs.New(errs.Invalid, "document_bad_id", "invalid document id")
		}
		doc, err := Get(c.UserContext(), s, tenantID, id)
		if err != nil {
			return err
		}
		return c.Status(fiber.StatusOK).JSON(getResponse{ID: doc.ID, Title: doc.Title, Body: doc.Body})
	}
}
```

## The adapter

[`internal/store/postgres.go`](https://github.com/throw-if-null/coral/blob/main/examples/go-api-slice/internal/store/postgres.go)
implements `document.Store` with pgx. It is hand-written here. In a real service **sqlc** generates
this package from the slices' queries, which is why persistence is one shared adapter package rather
than a package per slice (`[MODEL-4]`). Two details matter: the tenant scoping in the SQL, and the
translation of the driver's "no rows" into the port's:

```go
// PG implements document.Store against a pgx pool.
type PG struct{ pool *pgxpool.Pool }

func NewPG(pool *pgxpool.Pool) *PG { return &PG{pool: pool} }

// GetByID scopes the query by tenant. A row of another tenant matches nothing.
func (p *PG) GetByID(ctx context.Context, tenantID, id uuid.UUID) (document.Document, error) {
	const q = `SELECT id, tenant_id, title, body FROM documents WHERE tenant_id = $1 AND id = $2`
	var d document.Document
	err := p.pool.QueryRow(ctx, q, tenantID, id).Scan(&d.ID, &d.TenantID, &d.Title, &d.Body)
	if errors.Is(err, pgx.ErrNoRows) {
		return document.Document{}, document.ErrNoRows
	}
	if err != nil {
		return document.Document{}, err
	}
	return d, nil
}
```

## The schema and its migrations

The owning package defines the schema, as migrations under
[`internal/document/migrations/`](https://github.com/throw-if-null/coral/tree/main/examples/go-api-slice/internal/document/migrations)
(`[STATE-5]`). The slice package embeds them and exports them as `document.Migrations`, so the table
is defined in one place and the package that owns it:

```sql
CREATE TABLE documents (
    id        uuid PRIMARY KEY,
    tenant_id uuid NOT NULL,
    title     text NOT NULL,
    body      text NOT NULL
);
```

The `db` crosscut runs them. It is the small, precisely named crosscut `PRODUCTION.md` § 11 allows
for connection management, pooling, and migration execution: it owns the pool and the
`schema_migrations` ledger, and it holds no query of any capability and defines no schema
(`[STATE-1]`, `[STATE-2]`). `Migrate` takes one `Set` per owning package, applies each file the
ledger does not record in one transaction with its record, and returns what it applied.
[`internal/db/db.go`](https://github.com/throw-if-null/coral/blob/main/examples/go-api-slice/internal/db/db.go):

```go
// Set is one package's migrations: the SQL files it owns, applied in file-name order and
// recorded under Owner.
type Set struct {
	Owner string
	FS    fs.FS
}

const ledger = `CREATE TABLE IF NOT EXISTS schema_migrations (
	name       text PRIMARY KEY,
	applied_at timestamptz NOT NULL DEFAULT now()
)`

// Migrate applies every migration in sets that schema_migrations does not record, one
// transaction per file, and returns the names it applied, in order.
func Migrate(ctx context.Context, pool *pgxpool.Pool, sets ...Set) ([]string, error) {
	if _, err := pool.Exec(ctx, ledger); err != nil {
		return nil, fmt.Errorf("schema_migrations: %w", err)
	}
	var applied []string
	for _, set := range sets {
		files, err := fs.Glob(set.FS, "*.sql")
		if err != nil {
			return applied, err
		}
		sort.Strings(files)
		for _, file := range files {
			name := set.Owner + "/" + file
			var recorded bool
			const q = `SELECT EXISTS (SELECT 1 FROM schema_migrations WHERE name = $1)`
			if err := pool.QueryRow(ctx, q, name).Scan(&recorded); err != nil {
				return applied, fmt.Errorf("%s: %w", name, err)
			}
			if recorded {
				continue
			}
			if err := apply(ctx, pool, set.FS, file, name); err != nil {
				return applied, fmt.Errorf("%s: %w", name, err)
			}
			applied = append(applied, name)
		}
	}
	return applied, nil
}

// apply runs one migration file and records it in the same transaction. Postgres DDL is
// transactional, so a failure leaves neither the change nor the record.
func apply(ctx context.Context, pool *pgxpool.Pool, fsys fs.FS, file, name string) error {
	sql, err := fs.ReadFile(fsys, file)
	if err != nil {
		return err
	}
	tx, err := pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	if _, err := tx.Exec(ctx, string(sql)); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `INSERT INTO schema_migrations (name) VALUES ($1)`, name); err != nil {
		return err
	}
	return tx.Commit(ctx)
}
```

The trigger is a separate command,
[`cmd/migrate/main.go`](https://github.com/throw-if-null/coral/blob/main/examples/go-api-slice/cmd/migrate/main.go),
a second thin root: it resolves configuration, opens the pool, passes the owning package's set to
`db.Migrate`, and logs each applied name. The API does not run migrations at startup. Whether an app
migrates at startup or as a separate step is a per-app human decision; this project's choice, the
separate step, is recorded in its `README.md`:

```go
func run(log *slog.Logger) error {
	cfg, err := config.Load()
	if err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()
	pool, err := db.Open(ctx, cfg.DatabaseURL)
	if err != nil {
		return err
	}
	defer pool.Close()

	applied, err := db.Migrate(ctx, pool, db.Set{Owner: "document", FS: document.Migrations})
	for _, name := range applied {
		log.Info("applied", "migration", name)
	}
	if err != nil {
		return err
	}
	log.Info("schema is current", "applied", len(applied))
	return nil
}
```

## The composition root

[`cmd/api/main.go`](https://github.com/throw-if-null/coral/blob/main/examples/go-api-slice/cmd/api/main.go)
wires and runs, and holds no business logic (`[ROOT-1]`). It resolves configuration through the
`config` crosscut, so a missing `DATABASE_URL` fails startup, and takes the pool from `db.Open`,
which parses and pings, so an unreachable database fails startup as well (`[CONFIG-3]`). It registers
the one error handler, the authentication middleware, and the slice under the `/v1` group. Importing
the crosscuts, the adapter, and the slice's `Register` is wiring, which `[ROOT-2]` permits. What it
forbids is reaching into a slice's behavior or making a state-access call:

```go
func main() {
	log := slog.New(slog.NewJSONHandler(os.Stderr, nil))
	if err := run(log); err != nil {
		log.Error("startup failed", "error", err)
		os.Exit(1)
	}
}

func run(log *slog.Logger) error {
	cfg, err := config.Load()
	if err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	// Migrations are a separate step, cmd/migrate, by decision: the API never runs them.
	pool, err := db.Open(ctx, cfg.DatabaseURL)
	if err != nil {
		return err
	}
	defer pool.Close()

	app := fiber.New(fiber.Config{ErrorHandler: errs.ErrorHandler(log)})
	app.Use(reqctx.Authenticate)
	// The API versioning strategy is a URL prefix. Every route is mounted under it.
	v1 := app.Group("/v1")
	document.Register(v1, store.NewPG(pool))
	return app.Listen(cfg.Addr)
}
```

```go
// Open parses url, opens a pool, and pings it, so a missing, malformed, or unreachable
// database fails at construction rather than at first use.
func Open(ctx context.Context, url string) (*pgxpool.Pool, error) {
	if url == "" {
		return nil, errors.New("database URL is empty")
	}
	pool, err := pgxpool.New(ctx, url)
	if err != nil {
		return nil, err
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("ping: %w", err)
	}
	return pool, nil
}
```

## The tests

The behavior tests are the acceptance tests of `document/get`, written as the
[behavioral verification protocol](../guides/behavioral-verification) states a criterion: one trigger,
one outcome, at the HTTP boundary, in rendered form. They drive the slice's real entry point through
`app.Test` against an in-memory `Store` (`[TEST-1]`), and each asserts one criterion and is named
for it.
[`get_test.go`](https://github.com/throw-if-null/coral/blob/main/examples/go-api-slice/internal/document/get_test.go)
opens with the criteria:

```go
// The acceptance criteria of document/get, in the format of the behavioral verification
// protocol. Each test asserts one criterion and is named for it.
//
//	Feature:    document/get
//	Boundary:   HTTP. GET /v1/documents/{id}, called with the gateway-verified tenant header.
//	            Contract: status code + response body + observable side effects.
//	Assumes:    the app's three-category error model and its status map: invalid renders
//	            as 400, not_found as 404, internal as 500.
//
//	Criterion:  get-returns-document
//	  Given:    a document of the caller's tenant exists.
//	  When:     GET /v1/documents/{id}.
//	  Then:     status 200, and the body is {id, title, body} of that document.
//
//	Criterion:  get-rejects-malformed-id
//	  When:     GET /v1/documents/not-a-uuid.
//	  Then:     status 400, and the body is {category: "invalid", code: "document_bad_id",
//	            message: <non-empty>}.
//
//	Criterion:  get-misses-unknown-document
//	  When:     GET /v1/documents/{id} for an id no tenant has.
//	  Then:     status 404, and the body is {category: "not_found",
//	            code: "document_not_found", message: <non-empty>}.
//
//	Criterion:  get-hides-other-tenants-document
//	  Given:    a document of another tenant exists.
//	  When:     GET /v1/documents/{id} for that document.
//	  Then:     status 404, and the body equals the body of get-misses-unknown-document.
//
//	Criterion:  get-hides-store-failure
//	  Given:    the store fails.
//	  When:     GET /v1/documents/{id}.
//	  Then:     status 500, and the body is {category: "internal", code: "document_store",
//	            message: <non-empty>}, and nothing of the failure is in it.
//
//	Criterion:  get-requires-tenant
//	  When:     GET /v1/documents/{id} without the tenant header, or with one that is not
//	            a UUID.
//	  Then:     status 401, and the body carries no category and no code.
```

The in-memory store is an implementation of the real port, not a mock that asserts on calls. It honours
the port's tenant scoping like the adapter does:

```go
// memStore is an in-memory document.Store. It honours the port's tenant scoping as the
// adapter does, so a document of another tenant is a miss.
type memStore map[uuid.UUID]document.Document

func (m memStore) GetByID(_ context.Context, tenantID, id uuid.UUID) (document.Document, error) {
	d, ok := m[id]
	if !ok || d.TenantID != tenantID {
		return document.Document{}, document.ErrNoRows
	}
	return d, nil
}
```

The tests assemble the app the way the root does, with the same error handler and middleware. Go cannot
import package `main`, so the three wiring lines are repeated:

```go
// newApp assembles the app as cmd/api/main.go does: the root's error handler, the
// authentication middleware, and the versioned route group. Go cannot import package
// main, so the wiring is repeated here.
func newApp(s document.Store) *fiber.App {
	log := slog.New(slog.NewTextHandler(io.Discard, nil))
	app := fiber.New(fiber.Config{ErrorHandler: errs.ErrorHandler(log)})
	app.Use(reqctx.Authenticate)
	document.Register(app.Group("/v1"), s)
	return app
}
```

Two criteria are what `[BE-8]` and the protocol's security item ask for. A scoped miss reaches the
client as a `404` whose body is byte for byte the body of a genuine miss, and a request without a tenant
is a `401` whose body carries no `category` and no `code`:

```go
func TestGet_hidesOtherTenantsDocument(t *testing.T) {
	caller, other, id := uuid.New(), uuid.New(), uuid.New()
	app := newApp(memStore{id: {ID: id, TenantID: other, Title: "Theirs", Body: "Private"}})

	status, body, scoped := get(t, app, caller.String(), id.String())
	_, _, genuine := get(t, app, caller.String(), uuid.NewString())

	assertError(t, status, body, http.StatusNotFound, "not_found", "document_not_found")
	if !bytes.Equal(scoped, genuine) {
		t.Fatalf("scoped miss %s differs from genuine miss %s", scoped, genuine)
	}
}
```

There is no body test. Each branch of `Get` is reached by one request, so a direct test of it would
duplicate the behavior tests, which `[TEST-3]` forbids.

**The in-memory tests cannot verify two things**: the SQL in `store/postgres.go`, including the
`tenant_id = $1` clause that *is* the tenant isolation (`[BE-6]`), and the migrations. `[TEST-1]`'s
"real or realistic temporary infrastructure" means both need a real Postgres. Two tests run when
`DATABASE_URL` is set and skip, naming the variable, when it is not. Each takes a disposable schema
from the `pgtest` helper, which creates it and drops it when the test ends.
[`internal/db/migrate_test.go`](https://github.com/throw-if-null/coral/blob/main/examples/go-api-slice/internal/db/migrate_test.go)
applies the slice package's migrations twice: the first run applies
`document/0001_create_documents.sql` and the table exists, the second applies nothing.
[`internal/store/postgres_test.go`](https://github.com/throw-if-null/coral/blob/main/examples/go-api-slice/internal/store/postgres_test.go)
migrates the same way, then asserts that the owner reads the row and another tenant does not:

```go
func TestPG_scopesByTenant(t *testing.T) {
	pool := pgtest.Schema(t)
	ctx := context.Background()
	if _, err := db.Migrate(ctx, pool, db.Set{Owner: "document", FS: document.Migrations}); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	owner, other, id := uuid.New(), uuid.New(), uuid.New()
	const insert = `INSERT INTO documents (id, tenant_id, title, body) VALUES ($1, $2, $3, $4)`
	if _, err := pool.Exec(ctx, insert, id, owner, "Hello", "World"); err != nil {
		t.Fatalf("insert: %v", err)
	}
	s := store.NewPG(pool)

	got, err := s.GetByID(ctx, owner, id)
	if err != nil || got.Title != "Hello" || got.TenantID != owner {
		t.Fatalf("owner's read: got (%v, %v), want the document", got, err)
	}
	if _, err := s.GetByID(ctx, other, id); !errors.Is(err, document.ErrNoRows) {
		t.Fatalf("another tenant's read: got %v, want ErrNoRows", err)
	}
	if _, err := s.GetByID(ctx, owner, uuid.New()); !errors.Is(err, document.ErrNoRows) {
		t.Fatalf("unknown id: got %v, want ErrNoRows", err)
	}
}
```

## Run it

```bash
go test ./...
```

from `examples/go-api-slice/` builds the project and runs every test. The project's
[`README.md`](https://github.com/throw-if-null/coral/blob/main/examples/go-api-slice/README.md)
has the `podman run` recipe for the Postgres tests, the two commands that run the service,
`go run ./cmd/migrate` and then `go run ./cmd/api`, and the command that regenerates its
`CORAL-CONTRACT.md`.

## How it fits together: the request's journey

1. **Middleware** rejects a request without a verified tenant with `401`, or puts the tenant on the
   context (`reqctx`, the trust boundary).
2. **Edge** parses `:id`, then calls `Get(ctx, store, tenant, id)`.
3. **Body** asks its `Store` for the row, scoped to the tenant.
4. **Adapter** returns the row, or `document.ErrNoRows`.
5. **Body** turns `ErrNoRows` into the model's `not_found` (a *domain* fact), or wraps anything
   unexpected as `internal`.
6. **Edge** writes `200` and the body, or returns the error.
7. **Root** renders the error once, for every handler: `{category, code, message}` and the status the
   category maps to.

The **error journey**: `pgx.ErrNoRows` (infrastructure) → `document` raises `not_found` (domain) → the
root renders `404` (transport). Slices raise, the root renders (`[ERR-3]`). Each package depends only
on the published surface of the one below it (`[MODEL-4]`, `[COMPOSE-1]`).

## Why the tree looks like this in Go

The capability is one package, `document`, holding body and edge. Nothing in Go forces a split between
them: a body and an HTTP handler compile in one package, and keeping the body free of `fiber` is a
dependency choice, not a language constraint. `[MODEL-2]` permits banding within a capability only
where the language or its tooling forces it, so the default is the unflagged one package. A project that
splits the edge into `internal/document/httpapi/` has introduced banding and flags it (`[AGENT-2]`).

Two Go facts do shape the tree. They justify the adapter and the one-way arrows, not a layer:

- **sqlc generates one persistence package.** Per-slice persistence packages fight the tool, so `store`
  is a single adapter package the slices share, each through its own port (`[MODEL-4]`).
- **Go forbids import cycles.** Dependencies point one way (`[COMPOSE-1]`). When two slices would need
  each other, Go forces you to extract the shared piece rather than couple them.

### The test that separates this from a `repositories/` layer

A shared `store` package is what `[STATE-2]` forbids, unless the **interface ownership points the
other way**. That inversion is what this tree does:

- `document.Store` is declared **by the slice**, in the slice's package, listing only the arguments and
  the one method *this* capability needs.
- `store.PG` **implements** the slice's interface. The dependency arrow runs `store → document`. The
  slice imports nothing from `store`.

That inversion is what makes it an adapter rather than a data-access layer. In a `repositories/` layer
the arrow runs the other way. The repository package defines the API, and every slice consumes whatever
it offers, so the repository accumulates every caller's needs and no slice can be understood alone.

Apply `[XCUT-5]`'s test: *would removing it break an invariant, or only break access to data?* `errs`,
`reqctx`, `db`, and `config` are crosscuts, because each carries an invariant: one error model, one
identity, one pool and one migration ledger, one validated configuration. `store` is neither a
crosscut nor a bucket. It is an **adapter**: an injected implementation of a slice-owned interface
(`[MODEL-4]`).

The slice package is named *by capability* (`document`, not `services/` or `handlers/`) and owns its
own types, errors, and migrations. The `documents` table has exactly one owning package, so its
migrations live in `document` (`[STATE-5]`).

## Mapping to the five categories  → `[MODEL-1]`

| Category | Here |
|---|---|
| **slice** | `document`: one capability in one package, holding the body (`Get`), the HTTP edge (`getHandler`), and the migrations of the table it owns |
| **adapter** | `store`, which implements the slice-declared `Store` interface, injected at the root (`[MODEL-4]`) |
| **published contract** | the exported `Get`, the `Document` type, the `Store` interface, and the typed `errs` it raises. That is all another slice may depend on |
| **crosscuts** | `errs` (the error model and its rendering) and `reqctx` (caller identity), consumed by the slice; `db` (pool and migrations) and `config` (settings), consumed by the roots |
| **composition root** | `cmd/api/main.go` and `cmd/migrate/main.go`: each resolves config, wires and runs, holds no logic (`[ROOT-1]`) |

`pgtest` is test support, imported by the two Postgres tests and by no application package. It stands
with the test files, outside the table.

## Scaling up (what a write adds)

A mutating endpoint keeps this shape and adds three things, all in the edge, leaving the body pure:

- the **transaction boundary**. The edge does `Begin`, `Commit` and `Rollback`, and passes the `tx`
  into the body, so the unit of work is owned where the request is.
- **composition**. `document.Create` can call sibling slices such as `folder.AddChild` over their
  published functions, all on the same `tx`, so a multi-entity operation is one atomic change
  (`[COMPOSE-1]`).
- **effects**. Emitting an event or an audit log happens in the edge after commit, not inside the body
  (`[EFFECT-2]`). The body returns the before and after data the edge needs for it.

## What this avoids (the anti-patterns from the review example)

- Error rendering scattered across handlers, or placed in a `utils` package. Here slices return errors,
  and the root registers the one handler that renders them (`[ERR-3]`, `[BE-5]`, `[XCUT-3]`).
- The domain body reaching for a global `*sql.DB`. Here persistence is an injected interface the slice
  declares (`[STATE-2]`).
- Bucket and technical-layer packages (`services/`, `handlers/`, `models/`, `utils/`). Here each
  package is named for the capability or the concern it owns (`[BUCKET-1]`, `[MODEL-2]`).

A real service is this same shape repeated per capability. That is why a human or an agent can open any
one of them and know where everything is.
