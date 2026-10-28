// Package reqctx carries the caller's identity from the trust boundary to the slices.
package reqctx

import (
	"context"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
)

// Header carries the tenant the gateway verified. The service trusts the gateway and
// nothing in front of it; a client that reaches the service directly is outside the trust
// boundary.
const Header = "X-Tenant-ID"

type ctxKey struct{}

// WithTenant records tenantID as the verified tenant. Call it only with a tenant that the
// trust boundary verified.
func WithTenant(ctx context.Context, tenantID uuid.UUID) context.Context {
	return context.WithValue(ctx, ctxKey{}, tenantID)
}

// TenantID reads the verified tenant. ok is false when Authenticate did not run.
func TenantID(ctx context.Context) (uuid.UUID, bool) {
	id, ok := ctx.Value(ctxKey{}).(uuid.UUID)
	return id, ok
}

// Authenticate is the middleware the root registers before every route. A request without
// a well-formed tenant header is unauthenticated and is rejected here with 401 and a
// minimal body, outside the error model: no slice raised it.
func Authenticate(c *fiber.Ctx) error {
	id, err := uuid.Parse(c.Get(Header))
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"message": "unauthenticated"})
	}
	c.SetUserContext(WithTenant(c.UserContext(), id))
	return c.Next()
}
