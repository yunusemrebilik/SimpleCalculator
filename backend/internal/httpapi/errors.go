package httpapi

import (
	"errors"
	"net/http"

	"simplecalculator/internal/calc"
)

// apiError is an error that maps directly to an HTTP error response.
type apiError struct {
	Status  int    `json:"-"`
	Code    string `json:"code"`
	Message string `json:"message"`
}

func (e *apiError) Error() string { return e.Message }

var (
	errNotFound         = &apiError{Status: http.StatusNotFound, Code: "NOT_FOUND", Message: "resource not found"}
	errMethodNotAllowed = &apiError{Status: http.StatusMethodNotAllowed, Code: "METHOD_NOT_ALLOWED", Message: "method not allowed; use POST"}
	errInternal         = &apiError{Status: http.StatusInternalServerError, Code: "INTERNAL", Message: "internal server error"}
)

func invalidJSON(message string) *apiError {
	return &apiError{Status: http.StatusBadRequest, Code: "INVALID_JSON", Message: message}
}

func toAPIError(err error) *apiError {
	var apiErr *apiError
	switch {
	case errors.As(err, &apiErr):
		return apiErr
	case errors.Is(err, calc.ErrDivisionByZero):
		return &apiError{Status: http.StatusUnprocessableEntity, Code: "DIVISION_BY_ZERO", Message: err.Error()}
	case errors.Is(err, calc.ErrNegativeSqrt):
		return &apiError{Status: http.StatusUnprocessableEntity, Code: "NEGATIVE_SQRT", Message: err.Error()}
	case errors.Is(err, calc.ErrUndefined):
		return &apiError{Status: http.StatusUnprocessableEntity, Code: "UNDEFINED_RESULT", Message: err.Error()}
	case errors.Is(err, calc.ErrOutOfRange):
		return &apiError{Status: http.StatusUnprocessableEntity, Code: "RESULT_OUT_OF_RANGE", Message: err.Error()}
	default:
		return errInternal
	}
}
