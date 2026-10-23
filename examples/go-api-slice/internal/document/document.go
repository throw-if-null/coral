// Package document is the capability that owns documents. It holds the body and the HTTP
// edge of its one operation, get, and declares the persistence port the store adapter
// implements.
package document

import (
	"context"
	"embed"
	"errors"
	"io/fs"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
)

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
