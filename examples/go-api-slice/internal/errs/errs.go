// Package errs is the error model this app declares: its categories, the one error type
// slices raise, and the handler the root registers to render it.
package errs

import (
	"errors"
	"log/slog"
	"net/http"

	"github.com/gofiber/fiber/v2"
)

// Category is one of the app's declared error categories. The set is closed: adding a
// category changes this declaration and Status, and no slice.
type Category string

const (
	Internal Category = "internal"
	NotFound Category = "not_found"
	Invalid  Category = "invalid"
)

// Error is the failure a slice raises. Code is minted by the raising slice.
type Error struct {
	Category Category
	Code     string
	Message  string
	cause    error
}

func (e *Error) Error() string { return e.Message }

// Unwrap exposes the cause to the log line, never to the response body.
func (e *Error) Unwrap() error { return e.cause }

// New constructs a raised failure.
func New(category Category, code, message string) *Error {
	return &Error{Category: category, Code: code, Message: message}
}

// Wrap classifies an unexpected cause as Internal. The message is fixed so the cause
// cannot reach the client.
func Wrap(code string, cause error) *Error {
	return &Error{Category: Internal, Code: code, Message: "internal error", cause: cause}
}

// Status maps every declared category to an HTTP status.
func Status(c Category) int {
	switch c {
	case NotFound:
		return http.StatusNotFound
	case Invalid:
		return http.StatusBadRequest
	case Internal:
		return http.StatusInternalServerError
	}
	// A value outside the declared set is a defect. It renders as an internal failure
	// rather than falling through to a handler.
	return http.StatusInternalServerError
}

type body struct {
	Category Category `json:"category"`
	Code     string   `json:"code"`
	Message  string   `json:"message"`
}

// ErrorHandler renders every error a handler returns as {category, code, message}. The
// root registers it as the app's one error handler, and nothing else renders.
func ErrorHandler(log *slog.Logger) fiber.ErrorHandler {
	return func(c *fiber.Ctx, err error) error {
		var e *Error
		if !errors.As(err, &e) {
			// Fiber raises its own errors for an unmatched route or method. No slice raised
			// them, so they keep Fiber's status and carry no slice-owned code.
			var fe *fiber.Error
			if errors.As(err, &fe) {
				return c.Status(fe.Code).JSON(fiber.Map{"message": fe.Message})
			}
			// Anything else bypassed the model. The root catches it once, here.
			e = Wrap("unhandled", err)
		}
		if e.Category == Internal {
			log.Error("request failed", "path", c.Path(), "code", e.Code, "error", e.cause)
		}
		return c.Status(Status(e.Category)).JSON(body{Category: e.Category, Code: e.Code, Message: e.Message})
	}
}
