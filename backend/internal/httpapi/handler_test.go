package httpapi

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestOperationSuccess(t *testing.T) {
	tests := []struct {
		op   string
		body string
		want float64
	}{
		{op: "add", body: `{"a": 2, "b": 3}`, want: 5},
		{op: "subtract", body: `{"a": 2, "b": 3}`, want: -1},
		{op: "multiply", body: `{"a": 12, "b": -3.5}`, want: -42},
		{op: "divide", body: `{"a": 12.5, "b": 4}`, want: 3.125},
		{op: "multiply", body: `{"a": -5, "b": 0}`, want: 0},
		{op: "add", body: `{"a": 1e2, "b": 0.5}`, want: 100.5},
		{op: "power", body: `{"a": 2, "b": 10}`, want: 1024},
		{op: "sqrt", body: `{"a": 9}`, want: 3},
		{op: "percent", body: `{"a": 70}`, want: 0.7},
	}

	for _, tt := range tests {
		t.Run(tt.op+" "+tt.body, func(t *testing.T) {
			rec := do(t, http.MethodPost, "/api/v1/"+tt.op, tt.body)

			assertStatus(t, rec, http.StatusOK)
			var got resultResponse
			decodeBody(t, rec, &got)
			if got.Result != tt.want {
				t.Errorf("result = %v, want %v", got.Result, tt.want)
			}
		})
	}
}

func TestOperationErrors(t *testing.T) {
	tests := []struct {
		name       string
		method     string
		path       string
		body       string
		wantStatus int
		wantCode   string
	}{
		{"division by zero", http.MethodPost, "/api/v1/divide", `{"a": 1, "b": 0}`, 422, "DIVISION_BY_ZERO"},
		{"overflow", http.MethodPost, "/api/v1/multiply", `{"a": 1e308, "b": 10}`, 422, "RESULT_OUT_OF_RANGE"},
		{"negative sqrt", http.MethodPost, "/api/v1/sqrt", `{"a": -4}`, 422, "NEGATIVE_SQRT"},
		{"undefined power", http.MethodPost, "/api/v1/power", `{"a": 0, "b": -1}`, 422, "UNDEFINED_RESULT"},
		{"unary with b", http.MethodPost, "/api/v1/sqrt", `{"a": 9, "b": 1}`, 400, "INVALID_JSON"},
		{"unary missing a", http.MethodPost, "/api/v1/percent", `{}`, 400, "MISSING_OPERAND"},
		{"unary string operand", http.MethodPost, "/api/v1/sqrt", `{"a": "9"}`, 400, "INVALID_JSON"},
		{"unary malformed json", http.MethodPost, "/api/v1/sqrt", `{"a": `, 400, "INVALID_JSON"},
		{"wrong method on unary", http.MethodGet, "/api/v1/sqrt", ``, 405, "METHOD_NOT_ALLOWED"},
		{"missing a", http.MethodPost, "/api/v1/add", `{"b": 1}`, 400, "MISSING_OPERAND"},
		{"missing b", http.MethodPost, "/api/v1/add", `{"a": 1}`, 400, "MISSING_OPERAND"},
		{"null operand", http.MethodPost, "/api/v1/add", `{"a": null, "b": 1}`, 400, "MISSING_OPERAND"},
		{"empty object", http.MethodPost, "/api/v1/add", `{}`, 400, "MISSING_OPERAND"},
		{"number out of range", http.MethodPost, "/api/v1/add", `{"a": 1e400, "b": 1}`, 400, "INVALID_NUMBER"},
		{"string operand", http.MethodPost, "/api/v1/add", `{"a": "1", "b": 2}`, 400, "INVALID_JSON"},
		{"bool operand", http.MethodPost, "/api/v1/add", `{"a": true, "b": 2}`, 400, "INVALID_JSON"},
		{"object operand", http.MethodPost, "/api/v1/add", `{"a": {}, "b": 2}`, 400, "INVALID_JSON"},
		{"unknown field", http.MethodPost, "/api/v1/add", `{"a": 1, "b": 2, "c": 3}`, 400, "INVALID_JSON"},
		{"malformed json", http.MethodPost, "/api/v1/add", `{"a": 1,`, 400, "INVALID_JSON"},
		{"empty body", http.MethodPost, "/api/v1/add", ``, 400, "INVALID_JSON"},
		{"array body", http.MethodPost, "/api/v1/add", `[1, 2]`, 400, "INVALID_JSON"},
		{"trailing data", http.MethodPost, "/api/v1/add", `{"a": 1, "b": 2} {}`, 400, "INVALID_JSON"},
		{"oversized body", http.MethodPost, "/api/v1/add", `{"a": 1, "b": 2` + strings.Repeat(" ", maxBodyBytes) + `}`, 400, "INVALID_JSON"},
		{"unknown operation", http.MethodPost, "/api/v1/modulo", `{"a": 1, "b": 2}`, 404, "NOT_FOUND"},
		{"unknown api path", http.MethodGet, "/api/v2/add", ``, 404, "NOT_FOUND"},
		{"wrong method", http.MethodGet, "/api/v1/add", ``, 405, "METHOD_NOT_ALLOWED"},
		{"wrong method on unknown operation", http.MethodGet, "/api/v1/modulo", ``, 404, "NOT_FOUND"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rec := do(t, tt.method, tt.path, tt.body)

			assertStatus(t, rec, tt.wantStatus)
			var got errorResponse
			decodeBody(t, rec, &got)
			if got.Error == nil || got.Error.Code != tt.wantCode {
				t.Fatalf("error = %+v, want code %q", got.Error, tt.wantCode)
			}
			if got.Error.Message == "" {
				t.Error("error message is empty")
			}
		})
	}
}

