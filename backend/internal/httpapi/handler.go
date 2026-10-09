// Package httpapi exposes the calculator over a JSON REST API.
package httpapi

import (
	"encoding/json"
	"log/slog"
	"net/http"

	"simplecalculator/internal/calc"
)

var operations = map[string]http.HandlerFunc{
	"add":      binary(calc.Add),
	"subtract": binary(calc.Subtract),
	"multiply": binary(calc.Multiply),
	"divide":   binary(calc.Divide),
	"power":    binary(calc.Power),
	"sqrt":     unary(calc.Sqrt),
	"percent":  unary(calc.Percent),
}

type resultResponse struct {
	Result float64 `json:"result"`
}

type errorResponse struct {
	Error *apiError `json:"error"`
}

// NewHandler returns the application's HTTP handler. If static is non-nil,
// it serves every request that does not match an API route.
func NewHandler(static http.Handler) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("POST /api/v1/{op}", handleOperation)
	mux.HandleFunc("/api/v1/{op}", handleWrongMethod)
	mux.HandleFunc("/api/", handleNotFound)
	mux.HandleFunc("GET /healthz", handleHealth)
	if static != nil {
		mux.Handle("/", static)
	}
	return mux
}

func handleOperation(w http.ResponseWriter, r *http.Request) {
	handle, ok := operations[r.PathValue("op")]
	if !ok {
		writeError(w, errNotFound)
		return
	}
	handle(w, r)
}

func binary(op calc.BinaryOp) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		a, b, err := decodeBinary(w, r)
		if err != nil {
			writeError(w, err)
			return
		}
		result, err := op(a, b)
		writeResult(w, result, err)
	}
}

func unary(op calc.UnaryOp) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		a, err := decodeUnary(w, r)
		if err != nil {
			writeError(w, err)
			return
		}
		result, err := op(a)
		writeResult(w, result, err)
	}
}

func writeResult(w http.ResponseWriter, result float64, err error) {
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, resultResponse{Result: result})
}

func handleWrongMethod(w http.ResponseWriter, r *http.Request) {
	if _, ok := operations[r.PathValue("op")]; !ok {
		writeError(w, errNotFound)
		return
	}
	w.Header().Set("Allow", http.MethodPost)
	writeError(w, errMethodNotAllowed)
}

func handleNotFound(w http.ResponseWriter, _ *http.Request) {
	writeError(w, errNotFound)
}

func handleHealth(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func writeError(w http.ResponseWriter, err error) {
	apiErr := toAPIError(err)
	if apiErr == errInternal {
		slog.Error("unhandled error", "error", err)
	}
	writeJSON(w, apiErr.Status, errorResponse{Error: apiErr})
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(body); err != nil {
		slog.Error("failed to write response", "error", err)
	}
}
