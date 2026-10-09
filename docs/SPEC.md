# Simple Calculator: Specification

## 1. Scope

A full-stack calculator:

- **Frontend**: React + TypeScript keypad calculator. Input is stored as structured slots (`left`, `operator`, `right`), so nothing is ever parsed. It **never computes**. It calls the matching endpoint and formats the result for display.
- **Backend**: Go REST API with **no external dependencies**. It does all the arithmetic on `float64`.

In scope (phase 1): add, subtract, multiply, divide.
Deferred (phase 2): exponentiation, square root, percentage.

## 2. Repository Layout

```
/
├── backend/
│   ├── cmd/server/main.go        # wiring, config, graceful shutdown
│   ├── internal/calc/            # pure arithmetic + domain errors
│   └── internal/httpapi/         # routing, handlers, JSON encode/decode
├── frontend/
│   └── src/
│       ├── api/                  # typed API client
│       └── features/calculator/  # reducer, hook, components
├── docs/SPEC.md
├── Dockerfile                    # single image: Go binary serves built frontend
└── README.md
```

## 3. Backend API

Base path: `/api/v1`

| Method | Path                 | Operation |
|--------|----------------------|-----------|
| POST   | `/api/v1/add`        | a + b     |
| POST   | `/api/v1/subtract`   | a − b     |
| POST   | `/api/v1/multiply`   | a × b     |
| POST   | `/api/v1/divide`     | a ÷ b     |
| GET    | `/healthz`           | liveness  |

### Request

```json
{ "a": 12.5, "b": 4 }
```

- Both `a` and `b` are required JSON numbers.
- Unknown fields, extra trailing data, and bodies over 1 KiB are rejected.

### Success: `200 OK`

```json
{ "result": 3.125 }
```

### Error: `4xx`

```json
{ "error": { "code": "DIVISION_BY_ZERO", "message": "division by zero is not allowed" } }
```

| Code                  | HTTP | When                                                       |
|-----------------------|------|------------------------------------------------------------|
| `INVALID_JSON`        | 400  | Malformed or oversized body, wrong types, or unknown fields |
| `MISSING_OPERAND`     | 400  | `a` or `b` is absent or `null`                             |
| `INVALID_NUMBER`      | 400  | Number out of `float64` range (e.g. `1e400`)               |
| `DIVISION_BY_ZERO`    | 422  | `b == 0` on divide                                         |
| `RESULT_OUT_OF_RANGE` | 422  | Result overflows to ±Inf or is NaN                         |
| `NOT_FOUND`           | 404  | Unknown operation                                          |
| `METHOD_NOT_ALLOWED`  | 405  | Wrong HTTP method                                          |

Notes:

- JSON cannot represent `NaN` or `Inf`, so valid inputs are always finite. The output check still stops overflow such as `1e308 * 10`.
- `-0` results are normalized to `0`.

### Backend Design

- `calc` package: one pure function per operation, with signature `func(a, b float64) (float64, error)`. It returns sentinel errors (`ErrDivisionByZero`, `ErrOutOfRange`). It has no HTTP knowledge.
- `httpapi` package: routes with the Go 1.22+ `http.ServeMux` pattern `POST /api/v1/{op}`. It looks up `op` in a `map[string]calc.BinaryOp` registry. Adding a new binary operation means one function plus one registry entry.
- Errors are mapped to HTTP status codes in a single place.
- Config comes from environment variables: `PORT` (default `8080`) and `STATIC_DIR` (optional; serves the frontend build when set).
- No CORS: in dev, the Vite proxy forwards `/api`. In prod, the frontend and API share the same origin.

## 4. Frontend

Stack: Vite, React, TypeScript (strict), Vitest, React Testing Library. No UI library; plain CSS with CSS Grid.

### UI

```
┌───────────────────────┐
│          12 × -3.5    │  ← display: rendered from state (shows `expr = result` after a successful request)
│  Cannot divide by 0   │  ← error area (separate; never overwrites the display)
├─────┬─────┬─────┬─────┤
│ AC  │  ⌫  │  ±  │  ÷  │
│  7  │  8  │  9  │  ×  │
│  4  │  5  │  6  │  −  │
│  1  │  2  │  3  │  +  │
│     0     │  .  │  =  │
└───────────┴─────┴─────┘
```

- Responsive: the keypad scales to the viewport width on mobile and is capped at a max width on desktop.
- Accessible: real `<button>` elements, `aria-label`s on symbol keys, `role="status"` on the display, and `role="alert"` on the error area.
- Keyboard shortcuts use a window `keydown` listener. Enter on a focused keypad button keeps its native activation behavior; otherwise Enter submits. Space also activates focused buttons. There is no text field.

### State

State is managed by a pure reducer (`useReducer`), and the API call runs in a custom hook.

```ts
type Operator = 'add' | 'subtract' | 'multiply' | 'divide';

interface CalculatorState {
  left: string;              // '', '-', '12', '-3.5', '0.'
  operator: Operator | null;
  right: string;
  result: number | null;     // raw API value; non-null means "result mode"
  status: 'idle' | 'loading';
  error: string | null;
}
```

- **Rendering:** the display shows `[left, symbol(operator), right]`, with empty parts filtered out and the rest joined by single spaces. In result mode it appends ` = {formatResult(result)}`.
- **Spaces exist only in rendering.** The data is never a string that needs parsing.
- **Unary minus:** it is just a `-` prefix on a slot's string.
- **Active slot:** `right` if `operator` is set, otherwise `left`.
- **Complete number:** a slot is complete when it is non-empty and not just `-`.

### Input Rules

