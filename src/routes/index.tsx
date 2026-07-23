import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "AI Repair Commons — Diagnose a puzzling AI answer" },
      {
        name: "description",
        content:
          "A calm, one-page tool for students to think through what may have gone wrong in an AI response and choose to repair, verify, escalate, or exit.",
      },
      { property: "og:title", content: "AI Repair Commons" },
      {
        property: "og:description",
        content:
          "Paste your prompt and the AI's response. Think through what may have gone wrong and pick a next step.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Index,
});

const LIMITS = {
  prompt: 3000,
  response: 8000,
  concern: 1000,
} as const;

type UiState = "input" | "processing" | "result" | "scope_blocked";

type DemoResult = {
  whatMayHaveHappened: string;
  whatIsStillUncertain: string;
  whatToDoNow: string[];
  betterNextPrompt?: string;
  whatToNoticeNextTime: string;
};

const SCOPE_BLOCK_MESSAGE =
  "This prototype is designed for learning-related AI interactions and cannot responsibly evaluate this situation. Do not rely on it for medical, legal, financial, crisis, safety, or disciplinary guidance. Consider contacting an appropriate qualified person or emergency service.";

// Deterministic client-side scope screen. Intentionally conservative: matches
// obvious high-stakes phrasing only. Not a substitute for server-side checks.
const SCOPE_PATTERNS: RegExp[] = [
  // medical
  /\b(diagnos(e|is|ed|ing)|prescrib(e|ed|ing)|dosage|dose of|mg\/kg|symptoms? of|treat(ment)? for|medication|prognosis|is (this|it) cancer|chest pain|overdose)\b/i,
  // legal
  /\b(legal advice|sue|lawsuit|plead guilty|custody|restraining order|deportation|my lawyer|criminal charge|is (this|it) legal|tenant rights)\b/i,
  // financial
  /\b(financial advice|invest(ing)? in|should i buy .* stock|tax advice|file (my|for) bankruptcy|mortgage advice|retirement plan|which stock|crypto to buy)\b/i,
  // crisis / self-harm / safety
  /\b(suicid(e|al)|kill myself|end my life|self[- ]harm|hurt myself|want to die|overdose|emergency|call 911|in danger|being abused|domestic violence|someone is (hurting|threatening) me)\b/i,
  // disciplinary
  /\b(academic (integrity|misconduct)|honor code|expelled|expulsion|disciplinary (hearing|action|committee)|title ix|plagiarism hearing|suspended from school)\b/i,
];

function isOutOfScope(...texts: string[]): boolean {
  const joined = texts.join("\n").toLowerCase();
  return SCOPE_PATTERNS.some((re) => re.test(joined));
}

// Placeholder demonstration data (fabricated-citation example).
// `betterNextPrompt` is intentionally omitted here because this example routes to
// Verify rather than Repair; the field is preserved on the type for future Repair results.
const DEMO_RESULT: DemoResult = {
  whatMayHaveHappened:
    "This looks like a possible grounding failure. The response presents a highly specific article title, journal, sample size, percentage, and DOI, but the source could not be independently located. The model may have fabricated or inaccurately reconstructed those details. The exchange alone cannot establish whether the article exists, so it should not be treated as reliable evidence.",
  whatIsStillUncertain:
    "It is not possible to tell from this exchange alone whether the article exists in some form, whether specific details (authors, journal, year, DOI) are partially correct, or whether the citation is entirely invented. The citation must be checked through an independent scholarly source — such as Crossref, Google Scholar, a university library database, or the journal's official site — before drawing any conclusion.",
  whatToDoNow: [
    "Search the exact title, authors, and DOI through Crossref, Google Scholar, a library database, or the journal's official site.",
    "If no authoritative record appears, treat the citation as unverified rather than asking the same AI to validate it.",
    "Do not cite the article or repeat its findings unless you can open and inspect the original source.",
  ],
  whatToNoticeNextTime:
    "Specific titles, statistics, journal details, and DOI-like strings can sound authoritative even when they are inaccurate. Verify AI-generated citations through an independent scholarly source before relying on them.",
};

