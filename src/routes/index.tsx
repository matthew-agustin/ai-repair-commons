import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Copy,
  Loader2,
  RefreshCw,
  Search,
  ShieldAlert,
  Wrench,
  XCircle,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import {
  analyzeSubmission,
  type AnalysisResult,
  type ClarifyResponse,
  type Pathway,
  type ServerResponse,
} from "@/lib/analyze.functions";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "AI Repair Commons — Diagnose a puzzling AI answer" },
      {
        name: "description",
        content:
          "A single-page tool for students to think through what may have gone wrong in an AI response and pick a repair, verify, escalate, or exit next step.",
      },
      { property: "og:title", content: "AI Repair Commons" },
      {
        property: "og:description",
        content:
          "Paste your prompt and the AI's response. Get a tentative breakdown, an uncertainty note, and one next step.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Index,
});

type Status =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "clarify"; question: string }
  | { kind: "submittingClarification"; question: string }
  | { kind: "result"; result: AnalysisResult }
  | { kind: "error"; reason: string; message: string };

const LIMITS = { originalRequest: 4000, aiResponse: 8000, whatSeemedWrong: 2000, clarification: 2000 };

function Index() {
  const analyze = useServerFn(analyzeSubmission);
  const [originalRequest, setOriginalRequest] = useState("");
  const [aiResponse, setAiResponse] = useState("");
  const [whatSeemedWrong, setWhatSeemedWrong] = useState("");
  const [clarificationAnswer, setClarificationAnswer] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const liveRegionRef = useRef<HTMLDivElement>(null);

  const isLoading = status.kind === "submitting" || status.kind === "submittingClarification";
  const canSubmit = originalRequest.trim().length > 0 && aiResponse.trim().length > 0 && !isLoading;

  useEffect(() => {
    if (status.kind === "result" || status.kind === "clarify" || status.kind === "error") {
      liveRegionRef.current?.focus();
    }
  }, [status.kind]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setStatus({ kind: "submitting" });
    try {
      const resp = (await analyze({
        data: {
          originalRequest: originalRequest.trim(),
          aiResponse: aiResponse.trim(),
          whatSeemedWrong: whatSeemedWrong.trim(),
        },
      })) as ServerResponse;
      applyResponse(resp);
    } catch (err) {
      setStatus({
        kind: "error",
        reason: "network",
        message: err instanceof Error ? err.message : "Something went wrong.",
      });
    }
  }

  async function handleClarify(e: React.FormEvent) {
    e.preventDefault();
    if (status.kind !== "clarify") return;
    if (clarificationAnswer.trim().length === 0) return;
    const priorQuestion = status.question;
    setStatus({ kind: "submittingClarification", question: priorQuestion });
    try {
      const resp = (await analyze({
        data: {
          originalRequest: originalRequest.trim(),
          aiResponse: aiResponse.trim(),
          whatSeemedWrong: whatSeemedWrong.trim(),
          priorQuestion,
          clarificationAnswer: clarificationAnswer.trim(),
        },
      })) as ServerResponse;
      applyResponse(resp, true);
    } catch (err) {
      setStatus({
        kind: "error",
        reason: "network",
        message: err instanceof Error ? err.message : "Something went wrong.",
      });
    }
  }

  function applyResponse(resp: ServerResponse, coerceClarify = false) {
    if (resp.kind === "clarify") {
      if (coerceClarify) {
        // Only one clarification allowed; treat as unclear.
        setStatus({
          kind: "result",
          result: {
            kind: "unclear",
            primaryCategory: "no clear breakdown",
            explanation:
              "There isn't enough signal to name a specific failure mode with confidence.",
            uncertaintyStatement:
              "I can't independently verify the source, so treat this as inconclusive.",
            pathway: "verify",
            steps: ["Compare the AI's key claims against an authoritative source."],
            noticeNextTime:
              "Notice which specific sentence in the AI response first felt wrong.",
          },
        });
        return;
      }
      setStatus({ kind: "clarify", question: resp.question });
      setClarificationAnswer("");
      return;
    }
    if (resp.kind === "error") {
      setStatus({ kind: "error", reason: resp.reason, message: resp.message });
      return;
    }
    setStatus({ kind: "result", result: resp });
  }

  function handleReset() {
    setOriginalRequest("");
    setAiResponse("");
    setWhatSeemedWrong("");
    setClarificationAnswer("");
    setStatus({ kind: "idle" });
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <main className="mx-auto max-w-3xl px-4 py-10 sm:py-14">
        <header className="mb-8">
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            AI Repair Commons
          </h1>
          <p className="mt-3 text-muted-foreground">
            Paste a prompt you gave an AI and the response you got back. You'll
            get a tentative breakdown category, an honest uncertainty note, and
            one suggested next step. This tool is a thinking aid — not a
            definitive diagnosis.
          </p>
        </header>

        <Alert className="mb-6">
          <ShieldAlert className="h-4 w-4" aria-hidden />
          <AlertTitle>Out of scope</AlertTitle>
          <AlertDescription>
            Don't use this for medical, legal, financial, crisis, safety,
            disciplinary, or academic-integrity questions. For those, talk to a
            qualified person. Nothing you paste is saved.
          </AlertDescription>
        </Alert>

        {status.kind !== "clarify" && status.kind !== "submittingClarification" && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Describe the AI exchange</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-5">
                <FieldTextarea
                  id="originalRequest"
                  label="Original request you gave the AI"
                  required
                  value={originalRequest}
                  onChange={setOriginalRequest}
                  max={LIMITS.originalRequest}
                  placeholder="Paste the exact prompt you sent…"
                  minRows={3}
                  disabled={isLoading}
                />
                <FieldTextarea
                  id="aiResponse"
                  label="AI response you received"
                  required
                  value={aiResponse}
                  onChange={setAiResponse}
                  max={LIMITS.aiResponse}
                  placeholder="Paste the AI's reply…"
                  minRows={5}
                  disabled={isLoading}
                />
                <FieldTextarea
                  id="whatSeemedWrong"
                  label="What seemed wrong? (optional)"
                  value={whatSeemedWrong}
                  onChange={setWhatSeemedWrong}
                  max={LIMITS.whatSeemedWrong}
                  placeholder="Anything specific that felt off, contradictory, or missing…"
                  minRows={2}
                  disabled={isLoading}
                />

                <div className="flex flex-wrap items-center gap-3 pt-2">
                  <Button type="submit" disabled={!canSubmit}>
                    {isLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                        Analyzing…
                      </>
                    ) : (
                      <>
                        Analyze
                        <ArrowRight className="ml-2 h-4 w-4" aria-hidden />
                      </>
                    )}
                  </Button>
                  {(status.kind === "result" || status.kind === "error") && (
                    <Button type="button" variant="ghost" onClick={handleReset}>
                      <RefreshCw className="mr-2 h-4 w-4" aria-hidden />
                      Start over
                    </Button>
                  )}
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        <div
          ref={liveRegionRef}
          tabIndex={-1}
          aria-live="polite"
          className="mt-6 outline-none"
        >
          {(status.kind === "clarify" || status.kind === "submittingClarification") && (
            <ClarificationPanel
              question={status.question}
              answer={clarificationAnswer}
              onAnswerChange={setClarificationAnswer}
              onSubmit={handleClarify}
              onCancel={handleReset}
              submitting={status.kind === "submittingClarification"}
            />
          )}

          {status.kind === "result" && (
            <ResultPanel result={status.result} onReset={handleReset} />
          )}

          {status.kind === "error" && (
            <Alert variant="destructive" className="mt-2">
              <XCircle className="h-4 w-4" aria-hidden />
              <AlertTitle>{errorTitle(status.reason)}</AlertTitle>
              <AlertDescription>{status.message}</AlertDescription>
            </Alert>
          )}
        </div>

        <footer className="mt-12 border-t pt-6 text-xs text-muted-foreground">
          <p>
            No accounts. No saved history. Your text isn't stored or used for
            training. This is a hypothesis-generating tool — always verify
            important claims yourself.
          </p>
        </footer>
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
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <Label htmlFor={id}>
          {label}
          {required && <span className="text-destructive"> *</span>}
        </Label>
        <span
          className={`text-xs tabular-nums ${
            value.length > max ? "text-destructive" : "text-muted-foreground"
          }`}
        >
          {value.length}/{max}
        </span>
      </div>
      <Textarea
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value.slice(0, max))}
        placeholder={placeholder}
        required={required}
        disabled={disabled}
        rows={minRows}
        className="resize-y"
      />
    </div>
  );
}

