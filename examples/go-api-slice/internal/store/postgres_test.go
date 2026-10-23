package store_test

import (
	"context"
	"errors"
	"testing"

	"github.com/google/uuid"

	"github.com/throw-if-null/coral/examples/go-api-slice/internal/db"
	"github.com/throw-if-null/coral/examples/go-api-slice/internal/document"
	"github.com/throw-if-null/coral/examples/go-api-slice/internal/pgtest"
	"github.com/throw-if-null/coral/examples/go-api-slice/internal/store"
)

// TestPG_scopesByTenant proves the one thing an in-memory store cannot: the tenant_id
// clause of the SQL. It needs a real Postgres, named by DATABASE_URL, and runs the document
// package's migrations in a schema of its own.
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
