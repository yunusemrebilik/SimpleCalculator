# Simple Calculator

A full-stack calculator: a **React + TypeScript** frontend that does no arithmetic itself, and a **Go** REST microservice (standard library only) that performs every calculation.

The detailed behaviour specification is in [docs/SPEC.md](docs/SPEC.md).

```
backend/                     Go API (no external dependencies)
  cmd/server/                entry point: config, static files, graceful shutdown
  internal/calc/             pure arithmetic + domain errors
  internal/httpapi/          routing, request validation, JSON responses
frontend/                    Vite + React + TypeScript
  src/api/                   typed API client
  src/features/calculator/   reducer, hook, keyboard mapping, formatting, components
Dockerfile                   single image: Go binary serves the built frontend
```

## Prerequisites

- Go 1.22+
- Node.js 24.15+ (24.x recommended), or 22.22.2+ (22.x) / 26+, and npm
- Docker (optional)

## Running Locally

**Backend** (port `8080`):

```sh
cd backend
go run ./cmd/server
```

**Frontend** (port `5173`; Vite proxies `/api` to `localhost:8080`, so no CORS is needed):

```sh
cd frontend
npm ci
npm run dev
```

Open <http://localhost:5173>.

**Single process:** the backend can also serve a production build of the frontend.

```sh
cd frontend && npm run build && cd ..
cd backend
STATIC_DIR=../frontend/dist go run ./cmd/server   # PowerShell: $env:STATIC_DIR="../frontend/dist"; go run ./cmd/server
```

| Env var      | Default | Description                                         |
|--------------|---------|-----------------------------------------------------|
| `PORT`       | `8080`  | HTTP port                                           |
| `STATIC_DIR` | unset   | If set, serves this directory for non-API requests  |

## Docker

Make sure Docker Desktop or Docker Engine is running before building.

```sh
docker build -t simple-calculator .
docker run --rm -p 8080:8080 simple-calculator
```

Open <http://localhost:8080>.

## Tests and Coverage

```sh
# backend
cd backend
go test ./... -cover
go test ./... '-coverprofile=coverage'
go tool cover '-html=coverage'

# frontend
cd frontend
npm test
npm run coverage          # text summary + HTML report in frontend/coverage/
```

Current coverage (full [coverage report](docs/COVERAGE.md), including the committed [Go coverage profile](backend/coverage)):

| Package / area              | Coverage              |
|-----------------------------|-----------------------|
| `backend/internal/calc`     | 100% statements       |
| `backend/internal/httpapi`  | 95.6% statements      |
| `frontend/src` (all files)  | 98.46% statements, 97.68% branches, 100% lines |

`cmd/server` contains only wiring and is covered by manual and end-to-end runs rather than unit tests.

## API

Each operation has its own endpoint. All of them take `POST`. Binary operations take `{"a": number, "b": number}`, and unary operations take `{"a": number}`.

| Method | Path               | Operation |
|--------|--------------------|-----------|
| POST   | `/api/v1/add`      | a + b     |
| POST   | `/api/v1/subtract` | a − b     |
| POST   | `/api/v1/multiply` | a × b     |
| POST   | `/api/v1/divide`   | a ÷ b     |
| POST   | `/api/v1/power`    | a ^ b     |
| POST   | `/api/v1/sqrt`     | √a        |
| POST   | `/api/v1/percent`  | a ÷ 100   |
| GET    | `/healthz`         | liveness  |

### Examples

```sh
$ curl -s -X POST localhost:8080/api/v1/add -H 'Content-Type: application/json' -d '{"a": 2, "b": 3}'
{"result":5}

$ curl -s -X POST localhost:8080/api/v1/divide -H 'Content-Type: application/json' -d '{"a": 12.5, "b": 4}'
{"result":3.125}

$ curl -s -X POST localhost:8080/api/v1/sqrt -H 'Content-Type: application/json' -d '{"a": 9}'
{"result":3}

$ curl -s -X POST localhost:8080/api/v1/divide -H 'Content-Type: application/json' -d '{"a": 1, "b": 0}'
{"error":{"code":"DIVISION_BY_ZERO","message":"division by zero is not allowed"}}

$ curl -s -X POST localhost:8080/api/v1/add -H 'Content-Type: application/json' -d '{"a": "1", "b": 2}'
{"error":{"code":"INVALID_JSON","message":"operand \"a\" must be a number"}}
```

### Errors

| Code                  | HTTP | When                                                        |
|-----------------------|------|-------------------------------------------------------------|
| `INVALID_JSON`        | 400  | Malformed or oversized (> 1 KiB) body, wrong types, unknown fields (including `b` on a unary operation), trailing data |
| `MISSING_OPERAND`     | 400  | A required operand is absent or `null`                      |
| `INVALID_NUMBER`      | 400  | Number outside the `float64` range (e.g. `1e400`)           |
| `DIVISION_BY_ZERO`    | 422  | `b == 0` on divide                                          |
| `NEGATIVE_SQRT`       | 422  | `a < 0` on sqrt                                             |
| `UNDEFINED_RESULT`    | 422  | Power without a real result (`0 ^ -1`, `(-8) ^ 0.5`)        |
| `RESULT_OUT_OF_RANGE` | 422  | Result overflows to ±Inf (e.g. `1e308 × 10`)                |
| `NOT_FOUND`           | 404  | Unknown operation or API path                               |
| `METHOD_NOT_ALLOWED`  | 405  | Non-POST request to an operation (sets `Allow: POST`)       |

