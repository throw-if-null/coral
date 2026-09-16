# Worked example: a Go API capability slice (one endpoint, end to end)

> Written against **Coral 0.6.0**.
>
> **"Written against" names the latest *released* Coral.** The error-model citations below are
> **unreleased** and ship in 0.7.0: `[ERR-1]` becomes a kernel rule that names no categories, and
> `[ERR-5]` becomes the recommended six-category vocabulary. In 0.6.0, `[ERR-1]` is a
> production-baseline rule that fixes those six names. Delete this note when 0.7.0 is cut.

The [CLI example](./cli-slice) shows a slice in a language that imposes nothing, so each slice is one
file. This one is the harder case: **a complete Coral slice in Go, where the language forces one
capability across three packages**. It is a single read endpoint wired all the way through, with its
tests and its cross-cutting concerns. It is deliberately tiny. What matters is the *shape*, which stays
the same as the service grows. The [third example](./backend-review) goes the other direction and
*reviews* a real service for where it drifts.

The capability: **fetch one document, scoped to the caller's tenant.** `GET /documents/:id`.

## The shape

A capability is one **slice** spread across three bands, plus the **crosscuts** it leans on.
In Go the bands fall out as packages:

```text
internal/
  errs/            ← crosscut: the error taxonomy + the one place errors become HTTP
  reqctx/          ← crosscut: who's calling (tenant), from the trusted edge
  module/
    document/      ← the slice BODY: pure domain logic, no HTTP, no global state
      document.go
      document_test.go
  store/           ← persistence: implements what the body needs (sqlc-generated in real life)
    postgres.go
  api/             ← the slice EDGE: HTTP in, typed errors rendered out
    document.go
    document_test.go
cmd/api/main.go    ← the composition root: wires crosscuts + slice, then runs
```

The dependency arrow only ever points **down**: `api → module → store`, and both `api` and `module` use
the `errs` crosscut. The body imports neither HTTP nor the database driver. That single constraint is
what makes the slice testable, reusable, and legible.

## The cross-cutting crosscuts

Errors are a **crosscut**, not something each handler reinvents (`[XCUT-3]`, `[ERR-1]`). One small
taxonomy, declared once, and exactly one place that turns a domain error into an HTTP status. `[ERR-3]`
states the second half: *slices raise, the edge renders*.

**This taxonomy is three categories, not Coral's recommended six.** `[ERR-1]` asks for one small, stable,
declared model and fixes neither the count nor the names, so `Internal` / `NotFound` / `Invalid` is
conformant as long as the renderer maps all of it (`[BE-5]`). `[ERR-5]`'s six-category vocabulary is the
default a project takes when it has no reason to differ; this example shows what the other choice looks
like.

```go
// internal/errs/errs.go
package errs

import "errors"

// Kind is the small, closed taxonomy every band agrees on.
type Kind int

const (
	Internal Kind = iota // unexpected → 500
	NotFound             // → 404
	Invalid              // → 400
)

// Error is what slices raise: a Kind plus a stable code and a human message.
type Error struct {
	Kind    Kind
	Code    string
	Message string
	wrapped error
}

func (e *Error) Error() string { return e.Message }
func (e *Error) Unwrap() error { return e.wrapped }

func NotFoundf(code, msg string) *Error { return &Error{Kind: NotFound, Code: code, Message: msg} }
func Invalidf(code, msg string) *Error  { return &Error{Kind: Invalid, Code: code, Message: msg} }

// Wrap tags an unexpected error as Internal so the edge can still render it safely.
func Wrap(err error) *Error {
	return &Error{Kind: Internal, Code: "internal", Message: "internal error", wrapped: err}
}

// HTTPStatus is the ONLY place a Kind becomes an HTTP code.
func HTTPStatus(err error) int {
	var e *Error
	if errors.As(err, &e) {
		switch e.Kind {
		case NotFound:
			return 404
		case Invalid:
			return 400
		}
	}
	return 500
}
```

Identity is the other crosscut. The tenant is established at the **trusted edge**, by a middleware that
reads a gateway-verified header rather than the client directly (`[TRUST-1]`). It then travels on the
context:

```go
// internal/reqctx/reqctx.go
package reqctx

import (
	"context"

	"github.com/google/uuid"
)

type ctxKey int

const tenantKey ctxKey = 0

func WithTenant(ctx context.Context, tenantID uuid.UUID) context.Context {
	return context.WithValue(ctx, tenantKey, tenantID)
}

func TenantID(ctx context.Context) (uuid.UUID, bool) {
	id, ok := ctx.Value(tenantKey).(uuid.UUID)
	return id, ok
}
```

