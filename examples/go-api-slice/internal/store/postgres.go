// Package store is the persistence adapter. It implements the ports the slices declare
// against Postgres through pgx. In a real service sqlc generates this package.
package store

import (
	"context"
	"errors"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/throw-if-null/coral/examples/go-api-slice/internal/document"
)

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