function Index() {
  const [prompt, setPrompt] = useState("");
  const [response, setResponse] = useState("");
  const [concern, setConcern] = useState("");
  const [uiState, setUiState] = useState<UiState>("input");
  const [result, setResult] = useState<DemoResult | null>(null);
  const [copied, setCopied] = useState(false);

  const resultRef = useRef<HTMLDivElement>(null);
  const processingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (processingTimer.current) clearTimeout(processingTimer.current);
    };
  }, []);

  const canAnalyze = useMemo(
    () => prompt.trim().length > 0 && response.trim().length > 0 && uiState !== "processing",
    [prompt, response, uiState],
  );

  useEffect(() => {
    if (uiState === "result" && resultRef.current) {
      resultRef.current.focus();
    }
  }, [uiState]);

  function handleAnalyze(e: React.FormEvent) {
    e.preventDefault();
    if (!canAnalyze) return;
    setUiState("processing");
    setResult(null);
    processingTimer.current = setTimeout(() => {
      setResult(DEMO_RESULT);
      setUiState("result");
    }, 900);
  }

  function handleClearForm() {
    if (processingTimer.current) clearTimeout(processingTimer.current);
    setPrompt("");
    setResponse("");
    setConcern("");
    setResult(null);
    setUiState("input");
  }

  function handleAnalyzeAnother() {
    if (processingTimer.current) clearTimeout(processingTimer.current);
    setPrompt("");
    setResponse("");
    setConcern("");
    setResult(null);
    setUiState("input");
  }

  function handleClearSession() {
    handleClearForm();
  }

  async function handleCopyResult() {
    if (!result) return;
    const text = formatResultForClipboard(result);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Silently ignore — clipboard may be unavailable.
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground antialiased">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-foreground focus:px-3 focus:py-2 focus:text-background"
      >
        Skip to main content
      </a>

      <main
        id="main"
        className="mx-auto w-full max-w-2xl px-5 py-10 sm:px-8 sm:py-14"
      >
        <header className="mb-10 space-y-4">
          <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            AI Repair Commons
          </h1>
          <p className="text-base leading-relaxed text-foreground sm:text-lg">
            Understand what may have gone wrong—and choose whether to repair,
            verify, escalate, or exit.
          </p>
          <p className="rounded-md border border-border bg-muted/50 px-4 py-3 text-sm leading-relaxed text-muted-foreground">
            This prototype supports learning-related AI interactions. It does
            not provide medical, legal, financial, crisis, or disciplinary
            guidance.
          </p>
        </header>

        {uiState !== "result" && (
          <form onSubmit={handleAnalyze} noValidate className="space-y-8">
            <FieldTextarea
              id="prompt"
              label="What did you ask the AI?"
              required
              value={prompt}
              onChange={setPrompt}
              max={LIMITS.prompt}
              placeholder="Paste the prompt or question you gave the AI."
              minRows={4}
              disabled={uiState === "processing"}
            />

            <FieldTextarea
              id="response"
              label="What did the AI say?"
              required
              value={response}
              onChange={setResponse}
              max={LIMITS.response}
              placeholder="Paste the response that seemed wrong, misleading, or unhelpful."
              minRows={7}
              disabled={uiState === "processing"}
            />

            <FieldTextarea
              id="concern"
              label="What made you question it?"
              value={concern}
              onChange={setConcern}
              max={LIMITS.concern}
              placeholder="For example: I could not find the source, the reasoning did not make sense, or the answer felt too confident."
              minRows={3}
              disabled={uiState === "processing"}
              hint="Optional"
            />

            <div className="space-y-3">
              <Alert>
                <AlertTitle>Before you paste</AlertTitle>
                <AlertDescription>
                  Please remove names, student IDs, private records, health
                  information, and other sensitive details. Only share what you
                  are comfortable analyzing.
                </AlertDescription>
              </Alert>

              <p className="text-sm leading-relaxed text-muted-foreground">
                Provisional privacy note: this MVP does not create accounts or
                intentionally save conversation history.
              </p>
            </div>

            <div className="flex flex-col-reverse gap-3 border-t border-border pt-6 sm:flex-row sm:items-center sm:justify-end">
              <Button
                type="button"
                variant="ghost"
                onClick={handleClearForm}
                disabled={uiState === "processing"}
                className="min-h-11 sm:w-auto"
              >
                Clear
              </Button>
              <Button
                type="submit"
                disabled={!canAnalyze}
                className="min-h-11 sm:w-auto"
                aria-describedby={
                  !canAnalyze && uiState !== "processing"
                    ? "analyze-help"
                    : undefined
                }
              >
                {uiState === "processing"
                  ? "Analyzing…"
                  : "Analyze this interaction"}
              </Button>
            </div>
            {!canAnalyze && uiState !== "processing" && (
              <p
                id="analyze-help"
                className="text-right text-xs text-muted-foreground"
              >
                Fill in the prompt and the AI response to continue.
              </p>
            )}
          </form>
        )}

        {uiState === "processing" && (
          <div
            role="status"
            aria-live="polite"
            className="mt-10 rounded-md border border-border bg-muted/40 px-4 py-6 text-sm text-muted-foreground"
          >
            Analyzing this interaction…
          </div>
        )}

        {uiState === "result" && result && (
          <section
            ref={resultRef}
            tabIndex={-1}
            aria-labelledby="result-heading"
            className="space-y-8 outline-none"
          >
            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Analysis
              </p>
              <h2
                id="result-heading"
                className="text-2xl font-semibold tracking-tight text-foreground"
              >
                A tentative reading of this interaction
              </h2>
              <p className="text-sm leading-relaxed text-muted-foreground">
                This is a hypothesis to think with, not a definitive judgment.
                Verify anything that matters before acting on it.
              </p>
            </div>

            <ResultBlock title="What may have happened">
              {result.whatMayHaveHappened}
            </ResultBlock>

            <ResultBlock title="What is still uncertain">
              {result.whatIsStillUncertain}
            </ResultBlock>

            <ResultBlock title="What to do now">
              <ol className="list-decimal space-y-2 pl-5">
                {result.whatToDoNow.map((step, i) => (
                  <li key={i}>{step}</li>
                ))}
              </ol>
            </ResultBlock>

            {result.betterNextPrompt && (
              <ResultBlock title="A better next prompt">
                <pre className="whitespace-pre-wrap rounded-md border border-border bg-muted/50 p-4 font-sans text-sm leading-relaxed text-foreground">
                  {result.betterNextPrompt}
                </pre>
              </ResultBlock>
            )}

            <ResultBlock title="What to notice next time">
              {result.whatToNoticeNextTime}
            </ResultBlock>

            <div
              role="group"
              aria-label="Result actions"
              className="flex flex-col gap-3 border-t border-border pt-6 sm:flex-row sm:flex-wrap sm:items-center"
            >
              <Button
                type="button"
                onClick={handleCopyResult}
                className="min-h-11 sm:w-auto"
                aria-live="polite"
              >
                {copied ? "Result copied" : "Copy result"}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={handleAnalyzeAnother}
                className="min-h-11 sm:w-auto"
              >
                Analyze another interaction
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={handleClearSession}
                className="min-h-11 sm:w-auto"
              >
                Clear and delete this session
              </Button>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

function FieldTextarea({
  id,
  label,
  value,
  onChange,
  max,
  required,
  placeholder,
  minRows = 3,
  disabled,
  hint,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  max: number;
  required?: boolean;
  placeholder?: string;
  minRows?: number;
  disabled?: boolean;
  hint?: string;
}) {
  const countId = `${id}-count`;
  const hintId = hint ? `${id}-hint` : undefined;
  const overLimit = value.length > max;

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <Label htmlFor={id} className="text-sm font-medium text-foreground">
          {label}
          {required && (
            <span aria-hidden className="ml-0.5 text-foreground">
              {" "}
              *
            </span>
          )}
          {required && <span className="sr-only"> (required)</span>}
        </Label>
        {hint && (
          <span id={hintId} className="text-xs text-muted-foreground">
            {hint}
          </span>
        )}
      </div>
      <Textarea
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value.slice(0, max))}
        placeholder={placeholder}
        required={required}
        disabled={disabled}
        rows={minRows}
        aria-describedby={[countId, hintId].filter(Boolean).join(" ") || undefined}
        aria-invalid={overLimit || undefined}
        className="min-h-[7rem] resize-y bg-background text-foreground placeholder:text-muted-foreground"
      />
      <div
        id={countId}
        className={`text-right text-xs tabular-nums ${
          overLimit ? "text-destructive" : "text-muted-foreground"
        }`}
      >
        {value.length.toLocaleString()} / {max.toLocaleString()} characters
      </div>
    </div>
  );
}

function ResultBlock({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      <div className="text-base leading-relaxed text-foreground">{children}</div>
    </section>
  );
}

function formatResultForClipboard(r: DemoResult) {
  const lines = [
    "AI Repair Commons — analysis",
    "",
    "What may have happened",
    r.whatMayHaveHappened,
    "",
    "What is still uncertain",
    r.whatIsStillUncertain,
    "",
    "What to do now",
    ...r.whatToDoNow.map((s, i) => `${i + 1}. ${s}`),
  ];
  if (r.betterNextPrompt) {
    lines.push("", "A better next prompt", r.betterNextPrompt);
  }
  lines.push("", "What to notice next time", r.whatToNoticeNextTime);
  return lines.join("\n");
}