## The body — the slice itself

The body is pure domain logic. It declares **exactly the persistence it needs** as a small interface,
satisfied by sqlc-generated queries in production and by a fake in tests (`[STATE-2]`). It threads the
tenant through for isolation. It also translates an infrastructure "no rows" into a *domain* error the
edge handles. No `fiber`, no `pgx`, no globals:

```go
// internal/module/document/document.go
package document

import (
	"context"
	"errors"

	"github.com/google/uuid"

	"example.com/app/internal/errs"
)

// Document is the entity this capability owns.
type Document struct {
	ID       uuid.UUID
	TenantID uuid.UUID
	Title    string
	Body     string
}

// Store is exactly the persistence this slice needs — nothing more.
type Store interface {
	GetByID(ctx context.Context, tenantID, id uuid.UUID) (Document, error)
}

// ErrNoRows is the persistence-level "not found" a Store may return.
var ErrNoRows = errors.New("no rows")

// Get returns one document scoped to the caller's tenant, raising a domain
// NotFound the edge knows how to render.
func Get(ctx context.Context, s Store, tenantID, id uuid.UUID) (Document, error) {
	doc, err := s.GetByID(ctx, tenantID, id)
	if err != nil {
		if errors.Is(err, ErrNoRows) {
			return Document{}, errs.NotFoundf("document_not_found", "document not found")
		}
		return Document{}, errs.Wrap(err)
	}
	return doc, nil
}
```

## The persistence

A thin adapter that implements `document.Store`. It is hand-written here for self-containment. In a real
service, **sqlc** generates these queries into a shared `db` package, as a *generated persistence
crosscut*. That is the idiomatic-Go reason persistence is one shared band rather than co-located per
slice, covered below. Two details matter: the tenant scoping in the SQL, and the infra-to-contract error
translation.

```go
// internal/store/postgres.go
package store

import (
	"context"
	"errors"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"example.com/app/internal/module/document"
)

type PG struct{ pool *pgxpool.Pool }

func NewPG(pool *pgxpool.Pool) *PG { return &PG{pool: pool} }

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

## The edge

The edge is thin. It pulls identity from context, parses the request, calls the body, and renders
**through the one `errs` path**. No handler writes its own status codes or JSON error shapes:

```go
// internal/api/document.go
package api

import (
	"errors"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"

	"example.com/app/internal/errs"
	"example.com/app/internal/module/document"
	"example.com/app/internal/reqctx"
)

type API struct{ store document.Store }

func New(store document.Store) *API { return &API{store: store} }

func (a *API) Register(app *fiber.App) {
	app.Get("/documents/:id", a.getDocument)
}

type documentResponse struct {
	ID    uuid.UUID `json:"id"`
	Title string    `json:"title"`
	Body  string    `json:"body"`
}

func (a *API) getDocument(c *fiber.Ctx) error {
	tenantID, ok := reqctx.TenantID(c.UserContext())
	if !ok {
		return render(c, errs.Invalidf("no_tenant", "missing tenant context"))
	}
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return render(c, errs.Invalidf("bad_id", "invalid document id"))
	}

	doc, err := document.Get(c.UserContext(), a.store, tenantID, id)
	if err != nil {
		return render(c, err)
	}

	return c.Status(fiber.StatusOK).JSON(documentResponse{ID: doc.ID, Title: doc.Title, Body: doc.Body})
}

// render is the single place an error becomes an HTTP response.
func render(c *fiber.Ctx, err error) error {
	var e *errs.Error
	if errors.As(err, &e) {
		return c.Status(errs.HTTPStatus(err)).JSON(fiber.Map{"code": e.Code, "message": e.Message})
	}
	return c.Status(500).JSON(fiber.Map{"code": "internal", "message": "internal error"})
}
```

## The composition root

A thin `main` wires the crosscuts and the slice, then runs. It composes, and it contains no logic
(`[ROOT-1]`):

```go
// cmd/api/main.go
func main() {
	pool, err := pgxpool.New(context.Background(), os.Getenv("DATABASE_URL"))
	if err != nil {
		log.Fatal(err)
	}
	defer pool.Close()

	app := fiber.New()
	app.Use(tenantMiddleware)           // reqctx crosscut — establishes the trust boundary
	api.New(store.NewPG(pool)).Register(app) // edge gets the persistence injected
	log.Fatal(app.Listen(":8080"))
}
```

## The tests — and why the split pays off

Two tests, and it matters which rule each one satisfies.

The **behavior test** is the one at the edge. It exercises the slice's entry point and asserts the
observable contract: status code and body (`[TEST-1]`). That is the test that must exist. The **body
test** below it is the narrower form (`[TEST-3]`). The error-translation branch is cheap to reach
directly and tedious to provoke through HTTP, so it earns a direct test.

Start with the narrower test, because it shows what the split buys you. The body depends on neither HTTP
nor a database, so it takes an in-memory `Store`. That store is an implementation of the *real*
interface, not a mock that asserts on calls:

```go
// internal/module/document/document_test.go
package document_test

