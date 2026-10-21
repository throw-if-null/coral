package store_test

import (
	"context"
	"errors"
	"os"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/throw-if-null/coral/examples/go-api-slice/internal/document"
	"github.com/throw-if-null/coral/examples/go-api-slice/internal/store"
)

// TestPG_scopesByTenant proves the one thing an in-memory store cannot: the tenant_id
// clause of the SQL. It needs a real Postgres, named by DATABASE_URL, and creates and drops
// its own schema there.
func TestPG_scopesByTenant(t *testing.T) {
	url := os.Getenv("DATABASE_URL")
	if url == "" {
		t.Skip("DATABASE_URL is not set; the Postgres tenant-isolation test needs a database URL")
	}
	ctx := context.Background()
	pool := temporarySchema(t, url)
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

// temporarySchema creates a schema holding the documents table, returns a pool whose
// search_path is that schema, and drops the schema when the test ends.
func temporarySchema(t *testing.T, url string) *pgxpool.Pool {
	t.Helper()
	ctx := context.Background()
	name := "coral_test_" + strings.ReplaceAll(uuid.NewString(), "-", "")

	admin, err := pgx.Connect(ctx, url)
	if err != nil {
		t.Fatalf("connect to DATABASE_URL: %v", err)
	}
	if _, err := admin.Exec(ctx, "CREATE SCHEMA "+name); err != nil {
		t.Fatalf("create schema: %v", err)
	}
	t.Cleanup(func() {
		if _, err := admin.Exec(ctx, "DROP SCHEMA "+name+" CASCADE"); err != nil {
			t.Errorf("drop schema %s: %v", name, err)
		}
		admin.Close(ctx)
	})

	cfg, err := pgxpool.ParseConfig(url)
	if err != nil {
		t.Fatalf("parse DATABASE_URL: %v", err)
	}
	cfg.ConnConfig.RuntimeParams["search_path"] = name
	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		t.Fatalf("open pool: %v", err)
	}
	t.Cleanup(pool.Close)
	if _, err := pool.Exec(ctx, document.Schema); err != nil {
		t.Fatalf("create table: %v", err)
	}
	return pool
}