function ClarificationPanel({
  question,
  answer,
  onAnswerChange,
  onSubmit,
  onCancel,
  submitting,
}: {
  question: ClarifyResponse["question"];
  answer: string;
  onAnswerChange: (v: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  onCancel: () => void;
  submitting: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">One quick clarification</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="mb-4 text-sm">{question}</p>
        <form onSubmit={onSubmit} className="space-y-3">
          <Label htmlFor="clarificationAnswer" className="sr-only">
            Your answer
          </Label>
          <Input
            id="clarificationAnswer"
            value={answer}
            onChange={(e) => onAnswerChange(e.target.value.slice(0, LIMITS.clarification))}
            placeholder="Your short answer…"
            disabled={submitting}
            autoFocus
          />
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={submitting || answer.trim().length === 0}>
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                  Analyzing…
                </>
              ) : (
                "Continue"
              )}
            </Button>
            <Button type="button" variant="ghost" onClick={onCancel} disabled={submitting}>
              Start over
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function ResultPanel({ result, onReset }: { result: AnalysisResult; onReset: () => void }) {
  const [copied, setCopied] = useState(false);
  async function copyRepair() {
    if (!result.repairPrompt) return;
    try {
      await navigator.clipboard.writeText(result.repairPrompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  }

  const isUnclear = result.kind === "unclear";

  return (
    <div className="space-y-4">
      <Alert>
        <AlertTriangle className="h-4 w-4" aria-hidden />
        <AlertTitle>Uncertainty</AlertTitle>
        <AlertDescription>{result.uncertaintyStatement}</AlertDescription>
      </Alert>

      <Card>
        <CardHeader className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={isUnclear ? "outline" : "secondary"}>
              {isUnclear ? "No clear failure" : "Possible breakdown"}
            </Badge>
            <PathwayBadge pathway={result.pathway} />
          </div>
          <div>
            <CardTitle className="text-lg">{result.primaryCategory}</CardTitle>
            {result.secondaryCategory && (
              <p className="mt-1 text-sm text-muted-foreground">
                Secondary: {result.secondaryCategory}
              </p>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <section>
            <h3 className="mb-1 text-sm font-medium">Why this might be</h3>
            <p className="text-sm text-muted-foreground">{result.explanation}</p>
          </section>

          {result.steps.length > 0 && (
            <section>
              <h3 className="mb-2 text-sm font-medium">Next steps</h3>
              <ol className="list-decimal space-y-1 pl-5 text-sm">
                {result.steps.map((step, i) => (
                  <li key={i}>{step}</li>
                ))}
              </ol>
            </section>
          )}

          {result.repairPrompt && (
            <section>
              <div className="mb-2 flex items-center justify-between gap-2">
                <h3 className="text-sm font-medium">Suggested repair prompt</h3>
                <Button type="button" size="sm" variant="outline" onClick={copyRepair}>
                  {copied ? (
                    <>
                      <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                      Copy
                    </>
                  )}
                </Button>
              </div>
              <pre className="whitespace-pre-wrap rounded-md bg-muted p-3 text-sm">
                {result.repairPrompt}
              </pre>
            </section>
          )}

          <section>
            <h3 className="mb-1 text-sm font-medium">Signal to notice next time</h3>
            <p className="text-sm text-muted-foreground">{result.noticeNextTime}</p>
          </section>

          <div className="pt-2">
            <Button type="button" variant="ghost" onClick={onReset}>
              <RefreshCw className="mr-2 h-4 w-4" aria-hidden />
              Analyze another
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function PathwayBadge({ pathway }: { pathway: Pathway }) {
  const meta = pathwayMeta(pathway);
  const Icon = meta.icon;
  return (
    <Badge variant="outline" className="gap-1.5">
      <Icon className="h-3.5 w-3.5" aria-hidden />
      <span className="capitalize">{pathway}</span>
      <span className="sr-only">pathway: {meta.label}</span>
    </Badge>
  );
}

function pathwayMeta(pathway: Pathway) {
  switch (pathway) {
    case "repair":
      return { icon: Wrench, label: "repair the prompt" };
    case "verify":
      return { icon: Search, label: "verify against a source" };
    case "escalate":
      return { icon: ShieldAlert, label: "escalate to a qualified human" };
    case "exit":
      return { icon: XCircle, label: "exit — try another approach" };
  }
}

function errorTitle(reason: string) {
  switch (reason) {
    case "rate_limit":
      return "Rate limit reached";
    case "credits":
      return "AI credits exhausted";
    case "scope_blocked":
      return "Out of scope";
    case "schema":
      return "Analysis couldn't be structured";
    default:
      return "Something went wrong";
  }
}
