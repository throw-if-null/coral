package db_test

import (
	"context"
	"reflect"
	"testing"

	"github.com/throw-if-null/coral/examples/go-api-slice/internal/db"
	"github.com/throw-if-null/coral/examples/go-api-slice/internal/document"
	"github.com/throw-if-null/coral/examples/go-api-slice/internal/pgtest"
)

func TestMigrate_appliesEachFileOnce(t *testing.T) {
	pool := pgtest.Schema(t)
	ctx := context.Background()
	set := db.Set{Owner: "document", FS: document.Migrations}

	first, err := db.Migrate(ctx, pool, set)
	if err != nil {
		t.Fatalf("first run: %v", err)
	}
	if want := []string{"document/0001_create_documents.sql"}; !reflect.DeepEqual(first, want) {
		t.Fatalf("first run applied %v, want %v", first, want)
	}
	var exists bool
	if err := pool.QueryRow(ctx, `SELECT to_regclass('documents') IS NOT NULL`).Scan(&exists); err != nil || !exists {
		t.Fatalf("documents table after the first run: exists=%v, err=%v", exists, err)
	}

	second, err := db.Migrate(ctx, pool, set)
	if err != nil {
		t.Fatalf("second run: %v", err)
	}
	if len(second) != 0 {
		t.Fatalf("second run applied %v, want nothing", second)
	}
}
