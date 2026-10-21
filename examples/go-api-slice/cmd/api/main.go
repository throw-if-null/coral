// Command api is the composition root. It reads and validates configuration, constructs
// the crosscuts and the adapter, registers the slice, and runs.
package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"os"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/throw-if-null/coral/examples/go-api-slice/internal/document"
	"github.com/throw-if-null/coral/examples/go-api-slice/internal/errs"
	"github.com/throw-if-null/coral/examples/go-api-slice/internal/reqctx"
	"github.com/throw-if-null/coral/examples/go-api-slice/internal/store"
)

// config is every setting the app reads, resolved and validated once, here.
type config struct {
	DatabaseURL string
	Addr        string
}

func loadConfig() (config, error) {
	cfg := config{DatabaseURL: os.Getenv("DATABASE_URL"), Addr: os.Getenv("ADDR")}
	if cfg.DatabaseURL == "" {
		return config{}, errors.New("DATABASE_URL is required")
	}
	if cfg.Addr == "" {
		cfg.Addr = ":8080"
	}
	return cfg, nil
}

func main() {
	log := slog.New(slog.NewJSONHandler(os.Stderr, nil))
	if err := run(log); err != nil {
		log.Error("startup failed", "error", err)
		os.Exit(1)
	}
}

func run(log *slog.Logger) error {
	cfg, err := loadConfig()
	if err != nil {
		return err
	}

	pool, err := pgxpool.New(context.Background(), cfg.DatabaseURL)
	if err != nil {
		return fmt.Errorf("DATABASE_URL: %w", err)
	}
	defer pool.Close()
	// pgxpool.New parses and does not connect. Ping now, so an unreachable database fails
	// startup rather than the first request.
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := pool.Ping(ctx); err != nil {
		return fmt.Errorf("database: %w", err)
	}

	app := fiber.New(fiber.Config{ErrorHandler: errs.ErrorHandler(log)})
	app.Use(reqctx.Authenticate)
	// The API versioning strategy is a URL prefix. Every route is mounted under it.
	v1 := app.Group("/v1")
	document.Register(v1, store.NewPG(pool))
	return app.Listen(cfg.Addr)
}
