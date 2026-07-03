# Prompts

Registry of every AI prompt the system uses. **This file is the source of truth**: prompts
are designed and reviewed here first, then implemented (M5) as constants in
`apps/api/src/modules/` / `apps/worker/src/jobs/` that must match this document. A prompt
change is a PR that updates both.

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

## `lead-enrichment-v1`

**Purpose:** turn raw scraped lead data plus page context into a structured company/person
profile, stored in `leads.enrichment` (status → `ENRICHED`). Used by the worker's `ENRICH`
job.

**Model / params:** default model, temperature `0`, max_tokens `1024`.

**Inputs:** `fullName`, `title`, `company`, `website`, `linkedinUrl`, `pageText` (truncated
scraped text, ≤ 8k chars).

**Template (system):**

```text
You are a B2B lead research assistant. Using ONLY the information provided, produce a
structured profile of the lead and their company. Do not invent facts; use null when the
information is not present. Respond with a single JSON object matching the schema — no
prose, no markdown fences.
```

**Template (user):**

```text
Lead:
- Name: {{fullName}}
- Title: {{title}}
- Company: {{company}}
- Website: {{website}}
- LinkedIn: {{linkedinUrl}}

Scraped page content:
"""
{{pageText}}
"""
```

**JSON response schema:**

```json
{
  "type": "object",
  "required": ["company", "person", "signals"],
  "additionalProperties": false,
  "properties": {
    "company": {
      "type": "object",
      "required": ["industry", "size", "summary"],
      "properties": {
        "industry": { "type": ["string", "null"] },
        "size": {
          "type": ["string", "null"],
          "enum": ["1-10", "11-50", "51-200", "201-1000", "1000+", null]
        },
        "summary": { "type": ["string", "null"], "maxLength": 500 },
        "location": { "type": ["string", "null"] },
        "techStack": { "type": "array", "items": { "type": "string" } }
      }
    },
    "person": {
      "type": "object",
      "required": ["seniority", "department"],
      "properties": {
        "seniority": {
          "type": ["string", "null"],
          "enum": ["c-level", "vp", "director", "manager", "ic", null]
        },
        "department": { "type": ["string", "null"] }
      }
    },
    "signals": {
      "type": "array",
      "items": { "type": "string", "maxLength": 200 },
      "description": "Buying signals found in the source material (hiring, funding, tooling mentions...)"
    }
  }
}
```

---

## `lead-scoring-v1`

**Purpose:** score a lead 0–100 against the campaign's ideal customer profile (ICP);
writes `leads.score` and drives `QUALIFIED`/`DISQUALIFIED` (threshold configured per
campaign). Used by the worker's `SCORE` job. Runs after enrichment.

**Model / params:** default model, temperature `0`, max_tokens `512`.

**Inputs:** `icpDescription` (from campaign settings), `leadProfile` (the
`lead-enrichment-v1` output JSON), `leadFields` (name/title/company).

**Template (system):**

```text
You are a lead qualification engine. Score how well the lead matches the ideal customer
profile from 0 (no fit) to 100 (perfect fit). Be conservative: missing information lowers
confidence, not the score dimensions themselves. Respond with a single JSON object
matching the schema — no prose.
```

**Template (user):**

```text
Ideal customer profile:
{{icpDescription}}

Lead:
{{leadFields}}

Enriched profile:
{{leadProfile}}
```

**JSON response schema:**

```json
{
  "type": "object",
  "required": ["score", "confidence", "reasons"],
  "additionalProperties": false,
  "properties": {
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
      "description": "Hard blockers if any (wrong geography, competitor, etc.)"
    }
  }
}
```

---

## `email-personalization-v1`

**Purpose:** generate a personalized first-line/hook and subject for outreach, consumed by
the n8n outreach workflow (M6). The template body of the email is owned by the campaign;
the LLM only personalizes.

**Model / params:** default model, temperature `0.7`, max_tokens `512`.

**Inputs:** `leadFields`, `leadProfile` (enrichment output), `campaignPitch` (one-sentence
value prop from campaign settings), `tone` (`"professional"` | `"casual"`).

**Template (system):**

```text
You write concise, specific B2B outreach openers. Use one concrete fact about the lead or
their company from the provided profile — never generic flattery. No emojis, no
exclamation marks, under 40 words for the opener. Respond with a single JSON object
matching the schema — no prose.
```

**Template (user):**

```text
Lead:
{{leadFields}}

Profile:
{{leadProfile}}

Our pitch: {{campaignPitch}}
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

---

## `scrape-query-expansion-v1`

**Purpose:** expand a campaign's ICP description into concrete search queries/target lists
for the `SCRAPE` job planner (M4). Keeps scraping targeted instead of crawling broadly.

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
