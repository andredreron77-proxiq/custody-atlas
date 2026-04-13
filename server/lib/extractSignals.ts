// lib/extractSignals.ts
// Calls the OpenAI API to extract structured signals from document text.
// Returns a RawSignal[] ready to be passed into buildWhatMattersNow().

import { RawSignal, SignalType } from "./signals";

const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";
const MODEL = "gpt-4o";

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are a custody document analyst. Your job is to extract actionable signals from legal custody documents for individuals who do not have legal representation.

You will return ONLY a valid JSON array. No preamble, no explanation, no markdown fences.

Each signal in the array must follow this exact shape:
{
  "id": "<unique string, e.g. sig_001>",
  "type": "<one of: urgent | risk | action | pattern>",
  "title": "<short plain-English label, max 8 words>",
  "detail": "<1-2 sentence plain-English explanation of why this matters>",
  "dueDate": "<ISO 8601 date string if applicable, else omit>",
  "sourceDocumentId": "<documentId passed in, always include>"
}

Signal type definitions:
- urgent: A deadline, hearing, or time-bound obligation is approaching.
- risk: Language or terms that could be interpreted against the user's interests.
- action: Something the user should do that isn't obvious from the document.
- pattern: A cross-document finding — only use when multiple document summaries are provided.

Rules:
- Be specific. "Review exchange schedule" is bad. "Exchange scheduled for June 1 — confirm location in writing" is good.
- Plain English only. No legal jargon.
- If no signals of a type exist, omit them — do not force signals.
- Maximum 8 signals per call.
- Never invent dates. Only include dueDate if a specific date appears in the document.
- If you cannot find meaningful signals, return an empty array: []`;

function buildUserPrompt(
  documentText: string,
  documentId: string,
  additionalContext?: string
): string {
  let prompt = `Document ID: ${documentId}\n\n`;
  if (additionalContext) {
    prompt += `Additional context: ${additionalContext}\n\n`;
  }
  prompt += `Document text:\n${documentText}`;
  return prompt;
}

// ---------------------------------------------------------------------------
// API call
// ---------------------------------------------------------------------------

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
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
      max_tokens: 1000,
      messages,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI API error ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  return data.choices[0].message.content.trim();
}

// ---------------------------------------------------------------------------
// Parse + validate response
// ---------------------------------------------------------------------------

function parseSignals(raw: string, documentId: string): RawSignal[] {
  const cleaned = raw.replace(/```json|```/g, "").trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    console.error("[extractSignals] Failed to parse JSON:", cleaned);
    return [];
  }

  if (!Array.isArray(parsed)) {
    console.error("[extractSignals] Response was not an array:", parsed);
    return [];
  }

  const validTypes: SignalType[] = ["urgent", "risk", "action", "pattern"];

  return parsed
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
      sourceDocumentId: documentId,
      dismissed: false,
    }));
}

// ---------------------------------------------------------------------------
// Public API — single document extraction
// ---------------------------------------------------------------------------

export interface ExtractSignalsOptions {
  documentId: string;
  documentText: string;
  additionalContext?: string;
}

export async function extractSignalsFromDocument(
  opts: ExtractSignalsOptions
): Promise<RawSignal[]> {
  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content: buildUserPrompt(
        opts.documentText,
        opts.documentId,
        opts.additionalContext
      ),
    },
  ];

  const raw = await callOpenAI(messages);
  return parseSignals(raw, opts.documentId);
}

// ---------------------------------------------------------------------------
// Public API — cross-document pattern extraction (Pro tier)
// ---------------------------------------------------------------------------

export interface DocumentSummary {
  documentId: string;
  summary: string;
  uploadedAt: string;
}

export async function extractCrossDocumentPatterns(
  documents: DocumentSummary[]
): Promise<RawSignal[]> {
  if (documents.length < 2) return [];

  const content = documents
    .map(
      (d, i) =>
        `Document ${i + 1} (ID: ${d.documentId}, uploaded: ${d.uploadedAt}):\n${d.summary}`
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

  const docIds = documents.map((d) => d.documentId);
  const signals = parseSignals(raw, docIds[0]);

  return signals.map((s) => ({
    ...s,
    type: "pattern" as SignalType,
    sourceDocumentIds: docIds,
  }));
}
