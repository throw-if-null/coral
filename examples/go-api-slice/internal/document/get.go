package document

import (
	"context"
	"errors"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"

	"github.com/throw-if-null/coral/examples/go-api-slice/internal/errs"
	"github.com/throw-if-null/coral/examples/go-api-slice/internal/reqctx"
)

// Get returns one document scoped to the caller's tenant. A scoped miss is raised as
// NotFound whether the document does not exist or belongs to another tenant.
func Get(ctx context.Context, s Store, tenantID, id uuid.UUID) (Document, error) {
	doc, err := s.GetByID(ctx, tenantID, id)
	if errors.Is(err, ErrNoRows) {
		return Document{}, errs.New(errs.NotFound, "document_not_found", "document not found")
	}
	if err != nil {
		return Document{}, errs.Wrap("document_store", err)
	}
	return doc, nil
}

type getResponse struct {
	ID    uuid.UUID `json:"id"`
	Title string    `json:"title"`
	Body  string    `json:"body"`
}

// getHandler is the HTTP edge of get. A failure is returned for the root to render.
func getHandler(s Store) fiber.Handler {
	return func(c *fiber.Ctx) error {
		tenantID, ok := reqctx.TenantID(c.UserContext())
		if !ok {
			// reqctx.Authenticate guarantees a tenant. Its absence is a wiring defect.
			return errs.Wrap("document_no_tenant", errors.New("no tenant on the request context"))
		}
		id, err := uuid.Parse(c.Params("id"))
		if err != nil {
			return errs.New(errs.Invalid, "document_bad_id", "invalid document id")
		}
		doc, err := Get(c.UserContext(), s, tenantID, id)
		if err != nil {
			return err
		}
		return c.Status(fiber.StatusOK).JSON(getResponse{ID: doc.ID, Title: doc.Title, Body: doc.Body})
	}
}
