// lib/extractSignals.ts
// Calls the OpenAI API to extract case intelligence from document text.
// Returns a richer intelligence report plus RawSignal[] ready for persistence.

import { RawSignal, SignalType } from "./signals";

const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";
const MODEL = "gpt-4o";

const SYSTEM_PROMPT = `You are a case intelligence engine analyzing custody documents.
Your job is not to inform — it is to tell the parent the ONE thing that will determine the outcome of their case right now.

Be decisive. Be specific. Be uncomfortable if necessary.

For the primary signal, think: "If this parent ignores everything else and focuses only on this, what is it?"

The primaryPriority MUST be specific. Never say "follow the court order" — instead say WHICH order, WHAT specific obligation, and WHAT happens if missed.

BAD: "Follow the court order"
GOOD: "Attend the June 15 final custody hearing — if you miss this, the court may award primary custody to the other parent without hearing your side"

BAD: "Review your documents"
GOOD: "Provide your current address to the court by April 18 — the temporary order requires this and non-compliance could affect your credibility with the judge"

Always name the specific document, date, or obligation.

For risks, do not soften language. Say exactly what will happen if they miss something.
Example: "If you miss the April 18 hearing, the court may rule without your input and you could lose temporary custody."

For deadlines, frame them as inevitable: "This will happen whether you are ready or not."

Return ONLY valid JSON with this exact shape:
{
  "primaryPriority": {
    "title": "One sharp sentence naming the ONE thing",
    "consequence": "What happens if ignored",
    "urgency": "critical | high | medium"
  },
  "signals": [
    {
      "id": "sig_001",
      "type": "urgent | risk | action | pattern",
      "title": "Short sharp label",
      "detail": "Specific explanation of why this matters right now",
      "dueDate": "ISO 8601 date string if applicable",
      "sourceDocumentId": "documentId passed in, always include"
    }
  ],
  "risks": [
    {
      "text": "Uncomfortable, specific risk language",
      "consequence": "Exact consequence if ignored",
      "deadline": "Specific date if applicable"
    }
  ],
  "timeline": [
    {
      "event": "What will happen next",
      "date": "Specific date if present",
      "framing": "This will happen whether you are ready or not",
      "isNext": true
    }
  ]
}

Rules:
- Be specific. "Review exchange schedule" is bad. "Hearing on June 1 at 9:00 AM — if you miss it, the judge may decide temporary custody without hearing from you" is good.
- The primaryPriority title must name the exact hearing, filing, order, address update, exchange, or deadline from the documents. Generic statements like "follow the court order" or "review your documents" are failures.
- The primaryPriority consequence must tie directly to that exact action and state what the court or case process may do next if it is missed.
- Never invent dates, deadlines, risks, or consequences that are not supported by the document.
- Maximum 8 supporting signals.
- Set exactly one timeline item to isNext=true when a next event can be identified.
- If there is no meaningful evidence for a section, return an empty array for that section.
- Keep the primary priority decisive and singular.`;

function buildUserPrompt(
  documentText: string,
  documentId: string,
  additionalContext?: string,
): string {
  let prompt = `Document ID: ${documentId}\n\n`;
  if (additionalContext) {
    prompt += `Additional context: ${additionalContext}\n\n`;
  }
  prompt += `Document text:\n${documentText}`;
  return prompt;
}

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ExtractedPrimaryPriority {
  title: string;
  consequence: string;
  urgency: "critical" | "high" | "medium";
}

export interface ExtractedRisk {
  text: string;
  consequence: string;
  deadline?: string;
}

export interface ExtractedTimelineEvent {
  event: string;
  date: string;
  framing: string;
  isNext: boolean;
}

export interface ExtractedSignalIntelligence {
  primaryPriority: ExtractedPrimaryPriority | null;
  signals: RawSignal[];
  risks: ExtractedRisk[];
  timeline: ExtractedTimelineEvent[];
}

