// Shared analysis-result contract and local validator.
// No network, no persistence — pure types + validation.

export const CATEGORIES = [
  "grounding",
  "reasoning",
  "framing",
  "boundary",
  "unclear",
  "no_clear_failure",
] as const;

export const ROUTES = ["repair", "verify", "escalate", "exit"] as const;

export const CONFIDENCE_LEVELS = ["low", "moderate", "high"] as const;

export type Category = (typeof CATEGORIES)[number];
export type Route = (typeof ROUTES)[number];
export type Confidence = (typeof CONFIDENCE_LEVELS)[number];

export type AnalysisResult = {
  needs_clarification: boolean;
  clarifying_question: string | null;
  primary_category: Category;
  secondary_category: Category | null;
  assessment: string;
  confidence: Confidence;
  uncertainty: string;
  primary_route: Route | null;
  secondary_route: Route | null;
  steps: string[];
  repair_prompt: string | null;
  transfer_signal: string | null;
  scope_warning: string | null;
};

export type ValidationOk = { ok: true; value: AnalysisResult };
export type ValidationErr = { ok: false; errors: string[] };
export type ValidationOutcome = ValidationOk | ValidationErr;

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function isStringOrNull(v: unknown): v is string | null {
  return v === null || typeof v === "string";
}

/**
 * Validate an unknown value against the AnalysisResult contract.
 * Returns { ok: true, value } if valid, otherwise { ok: false, errors }.
 * Errors are for developer logging only; do not surface to end users.
 */
