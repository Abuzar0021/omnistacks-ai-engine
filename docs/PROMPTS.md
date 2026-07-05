# Prompts

Registry of every AI prompt the system uses. **This file is the source of truth**: prompts
are designed and reviewed here first, then implemented as constants in
`apps/api/src/modules/` (`business-audit-v1` in M3, `email-personalization-v1` in M4) that
must match this document. A prompt change is a PR that updates both.

## Conventions

- All LLM calls go through the shared OpenRouter client
  (`apps/api/src/lib/openrouter.ts`); default model comes from `OPENROUTER_MODEL`
  (currently `anthropic/claude-sonnet-4.5`), overridable per call.
- Every prompt has: an **ID** (kebab-case, stable), a **purpose**, a **template** with
  `{{placeholders}}`, and a **JSON response schema**.
- Prompts that produce structured data must instruct the model to return **only JSON**,
  and the response is validated with a Zod schema mirroring the JSON schema here. Invalid
  output → one retry with the validation error appended → job failure (never store
  unvalidated output).
- Temperature: `0` for extraction/scoring (deterministic), up to `0.7` for copywriting.
- **Versioning:** breaking prompt changes bump a `-v2` suffix on the ID and note the date,
  so stored `enrichment` payloads remain traceable to the prompt version that produced
  them (`_prompt` field in stored output).
- **Privacy:** prompts receive only the lead fields listed as inputs — never other users'
  data, credentials, or internal IDs beyond what's specified.

---

## `lead-enrichment-v1` and `lead-scoring-v1` — superseded

These were designed when data collection was expected to be an LLM step. M2 (website
analyzer) replaced that with deterministic Playwright extraction — no model call needed
to turn a scraped page into structured data, and it's cheaper and more reliable that way.
`business-audit-v1` below is their replacement: one call that both audits and scores,
operating on M2's actual output.

---

## `business-audit-v1`

**Purpose:** given a business and the structured data M2 already collected about its
website, produce an evidence-based audit (findings: what's working, what isn't, what
opportunity exists) plus a 0–100 fit score against the operator's own business/ICP
description. Used by the `BusinessAudit` service (M3); runs after a `WebsiteAnalysis`
reaches `COMPLETED` (`ANALYZED → AUDITED`).

**Model / params:** default model, temperature `0`, max_tokens `1024`.

**Inputs:**

- `businessContext` — free text from the `BUSINESS_CONTEXT` env var: who the operator is,
  what they offer, and what an ideal customer looks like. Single global value (one
  operator, no per-campaign ICP yet — see [ROADMAP.md](ROADMAP.md) M3 note).
