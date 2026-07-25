// Shared, deterministic high-stakes scope screen and input limits.
// Used by both the client pre-check and the server analysis boundary.
// No network, no persistence.

export const LIMITS = {
  prompt: 3000,
  response: 8000,
  concern: 1000,
} as const;

export const SCOPE_BLOCK_MESSAGE =
  "This prototype is designed for learning-related AI interactions and cannot responsibly evaluate this situation. Do not rely on it for medical, legal, financial, crisis, safety, or disciplinary guidance. Consider contacting an appropriate qualified person or emergency service.";

// Intentionally conservative: matches obvious high-stakes phrasing only.
export const SCOPE_PATTERNS: RegExp[] = [
  /\b(diagnos(e|is|ed|ing)|prescrib(e|ed|ing)|dosage|dose of|mg\/kg|symptoms? of|treat(ment)? for|medication|prognosis|is (this|it) cancer|chest pain|overdose)\b/i,
  /\b(legal advice|sue|lawsuit|plead guilty|custody|restraining order|deportation|my lawyer|criminal charge|is (this|it) legal|tenant rights)\b/i,
  /\b(financial advice|invest(ing)? in|should i buy .* stock|tax advice|file (my|for) bankruptcy|mortgage advice|retirement plan|which stock|crypto to buy)\b/i,
  /\b(suicid(e|al)|kill myself|end my life|self[- ]harm|hurt myself|want to die|overdose|emergency|call 911|in danger|being abused|domestic violence|someone is (hurting|threatening) me)\b/i,
  /\b(academic (integrity|misconduct)|honor code|expelled|expulsion|disciplinary (hearing|action|committee)|title ix|plagiarism hearing|suspended from school)\b/i,
];

export function isOutOfScope(...texts: (string | null | undefined)[]): boolean {
  const joined = texts.filter(Boolean).join("\n").toLowerCase();
  return SCOPE_PATTERNS.some((re) => re.test(joined));
}
