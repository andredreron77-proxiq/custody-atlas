import type { RawSignal as Signal } from "./signals";

const OPENAI_MODEL = "gpt-4o";

export type CaseStrength = "weak" | "moderate" | "strong";

export interface CaseStrengthReport {
  score: CaseStrength;
  percentage: number;
  summary: string;
  factors: {
    factor: string;
    impact: "positive" | "negative" | "neutral";
    detail: string;
  }[];
  disclaimer: string;
}

function getOpenAIEndpoint(): string {
  const base = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL ?? "https://api.openai.com/v1";
  return `${base.replace(/\/$/, "")}/chat/completions`;
}

function getOpenAIKey(): string {
  const key = process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OpenAI API key is not configured.");
  return key;
}

export async function analyzeCaseStrength(
  documents: string[],
  signals: Signal[],
  jurisdiction: { state: string; county: string },
): Promise<CaseStrengthReport> {
  const response = await fetch(getOpenAIEndpoint(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getOpenAIKey()}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      response_format: { type: "json_object" },
      max_tokens: 1400,
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content: `You are analyzing a custody case to assess its relative strength. This is not a prediction of outcome — it is an assessment of the current evidence and documentation position.

Analyze these factors:
1. Documentation quality — are there court orders, GAL reports, evidence of compliance?
2. Timeline adherence — are deadlines being met?
3. Risk factors — supervised visitation, missed hearings, non-compliance flags
4. Hearing proximity — imminent hearings increase urgency
5. Document completeness — is the case well-documented?

Score:
- Weak (0-33): Significant gaps, risks, or missing documentation
- Moderate (34-66): Some strengths but meaningful gaps exist
- Strong (67-100): Well-documented, compliant, good position

Return JSON:
{
  "score": "weak | moderate | strong",
  "percentage": 0,
  "summary": "One decisive sentence about case position",
  "factors": [
    {
      "factor": "Documentation",
      "impact": "positive | negative | neutral",
      "detail": "Specific finding about this factor"
    }
  ],
  "disclaimer": "This score reflects document analysis only, not legal advice or outcome prediction. Consult a licensed family law attorney."
}`,
        },
        {
          role: "user",
          content: `Jurisdiction: ${jurisdiction.county}, ${jurisdiction.state}

Document excerpts:
${documents.map((text, index) => `Document ${index + 1}:\n${text.slice(0, 4000)}`).join("\n\n---\n\n")}

Signals:
${JSON.stringify(signals, null, 2)}`,
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Case strength analysis failed (${response.status}): ${errorText}`);
  }

  const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
  const raw = data.choices?.[0]?.message?.content?.trim();
  if (!raw) throw new Error("Case strength analysis returned no content.");

  const parsed = JSON.parse(raw) as Partial<CaseStrengthReport>;
  const score =
    parsed.score === "weak" || parsed.score === "moderate" || parsed.score === "strong"
      ? parsed.score
      : "moderate";

  return {
    score,
    percentage: typeof parsed.percentage === "number"
      ? Math.max(0, Math.min(100, Math.round(parsed.percentage)))
      : score === "weak"
        ? 25
        : score === "strong"
          ? 75
          : 50,
    summary: typeof parsed.summary === "string"
      ? parsed.summary
      : "The current case position is mixed and needs closer review.",
    factors: Array.isArray(parsed.factors)
      ? parsed.factors.filter((factor): factor is CaseStrengthReport["factors"][number] =>
        typeof factor === "object" &&
        factor !== null &&
        typeof factor.factor === "string" &&
        (factor.impact === "positive" || factor.impact === "negative" || factor.impact === "neutral") &&
        typeof factor.detail === "string")
      : [],
    disclaimer: typeof parsed.disclaimer === "string"
      ? parsed.disclaimer
      : "This score reflects document analysis only, not legal advice or outcome prediction. Consult a licensed family law attorney.",
  };
}