| Key / Button               | Rule                                                                                       |
|----------------------------|--------------------------------------------------------------------------------------------|
| `0`–`9`                    | Append to the active slot. A lone leading `0` is replaced (`0`→`5`, `-0`→`-5`). Typing is capped at 15 digits per number. |
| `.`                        | Append if the slot has no `.`. An empty slot becomes `0.`, and `-` becomes `-0.`.          |
| `±`                        | Toggle the `-` prefix of the active slot. An empty slot becomes `-`.                       |
| `-` key / `−` button       | If the active slot is empty, it becomes `-` (unary). Otherwise it acts as the subtract operator (next row). |
| `+` `−` `×` `÷` (`*` `/`)   | If `left` isn't complete, or `right` is just `-`: error "Enter a number first". If `operator` is set and `right` is empty: replace the operator. If `right` is complete: error **"Calculate the current operation first"**, and state is unchanged. |
| `Enter`, `=`               | If `left`, `operator`, and `right` are all complete: send the request. Otherwise: error "Incomplete expression". |
| `Backspace`, `⌫`           | Delete backwards across slots: the last char of `right`, then the `operator`, then the last char of `left`. |
| `Escape`, `AC`             | Reset everything.                                                                          |

Other rules:

- **No-op keys:** keys that can't apply are ignored, e.g. a second `.`, a 16th digit, or `-` on a slot that is already `-`.
- **Request body:** `{ a: Number(left), b: Number(right) }`, sent to `/api/v1/{operator}`.
- **Clearing errors:** an error is cleared by the next accepted key.

### Request and Result Mode

- **`loading`:** all keys are ignored and the keypad is disabled. After 10 seconds the request is aborted, input is preserved, the keypad is re-enabled, and "Request timed out. Please try again." is shown. Cleanup cancels the timer and request; late responses cannot overwrite newer state.
- **Success:** `result` is set, and the display shows `12 ÷ 4 = 3`.
- **API error:** the slots are kept unchanged and the message is shown in the error area. The user fixes the input with `⌫` and presses `=` again.
- **Result mode**, for the next key:
  - **Digit or `.`:** starts fresh, with that key as the start of `left`.
  - **Operator, including `-`:** `left = resultToOperand(result)`, and the operator is set.
  - **`±`:** `left` becomes the negated result.
  - **`⌫`:** `left = resultToOperand(result)`. The user then keeps editing the result.
  - **`AC`:** reset.

### Result Formatting

Results are formatted with `Intl.NumberFormat('en-US', { maximumSignificantDigits: 12, useGrouping: false, signDisplay: 'negative' })`:

- `3.50000` → `3.5`
- `1 ÷ 3` → `0.333333333333`
- `-0.000001` stays `-0.000001`; only actual negative zero becomes `0`
- Large values stay in plain decimal (no exponent), so a result can always be reused as `left`.

The result is stored as the raw API number. When reused or edited, `resultToOperand` converts it to an exponent-free decimal string with round-trip precision (up to 21 significant digits), so the next request preserves its value. The full operand becomes visible during reuse/editing. For example, `1 ÷ 3 = 0.333333333333`, then `× 3` gives `1`. Display rounding never changes arithmetic.

### Error Messages (API)

| Source                        | Display                      |
|-------------------------------|------------------------------|
| `DIVISION_BY_ZERO`            | "Cannot divide by zero"      |
| `RESULT_OUT_OF_RANGE`         | "Result out of range"        |
| Other API error               | API `message`                |
| Network failure / non-JSON    | "Service unavailable"        |

### Why Structured Input

The per-operation endpoints take exactly `a op b`. Building that shape directly removes any need for tokenizing, spacing rules, or unary-minus disambiguation. A free-text field would mean building a string only to parse it back. Full expressions would need precedence, parsing, and an `/evaluate` endpoint, which is out of scope.

## 5. Testing

| Layer    | Tool                    | Focus                                                    |
|----------|-------------------------|----------------------------------------------------------|
| `calc`   | `go test` (table-driven) | each op, divide by zero, overflow, `-0`                  |
| `httpapi`| `httptest`              | status codes, error codes, body validation, unknown op   |
| reducer  | Vitest                  | every input rule, result mode, and error cases           |
| formatter | Vitest                 | rounding, trailing zeros, `-0`, large values             |
| API client | Vitest + mocked `fetch` | success, API error, network error                       |
| UI       | RTL + `user-event`      | click flow, keyboard flow, error area keeps the input    |

Coverage:

- Backend: `go test ./... -coverprofile`
- Frontend: `vitest --coverage` (v8)

The README links the coverage reports.

## 6. Deployment

The repo uses a multi-stage `Dockerfile`:

1. A Node stage builds the frontend.
2. A Go stage builds a static binary.
3. A minimal runtime image contains the binary and `/static`, with `STATIC_DIR=/static`, on port `8080`.

## 7. Phase 2 (Deferred)

- `POST /api/v1/power` takes `{a, b}` and fits the existing binary registry.
- `POST /api/v1/sqrt` takes `{a}`. It needs a small unary-operation variant, plus a `NEGATIVE_SQRT` error.
- `percent`: semantics to be decided. It could be `a % b` (modulo), `a × b / 100`, or calculator-style (`50 + 10%` = 55).

## 8. Decisions Log

1. Results are rounded for display to at most 12 significant digits, with trailing zeros dropped; raw API precision is preserved for chaining.
2. `±` is included in phase 1.
3. `DIVISION_BY_ZERO` and `RESULT_OUT_OF_RANGE` return `422`.
4. Input is a keypad that writes to structured slots (`left`, `operator`, `right`). There is no free-text field and no parsing.
5. Exactly one operation is allowed per request. Pressing an operator while `right` is filled shows "Calculate the current operation first" instead of chaining.
