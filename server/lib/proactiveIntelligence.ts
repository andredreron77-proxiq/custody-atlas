export interface ProactiveInsight {
  type: "suggested_question" | "contradiction" | "assumption_challenge";
  text: string;
  reason: string;
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

export async function generateProactiveInsights(
  userQuestion: string,
  atlasResponse: string,
  caseDocuments: string[],
  conversationHistory: Array<{ role: string; content: string }>,
): Promise<ProactiveInsight[]> {
  const response = await fetch(getOpenAIEndpoint(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getOpenAIKey()}`,
    },
    body: JSON.stringify({
      model: "gpt-4o",
      response_format: { type: "json_object" },
      max_tokens: 900,
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content: `You are analyzing a custody conversation to surface what the parent should be thinking about but isn't asking.

Look for:
1. SUGGESTED QUESTIONS: What follow-up question would a good attorney ask next? Surface the question the parent should be asking but hasn't.

2. CONTRADICTIONS: Are there contradictions between what the parent said and what their documents show? Flag them.
Example: "You mentioned consistent visitation but your documents show 11 missed visits."

3. ASSUMPTION CHALLENGES: Is the parent assuming something that may not be accurate? Challenge it respectfully.
Example: "You mentioned the other parent won't get custody — your GAL report recommends the opposite."

Return 1-2 insights maximum. Be specific. Be direct.
Return JSON object with this shape:
{
  "insights": [
    {
      "type": "suggested_question | contradiction | assumption_challenge",
      "text": "Insight text",
      "reason": "Why this matters now"
    }
  ]
}`,
        },
        {
          role: "user",
          content: `User question:
${userQuestion}

Atlas response:
${atlasResponse}

Conversation history:
${conversationHistory.map((item) => `${item.role}: ${item.content}`).join("\n")}

Case documents:
${caseDocuments.map((doc, index) => `Document ${index + 1}:\n${doc.slice(0, 3000)}`).join("\n\n---\n\n")}`,
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Proactive insight generation failed (${response.status}): ${errorText}`);
  }

  const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
  const raw = data.choices?.[0]?.message?.content?.trim();
  if (!raw) return [];

  const parsed = JSON.parse(raw) as { insights?: unknown };
  if (!Array.isArray(parsed.insights)) return [];

  return parsed.insights
    .filter((item): item is ProactiveInsight =>
      typeof item === "object" &&
      item !== null &&
      (((item as { type?: string }).type === "suggested_question") ||
        ((item as { type?: string }).type === "contradiction") ||
        ((item as { type?: string }).type === "assumption_challenge")) &&
      typeof (item as { text?: string }).text === "string" &&
      typeof (item as { reason?: string }).reason === "string")
    .slice(0, 2);
}
