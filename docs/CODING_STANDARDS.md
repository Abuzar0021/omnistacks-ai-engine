# Coding standards

House rules for all TypeScript in this repo. Tooling enforces what it can
(`tsconfig.base.json`, Prettier, CI); this document covers the rest. When in doubt, match
the surrounding code.

## TypeScript conventions

- **Strictness is non-negotiable.** All apps extend `tsconfig.base.json` (`strict`,
  `noUncheckedIndexedAccess`, `verbatimModuleSyntax`, `isolatedModules`, ...). Never
  weaken these per-app.
- **No `any`.** Use `unknown` at trust boundaries (HTTP bodies, JSON columns, LLM output)
  and narrow with Zod. `as` casts need a comment explaining why they're safe.
- **ESM everywhere.** All packages are `"type": "module"`. In Node apps (`api`, `worker`)
  relative imports carry the `.js` extension (`import { env } from './config/env.js'`);
  the web app uses bundler resolution (no extension).
- **`import type`** for type-only imports — enforced by `verbatimModuleSyntax`.
- **Explicit return types** on exported functions; inference is fine for internals.
- **Nullability:** prefer `?? default` at the edge over sprinkling null checks through
  business code.
- **Enums:** use Prisma-generated enums for DB values; for app-internal unions prefer
  string literal unions over TS `enum`.
- Derive types from Zod schemas (`z.infer<typeof schema>`) instead of writing parallel
  interfaces.

## File naming

| Kind                               | Convention                    | Example                                |
| ---------------------------------- | ----------------------------- | -------------------------------------- |
| Modules (Node + web non-component) | kebab-case `.ts`              | `error-handler.ts`                     |
| React components                   | PascalCase `.tsx`             | `App.tsx`, `LeadTable.tsx`             |
| React hooks                        | camelCase, `use` prefix       | `useLeads.ts`                          |
| Route files                        | resource name                 | `health.ts`, `campaigns.ts`            |
| Feature module files               | `<feature>.<role>.ts`         | `leads.service.ts`, `leads.schemas.ts` |
| Tests                              | mirror source + `.test.ts(x)` | `leads.service.test.ts`                |
| Shell scripts                      | kebab-case `.sh`, executable  | `db-migrate.sh`                        |

## Folder organization

- **`apps/api/src/`**
  - `config/` — env parsing only; the _only_ place `process.env` is read.
  - `lib/` — shared clients (Prisma, OpenRouter). No business rules.
  - `middleware/` — cross-cutting Express middleware.
  - `routes/` — thin route composition; no logic beyond wiring.
  - `modules/<feature>/` — business logic: `*.routes.ts` (HTTP), `*.service.ts` (domain,
    no Express types), `*.schemas.ts` (Zod). Services are testable without HTTP.
- **`apps/worker/src/`**
  - `jobs/<type>.ts` — one handler per `JobType`, exporting a single `handle(job)` entry.
  - `browser.ts` — all Playwright launches go through here.
- **`apps/web/src/`**
  - `api/` — the only module allowed to call `fetch`.
  - `pages/` — routed screens; `components/` — shared presentational UI.
- Dependency direction: `routes → services → lib`. Services never import routes/Express;
  `lib/` never imports `modules/`.
- New shared code used by ≥2 apps prompts a `packages/shared` workspace — don't
  copy-paste across apps.

## Logging

- Prefix every line with the service: `[api]`, `[worker]`, `[entrypoint]` (current
  scaffold convention). M8 replaces raw `console` with pino structured JSON — keep call
  sites shaped like `log("<event>", context)` so the swap is mechanical.
- Log **events, not prose**: started/finished/failed with identifiers (jobId, leadId,
  requestId). No logging inside tight loops.
- **Never log secrets** — no tokens, passwords, API keys, or full LLM prompts containing
  personal data. Prisma query logging stays dev-only (see `lib/prisma.ts`).
- Errors are logged once, where they're handled — not at every layer they pass through.

## Error handling

- **API:** throw, don't return error objects. The central `error-handler.ts` middleware is
  the single place errors become HTTP responses (envelope per [API.md](API.md)). Expected
  failures use typed error classes (e.g. `NotFoundError`) that the handler maps to status
  codes.
- **Worker:** a job handler failure marks the job `FAILED` with `error` populated and is
  subject to retry policy (M3). Handlers must be idempotent — a retried job must not
  duplicate side effects.
- **No swallowed errors.** Empty `catch` blocks are forbidden; `catch` must rethrow, log +
  degrade explicitly, or translate to a typed error.
- **Trust boundaries validate:** HTTP input, LLM output, webhook payloads, and JSON
  columns are `unknown` until parsed with Zod.
- Graceful shutdown on SIGINT/SIGTERM everywhere (already scaffolded): stop intake, finish
  in-flight work, disconnect Prisma, exit within 10s.

## Testing requirements

Test infra lands with the first business logic (M1); these are the standing rules:

- **Framework:** Vitest for unit/integration; Supertest against the Express app;
  Playwright only for web e2e smoke tests.
- **What must be tested:**
  - Every service function: happy path + failure paths.
  - Every endpoint: success, validation failure, authz failure (integration).
  - Every job handler: success, failure/retry, idempotency.
  - Zod schemas with representative invalid inputs.
- **Isolation:** no live network in tests. OpenRouter is mocked; scraping runs against
  local fixture pages; DB integration tests use a dedicated schema/database per run.
- **Placement:** co-located `*.test.ts` next to the source file.
- **CI:** `npm test` joins the quality job the moment the first test exists; a red suite
  blocks merge. Coverage is tracked but not gated initially — repeatedly-buggy areas get
  gates first.

## Git & PR hygiene

- Small, focused PRs; imperative-mood commit subjects ("Add lead scoring handler").
- CI (format check, typecheck, build, tests) must be green before review.
- Schema changes ship with their migration and a [DATABASE.md](DATABASE.md) update.
- Prompt changes ship with a [PROMPTS.md](PROMPTS.md) update — see that doc's versioning
  rules.
