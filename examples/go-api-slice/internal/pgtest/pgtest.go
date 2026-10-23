// Package pgtest gives a test a disposable Postgres schema. It is test support: no
// application package imports it.
package pgtest

import (
	"context"
	"os"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Schema skips the test unless DATABASE_URL is set. Otherwise it creates a schema of its
// own, returns a pool whose search_path is that schema, and drops the schema when the test
// ends.
func Schema(t *testing.T) *pgxpool.Pool {
	t.Helper()
	url := os.Getenv("DATABASE_URL")
	if url == "" {
		t.Skip("DATABASE_URL is not set; this test needs a Postgres URL")
	}
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
	return pool
}
