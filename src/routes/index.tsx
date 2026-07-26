import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";

import { analyzeInteraction } from "@/lib/analyze.functions";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  validateAnalysisResult,
  type AnalysisResult,
} from "@/lib/analysis-result";
import {
  LIMITS as SHARED_LIMITS,
  SCOPE_BLOCK_MESSAGE,
  isOutOfScope,
} from "@/lib/scope-screen";


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

const LIMITS = SHARED_LIMITS;

type UiState =
  | "input"
  | "processing"
  | "result"
  | "scope_blocked"
  | "invalid_result";

const INVALID_RESULT_MESSAGE =
  "We could not produce a reliable result from this interaction. Please clear the session and try again.";



function Index() {
  const [prompt, setPrompt] = useState("");
  const [response, setResponse] = useState("");
  const [concern, setConcern] = useState("");
  const [uiState, setUiState] = useState<UiState>("input");
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [copied, setCopied] = useState(false);
  const [promptTouched, setPromptTouched] = useState(false);
  const [responseTouched, setResponseTouched] = useState(false);

  const resultRef = useRef<HTMLDivElement>(null);
  const scopeRef = useRef<HTMLDivElement>(null);
  const invalidRef = useRef<HTMLDivElement>(null);
  // Monotonic submission id: only the newest submission may update state.
  const submissionId = useRef(0);

  const analyze = useServerFn(analyzeInteraction);

  const promptTrimmedLen = prompt.trim().length;
  const responseTrimmedLen = response.trim().length;
  const promptOver = prompt.length > LIMITS.prompt;
  const responseOver = response.length > LIMITS.response;
  const concernOver = concern.length > LIMITS.concern;
  const anyOverLimit = promptOver || responseOver || concernOver;

  const promptError =
    promptTouched && promptTrimmedLen === 0
      ? "Please share what you asked the AI."
      : promptOver
        ? `Please shorten this to ${LIMITS.prompt.toLocaleString()} characters or fewer.`
        : null;
  const responseError =
    responseTouched && responseTrimmedLen === 0
      ? "Please paste what the AI said."
      : responseOver
        ? `Please shorten this to ${LIMITS.response.toLocaleString()} characters or fewer.`
        : null;
  const concernError = concernOver
    ? `Please shorten this to ${LIMITS.concern.toLocaleString()} characters or fewer.`
    : null;

  const canAnalyze = useMemo(
    () =>
      promptTrimmedLen > 0 &&
      responseTrimmedLen > 0 &&
      !anyOverLimit &&
      uiState !== "processing",
    [promptTrimmedLen, responseTrimmedLen, anyOverLimit, uiState],
  );

  useEffect(() => {
    if (uiState === "result" && resultRef.current) resultRef.current.focus();
    if (uiState === "scope_blocked" && scopeRef.current) scopeRef.current.focus();
    if (uiState === "invalid_result" && invalidRef.current)
      invalidRef.current.focus();
  }, [uiState]);

  async function handleAnalyze(e: React.FormEvent) {
    e.preventDefault();
    setPromptTouched(true);
    setResponseTouched(true);
    if (!canAnalyze) return;
    if (isOutOfScope(prompt, response, concern)) {
      submissionId.current += 1;
      setResult(null);
      setUiState("scope_blocked");
      return;
    }

    const requestId = ++submissionId.current;
    const isCurrent = () => submissionId.current === requestId;

    setResult(null);
    setCopied(false);
    setUiState("processing");

    const trimmedConcern = concern.trim();

    try {
      const outcome = await analyze({
        data: {
          prompt: prompt.trim(),
          response: response.trim(),
          concern: trimmedConcern.length > 0 ? trimmedConcern : null,
        },
      });
      if (!isCurrent()) return;

      if (!outcome.ok) {
        if (import.meta.env.DEV) {
          // eslint-disable-next-line no-console
          console.warn("[AI Repair Commons] Analysis failed:", outcome.code);
        }
        setResult(null);
        setUiState(outcome.code === "out_of_scope" ? "scope_blocked" : "invalid_result");
        return;
      }

      // The server response is untrusted at this boundary: revalidate.
      const validation = validateAnalysisResult(outcome.result);
      if (!validation.ok) {
        if (import.meta.env.DEV) {
          // eslint-disable-next-line no-console
          console.warn(
            "[AI Repair Commons] Analysis result failed validation:",
            validation.errors,
          );
        }
        setResult(null);
        setUiState("invalid_result");
        return;
      }

      setResult(validation.value);
      setUiState("result");
    } catch {
      if (!isCurrent()) return;
      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.warn("[AI Repair Commons] Analysis request failed to complete.");
      }
      setResult(null);
      setUiState("invalid_result");
    }
  }

  function resetAll() {
    // Invalidate any in-flight submission so a late response cannot land.
    submissionId.current += 1;
    setPrompt("");
    setResponse("");
    setConcern("");
    setResult(null);
    setCopied(false);
    setPromptTouched(false);
    setResponseTouched(false);
    setUiState("input");
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

        {uiState !== "result" &&
          uiState !== "scope_blocked" &&
          uiState !== "invalid_result" && (
            <form onSubmit={handleAnalyze} noValidate className="space-y-8">
              <FieldTextarea
                id="prompt"
                label="What did you ask the AI?"
                required
                value={prompt}
                onChange={setPrompt}
                onBlur={() => setPromptTouched(true)}
                max={LIMITS.prompt}
                placeholder="Paste the prompt or question you gave the AI."
                minRows={4}
                disabled={uiState === "processing"}
                error={promptError}
              />

              <FieldTextarea
                id="response"
                label="What did the AI say?"
                required
                value={response}
                onChange={setResponse}
                onBlur={() => setResponseTouched(true)}
                max={LIMITS.response}
                placeholder="Paste the response that seemed wrong, misleading, or unhelpful."
                minRows={7}
                disabled={uiState === "processing"}
                error={responseError}
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
                error={concernError}
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
                  onClick={resetAll}
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
                  {anyOverLimit
                    ? "Please shorten fields that exceed their character limit."
                    : "Fill in the prompt and the AI response to continue."}
                </p>
              )}
            </form>
          )}

        {uiState === "scope_blocked" && (
          <section
            ref={scopeRef}
            tabIndex={-1}
            aria-labelledby="scope-heading"
            aria-live="polite"
            className="space-y-6 outline-none"
          >
            <Alert>
              <AlertTitle id="scope-heading">Out of scope</AlertTitle>
              <AlertDescription>{SCOPE_BLOCK_MESSAGE}</AlertDescription>
            </Alert>
            <div className="flex flex-col gap-3 border-t border-border pt-6 sm:flex-row sm:items-center">
              <Button
                type="button"
                onClick={resetAll}
                className="min-h-11 sm:w-auto"
              >
                Start over
              </Button>
            </div>
          </section>
        )}

        {uiState === "invalid_result" && (
          <section
            ref={invalidRef}
            tabIndex={-1}
            aria-labelledby="invalid-heading"
            aria-live="polite"
            className="space-y-6 outline-none"
          >
            <Alert>
              <AlertTitle id="invalid-heading">Result unavailable</AlertTitle>
              <AlertDescription>{INVALID_RESULT_MESSAGE}</AlertDescription>
            </Alert>
            <div className="flex flex-col gap-3 border-t border-border pt-6 sm:flex-row sm:items-center">
              <Button
                type="button"
                onClick={resetAll}
                className="min-h-11 sm:w-auto"
              >
                Clear and delete this session
              </Button>
            </div>
          </section>
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

        {uiState === "result" &&
          result &&
          result.needs_clarification &&
          result.primary_category === "unclear" && (
            <section
              ref={resultRef}
              tabIndex={-1}
              aria-labelledby="clarification-heading"
              aria-live="polite"
              className="space-y-8 outline-none"
            >
              <div className="space-y-2">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Clarification
                </p>
                <h2
                  id="clarification-heading"
                  className="text-2xl font-semibold tracking-tight text-foreground"
                >
                  One clarification is needed
                </h2>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  This interaction does not yet contain enough detail to support
                  a responsible assessment.
                </p>
              </div>

              {result.clarifying_question && (
                <p className="rounded-md border border-border bg-muted/50 px-4 py-4 text-lg leading-relaxed text-foreground">
                  {result.clarifying_question}
                </p>
              )}

              <div className="flex flex-col gap-3 border-t border-border pt-6 sm:flex-row sm:items-center">
                <Button
                  type="button"
                  onClick={resetAll}
                  className="min-h-11 sm:w-auto"
                >
                  Clear and start again
                </Button>
              </div>
            </section>
          )}

        {uiState === "result" &&
          result &&
          !result.needs_clarification &&
          result.primary_category === "no_clear_failure" && (
            <section
              ref={resultRef}
              tabIndex={-1}
              aria-labelledby="no-failure-heading"
              className="space-y-8 outline-none"
            >
              <div className="space-y-2">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Analysis
                </p>
                <h2
                  id="no-failure-heading"
                  className="text-2xl font-semibold tracking-tight text-foreground"
                >
                  No clear failure is evident
                </h2>
              </div>

              <ResultBlock title="What may have happened">
                {result.assessment}
              </ResultBlock>

              <ResultBlock title="What is still uncertain">
                {result.uncertainty}
              </ResultBlock>

              {result.steps.length > 0 && (
                <ResultBlock title="One thing you could do">
                  {result.steps[0]}
                </ResultBlock>
              )}

              {result.transfer_signal && (
                <ResultBlock title="What to notice next time">
                  {result.transfer_signal}
                </ResultBlock>
              )}

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
                  onClick={resetAll}
                  className="min-h-11 sm:w-auto"
                >
                  Analyze another interaction
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={resetAll}
                  className="min-h-11 sm:w-auto"
                >
                  Clear and delete this session
                </Button>
              </div>
            </section>
          )}

        {uiState === "result" &&
          result &&
          !result.needs_clarification &&
          result.primary_category !== "unclear" &&
          result.primary_category !== "no_clear_failure" && (
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
              {result.assessment}
            </ResultBlock>

            <ResultBlock title="What is still uncertain">
              {result.uncertainty}
            </ResultBlock>

            {result.steps.length > 0 && (
              <ResultBlock title="What to do now">
                <ol className="list-decimal space-y-2 pl-5">
                  {result.steps.map((step, i) => (
                    <li key={i}>{step}</li>
                  ))}
                </ol>
              </ResultBlock>
            )}

            {result.repair_prompt && (
              <ResultBlock title="A better next prompt">
                <pre className="whitespace-pre-wrap rounded-md border border-border bg-muted/50 p-4 font-sans text-sm leading-relaxed text-foreground">
                  {result.repair_prompt}
                </pre>
              </ResultBlock>
            )}

            {result.transfer_signal && (
              <ResultBlock title="What to notice next time">
                {result.transfer_signal}
              </ResultBlock>
            )}

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
                onClick={resetAll}
                className="min-h-11 sm:w-auto"
              >
                Analyze another interaction
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={resetAll}
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
  onBlur,
  max,
  required,
  placeholder,
  minRows = 3,
  disabled,
  hint,
  error,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  max: number;
  required?: boolean;
  placeholder?: string;
  minRows?: number;
  disabled?: boolean;
  hint?: string;
  error?: string | null;
}) {
  const countId = `${id}-count`;
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
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
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        placeholder={placeholder}
        required={required}
        disabled={disabled}
        rows={minRows}
        aria-describedby={
          [countId, hintId, errorId].filter(Boolean).join(" ") || undefined
        }
        aria-invalid={overLimit || Boolean(error) || undefined}
        className="min-h-[7rem] resize-y bg-background text-foreground placeholder:text-muted-foreground"
      />
      <div className="flex items-start justify-between gap-3">
        {error ? (
          <p id={errorId} className="text-xs text-destructive">
            {error}
          </p>
        ) : (
          <span />
        )}
        <div
          id={countId}
          className={`text-right text-xs tabular-nums ${
            overLimit ? "text-destructive" : "text-muted-foreground"
          }`}
        >
          {value.length.toLocaleString()} / {max.toLocaleString()} characters
        </div>
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

function formatResultForClipboard(r: AnalysisResult) {
  const lines = [
    "AI Repair Commons — analysis",
    "",
    "What may have happened",
    r.assessment,
    "",
    "What is still uncertain",
    r.uncertainty,
  ];
  if (r.steps.length > 0) {
    lines.push("", "What to do now");
    r.steps.forEach((s, i) => lines.push(`${i + 1}. ${s}`));
  }
  if (r.repair_prompt) {
    lines.push("", "A better next prompt", r.repair_prompt);
  }
  if (r.transfer_signal) {
    lines.push("", "What to notice next time", r.transfer_signal);
  }
  return lines.join("\n");
}