- `business` — `name`, `industry`, `country`, `city` (whatever is set on the `Business`).
- `analysis` — a trimmed subset of the `WebsiteAnalysis` record: `title`,
  `metaDescription`, top-level headings (h1/h2), `technologies`, counts of
  internal/external links, whether `contactForms`/`emails`/`phones`/`socialLinks` are
  present. Deliberately not the full raw payload (keeps the prompt small and avoids
  paying to re-send data the model doesn't need).

**Template (system):**

```text
You are a B2B opportunity auditor. Given a description of our business and our ideal
customers, and structured data collected from a prospect's website, assess how well they
fit and what opportunity exists to help them. Every finding must cite something present in
the provided data — do not invent facts.

Respond with a single JSON object matching exactly this schema — no prose, no markdown
fences, no extra keys, no renamed keys:
{
  "summary": string (max 500 chars),
  "findings": [{ "category": "seo" | "performance" | "design" | "content" | "technology" | "contact" | "trust" | "other", "severity": "low" | "medium" | "high", "description": string (max 300 chars) }],
  "score": integer 0-100,
  "confidence": "low" | "medium" | "high",
  "reasons": string[] (1 to 5 items, each max 200 chars),
  "disqualifiers": string[] (optional, each max 200 chars) — hard blockers if any (wrong geography, competitor, already a client, ...)
}
```

The response schema is embedded directly in this system prompt (not left implicit) —
earlier revisions said only "matching the schema" without stating it, which left the model
guessing at field names (observed in production: it invented `fitScore`, `opportunities`,
etc. instead of the fields below).

**Template (user):**

```text
About us and our ideal customers:
{{businessContext}}

Prospect:
{{business}}

Website data collected:
{{analysis}}
```

**JSON response schema:**

```json
{
  "type": "object",
  "required": ["summary", "findings", "score", "confidence", "reasons"],
  "additionalProperties": false,
  "properties": {
    "summary": { "type": "string", "maxLength": 500 },
    "findings": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["category", "severity", "description"],
        "properties": {
          "category": {
            "type": "string",
            "enum": [
              "seo",
              "performance",
              "design",
              "content",
              "technology",
              "contact",
              "trust",
              "other"
            ]
          },
          "severity": { "type": "string", "enum": ["low", "medium", "high"] },
          "description": { "type": "string", "maxLength": 300 }
        }
      }
    },
    "score": { "type": "integer", "minimum": 0, "maximum": 100 },
    "confidence": { "type": "string", "enum": ["low", "medium", "high"] },
    "reasons": {
      "type": "array",
      "minItems": 1,
      "maxItems": 5,
      "items": { "type": "string", "maxLength": 200 }
    },
    "disqualifiers": {
      "type": "array",
      "items": { "type": "string", "maxLength": 200 },
      "description": "Hard blockers if any (wrong geography, competitor, already a client, ...)"
    }
  }
}
```

Stored on `BusinessAudit`: `summary`, `findings`, `score`, `confidence`, `reasons`,
`disqualifiers` map directly to columns/JSON fields of the same name (see
[DATABASE.md](DATABASE.md#business_audits)). On completion, `score` is also denormalized
onto `Business.score` (for list-view sorting) and `Business.status` advances
`ANALYZED → AUDITED`.

---

## `email-personalization-v1`

**Purpose:** given a business and its completed audit, generate a personalized opener and
subject line for an outreach email. Used by the `EmailDraft` service (M4); runs after a
`BusinessAudit` reaches `COMPLETED` (`AUDITED → EMAIL_DRAFTED`). Only the opener is
model-generated — the rest of the email body comes from the operator's own
`OUTREACH_EMAIL_TEMPLATE` env var (a static template with an `{{opener}}` placeholder),
assembled in code, never by the model. This keeps the LLM's job narrow (one fact, one
sentence) and the rest of the email consistent and reviewable.

**Model / params:** default model, temperature `0.7`, max_tokens `512`.

**Inputs:**

- `businessContext` — the same `BUSINESS_CONTEXT` env var `business-audit-v1` uses.
- `business` — `name`, `industry`, `country`, `city` (same shape as `business-audit-v1`).
- `audit` — a trimmed subset of the business's latest completed `BusinessAudit`:
  `summary`, `score`, `reasons`. Deliberately not the full `findings`/`disqualifiers` — a
  one-line opener doesn't need them.
- `tone` — fixed `"professional"` for now (no per-campaign tone yet, consistent with the
  single global `BUSINESS_CONTEXT` — see [ROADMAP.md](ROADMAP.md) M3 note).

**Template (system):**

```text
You write concise, specific B2B outreach openers. Use one concrete fact about the
prospect or their website from the provided audit — never generic flattery. No emojis, no
exclamation marks, under 40 words for the opener.

Respond with a single JSON object matching exactly this schema — no prose, no markdown
fences, no extra keys, no renamed keys:
{
  "subject": string (max 80 chars),
  "opener": string (max 300 chars),
  "factUsed": string (optional, max 200 chars) — the concrete fact referenced, for QA/review
}
```

**Template (user):**

```text
About us and our ideal customers:
{{businessContext}}

Prospect:
{{business}}

Our audit of their site:
{{audit}}

Tone: {{tone}}
```

**JSON response schema:**

```json
{
  "type": "object",
  "required": ["subject", "opener"],
  "additionalProperties": false,
  "properties": {
    "subject": { "type": "string", "maxLength": 80 },
    "opener": { "type": "string", "maxLength": 300 },
    "factUsed": {
      "type": "string",
      "maxLength": 200,
      "description": "The concrete fact referenced, for QA/review"
    }
  }
}
```

Stored on `EmailDraft`: `subject`, `opener`, `factUsed` map directly to columns of the
same name (see [DATABASE.md](DATABASE.md#email_drafts)). `body` is **not** part of the
model's response — it's assembled by substituting `{{opener}}` and `{{senderName}}`
(from `OUTREACH_SENDER_NAME`) into `OUTREACH_EMAIL_TEMPLATE` before being stored, so the
persisted `body` is always the exact text a "Send" action will hand to n8n (see
[N8N.md](N8N.md)). On completion, `Business.status` advances `AUDITED → EMAIL_DRAFTED`.

---

## `scrape-query-expansion-v1`

> Belongs to the scaffold-era `Campaign`/`Lead`/`scrape_jobs` scraping flow, which is
> superseded by `Business` as the operative entity (see [DATABASE.md](DATABASE.md) and
> [ROADMAP.md](ROADMAP.md)). Undecided — repurpose or remove — pending the M7 campaign
> redesign; not implemented by M3 or M4, both of which operate on `Business` directly.

**Purpose:** expand a campaign's ICP description into concrete search queries/target lists
for the `SCRAPE` job planner. Keeps scraping targeted instead of crawling broadly.

**Model / params:** default model, temperature `0.3`, max_tokens `512`.

**Inputs:** `icpDescription`, `maxQueries` (int).

**Template (system):**

```text
You turn an ideal customer profile into specific web search queries for finding matching
companies and people. Queries must be directly usable in a search engine. Respond with a
single JSON object matching the schema — no prose.
```

**Template (user):**

```text
Ideal customer profile:
{{icpDescription}}

Generate at most {{maxQueries}} queries.
```

**JSON response schema:**

```json
{
  "type": "object",
  "required": ["queries"],
  "additionalProperties": false,
  "properties": {
    "queries": {
      "type": "array",
      "minItems": 1,
      "items": {
        "type": "object",
        "required": ["query", "intent"],
        "properties": {
          "query": { "type": "string", "maxLength": 200 },
          "intent": { "type": "string", "enum": ["find-companies", "find-people", "find-signals"] }
        }
      }
    }
  }
}
```

---

## Adding a new prompt

1. Add its section here (ID, purpose, model/params, inputs, template, JSON schema) in a
   PR — get it reviewed before implementation.
2. Implement the Zod mirror of the schema next to the consuming job/module.
3. Store the prompt ID in any persisted output (`"_prompt": "lead-enrichment-v1"`).
4. Add tests with mocked model responses: one valid, one schema-violating.