export function validateAnalysisResult(input: unknown): ValidationOutcome {
  const errors: string[] = [];
  const push = (m: string) => errors.push(m);

  if (input === null || typeof input !== "object") {
    return { ok: false, errors: ["Result is not an object."] };
  }
  const r = input as Record<string, unknown>;

  // Presence + shape of every field.
  if (typeof r.needs_clarification !== "boolean")
    push("needs_clarification must be a boolean.");
  if (!isStringOrNull(r.clarifying_question))
    push("clarifying_question must be a string or null.");
  if (typeof r.primary_category !== "string")
    push("primary_category must be a string.");
  if (r.secondary_category !== null && typeof r.secondary_category !== "string")
    push("secondary_category must be a string or null.");
  if (typeof r.assessment !== "string") push("assessment must be a string.");
  if (typeof r.confidence !== "string") push("confidence must be a string.");
  if (typeof r.uncertainty !== "string") push("uncertainty must be a string.");
  if (r.primary_route !== null && typeof r.primary_route !== "string")
    push("primary_route must be a string or null.");
  if (r.secondary_route !== null && typeof r.secondary_route !== "string")
    push("secondary_route must be a string or null.");
  if (!Array.isArray(r.steps)) push("steps must be an array.");
  else if (!r.steps.every((s) => typeof s === "string"))
    push("steps must be an array of strings.");
  if (!isStringOrNull(r.repair_prompt))
    push("repair_prompt must be a string or null.");
  if (!isStringOrNull(r.transfer_signal))
    push("transfer_signal must be a string or null.");
  if (!isStringOrNull(r.scope_warning))
    push("scope_warning must be a string or null.");

  if (errors.length > 0) return { ok: false, errors };

  // Enum membership.
  const primary_category = r.primary_category as string;
  const secondary_category = r.secondary_category as string | null;
  const primary_route = r.primary_route as string | null;
  const secondary_route = r.secondary_route as string | null;
  const confidence = r.confidence as string;

  if (!(CATEGORIES as readonly string[]).includes(primary_category))
    push(`primary_category "${primary_category}" is not allowed.`);
  if (
    secondary_category !== null &&
    !(CATEGORIES as readonly string[]).includes(secondary_category)
  )
    push(`secondary_category "${secondary_category}" is not allowed.`);
  if (
    primary_route !== null &&
    !(ROUTES as readonly string[]).includes(primary_route)
  )
    push(`primary_route "${primary_route}" is not allowed.`);
  if (
    secondary_route !== null &&
    !(ROUTES as readonly string[]).includes(secondary_route)
  )
    push(`secondary_route "${secondary_route}" is not allowed.`);
  if (!(CONFIDENCE_LEVELS as readonly string[]).includes(confidence))
    push(`confidence "${confidence}" is not allowed.`);

  if (errors.length > 0) return { ok: false, errors };

  const needs_clarification = r.needs_clarification as boolean;
  const clarifying_question = r.clarifying_question as string | null;
  const assessment = r.assessment as string;
  const uncertainty = r.uncertainty as string;
  const steps = r.steps as string[];
  const repair_prompt = r.repair_prompt as string | null;
  const transfer_signal = r.transfer_signal as string | null;
  const scope_warning = r.scope_warning as string | null;

  // Step count cap (general).
  if (steps.length > 3) push("steps must contain no more than 3 items.");

  // Clarification state.
  if (needs_clarification) {
    if (primary_category !== "unclear")
      push("clarification requires primary_category to be 'unclear'.");
    if (!isNonEmptyString(clarifying_question))
      push("clarification requires a non-empty clarifying_question.");
    if (primary_route !== null)
      push("clarification requires primary_route to be null.");
    if (secondary_route !== null)
      push("clarification requires secondary_route to be null.");
    if (secondary_category !== null)
      push("clarification requires secondary_category to be null.");
    if (transfer_signal !== null)
      push("clarification requires transfer_signal to be null.");
    if (steps.length !== 0) push("clarification requires empty steps.");
    if (repair_prompt !== null)
      push("clarification requires repair_prompt to be null.");
  } else {
    if (clarifying_question !== null)
      push("clarifying_question must be null when not requesting clarification.");
    if (primary_category === "unclear")
      push("primary_category 'unclear' requires needs_clarification to be true.");
  }

  // No-clear-failure state.
  if (primary_category === "no_clear_failure") {
    if (needs_clarification)
      push("no_clear_failure cannot request clarification.");
    if (primary_route !== null)
      push("no_clear_failure requires primary_route to be null.");
    if (secondary_route !== null)
      push("no_clear_failure requires secondary_route to be null.");
    if (steps.length > 1)
      push("no_clear_failure allows at most 1 step.");
    if (repair_prompt !== null)
      push("no_clear_failure requires repair_prompt to be null.");
    if (secondary_category !== null)
      push("no_clear_failure requires secondary_category to be null.");
  }

  // Normal recovery state.
  const NORMAL: Category[] = ["grounding", "reasoning", "framing", "boundary"];
  if ((NORMAL as string[]).includes(primary_category)) {
    if (needs_clarification)
      push("recovery result cannot request clarification.");
    if (primary_route === null)
      push("recovery result requires a primary_route.");
    if (steps.length < 1 || steps.length > 3)
      push("recovery result requires between 1 and 3 steps.");
  }

  // Required non-empty string fields for any rendered (non-clarification) result.
  if (!needs_clarification) {
    if (!isNonEmptyString(assessment))
      push("assessment must be non-empty for a result.");
    if (!isNonEmptyString(uncertainty))
      push("uncertainty must be non-empty for a result.");
    for (let i = 0; i < steps.length; i++) {
      if (!isNonEmptyString(steps[i]))
        push(`steps[${i}] must be non-empty.`);
    }
  }

  // Route-specific rules.
  if (primary_route === "repair") {
    if (!isNonEmptyString(repair_prompt))
      push("repair route requires a non-empty repair_prompt.");
  } else if (
    primary_route === "verify" ||
    primary_route === "escalate" ||
    primary_route === "exit"
  ) {
    if (repair_prompt !== null)
      push(`${primary_route} route requires repair_prompt to be null.`);
  } else {
    // primary_route is null — repair_prompt must also be null.
    if (repair_prompt !== null)
      push("repair_prompt may be present only when primary_route is 'repair'.");
  }

  if (secondary_route !== null && secondary_route === primary_route)
    push("secondary_route must not equal primary_route.");
  if (secondary_category !== null && secondary_category === primary_category)
    push("secondary_category must not equal primary_category.");
  if (
    secondary_category === "unclear" ||
    secondary_category === "no_clear_failure"
  )
    push(
      "secondary_category may not be 'unclear' or 'no_clear_failure'.",
    );

  // transfer_signal nullability.
  const transferMayBeNull =
    needs_clarification || primary_category === "no_clear_failure";
  if (!transferMayBeNull && transfer_signal === null)
    push("transfer_signal is required for this result type.");
  if (transfer_signal !== null && !isNonEmptyString(transfer_signal))
    push("transfer_signal, when present, must be non-empty.");

  // scope_warning, when present, must be non-empty.
  if (scope_warning !== null && !isNonEmptyString(scope_warning))
    push("scope_warning, when present, must be non-empty.");

  if (errors.length > 0) return { ok: false, errors };

  const value: AnalysisResult = {
    needs_clarification,
    clarifying_question,
    primary_category: primary_category as Category,
    secondary_category: secondary_category as Category | null,
    assessment,
    confidence: confidence as Confidence,
    uncertainty,
    primary_route: primary_route as Route | null,
    secondary_route: secondary_route as Route | null,
    steps,
    repair_prompt,
    transfer_signal,
    scope_warning,
  };
  return { ok: true, value };
}
