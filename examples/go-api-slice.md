# Worked example: a Go API capability slice (one endpoint, end to end)

The [other worked example](./backend-review) *reviews* a service and finds where it drifts from Coral.
This one shows the opposite: **the smallest complete Coral slice in Go** — a single read endpoint, wired
all the way through, with a test and its cross-cutting concerns. It is deliberately tiny; the point is the
*shape*, which stays the same as the service grows.

The capability: **fetch one document, scoped to the caller's tenant.** `GET /documents/:id`.

## The shape

A capability is one **vertical slice** spread across three bands, plus the **horizontals** it leans on.
In Go the bands fall out as packages:

```text
internal/
  errs/            ← horizontal: the error taxonomy + the one place errors become HTTP
  reqctx/          ← horizontal: who's calling (tenant), from the trusted edge
  module/
    document/      ← the slice BODY: pure domain logic, no HTTP, no global state
      document.go
      document_test.go
  store/           ← persistence: implements what the body needs (sqlc-generated in real life)
    postgres.go
  api/             ← the slice EDGE: HTTP in, typed errors rendered out
    document.go
    document_test.go
cmd/api/main.go    ← the composition root: wires horizontals + slice, then runs
```

The dependency arrow only ever points **down**: `api → module → store`, and both `api` and `module` use
the `errs` horizontal. The body imports neither HTTP nor the database driver. That single constraint is
what makes the slice testable, reusable, and legible.

## The cross-cutting horizontals

Errors are a **horizontal**, not something each handler reinvents (`[XCUT-3]`, `[ERR-1]`). One small
taxonomy, and exactly one place that turns a domain error into an HTTP status (`[ERR-3]` — *slices raise,
the edge renders*):

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

Identity is the other horizontal. The tenant is established at the **trusted edge** (a middleware that
reads a gateway-verified header — never the client directly, `[TRUST-1]`) and travels on the context:

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

The body is pure domain logic. It declares **exactly the persistence it needs** as a small interface
(satisfied by sqlc-generated queries in production, by a fake in tests — `[STATE-2]`), threads the tenant
through for isolation, and translates an infrastructure "no rows" into a *domain* error the edge
understands. No `fiber`, no `pgx`, no globals:

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

A thin adapter that implements `document.Store`. Here it's hand-written for self-containment; in a real
service these queries are generated by **sqlc** into a shared `db` package — a *generated persistence
horizontal*, which is the idiomatic-Go reason persistence is one shared band rather than co-located per
slice (more on that below). Note the tenant scoping in the SQL and the infra→contract error translation:

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

The edge is a thin membrane: pull identity from context, parse the request, call the body, and render —
**through the one `errs` path**, so no handler hand-rolls status codes or JSON error shapes:

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

A thin `main` wires the horizontals and the slice, then runs — it composes, it does not contain logic
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
	app.Use(tenantMiddleware)           // reqctx horizontal — establishes the trust boundary
	api.New(store.NewPG(pool)).Register(app) // edge gets the persistence injected
	log.Fatal(app.Listen(":8080"))
}
```

## The test — and why the split pays off

Because the body knows nothing about HTTP or a database, you test the *domain logic* with a fake store —
no server, no Postgres, no fixtures (`[TEST-1]`):

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

// fakeStore is the whole reason the body is its own package.
type fakeStore struct{ docs map[uuid.UUID]document.Document }

func (f fakeStore) GetByID(_ context.Context, tenantID, id uuid.UUID) (document.Document, error) {
	d, ok := f.docs[id]
	if !ok || d.TenantID != tenantID { // tenant isolation, enforced here too
		return document.Document{}, document.ErrNoRows
	}
	return d, nil
}

func TestGet_returnsDocument(t *testing.T) {
	tenant, id := uuid.New(), uuid.New()
	s := fakeStore{docs: map[uuid.UUID]document.Document{
		id: {ID: id, TenantID: tenant, Title: "Hello"},
	}}

	got, err := document.Get(context.Background(), s, tenant, id)
	if err != nil || got.Title != "Hello" {
		t.Fatalf("got (%v, %v), want a document", got, err)
	}
}

func TestGet_missingIsNotFound(t *testing.T) {
	_, err := document.Get(context.Background(), fakeStore{}, uuid.New(), uuid.New())

	var e *errs.Error
	if !errors.As(err, &e) || e.Kind != errs.NotFound {
		t.Fatalf("got %v, want errs.NotFound", err)
	}
}
```

And the edge wiring — the `errs` horizontal really does produce a 404 — verified with `httptest` and the
same fake, still no real database:

