# go-api-slice

An executable Coral example: one backend capability, `document`, with one operation, `get`, in Go.
[The page](https://coral.appsandtools.work/examples/go-api-slice) walks through the code and cites it
by URL.

The route is `GET /v1/documents/{id}`. The caller's tenant comes from the `X-Tenant-ID` header, which
the gateway in front of this service verifies. The service trusts that gateway and nothing in front of
it. A document of another tenant is a `404`, indistinguishable from a document that does not exist.

## Commands

Go 1.25 or later.

```bash
go test ./...
```

builds the project and runs every test. Without `DATABASE_URL` the two Postgres tests skip and say so.

The Postgres tests, tenant isolation in `internal/store` and migration in `internal/db`, run when
`DATABASE_URL` is set. Each creates its own schema and drops it afterwards. With podman:

```bash
podman run --rm -d --name coral-pg -e POSTGRES_PASSWORD=coral -p 5432:5432 docker.io/library/postgres:17
DATABASE_URL='postgres://postgres:coral@localhost:5432/postgres?sslmode=disable' go test ./...
podman stop coral-pg
```

To run the service, apply the migrations, then start the API:

```bash
export DATABASE_URL='postgres://postgres:coral@localhost:5432/postgres?sslmode=disable'
go run ./cmd/migrate
go run ./cmd/api
```

`go run ./cmd/migrate` applies every migration not yet recorded in `schema_migrations` and logs each
one; a second run applies nothing. `ADDR` sets the API's listen address; the default is `:8080`. Both
commands fail at startup when `DATABASE_URL` is missing or the database is unreachable.

## Decisions

- API versioning: a URL prefix, `/v1`, the default `[BE-7]` names. It advances only for a breaking
  change.
- Authorization: every verified tenant may call `GET /v1/documents/{id}`, so no `403` path exists.
  Resource-level authorization is the `tenant_id` clause of the query (`[BE-6]`).
- Error model: three categories, `internal`, `not_found`, and `invalid`, declared in `internal/errs`.
  The root maps them to `500`, `404`, and `400`.
- Migrations: the owning package defines them, under `internal/document/migrations/`; the `db` crosscut
  runs them; `go run ./cmd/migrate` triggers them as a separate step before the API starts. The API
  does not run them at startup. Whether an app migrates at startup is a per-app decision, and this
  project chose the separate step.

## Coral

`CORAL.md` is the adherence record. `CORAL-CONTRACT.md` is generated from it and is not edited by hand.
Regenerate it from a Coral checkout at the version the record targets:

```bash
npm run contract:generate -- --project examples/go-api-slice
```

The Coral repository's `npm test` fails when the committed contract differs from the generator's
output. `AGENTS.md` tells a coding agent what to load before it changes code.