func TestWrongMethodSetsAllowHeader(t *testing.T) {
	rec := do(t, http.MethodGet, "/api/v1/add", "")

	if got := rec.Header().Get("Allow"); got != http.MethodPost {
		t.Errorf("Allow = %q, want %q", got, http.MethodPost)
	}
}

func TestHealth(t *testing.T) {
	rec := do(t, http.MethodGet, "/healthz", "")

	assertStatus(t, rec, http.StatusOK)
	var got map[string]string
	decodeBody(t, rec, &got)
	if got["status"] != "ok" {
		t.Errorf("status = %q, want %q", got["status"], "ok")
	}
}

func TestStaticHandler(t *testing.T) {
	static := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusTeapot)
	})
	handler := NewHandler(static)

	tests := []struct {
		path       string
		wantStatus int
	}{
		{path: "/", wantStatus: http.StatusTeapot},
		{path: "/assets/app.js", wantStatus: http.StatusTeapot},
		{path: "/api/unknown", wantStatus: http.StatusNotFound},
	}

	for _, tt := range tests {
		t.Run(tt.path, func(t *testing.T) {
			rec := httptest.NewRecorder()
			handler.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, tt.path, nil))
			assertStatus(t, rec, tt.wantStatus)
		})
	}
}

func do(t *testing.T, method, path, body string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	NewHandler(nil).ServeHTTP(rec, req)
	return rec
}

func assertStatus(t *testing.T, rec *httptest.ResponseRecorder, want int) {
	t.Helper()
	if rec.Code != want {
		t.Fatalf("status = %d, want %d; body = %s", rec.Code, want, rec.Body)
	}
}

func decodeBody(t *testing.T, rec *httptest.ResponseRecorder, v any) {
	t.Helper()
	if ct := rec.Header().Get("Content-Type"); ct != "application/json" {
		t.Fatalf("Content-Type = %q, want application/json", ct)
	}
	if err := json.NewDecoder(rec.Body).Decode(v); err != nil {
		t.Fatalf("decode body: %v", err)
	}
}
