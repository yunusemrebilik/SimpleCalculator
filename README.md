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

This project was built with GitHub Copilot (agent mode) in VS Code and ChatGPT Codex. The prompts used are listed below.

```
Hi, I've given a take-home test and want to build it together

Details are given below:
--begin--
As a next step, please complete the following within the next 5 business days.

**Objective**
Build a full-stack calculator application with a **React frontend** and a backend microservice. The frontend should consume the backend API to perform basic and advanced arithmetic operations. Focus on clean design, maintainable code, and testable architecture.**Requirements**
**Functional**
**Operations:**

- Addition, Subtraction, Multiplication, Division
- Optional: Exponentiation, Square Root, Percentage
**Frontend (React):**

- Intuitive UI for entering input and displaying results
- Input validation and error handling
- Responsive design (basic mobile support)
**Backend (REST API):**

- Expose endpoints for calculator operations
- Validate input and handle edge cases (division by zero, invalid data)
- Return results in JSON format
**Non-Functional**

- Clean, readable, and idiomatic code (frontend and backend)
- Unit tests covering key functionality for both layers
- Documentation: setup instructions, API usage, and design rationale
- Optional: Dockerfile for full-stack deployment
**Constraints**

- Frontend: React (TypeScript preferred)
- Backend: Go is perferred
**Deliverables**

1. Git repository with frontend and backend code
2. README with setup instructions, API examples, and design decisions
3. Unit tests and coverage report
4. Optional: Dockerfile to run frontend + backend together
**Instructions**

1. Use any AI tooling you would like
2. Spend ~**2–4 hours** on this assignment. Prioritize correctness, clarity, and maintainability over extra features.
3. Push your solution to **GitHub, GitLab, or another Git repository**.
4. Share the repository link with us for evaluation.
5. Share any prompts that you used in your work
6. Make sure your README includes:
- Setup instructions
- How to run the frontend and backend
- Examples of API calls (if using REST)
- Design decisions or assumptions
--end--

My initial idea is to create a react ui with typescript (clean folder and component structure) and a go backend preferably without external deps
We can use float64 as numeric value
As said in the reqs we will handle errors or invalid values
My idea is frontend should not calculate anything, it can check for invalid chars without much "knowledge"
Backend should calculate and return the response
To me this seems like a simple calc without an arbitrary text entry (so we don't need something like shunting-yard or Pratt)
Also as far as I know they expect us to have a multiple endpoints, each operation can have their own endpoints
We'll first start with the mandatory operations and defer the optional ones for now

You should ask me for clarification but you should already know to write idiomatic ts or go, don't ask for them. If I see something suboptimal in your output I can still correct it

Start with a simple specification, for this project we don't need anything huge

I'll review it and tell you what to do next
```

```
I've read the spec and it's very good but I have a few things to say, let me first answer the open questions:

Frontend should round it. 5 digits at most after '.' is enough, if it is 3.50000 we should simply show 3.5
Yes we should allow that
422 (the spec examples are good)
My idea for calculation is simpler
User whether types or clicks buttons to enter an expression and we display it in the text field, it is editable until they send a request (via enter or '=' button)
Then we ignore / block inputs, after backend returns a response we either show the result or error (error should have its own place, it should not override the previous input, we should allow the user to correct their bad input)
If it is a valid result we should show it as {expression} = {result}
If the user enter a number we override the whole result
If the user enters an operation we take the result as the left operand

If anything is still unclear let me know
```

```
We should say "calculate the current operation first" (otherwise it also feels like in correct in terms operator precedence perspective, but once it is already computed, nothing is wrong with that)
```

```
Yes the current spec is good and you can actually implement the app
```

```
I have a take-home task and I kind of completed it (at least the mandatory part)
I want you to test it and tell me whether anything needs a fix, improvement, etc.
Let me share the whole email so you know what they are asking for
As a next step, please complete the following within the next 5 business days.
ObjectiveBuild a full-stack calculator application with a React frontend and a backend microservice. The frontend should consume the backend API to perform basic and advanced arithmetic operations. Focus on clean design, maintainable code, and testable architecture.RequirementsFunctionalOperations:
- Addition, Subtraction, Multiplication, Division
- Optional: Exponentiation, Square Root, Percentage
Frontend (React):
- Intuitive UI for entering input and displaying results
- Input validation and error handling
- Responsive design (basic mobile support)
Backend (REST API):
- Expose endpoints for calculator operations
- Validate input and handle edge cases (division by zero, invalid data)
- Return results in JSON format
Non-Functional
- Clean, readable, and idiomatic code (frontend and backend)
- Unit tests covering key functionality for both layers
- Documentation: setup instructions, API usage, and design rationale
- Optional: Dockerfile for full-stack deployment
Constraints
- Frontend: React (TypeScript preferred)
- Backend: Go is perferred
Deliverables
1. Git repository with frontend and backend code
2. README with setup instructions, API examples, and design decisions
3. Unit tests and coverage report
4. Optional: Dockerfile to run frontend + backend together
Instructions
1. Use any AI tooling you would like
2. Spend ~2–4 hours on this assignment. Prioritize correctness, clarity, and maintainability over extra features.
3. Push your solution to GitHub, GitLab, or another Git repository.
4. Share the repository link with us for evaluation.
5. Share any prompts that you used in your work
6. Make sure your README includes:
   - Setup instructions
   - How to run the frontend and backend
   - Examples of API calls (if using REST)
   - Design decisions or assumptions

Please submit here:  [redacted]
```

```
Apply the approved / agreed fixes and then tell me about the design choice
Also leave an open web page so I can test it myself directly in the browser
```

```
Could you tell me how you would implement phase II? Percentage can be (200 + 10% = 220).
I think it's better to support sqrt and % directly instead of gluing the current arch but I'd like to know what you think
```

```
What if we keep things simple and treat 70% as 0.7 and not more?
It also becomes a unary op right?
I'm curious what is your plan to handle unary ops?
```

```
I personally do not like this type of implicit calculations because I may want to type sqrt(100) but in your proposal it would run instantly and did not wait for me to enter the whole number
I'm still in favor of explicit calculations with equals or enter key
Also I feel like we can simply do not allow chaining percent or sqrt with other operations
You can calculate the percentage and then pressing an operand already uses the existing result
So example:
10% = 0.1 * 200 = 20 (0.1 became left operand, it must have already been implemented)
What do you think?
Once we agree I'll let you update the spec and implement
```

```
Yes '=' and Enter send the request, no unintended request sending
Yep we will ship power too, since it is almost identical to earlier operations I did not concentrate on it that much. It is just an extension (you should add the error though)
Yep a new row with shortcuts are approved
Update the spec and start implementing
```

```
I've used Claude to implement the feature
I want you to review the working tree thoroughly and tell me whether it is working as expected, needs a fix/improvement, has a bug, etc.
```

```
Commit the current state first and then apply the approved fixes
Test the app the let me know when you are done
```

```
I want you to lighten the background of the operator buttons a bit to match a roughly 4:1 contrast
Right now they are unnecessarily dark, they look like tangerine rather than orange
Also change the first row (sqrt, pow, %) with AC - Backspace - Unary Toggle
I feel like they would make the calculator more coherent
```

```
I feel like orange buttons are lightened less compared to other buttons on hover
Is this true? If it is I want you to match them to the rest, if it is not skip it
Then commit the current state, meanwhile I'll collect the prompts I've used
Also make sure everything is ready to send (e.g., builds and docker files etc.,) apart from prompts
```