```go
// internal/api/document_test.go (abridged)
func TestGetDocument_404(t *testing.T) {
	app := fiber.New()
	app.Use(func(c *fiber.Ctx) error { // stand in for the real tenant middleware
		c.SetUserContext(reqctx.WithTenant(c.UserContext(), uuid.New()))
		return c.Next()
	})
	api.New(fakeStore{}).Register(app)

	resp, _ := app.Test(httptest.NewRequest("GET", "/documents/"+uuid.NewString(), nil))
	if resp.StatusCode != 404 {
		t.Fatalf("got %d, want 404", resp.StatusCode)
	}
}
```

## How it fits together — the request's journey

1. **Edge** middleware puts the gateway-verified tenant on the context (`reqctx`, the trust boundary).
2. **Edge** handler parses `:id`, then calls `document.Get(ctx, store, tenant, id)`.
3. **Body** asks its `Store` for the row, scoped to the tenant.
4. **Persistence** returns the row, or `document.ErrNoRows`.
5. **Body** turns `ErrNoRows` into `errs.NotFound` (a *domain* fact), or wraps anything unexpected.
6. **Edge** `render` maps the error's `Kind` → HTTP once, for every handler.

Notice the **error journey**: `pgx.ErrNoRows` (infra) → `document` raises `errs.NotFound` (domain) →
edge renders `404` (transport). Each band only speaks to the one below it — that is `[ERR-3]` in motion.

## Why it's split this way in Go (not a layer cake)

The strict Coral ideal co-locates a capability's whole vertical. Three facts about Go make the
edge / body / persistence split the *faithful* adaptation, not a compromise:

- **Co-locating the HTTP edge would couple the web framework into the domain.** Keeping `module/document`
  free of `fiber` is what lets the same body serve an HTTP edge, a gRPC edge, a CLI, or a test. The body
  is transport-agnostic on purpose.
- **sqlc generates one persistence package.** Per-slice persistence packages fight the tool, so `store`/
  `db` is a single *generated horizontal* the slices share — a symbiont, not a layer the slices live
  inside.
- **Go forbids import cycles.** This keeps slice-to-slice composition honest: dependencies must point one
  way (`[COMPOSE-1]`). When two slices would need each other, Go forces you to extract the shared piece
  rather than tangle them.

What keeps it Coral rather than a layer cake is the **direction of ownership**: the middle band is named
and bounded *by capability* (`module/document`, not `services/` or `repositories/`), it owns its types and
its errors, and it composes siblings through their published functions — never their internals.

## Mapping to the Coral model

- **Polyp body** → `module/document`: the capability's domain logic.
- **Skeleton** (its published contract) → the exported `Get`, the `Document` type, the `Store` interface,
  and the typed `errs` it raises. That's all another slice (or the edge) may depend on.
- **Symbionts** (injected horizontals) → `errs`, `reqctx`, the persistence `Store`. The body *receives*
  them; it does not reach out and locate them.
- **Edge / membrane** → `api/document.go`: the transport adapter. Thin by design.
- **Composition root** → `cmd/api/main.go`: wires the colony, holds no logic (`[ROOT-1]`).

## Scaling up (what a write adds)

A mutating endpoint keeps this shape and adds three things, all at the **edge**, leaving the body pure:

- the **transaction boundary** — the edge does `Begin`/`Commit`/`Rollback` and passes the `tx` into the
  body, so the unit of work is owned where the request is;
- **composition** — `document.Create` can call sibling slices (`folder.AddChild`, `audit trail…`) over
  their published functions, all on the same `tx`, so a multi-entity operation is one atomic change
  (`[COMPOSE-1]`);
- **effects** — emitting an event or an audit log happens at the edge after commit, not inside the body
  (`[EFFECT-2]`); the body returns the before/after data the edge needs to do it.

## What this avoids (the anti-patterns from the review example)

- Error rendering scattered inline across handlers, or dumped in a `utils` package — here it's one
  `errs` horizontal (`[ERR-3]`, `[XCUT-3]`).
- The domain body importing `fiber` or a global `*sql.DB` — here it imports neither; persistence is an
  injected interface (`[STATE-2]`).
- Bucket packages (`services/`, `models/`, `utils/`) — here packages are named for the capability or the
  concern they own (`[BUCKET-1]`, `[MODEL-2]`).

At ~150 lines this is a complete, navigable Coral slice. A real service is this same shape repeated per
capability — which is exactly why a human or an agent can open any one of them and know where everything
is.
