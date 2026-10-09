# Simple Calculator: Specification

## 1. Scope

A full-stack calculator:

- **Frontend**: React + TypeScript keypad calculator. Input is stored as a typed unary or binary expression, so no expression string is parsed. It **never computes**. It calls the matching endpoint and formats the result for display.
- **Backend**: Go REST API with **no external dependencies**. It does all the arithmetic on `float64`.

Phase 1: add, subtract, multiply, divide.
Phase 2: power (binary), square root and percent (unary). See §7.

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
| POST   | `/api/v1/power`      | a ^ b     |
| POST   | `/api/v1/sqrt`       | √a        |
| POST   | `/api/v1/percent`    | a ÷ 100   |
| GET    | `/healthz`           | liveness  |

### Request

Binary operations (`add`, `subtract`, `multiply`, `divide`, `power`):

```json
{ "a": 12.5, "b": 4 }
```

Unary operations (`sqrt`, `percent`):

```json
{ "a": 9 }
```

- Every operand of the operation is a required JSON number.
- Unknown fields (including `b` on a unary operation), extra trailing data, and bodies over 1 KiB are rejected.

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
| `MISSING_OPERAND`     | 400  | A required operand is absent or `null`                     |
| `INVALID_NUMBER`      | 400  | Number out of `float64` range (e.g. `1e400`)               |
| `DIVISION_BY_ZERO`    | 422  | `b == 0` on divide                                         |
| `NEGATIVE_SQRT`       | 422  | `a < 0` on sqrt                                            |
| `UNDEFINED_RESULT`    | 422  | Power has no real result: `0 ^ b` with `b < 0`, or a negative base with a non-integer exponent |
| `RESULT_OUT_OF_RANGE` | 422  | Result overflows to ±Inf                                   |
| `NOT_FOUND`           | 404  | Unknown operation                                          |
| `METHOD_NOT_ALLOWED`  | 405  | Wrong HTTP method                                          |

Notes:

- JSON cannot represent `NaN` or `Inf`, so valid inputs are always finite. The output check still stops overflow such as `1e308 * 10`.
- `-0` results are normalized to `0`.

### Backend Design

- `calc` package: one pure function per operation, either `BinaryOp func(a, b float64) (float64, error)` or `UnaryOp func(a float64) (float64, error)`. It returns sentinel errors (`ErrDivisionByZero`, `ErrNegativeSqrt`, `ErrUndefined`, `ErrOutOfRange`). It has no HTTP knowledge.
- `httpapi` package: routes with the Go 1.22+ `http.ServeMux` pattern `POST /api/v1/{op}`. It looks up `op` in a single `map[string]http.HandlerFunc` registry whose entries are built by two adapters, `binary(calc.Add)` and `unary(calc.Sqrt)`. Each adapter decodes its own request shape. Adding an operation means one function plus one registry entry.
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
│ AC  │  ±  │     ⌫     │
│  √  │ xʸ  │  %  │  ÷  │
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
type Operator = 'add' | 'subtract' | 'multiply' | 'divide' | 'power';
type UnaryOperator = 'sqrt' | 'percent';

type Expression =
  | { kind: 'binary'; left: string; operator: Operator | null; right: string }
  | { kind: 'unary'; operator: UnaryOperator; operand: string };

