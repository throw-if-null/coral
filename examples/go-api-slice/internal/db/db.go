// Package db is the crosscut that owns the connection pool and runs migrations. It holds no
// query of any capability and defines no schema: each capability package defines its own
// migrations, and a command triggers them.
package db

import (
	"context"
	"errors"
	"fmt"
	"io/fs"
	"sort"

	"github.com/jackc/pgx/v5/pgxpool"
)

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
