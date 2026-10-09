package httpapi

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strconv"
)

const maxBodyBytes = 1 << 10

type binaryRequest struct {
	A json.RawMessage `json:"a"`
	B json.RawMessage `json:"b"`
}

type unaryRequest struct {
	A json.RawMessage `json:"a"`
}

func decodeBinary(w http.ResponseWriter, r *http.Request) (a, b float64, err error) {
	var req binaryRequest
	if err := decodeRequest(w, r, &req, `{"a": 1, "b": 2}`); err != nil {
		return 0, 0, err
	}
	if a, err = parseOperand("a", req.A); err != nil {
		return 0, 0, err
	}
	if b, err = parseOperand("b", req.B); err != nil {
		return 0, 0, err
	}
	return a, b, nil
}

func decodeUnary(w http.ResponseWriter, r *http.Request) (float64, error) {
	var req unaryRequest
	if err := decodeRequest(w, r, &req, `{"a": 1}`); err != nil {
		return 0, err
	}
	return parseOperand("a", req.A)
}

// decodeRequest decodes exactly one JSON object with no unknown fields into dst.
func decodeRequest(w http.ResponseWriter, r *http.Request, dst any, example string) error {
	dec := json.NewDecoder(http.MaxBytesReader(w, r.Body, maxBodyBytes))
	dec.DisallowUnknownFields()

	if err := dec.Decode(dst); err != nil {
		return decodeError(err, example)
	}
	if err := dec.Decode(&struct{}{}); !errors.Is(err, io.EOF) {
		return invalidJSON("request body must contain a single JSON object")
	}
	return nil
}

func decodeError(err error, example string) *apiError {
	var maxBytesErr *http.MaxBytesError
	if errors.As(err, &maxBytesErr) {
		return invalidJSON(fmt.Sprintf("request body must not exceed %d bytes", maxBytesErr.Limit))
	}
	return invalidJSON("request body must be a JSON object like " + example)
}

// parseOperand works on the raw value so that strings, booleans and
// out-of-range numbers can be told apart, which typed decoding cannot do reliably.
func parseOperand(name string, raw json.RawMessage) (float64, error) {
	if len(raw) == 0 || string(raw) == "null" {
		return 0, &apiError{
			Status:  http.StatusBadRequest,
			Code:    "MISSING_OPERAND",
			Message: fmt.Sprintf("operand %q is required", name),
		}
	}
	if c := raw[0]; c != '-' && (c < '0' || c > '9') {
		return 0, invalidJSON(fmt.Sprintf("operand %q must be a number", name))
	}
	value, err := strconv.ParseFloat(string(raw), 64)
	if err != nil {
		return 0, &apiError{
			Status:  http.StatusBadRequest,
			Code:    "INVALID_NUMBER",
			Message: fmt.Sprintf("operand %q is out of range", name),
		}
	}
	return value, nil
}
