// Command migrate is the root that applies the schema migrations the capability packages
// define. It runs as a separate step before the API starts.
package main

import (
	"context"
	"log/slog"
	"os"
	"time"

	"github.com/throw-if-null/coral/examples/go-api-slice/internal/config"
	"github.com/throw-if-null/coral/examples/go-api-slice/internal/db"
	"github.com/throw-if-null/coral/examples/go-api-slice/internal/document"
)

func main() {
	log := slog.New(slog.NewJSONHandler(os.Stderr, nil))
	if err := run(log); err != nil {
		log.Error("migrate failed", "error", err)
		os.Exit(1)
	}
}

func run(log *slog.Logger) error {
	cfg, err := config.Load()
	if err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()
	pool, err := db.Open(ctx, cfg.DatabaseURL)
	if err != nil {
		return err
	}
	defer pool.Close()

	applied, err := db.Migrate(ctx, pool, db.Set{Owner: "document", FS: document.Migrations})
	for _, name := range applied {
		log.Info("applied", "migration", name)
	}
	if err != nil {
		return err
	}
	log.Info("schema is current", "applied", len(applied))
	return nil
}