import (
	"context"
	"errors"
	"testing"

	"github.com/google/uuid"

	"example.com/app/internal/errs"
	"example.com/app/internal/module/document"
)

// memStore is the whole reason the body is its own package: a real implementation
// of document.Store, in memory. Not a mock — it has behavior, and a broken body
// still fails against it.
type memStore struct{ docs map[uuid.UUID]document.Document }

func (f memStore) GetByID(_ context.Context, tenantID, id uuid.UUID) (document.Document, error) {
	d, ok := f.docs[id]
	if !ok || d.TenantID != tenantID { // tenant isolation, enforced here too
		return document.Document{}, document.ErrNoRows
	}
	return d, nil
}

func TestGet_returnsDocument(t *testing.T) {
	tenant, id := uuid.New(), uuid.New()
	s := memStore{docs: map[uuid.UUID]document.Document{
		id: {ID: id, TenantID: tenant, Title: "Hello"},
	}}

	got, err := document.Get(context.Background(), s, tenant, id)
	if err != nil || got.Title != "Hello" {
		t.Fatalf("got (%v, %v), want a document", got, err)
	}
}

func TestGet_missingIsNotFound(t *testing.T) {
	_, err := document.Get(context.Background(), memStore{}, uuid.New(), uuid.New())

	var e *errs.Error
	if !errors.As(err, &e) || e.Kind != errs.NotFound {
		t.Fatalf("got %v, want errs.NotFound", err)
	}
}
```

The behavior test drives the slice's real entry point and asserts the observable contract. It is
verified with `httptest` and the same in-memory store:

```go
// internal/api/document_test.go (abridged)
func TestGetDocument_404(t *testing.T) {
	app := fiber.New()
	app.Use(func(c *fiber.Ctx) error { // stand in for the real tenant middleware
		c.SetUserContext(reqctx.WithTenant(c.UserContext(), uuid.New()))
		return c.Next()
	})
	api.New(memStore{}).Register(app)

	resp, _ := app.Test(httptest.NewRequest("GET", "/documents/"+uuid.NewString(), nil))
	if resp.StatusCode != 404 {
		t.Fatalf("got %d, want 404", resp.StatusCode)
	}
}
```

**These two tests do not cover one thing**, and the omission is deliberate rather than hidden: the SQL in
`store/postgres.go`, including the `tenant_id = $1` clause that *is* the tenant isolation. An in-memory
store cannot verify a WHERE clause. `[TEST-1]`'s "real or realistic temporary infrastructure" means that
query needs a test against a real Postgres, using a test container or a temp schema. `[BE-6]` and
`[TEST-4]` make the authorization case mandatory rather than optional: a test that another tenant's id
returns 404. Keep the in-memory tests for branch coverage and speed. Do not let them stand in for the one
test that proves rows do not leak across tenants.

## How it fits together — the request's journey

1. **Edge** middleware puts the gateway-verified tenant on the context (`reqctx`, the trust boundary).
2. **Edge** handler parses `:id`, then calls `document.Get(ctx, store, tenant, id)`.
3. **Body** asks its `Store` for the row, scoped to the tenant.
4. **Persistence** returns the row, or `document.ErrNoRows`.
5. **Body** turns `ErrNoRows` into `errs.NotFound` (a *domain* fact), or wraps anything unexpected.
6. **Edge** `render` maps the error's `Kind` → HTTP once, for every handler.

Follow the **error journey**: `pgx.ErrNoRows` (infra) → `document` raises `errs.NotFound` (domain) →
edge renders `404` (transport). Each band depends only on the one below it, which is `[ERR-3]` applied.

## Why it's split this way in Go (not a layer cake)

One capability here spans three packages, which looks like the layering `[MODEL-2]` warns about. It is
not, and the rule says so explicitly. **Banding within a capability is permitted where the language
forces it.** Two conditions apply: every band is still named for the capability or concern it owns, and
the dependency arrow points one way. Three facts about Go force the banding:

- **Co-locating the HTTP edge would couple the web framework into the domain.** Keeping `module/document`
  free of `fiber` is what lets the same body serve an HTTP edge, a gRPC edge, a CLI, or a test. The body
  is transport-agnostic on purpose.
- **sqlc generates one persistence package.** Per-slice persistence packages fight the tool, so `store`
  is a single generated adapter package the slices share.
- **Go forbids import cycles.** Dependencies must therefore point one way (`[COMPOSE-1]`). When two
  slices would need each other, Go forces you to extract the shared piece rather than couple them.

### The test that separates this from a `repositories/` layer

A shared `store` package is exactly what `[STATE-2]` forbids, unless the **interface ownership points the
other way**. That inversion is what this tree does:

- `document.Store` is declared **by the slice**, in the slice's package, listing only the two arguments
  and one method *this* capability needs.
- `store.PG` **implements** the slice's interface. The dependency arrow runs `store → module/document`.
  The slice imports nothing from `store`.

That inversion is what makes it an adapter rather than a data-access layer. In a `repositories/` layer
the arrow runs the other way. The repository package defines the API, and every slice consumes whatever
it offers, so the repository accumulates every caller's needs and no slice can be understood alone.

Apply `[XCUT-5]`'s test: *would removing it break an invariant, or only break access to data?* That gives
the right answer for all three. `errs` and `reqctx` are crosscuts, because they carry invariants. `store`
is neither a crosscut nor a bucket. It is an **adapter**: an injected implementation of a slice-owned
interface (`[MODEL-4]`).

Two further properties hold the boundary. The middle band is named *by capability* (`module/document`,
not `services/` or `repositories/`) and owns its own types and errors. The `documents` table has exactly
one owning feature package, so its schema changes live with `module/document` (`[STATE-5]`).

Per `[MODEL-2]`, introducing banding is a decision to **flag** (`[AGENT-2]`), not to assume. This section
is that flag, written down.

## Mapping to the five categories  → `[MODEL-1]`

| Category | Here |
|---|---|
| **slice** | `module/document` (the body) + `api/document.go` (its edge): one capability, two bands |
| **adapter** | `store`, which implements the slice-declared `Store` interface, injected at the root (`[MODEL-4]`) |
| **published contract** | the exported `Get`, the `Document` type, the `Store` interface, and the typed `errs` it raises. That is all another slice may depend on |
| **crosscuts** | `errs` (the error taxonomy) and `reqctx` (caller identity), injected, carrying invariants |
| **composition root** | `cmd/api/main.go`: wires and runs, holds no logic (`[ROOT-1]`) |

`store` used to sit outside this table. It is neither a crosscut nor a bucket. While there were only four
categories there was nowhere to put it, so this page said it was "deliberately not in this table". That
sentence recorded the taxonomy's gap rather than explaining anything. `[MODEL-4]` names it: an
**adapter**, defined by the direction of interface ownership.
[The test above](#the-test-that-separates-this-from-a-repositories-layer) is that definition applied to
this tree.

## Scaling up (what a write adds)

A mutating endpoint keeps this shape and adds three things, all at the **edge**, leaving the body pure:

- the **transaction boundary**. The edge does `Begin`, `Commit` and `Rollback`, and passes the `tx` into
  the body, so the unit of work is owned where the request is.
- **composition**. `document.Create` can call sibling slices such as `folder.AddChild` over their
  published functions, all on the same `tx`, so a multi-entity operation is one atomic change
  (`[COMPOSE-1]`).
- **effects**. Emitting an event or an audit log happens at the edge after commit, not inside the body
  (`[EFFECT-2]`). The body returns the before and after data the edge needs for it.

## What this avoids (the anti-patterns from the review example)

- Error rendering scattered inline across handlers, or placed in a `utils` package. Here it is one
  `errs` crosscut (`[ERR-3]`, `[XCUT-3]`).
- The domain body importing `fiber` or a global `*sql.DB`. Here it imports neither, and persistence is an
  injected interface (`[STATE-2]`).
- Bucket packages (`services/`, `models/`, `utils/`). Here packages are named for the capability or the
  concern they own (`[BUCKET-1]`, `[MODEL-2]`).

At around 150 lines this is a complete, navigable Coral slice. A real service is this same shape repeated
per capability. That is why a human or an agent can open any one of them and know where everything is.
