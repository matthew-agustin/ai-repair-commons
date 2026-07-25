// Thin server-function wrapper. All logic lives in analyze.server.ts so the
// server-fn splitter never loses sibling declarations.
import { createServerFn } from "@tanstack/react-start";

import type { AnalyzeOutcome } from "./analyze.server";

export const analyzeInteraction = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => input)
  .handler(async ({ data }): Promise<AnalyzeOutcome> => {
    const { runAnalysis } = await import("./analyze.server");
    return runAnalysis(data);
  });