## Using the Calculator

- **Input:** use the keypad, or the keyboard: `0-9`, `.`, `+`, `-`, `*`, `/`, `^` (power), `@` (square root), `%` (percent), `Enter` or `=`, `Backspace`, and `Escape` to clear. When a keypad button has focus, `Enter` or Space activates that button; `=` always submits the expression.
- **Negative numbers:** `-` on an empty number makes it negative (`12 − -3`). `±` toggles the sign.
- **Square root and percent:** select `√` before or after entering the number, then press `=`: both `√ 100 =` and `100 √ =` show `√(100) = 10`. For percent, enter a number, then `%`, then `=`; `70 % =` shows `70% = 0.7`. Percent is always `a ÷ 100`. Digits, decimal point, and `±` keep editing a pending unary operand. Backspace removes the unary operation first, leaving the operand available for editing.
- **One operation per request:** selecting another operation replaces the pending operation while there is only one operand, without calculating it (`10 % × 200 =` is `10 × 200 = 2000`). Pressing another operator once both numbers are entered shows "Calculate the current operation first". `√` and `%` can't be combined with a binary operation (`200 + 10%` is rejected); use the result instead: `10 % =`, then `× 200 =`.
- **Results:** a result is shown as `12 ÷ 4 = 3`. Typing a digit starts over, and pressing an operation key continues from the result.
- **Errors:** errors appear below the display without clearing it, so the input can be fixed and resent.

## Design Decisions

**Backend**

- **No dependencies.** Go 1.22's `http.ServeMux` method and wildcard patterns (`POST /api/v1/{op}`) cover the routing.
- **Pure domain package.** `calc` exposes one `func(a, b float64) (float64, error)` or `func(a float64) (float64, error)` per operation and knows nothing about HTTP. The handler looks up `{op}` in a registry of handlers built by `binary(...)` and `unary(...)` adapters, so adding an operation means writing one function and adding one map entry.
- **Strict input validation.** Operands are decoded as raw JSON so the API can tell these apart: missing or `null` (`MISSING_OPERAND`), non-numeric (`INVALID_JSON`), and out-of-range numbers (`INVALID_NUMBER`). Unknown fields, trailing data and bodies over 1 KiB are rejected.
- **Domain errors return 422.** The request is well-formed but can't be computed. Non-finite results are rejected, and `-0` is returned as `0`.
- **Single error-mapping point.** All errors go through `toAPIError`, so status codes and error codes are defined in one place.
- **Production details.** The server has timeouts, graceful shutdown on SIGINT/SIGTERM, and a `/healthz` endpoint.

**Frontend**

- **Structured input instead of free text.** The expression is a discriminated union: binary expressions have `left`, `operator`, and `right`; unary expressions have an `operator` and one `operand`. TypeScript narrows the fields by `kind`, so unary and binary operators cannot coexist in the same expression. Since the API takes `a op b` or `op a`, the UI builds that shape directly, so there's no parsing, tokenizing or spacing rule. A unary minus is just a `-` prefix on one value.
- **The frontend never computes.** It only edits operand strings and calls the API. It does round results for display only: at most 12 significant digits, trailing zeros dropped, never `-0`.
- **Full-precision chaining.** The raw API result is stored separately from its display formatting. For example, `1 ÷ 3 = 0.333333333333`, then `× 3` gives `1`. Reusing or editing a result exposes its full-precision decimal operand; formatting never changes the value sent to the API. Small nonzero values remain visible, e.g. `1 ÷ 1000000 = 0.000001`.
- **Pure reducer plus a thin hook.** All input rules live in `calculatorReducer.ts`, which is a pure function and is exhaustively unit tested. `useCalculator` handles the side effects:
  - It sends the request whenever the state enters `loading`, aborts it on cleanup, and enforces a 10-second timeout. A timeout preserves the expression, shows a retry message, and re-enables the keypad. Late responses are ignored.
  - It runs the keyboard listener.
- **Input errors preserve the expression.** Operation replacement is intentional when only one operand is present. These invalid inputs show a message:
  - pressing a binary operator (except unary minus) or `%` before entering a number; `√` can be selected first
  - pressing an operator when the expression already has both numbers
  - pressing `=` on an incomplete expression

  Keys that simply can't apply (a second `.`, a 16th digit) are ignored.
- **No UI library.** It uses CSS modules and CSS Grid. The layout is responsive and has accessible names on every key, `role="status"` on the display, and `role="alert"` on the errors.

**Deployment**

- **One image, one origin.** The Go binary serves the built frontend, so production needs no CORS and no reverse proxy. The runtime image is distroless and runs as non-root.

## Assumptions

- All numbers are IEEE-754 `float64`, so results such as `0.1 + 0.2` carry the usual floating-point error. The UI hides this through display rounding.
- Each request is a single operation. There is no operator precedence and no multi-step expression.
- Percent is plain `a ÷ 100`; calculator-style percent (`200 + 10% = 220`) is not supported. See [docs/SPEC.md §7](docs/SPEC.md).

## AI Usage

This project was built with GitHub Copilot (agent mode) in VS Code. The prompts used are listed below.

<!-- TODO: paste prompts -->
