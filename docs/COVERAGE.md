# Test Coverage

Generated on 9 October 2026 with Go 1.27.0 and Node.js 26.4.0 on Windows.

The Go suite passed. The frontend suite passed all **187 tests in 7 files**, including rejection of positive and negative overflowing API results. The production frontend build and `go vet ./...` also passed.

| Layer / package | Statements | Branches | Functions | Lines |
|---|---|---|---|---|
| Go `internal/calc` | 100% | — | — | — |
| Go `internal/httpapi` | 95.6% | — | — | — |
| Go `cmd/server` | 0% | — | — | — |
| Go overall | 75.4% | — | — | — |
| Frontend `src` | 98.46% (192/195) | 97.68% (169/173) | 100% (45/45) | 100% (157/157) |

The Go entry point contains configuration, static-file wiring, and server lifecycle handling. Its statements are included in the overall figure but are not covered by unit tests. All seven arithmetic operations, including power, square root, and percent, have 100% statement coverage.

Frontend coverage excludes the application bootstrap (`src/main.tsx`), test setup, and test files. It includes the API client, reducer, hook, formatting, keyboard handling, and components.

The committed [Go coverage profile](../backend/coverage) corresponds to the current source. To regenerate it and inspect its per-function or HTML report:

```sh
cd backend
go test ./... -count=1 '-coverprofile=coverage'
go tool cover '-func=coverage'
go tool cover '-html=coverage'
```

The quoted flags work in both POSIX shells and PowerShell. To regenerate the frontend report:

```sh
cd frontend
npm ci
npm run coverage
```

Vitest prints a summary and writes an HTML report to `frontend/coverage/index.html`. Generated frontend HTML files are ignored by Git; the current summary is recorded above. Regenerate both reports and update this summary after changing code or tests.

The full Docker image also built and ran successfully with Docker Engine 29.7.2 on Linux. The runtime used non-root UID 65532. Live checks passed for the health endpoint, both frontend assets, all seven operations, six validation/domain error cases, and full-precision result chaining. A browser calculation against the container produced `7 + 8 = 15` without console warnings or errors.
