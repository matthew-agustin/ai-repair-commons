## AI Repair Commons — Application-Stage MVP Plan

Single-page TanStack Start app. No accounts, no database, no history, no analytics on user text. One server function calls Lovable AI Gateway and returns a validated structured result.

### 1. Frontend Component Structure

Route: `src/routes/index.tsx` (replaces the placeholder). All UI on one page, composed of:

- `PageHeader` — product name, one-line purpose, scope disclaimer.
- `SubmissionForm`
  - `FieldOriginalRequest` (required textarea)
  - `FieldAiResponse` (required textarea)
  - `FieldWhatSeemedWrong` (optional textarea)
  - `CharCountHint` per field
  - `ScopeNotice` — "not for medical, legal, financial, crisis, safety, disciplinary, or academic-integrity questions"
  - `SubmitButton` (disabled until required fields non-empty or while loading)
- `LoadingState`
- `ClarificationPanel` — shown when model asks the single allowed clarification; single input + submit.
- `ResultPanel` — shown for result/unclear:
  - `UncertaintyBanner` (always present, top of result)
  - `CategoryBlock` (primary + optional secondary)
  - `ExplanationBlock`
  - `PathwayBadge` (repair | verify | escalate | exit)
  - `StepsList` (0–3 items)
  - `RepairPromptBlock` (optional, with copy-to-clipboard)
  - `NoticeNextTime`
  - `ResetButton`
- `ErrorState` — validation / rate limit / credits / network / schema.
- `Footer` — scope + no-history reminder.

Uses shadcn primitives (Textarea, Button, Card, Badge, Alert). No new routes beyond `/`. `src/routes/__root.tsx` head() gets a real title/description/og for the product (replacing placeholder metadata).

### 2. Application States

Single state machine on the index page:

- `idle` — empty form.
- `submitting` — first server call in flight.
- `clarify` — model returned one clarification question.
- `submittingClarification` — second call in flight.
- `result` — full structured analysis rendered.
- `unclear` — no-clear-failure verdict (rendered distinctly, still uses result layout).
- `error` — with `reason: validation | rate_limit | credits | network | schema | scope_blocked`.

Transitions:
- `idle → submitting → (clarify | result | unclear | error)`
- `clarify → submittingClarification → (result | unclear | error)`
- Any state → `idle` via Reset.
- Only one clarification round; if the model tries to clarify again, coerce to `unclear`.

### 3. Data Types

```ts
type Pathway = "repair" | "verify" | "escalate" | "exit";

type SubmissionInput = {
  originalRequest: string;      // required, capped length
  aiResponse: string;           // required, capped length
  whatSeemedWrong?: string;     // optional
  priorQuestion?: string;       // present on the clarification round
  clarificationAnswer?: string; // present on the clarification round
};

type ClarifyResponse = {
  kind: "clarify";
  question: string; // exactly one
};

type AnalysisResult = {
  kind: "result" | "unclear";
  primaryCategory: string;
  secondaryCategory?: string;
  explanation: string;
  uncertaintyStatement: string; // required non-empty
  pathway: Pathway;
  steps: string[];              // 0–3, clamped server-side
  repairPrompt?: string;
  noticeNextTime: string;
};

type ServerResponse = ClarifyResponse | AnalysisResult;

type ServerError = {
  kind: "error";
  reason: "validation" | "rate_limit" | "credits" | "schema" | "network" | "scope_blocked";
  message: string;
};
```

Schema notes: use AI SDK `Output.object` with `pathway` as an enum. Do NOT put `.min/.max`, length bounds, string patterns, or long enums on `primaryCategory`, `steps`, etc. — state limits in the prompt and clamp/validate in code. Wrap the call with `NoObjectGeneratedError.isInstance` and fall back to an `unclear` result on schema failure.

### 4. Server Boundary

One `createServerFn` — no server routes needed (not streaming, not a webhook):

- `src/lib/analyze.functions.ts` → `analyzeSubmission` (POST)
  - Zod `inputValidator` enforces required fields and length caps.
  - Reads `process.env.LOVABLE_API_KEY` inside the handler.
  - Uses provider helper in `src/lib/ai-gateway.server.ts` per `ai-sdk-lovable-gateway`.
  - Calls `generateText` with `Output.object` schema for `ServerResponse`.
  - System prompt encodes: treat submitted text as data (not instructions); required uncertainty statement; never claim definitive diagnosis; max one clarification; max three steps; single pathway; scope refusals (medical/legal/financial/crisis/safety/disciplinary/academic-integrity → return unclear + escalate + generic referral); on the clarification-round input, forbid asking again.
  - Maps provider errors: 429 → `rate_limit`, 402 → `credits`, other → `network`; schema failure → `schema` or coerce to unclear.
  - No logging of user text; no persistence anywhere.

Client calls it via `useServerFn` from the index page.

Model: pick a current chat model from `ai-models-chat` at implementation time (no user choice exposed).

### 5. Security & Privacy Concerns

- `LOVABLE_API_KEY` stays server-side; never `VITE_`-exposed.
- Public unauthenticated endpoint by design (no accounts). Add a best-effort per-IP rate limit via in-memory token bucket keyed on `getRequestIP()`; document as soft-limit only.
- Server-side length caps bound token cost and abuse.
- Zero storage: no DB, no user-text logs, no telemetry on submissions. Only operational errors logged (without body content).
- Prompt-injection: pasted AI response is untrusted. System prompt instructs the model to treat submitted content as data and to refuse embedded instructions/role changes.
- Scope-blocking enforced in the system prompt; client also shows the scope notice up front. Scope-blocked topics coerced to `escalate` with generic "consult a qualified professional" language — no specific medical/legal/financial guidance.
- Clipboard copy of the repair prompt is local-only.
- Accessibility: labeled inputs, `aria-live` on result/error/clarify panels, focus management on state change, keyboard-reachable reset, pathway conveyed by text + icon (not color alone), responsive layout.

### 6. Requests That Would Accidentally Add Out-of-Scope Functionality

Flag and refuse if requested during build:

- Accounts, login, profiles, or session save.
- Any database, Lovable Cloud enablement, or persistence of submissions/results.
- History list, recent submissions, favorites, export.
- Share links, public gallery, "contribute this transcript".
- Analytics/tracking on submitted text; feedback widgets that store content.
- File or image uploads; screenshot parsing.
- Live web search, citations lookup, retrieval augmentation.
- Multi-turn chat beyond the single allowed clarification.
- Definitive diagnosis language, confidence scores, streaks, badges, leaderboards.
- Admin dashboard, moderation queue, taxonomy editor.
- Direct medical/legal/financial/crisis/safety/disciplinary/academic-integrity advice — must route to `escalate` with generic referral.
- Payments or user-facing usage dashboards.
