package document_test

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

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"reflect"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"

	"github.com/throw-if-null/coral/examples/go-api-slice/internal/document"
	"github.com/throw-if-null/coral/examples/go-api-slice/internal/errs"
	"github.com/throw-if-null/coral/examples/go-api-slice/internal/reqctx"
)

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

type failingStore struct{ err error }

func (f failingStore) GetByID(context.Context, uuid.UUID, uuid.UUID) (document.Document, error) {
	return document.Document{}, f.err
}

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

func get(t *testing.T, app *fiber.App, tenant, id string) (int, map[string]any, []byte) {
	t.Helper()
	req := httptest.NewRequest(http.MethodGet, "/v1/documents/"+id, nil)
	if tenant != "" {
		req.Header.Set(reqctx.Header, tenant)
	}
	resp, err := app.Test(req)
	if err != nil {
		t.Fatalf("request: %v", err)
	}
	defer resp.Body.Close()
	raw, err := io.ReadAll(resp.Body)
	if err != nil {
		t.Fatalf("read body: %v", err)
	}
	var body map[string]any
	if err := json.Unmarshal(raw, &body); err != nil {
		t.Fatalf("body is not a JSON object: %v: %s", err, raw)
	}
	return resp.StatusCode, body, raw
}

func assertError(t *testing.T, status int, body map[string]any, wantStatus int, category, code string) {
	t.Helper()
	if status != wantStatus {
		t.Fatalf("status: got %d, want %d (body %v)", status, wantStatus, body)
	}
	if body["category"] != category || body["code"] != code {
		t.Fatalf("body: got %v, want category %q and code %q", body, category, code)
	}
	if msg, _ := body["message"].(string); msg == "" {
		t.Fatalf("body: message is empty: %v", body)
	}
}

func TestGet_returnsDocument(t *testing.T) {
	tenant, id := uuid.New(), uuid.New()
	app := newApp(memStore{id: {ID: id, TenantID: tenant, Title: "Hello", Body: "World"}})

	status, body, _ := get(t, app, tenant.String(), id.String())

	if status != http.StatusOK {
		t.Fatalf("status: got %d, want 200 (body %v)", status, body)
	}
	want := map[string]any{"id": id.String(), "title": "Hello", "body": "World"}
	if !reflect.DeepEqual(body, want) {
		t.Fatalf("body: got %v, want %v", body, want)
	}
}

func TestGet_rejectsMalformedID(t *testing.T) {
	app := newApp(memStore{})

	status, body, _ := get(t, app, uuid.NewString(), "not-a-uuid")

	assertError(t, status, body, http.StatusBadRequest, "invalid", "document_bad_id")
}

func TestGet_missesUnknownDocument(t *testing.T) {
	app := newApp(memStore{})

	status, body, _ := get(t, app, uuid.NewString(), uuid.NewString())

	assertError(t, status, body, http.StatusNotFound, "not_found", "document_not_found")
}

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

func TestGet_hidesStoreFailure(t *testing.T) {
	app := newApp(failingStore{err: errors.New("connection refused")})

	status, body, raw := get(t, app, uuid.NewString(), uuid.NewString())

	assertError(t, status, body, http.StatusInternalServerError, "internal", "document_store")
	if len(body) != 3 || bytes.Contains(raw, []byte("connection refused")) {
		t.Fatalf("body carries more than category, code and message: %s", raw)
	}
}

func TestGet_requiresTenant(t *testing.T) {
	app := newApp(memStore{})

	for name, header := range map[string]string{"missing": "", "malformed": "not-a-uuid"} {
		t.Run(name, func(t *testing.T) {
			status, body, _ := get(t, app, header, uuid.NewString())

			if status != http.StatusUnauthorized {
				t.Fatalf("status: got %d, want 401 (body %v)", status, body)
			}
			for _, k := range []string{"category", "code"} {
				if _, ok := body[k]; ok {
					t.Fatalf("body carries %q, which no slice raised: %v", k, body)
				}
			}
		})
	}
}
