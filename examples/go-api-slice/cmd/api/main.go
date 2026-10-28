// Command api is the composition root of the service.
package main

import (
	"context"
	"log/slog"
	"os"
	"time"

	"github.com/gofiber/fiber/v2"

	"github.com/throw-if-null/coral/examples/go-api-slice/internal/config"
	"github.com/throw-if-null/coral/examples/go-api-slice/internal/db"
	"github.com/throw-if-null/coral/examples/go-api-slice/internal/document"
	"github.com/throw-if-null/coral/examples/go-api-slice/internal/errs"
	"github.com/throw-if-null/coral/examples/go-api-slice/internal/reqctx"
	"github.com/throw-if-null/coral/examples/go-api-slice/internal/store"
)

func main() {
	log := slog.New(slog.NewJSONHandler(os.Stderr, nil))
	if err := run(log); err != nil {
		log.Error("startup failed", "error", err)
		os.Exit(1)
	}
}

func run(log *slog.Logger) error {
	cfg, err := config.Load()
	if err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	// Migrations are a separate step, cmd/migrate, by decision: the API never runs them.
	pool, err := db.Open(ctx, cfg.DatabaseURL)
	if err != nil {
		return err
	}
	defer pool.Close()

	app := fiber.New(fiber.Config{ErrorHandler: errs.ErrorHandler(log)})
	app.Use(reqctx.Authenticate)
	// The API versioning strategy is a URL prefix. Every route is mounted under it.
	v1 := app.Group("/v1")
	document.Register(v1, store.NewPG(pool))
	return app.Listen(cfg.Addr)
}
