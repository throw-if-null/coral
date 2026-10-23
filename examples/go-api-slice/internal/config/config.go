// Package config is the crosscut that resolves and validates every setting the app reads.
// The two roots, api and migrate, consume it; no slice does.
package config

import (
	"errors"
	"os"
)

// Config is every setting the app reads, resolved and validated once.
type Config struct {
	DatabaseURL string
	Addr        string
}

// Load reads the environment. DATABASE_URL is required; ADDR defaults to :8080.
func Load() (Config, error) {
	cfg := Config{DatabaseURL: os.Getenv("DATABASE_URL"), Addr: os.Getenv("ADDR")}
	if cfg.DatabaseURL == "" {
		return Config{}, errors.New("DATABASE_URL is required")
	}
	if cfg.Addr == "" {
		cfg.Addr = ":8080"
	}
	return cfg, nil
}