interface CalculatorState {
  expression: Expression;
  result: number | null; // raw API value; non-null means "result mode"
  status: 'idle' | 'loading';
  error: string | null;
}
```

- **Expression kind:** TypeScript distinguishes unary from binary fields. A unary expression has one operand and cannot retain a binary operator or right operand.
- **Rendering:** binary expressions show `[left, symbol(operator), right]`, with empty parts omitted. Unary expressions show `√(operand)` or `operand%`; an empty square root shows `√()`. A successful result appends ` = {formatResult(result)}`.
- **Active operand:** the unary `operand`, or binary `right` when an operator is selected, otherwise `left`.
- **Complete number:** a non-empty operand other than `-`. A trailing decimal point is allowed.
- **Unary minus:** a `-` prefix on the operand string. Spaces and parentheses exist only in rendering; no expression parsing is needed.

### Input Rules

| Key / Button | Rule |
|--------------|------|
| `0`–`9` | Append to the active operand, including a pending unary operand. A lone leading `0` is replaced (`0` → `5`, `-0` → `-5`). Typing is capped at 15 digits per number. |
| `.` | Append if there is no decimal point. An empty operand becomes `0.`, and `-` becomes `-0.`. Works in unary and binary expressions. |
| `±` | Toggle the active operand's sign, including after a unary error. An empty operand becomes `-`. |
| `-` key / `−` button | On an empty active operand, enter a unary minus; on a lone `-`, do nothing. Otherwise select subtraction as below. |
| `+` `−` `×` `÷` `xʸ` (`*` `/` `^`) | Require a complete first operand and no incomplete signed right operand. With one operand, set or replace the operation, including a pending unary operation. With a complete binary right operand, show "Calculate the current operation first". |
| `√` (`@`) | Select square root before or after entering the operand. The operand stays editable until equals. A complete binary right operand is rejected with "√ and % work on a single number"; a right operand of `-` gives "Enter a number first". |
| `%` | Require a complete single operand when selecting percentage. Set or replace the operation; the operand stays editable. A binary right operand is rejected as for square root. |
| `Enter`, `=` | Submit only a complete unary expression or a binary expression with two complete operands and an operator. Otherwise show "Incomplete expression". Enter on a focused keypad button retains native button activation. |
| `Backspace`, `⌫` | For unary input, remove the operation first and retain the operand as binary `left` with no operator. For binary input, delete backwards across `right`, `operator`, and `left`. |
| `Escape`, `AC` | Reset everything. |

Examples:

- `√ 100 =` and `100 √ =` both produce `√(100) = 10`.
- `1 √ 00 =` edits the operand to `100`, then produces `10`.
- `10 % 0 =` edits the operand to `100`, then produces `1`.
- `10 % × 200 =` replaces percent with multiplication and produces `2000`; no percentage request is sent.
- `10 % =`, then `× 200 =`, calculates percentage first and produces `20`.

Other rules:

- **No-op keys:** a second `.`, a 16th digit, or `-` on a lone `-` leaves the state unchanged.
- **Only explicit evaluation sends a request.** Selecting or replacing an operation never sends one.
- **Request conversion:** `toRequest(expression)` produces `{ operation, a, b }` for binary operations or `{ operation, a }` for unary operations. It returns `null` for incomplete expressions instead of converting empty operands to zero. The API client sends the operands to `/api/v1/{operation}`.
- **Clearing errors:** an accepted input clears the error; an ignored key preserves it.

### Request and Result Mode

- **`loading`:** all keys are ignored and the keypad is disabled. After 10 seconds the request is aborted, the expression is preserved, the keypad is re-enabled, and "Request timed out. Please try again." is shown. Cleanup cancels the timer and request; late responses cannot overwrite newer state.
- **Success:** retain the expression and raw result, displaying e.g. `12 ÷ 4 = 3`, `√(9) = 3`, or `70% = 0.7`.
- **API error:** preserve the expression and show the error separately. Unary operands can be edited directly using digits, decimal point, and sign toggle; Backspace removes the unary operation first. Press equals to retry.
- **Result mode**, for the next key:
  - **Digit or `.`:** start a new binary expression with that key as the beginning of `left`.
  - **Binary operator:** create a binary expression with `left = resultToOperand(result)` and the chosen operator.
  - **`√` or `%`:** create an editable unary expression with `operand = resultToOperand(result)` and the chosen operator. Wait for equals.
  - **`±`:** create a binary expression with the sign-toggled result as `left` and no operator.
  - **`⌫`:** create a binary expression with the result as `left` and no operator; subsequent Backspace presses edit it.
  - **`AC`:** reset.
  - **Equals:** leave the displayed result unchanged.

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
| `NEGATIVE_SQRT`               | "Cannot take the square root of a negative number" |
| `UNDEFINED_RESULT`            | "Result is undefined"        |
| `RESULT_OUT_OF_RANGE`         | "Result out of range"        |
| Other API error               | API `message`                |
| Network failure / non-JSON    | "Service unavailable"        |

### Why Structured Input

The per-operation endpoints take either two operands (`a op b`) or one operand (`op a`). Building that shape directly removes any need for tokenizing, spacing rules, or unary-minus disambiguation. A free-text field would mean building a string only to parse it back. Full expressions would need precedence, parsing, and an `/evaluate` endpoint, which is out of scope.

## 5. Testing

| Layer    | Tool                    | Focus                                                    |
|----------|-------------------------|----------------------------------------------------------|
| `calc`   | `go test` (table-driven) | each op, divide by zero, negative sqrt, undefined power, overflow, `-0` |
| `httpapi`| `httptest`              | status codes, error codes, binary and unary body validation, unknown op |
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

## 7. Phase 2: Power, Square Root, Percent

- **Power** (`xʸ`, `^`) is a binary operation like the others: `2 ^ 10 = 1024`. Results without a real value (`0 ^ -1`, `(-8) ^ (1/3)`) return `UNDEFINED_RESULT`; overflow returns `RESULT_OUT_OF_RANGE`. `0 ^ 0` is `1`.
- **Square root** (`√`, `@`) and **percent** (`%`) are unary operations on one editable operand. Square root can be selected before or after entering the operand; percentage is selected after a number. Both wait for equals: `√ 9 =` and `9 √ =` show `√(9) = 3`.
- **Percent is plain `a ÷ 100`**: `70% = 0.7`. Calculator-style percent (`200 + 10% = 220`) is not supported. The same value takes steps instead: `10 % =` gives `0.1`, then `× 200 =` gives `20`.
- **No mixing:** an expression has exactly one operation, binary or unary. `200 + 10%` is rejected with "√ and % work on a single number".

## 8. Decisions Log

1. Results are rounded for display to at most 12 significant digits, with trailing zeros dropped; raw API precision is preserved for chaining.
2. `±` is included in phase 1.
3. `DIVISION_BY_ZERO` and `RESULT_OUT_OF_RANGE` return `422`.
4. Input is a keypad that writes to a discriminated union of unary and binary expressions. There is no free-text field and no expression parsing.
5. Exactly one operation is allowed per request. Pressing an operator while `right` is filled shows "Calculate the current operation first" instead of chaining.
6. `√` allows prefix or postfix selection; `%` is selected after a number. Their operands remain editable, and only explicit evaluation sends a request.
7. Percent is `a ÷ 100`; calculator-style percent is not supported.
8. Unary and binary operations are never mixed in one expression; the result of one can be reused by the next.
9. Power returns `UNDEFINED_RESULT` (422) when there is no real result.
10. Selecting another operation while there is only one operand replaces it without calculating. Backspace removes a unary operation before editing its operand.
