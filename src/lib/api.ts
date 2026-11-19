/**
 * Submits the intake payload to the n8n webhook and returns the raw JSON response.
 * If VITE_USE_MOCK === "true", returns local mock data instead of calling the webhook.
 */
export async function submitIntake(payload: unknown): Promise<unknown> {
  if (import.meta.env.VITE_USE_MOCK === "true") {
    const { mockSummaryResult } = await import("@/data/mockSummaryResult");
    return mockSummaryResult;
  }

  const webhookUrl = import.meta.env.VITE_N8N_WEBHOOK_URL?.trim();
  if (!webhookUrl) {
    throw new Error("Configure VITE_N8N_WEBHOOK_URL for live intake or enable VITE_USE_MOCK.");
  }

  // A lost response may follow a successful intake. Repeating the POST could
  // create a second review, so leave a retry decision to the operator.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15 * 60 * 1000);
  let response: Response;
  let text: string;
  try {
    response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    text = await response.text();
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    throw new Error(
      `Webhook returned ${response.status} ${response.statusText}` +
      (text ? `\n\nResponse body: ${text.slice(0, 500)}` : " (empty body)")
    );
  }

  if (!text || text.trim() === "") {
    throw new Error(
      "n8n returned an empty response. Make sure your workflow has a 'Respond to Webhook' node that returns the JSON body."
    );
  }

  let result: unknown;
  try {
    result = JSON.parse(text);
  } catch {
    throw new Error(
      `n8n response is not valid JSON.\n\nReceived: ${text.slice(0, 500)}`
    );
  }

  // Unwrap n8n's { output: "<stringified JSON>" } wrapper
  const unwrap = (obj: unknown): unknown => {
    if (Array.isArray(obj) && obj.length > 0) {
      return unwrap(obj[0]);
    }
    if (obj && typeof obj === "object" && "output" in (obj as Record<string, unknown>)) {
      const raw = (obj as Record<string, unknown>).output;
      if (typeof raw === "string") {
        const cleaned = raw
          .replace(/```json\s*/gi, "")
          .replace(/```\s*/g, "")
          .trim()
          .replace(/,\s*}/g, "}")
          .replace(/,\s*]/g, "]");
        try {
          return JSON.parse(cleaned);
        } catch {
          throw new Error(`Failed to parse nested output JSON.\n\n${cleaned.slice(0, 500)}`);
        }
      }
    }
    return obj;
  };

  const normalized = unwrap(result);

  // Normalize scenario_snippet → evidence_snippet in intelligence_breakdown
  if (normalized && typeof normalized === "object") {
    const payload = (normalized as Record<string, unknown>).ui_payload;
    if (payload && typeof payload === "object") {
      const candidates = (payload as Record<string, unknown>).candidates;
      if (Array.isArray(candidates)) {
        for (const c of candidates) {
          if (c && Array.isArray(c.intelligence_breakdown)) {
            for (const ib of c.intelligence_breakdown) {
              if (ib && !ib.evidence_snippet && ib.scenario_snippet) {
                ib.evidence_snippet = ib.scenario_snippet;
                delete ib.scenario_snippet;
              }
            }
          }
        }
      }
    }
  }

  return normalized;
}