async function callOpenAI(messages: ChatMessage[]): Promise<string> {
  const response = await fetch(OPENAI_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1200,
      response_format: { type: "json_object" },
      messages,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI API error ${response.status}: ${errorText}`);
  }

  const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
  return data.choices?.[0]?.message?.content?.trim() ?? "";
}

function parseSignalsFromItems(items: unknown, documentId: string): RawSignal[] {
  if (!Array.isArray(items)) return [];

  const validTypes: SignalType[] = ["urgent", "risk", "action", "pattern"];

  return items
    .filter((item): item is Record<string, unknown> => {
      return (
        typeof item === "object" &&
        item !== null &&
        typeof item.id === "string" &&
        typeof item.type === "string" &&
        validTypes.includes(item.type as SignalType) &&
        typeof item.title === "string" &&
        typeof item.detail === "string"
      );
    })
    .map((item) => ({
      id: item.id as string,
      type: item.type as SignalType,
      title: item.title as string,
      detail: item.detail as string,
      dueDate: typeof item.dueDate === "string" ? item.dueDate : undefined,
      sourceDocumentId: typeof item.sourceDocumentId === "string" ? item.sourceDocumentId : documentId,
      dismissed: false,
    }));
}

function parseSignalIntelligence(raw: string, documentId: string): ExtractedSignalIntelligence {
  const cleaned = raw.replace(/```json|```/g, "").trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    console.error("[extractSignals] Failed to parse JSON:", cleaned);
    return { primaryPriority: null, signals: [], risks: [], timeline: [] };
  }

  if (typeof parsed !== "object" || parsed === null) {
    console.error("[extractSignals] Response was not an object:", parsed);
    return { primaryPriority: null, signals: [], risks: [], timeline: [] };
  }

  const record = parsed as Record<string, unknown>;
  const primaryRaw =
    typeof record.primaryPriority === "object" && record.primaryPriority !== null
      ? (record.primaryPriority as Record<string, unknown>)
      : null;

  const primaryPriority = primaryRaw &&
    typeof primaryRaw.title === "string" &&
    typeof primaryRaw.consequence === "string" &&
    (primaryRaw.urgency === "critical" || primaryRaw.urgency === "high" || primaryRaw.urgency === "medium")
    ? {
        title: primaryRaw.title,
        consequence: primaryRaw.consequence,
        urgency: primaryRaw.urgency,
      } satisfies ExtractedPrimaryPriority
    : null;

  const risks = Array.isArray(record.risks)
    ? record.risks
      .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
      .filter((item) => typeof item.text === "string" && typeof item.consequence === "string")
      .map((item) => ({
        text: item.text as string,
        consequence: item.consequence as string,
        deadline: typeof item.deadline === "string" ? item.deadline : undefined,
      }))
    : [];

  let nextSeen = false;
  const timeline = Array.isArray(record.timeline)
    ? record.timeline
      .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
      .filter((item) =>
        typeof item.event === "string" &&
        typeof item.date === "string" &&
        typeof item.framing === "string" &&
        typeof item.isNext === "boolean")
      .map((item) => {
        const normalizedIsNext = Boolean(item.isNext) && !nextSeen;
        if (normalizedIsNext) nextSeen = true;
        return {
          event: item.event as string,
          date: item.date as string,
          framing: item.framing as string,
          isNext: normalizedIsNext,
        };
      })
    : [];

  return {
    primaryPriority,
    signals: parseSignalsFromItems(record.signals, documentId),
    risks,
    timeline,
  };
}

export interface ExtractSignalsOptions {
  documentId: string;
  documentText: string;
  additionalContext?: string;
}

export async function extractSignalsFromDocument(
  opts: ExtractSignalsOptions,
): Promise<ExtractedSignalIntelligence> {
  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content: buildUserPrompt(
        opts.documentText,
        opts.documentId,
        opts.additionalContext,
      ),
    },
  ];

  const raw = await callOpenAI(messages);
  return parseSignalIntelligence(raw, opts.documentId);
}

export interface DocumentSummary {
  documentId: string;
  summary: string;
  uploadedAt: string;
}

export async function extractCrossDocumentPatterns(
  documents: DocumentSummary[],
): Promise<RawSignal[]> {
  if (documents.length < 2) return [];

  const content = documents
    .map(
      (d, i) =>
        `Document ${i + 1} (ID: ${d.documentId}, uploaded: ${d.uploadedAt}):\n${d.summary}`,
    )
    .join("\n\n---\n\n");

  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content: `The following are summaries of multiple custody-related documents from the same case. Identify pattern-type signals only — cross-document conflicts, modifications, escalating language, or contradictory obligations.\n\n${content}`,
    },
  ];

  const raw = await callOpenAI(messages);
  const intelligence = parseSignalIntelligence(raw, documents[0].documentId);
  const docIds = documents.map((d) => d.documentId);

  return intelligence.signals.map((s) => ({
    ...s,
    type: "pattern" as SignalType,
    sourceDocumentIds: docIds,
  }));
}
