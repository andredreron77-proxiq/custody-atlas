import { z } from "zod";
import type { Express } from "express";
import { createServer, type Server } from "http";
import { mkdirSync, unlinkSync, readFileSync } from "fs";
import { join } from "path";
import multer from "multer";
import OpenAI from "openai";
import { extractTextFromDocument } from "./documentai";
import { getCustodyLaw, listStates } from "./custody-laws-store";
import { getCountyProcedure } from "./county-procedures-store";
import { buildSystemPrompt, buildUserPrompt, buildComparisonSystemPrompt, buildComparisonUserPrompt } from "./lib/prompts/legalAssistant";
import { requireAuth } from "./services/auth";
import {
  getUsageState,
  checkQuestionLimit,
  checkDocumentLimit,
  trackQuestion,
  trackDocument,
} from "./services/usage";
import { saveQuestion } from "./services/questions";
import { saveDocument } from "./services/documents";
import {
  maybePublishQuestion,
  getPublicQuestionsByState,
  getPublicQuestionBySlug,
  getRelatedQuestions,
  TOPIC_LABELS,
} from "./services/publicQuestions";
import {
  geocodeByCoordinatesSchema,
  geocodeByZipSchema,
  askAIRequestSchema,
  aiLegalResponseSchema,
  documentAnalysisResultSchema,
  documentQARequestSchema,
  documentQAResponseSchema,
  countyProcedureSchema,
  type Jurisdiction,
} from "@shared/schema";

function getOpenAIClient(): OpenAI {
  return new OpenAI({
    apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY,
    baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || undefined,
  });
}

async function geocodeWithGoogle(
  params: { lat: number; lng: number } | { address: string }
): Promise<Jurisdiction | null> {
  // GOOGLE MAPS API KEY used here — server-side only, never exposed to the client
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    throw new Error("GOOGLE_MAPS_API_KEY is not configured");
  }

  let url: string;
  let inputCoords: { latitude: number; longitude: number } | undefined;

  if ("lat" in params) {
    // Reverse geocoding: coordinates → address components
    // GOOGLE MAPS GEOCODING API — latlng lookup
    url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${params.lat},${params.lng}&key=${apiKey}`;
    inputCoords = { latitude: params.lat, longitude: params.lng };
  } else {
    // Forward geocoding: ZIP/address → address components
    // GOOGLE MAPS GEOCODING API — address lookup
    url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(params.address)}&key=${apiKey}`;
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Geocoding API request failed: ${response.statusText}`);
  }

  const data = await response.json() as any;

  if (data.status === "REQUEST_DENIED") {
    throw new Error(`REQUEST_DENIED: ${data.error_message || "API key may have referrer restrictions"}`);
  }

  if (data.status !== "OK" || !data.results || data.results.length === 0) {
    return null;
  }

  const result = data.results[0];
  const components = result.address_components as Array<{
    long_name: string;
    short_name: string;
    types: string[];
  }>;

  let state = "";
  let county = "";
  let country = "";
  let cityFallback = "";

  for (const component of components) {
    if (component.types.includes("administrative_area_level_1")) {
      state = component.long_name;
    }
    if (component.types.includes("administrative_area_level_2")) {
      county = component.long_name
        .replace(/ County$/, "")
        .replace(/ Parish$/, "")
        .replace(/ Borough$/, "")
        .replace(/ Municipality$/, "");
    }
    if (component.types.includes("country")) {
      country = component.long_name;
    }
    // Collect fallback values for areas where Google omits administrative_area_level_2
    // (e.g. New York City ZIPs, some rural/PO Box ZIPs)
    if (!cityFallback && component.types.includes("locality")) {
      cityFallback = component.long_name;
    }
    if (!cityFallback && component.types.includes("sublocality_level_1")) {
      cityFallback = component.long_name;
    }
    if (!cityFallback && component.types.includes("postal_town")) {
      cityFallback = component.long_name;
    }
    if (!cityFallback && component.types.includes("neighborhood")) {
      cityFallback = component.long_name;
    }
  }

  // Use city/locality as county display name when the county component is missing
  if (!county && cityFallback) {
    county = cityFallback;
  }

  if (!state) return null;

  // Extract coordinates from the geocode result geometry (available for both lookup types)
  const geometry = result.geometry?.location as { lat: number; lng: number } | undefined;
  const latitude = inputCoords?.latitude ?? geometry?.lat;
  const longitude = inputCoords?.longitude ?? geometry?.lng;

  return {
    state,
    county,
    country,
    formattedAddress: result.formatted_address,
    ...(latitude !== undefined && { latitude }),
    ...(longitude !== undefined && { longitude }),
  };
}

const UPLOADS_DIR = join(process.cwd(), "uploads");
mkdirSync(UPLOADS_DIR, { recursive: true });

const upload = multer({
  dest: UPLOADS_DIR,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ["application/pdf", "image/jpeg", "image/png", "image/jpg"];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Unsupported file type. Please upload a PDF, JPG, or PNG."));
    }
  },
});

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {

  // ── Usage state ────────────────────────────────────────────────────────────
  app.get("/api/usage", async (req, res) => {
    try {
      const state = await getUsageState(req);
      res.json(state);
    } catch (err) {
      console.error("Usage state error:", err);
      res.status(500).json({ error: "Could not retrieve usage state." });
    }
  });

  app.post("/api/geocode/coordinates", async (req, res) => {
    try {
      const parsed = geocodeByCoordinatesSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid coordinates", details: parsed.error.issues });
      }

      const jurisdiction = await geocodeWithGoogle({ lat: parsed.data.lat, lng: parsed.data.lng });
      if (!jurisdiction) {
        return res.status(404).json({
          error: "Could not determine jurisdiction for these coordinates. Please try entering your ZIP code manually.",
        });
      }

      return res.json(jurisdiction);
    } catch (err: any) {
      if (err.message?.includes("GOOGLE_MAPS_API_KEY")) {
        return res.status(503).json({ error: "Geocoding service not configured. Please add a Google Maps API key." });
      }
      if (err.message?.includes("REQUEST_DENIED") || err.message?.includes("referer")) {
        return res.status(503).json({
          error: "Google Maps API key has referrer restrictions. Please remove restrictions in Google Cloud Console.",
        });
      }
      console.error("Geocoding error:", err);
      return res.status(500).json({ error: "Location lookup failed. Please try entering your ZIP code manually." });
    }
  });

  app.post("/api/geocode/zip", async (req, res) => {
    try {
      const parsed = geocodeByZipSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid ZIP code", details: parsed.error.issues });
      }

      const jurisdiction = await geocodeWithGoogle({ address: `${parsed.data.zipCode}, USA` });
      if (!jurisdiction) {
        return res.status(404).json({ error: "Could not find a location for this ZIP code" });
      }

      return res.json(jurisdiction);
    } catch (err: any) {
      if (err.message?.includes("GOOGLE_MAPS_API_KEY")) {
        return res.status(503).json({ error: "Geocoding service not configured. Please add a Google Maps API key." });
      }
      if (err.message?.includes("REQUEST_DENIED")) {
        return res.status(503).json({
          error: "Google Maps API key has referrer restrictions. Please remove restrictions in Google Cloud Console.",
        });
      }
      console.error("Geocoding error:", err);
      return res.status(500).json({ error: "Location lookup failed. Please try a different ZIP code." });
    }
  });

  app.get("/api/custody-laws/:state", (req, res) => {
    const stateName = req.params.state;
    const law = getCustodyLaw(stateName);

    if (!law) {
      return res.status(404).json({
        error: `No custody law data available for ${stateName}`,
        availableStates: listStates(),
      });
    }

    return res.json(law);
  });

  app.get("/api/custody-laws", (_req, res) => {
    return res.json({ states: listStates() });
  });

  /**
   * GET /api/county-procedures/:state/:county
   *
   * Returns LOCAL COURT PROCEDURE data for a specific county.
   *
   * This is SEPARATE from /api/custody-laws/:state which returns statewide
   * legal rules.  County procedure data covers court-operational details
   * (court name, filing links, mandatory classes, local mediation programs)
   * that may vary county-by-county even within the same state.
   *
   * Returns 404 when no county record exists — callers must degrade gracefully
   * to displaying state-law-only content.  A 404 here is NORMAL, not an error.
   */
  app.get("/api/county-procedures/:state/:county", (req, res) => {
    const { state, county } = req.params;

    // "general" is the sentinel county used by the map flow.
    // It is never a real county so always return 404.
    if (!state || !county || county.toLowerCase() === "general") {
      return res.status(404).json({ error: "No county procedure data for this location." });
    }

    const procedure = getCountyProcedure(
      decodeURIComponent(state),
      decodeURIComponent(county)
    );

    if (!procedure) {
      return res.status(404).json({
        error: `No county procedure data available for ${county} County, ${state}`,
      });
    }

    const validated = countyProcedureSchema.safeParse(procedure);
    if (!validated.success) {
      console.error("County procedure record failed schema validation:", validated.error.issues);
      return res.status(500).json({ error: "County procedure data is malformed." });
    }

    return res.json(validated.data);
  });

  app.post("/api/ask", requireAuth, checkQuestionLimit, async (req, res) => {
    try {
      const parsed = askAIRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: "Invalid request",
          details: parsed.error.issues.map((i) => i.message),
        });
      }

      const { jurisdiction, legalContext, userQuestion, history } = parsed.data;

      if (!jurisdiction.state || !jurisdiction.county) {
        return res.status(400).json({ error: "Jurisdiction must include both state and county." });
      }

      const hasAI = process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
      if (!hasAI) {
        return res.status(503).json({
          error: "AI service not configured. Please connect an OpenAI integration.",
        });
      }

      // Load state law from the store (server always controls this — client legalContext is supplemental)
      const stateLaw = getCustodyLaw(jurisdiction.state);
      const isUnsupportedState = !stateLaw;

      const legalContextText = stateLaw
        ? [
            `CUSTODY STANDARD:\n${stateLaw.custody_standard}`,
            `CUSTODY TYPES:\n${stateLaw.custody_types}`,
            `MODIFICATION RULES:\n${stateLaw.modification_rules}`,
            `RELOCATION RULES:\n${stateLaw.relocation_rules}`,
            `ENFORCEMENT OPTIONS:\n${stateLaw.enforcement_options}`,
            `MEDIATION REQUIREMENTS:\n${stateLaw.mediation_requirements}`,
          ].join("\n\n")
        : legalContext
          ? JSON.stringify(legalContext, null, 2)
          : `No specific custody law data is available for ${jurisdiction.state}. Apply general US family law principles and clearly flag that the user must verify with a local ${jurisdiction.state} attorney.`;

      const openai = getOpenAIClient();

      // Build multi-turn message array: system → history turns → current question.
      // Prior turns are capped server-side at 8 pairs (max 16 items) to bound cost.
      const historyTurns = (history ?? [])
        .slice(-16)
        .map((h) => ({ role: h.role as "user" | "assistant", content: h.content }));

      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: buildSystemPrompt(jurisdiction.state) },
          ...historyTurns,
          {
            role: "user",
            content: buildUserPrompt({
              state: jurisdiction.state,
              county: jurisdiction.county,
              isUnsupportedState,
              legalContextText,
              userQuestion,
            }),
          },
        ],
        response_format: { type: "json_object" },
        max_tokens: 1400,
        temperature: 0.4,
      });

      const rawContent = completion.choices[0]?.message?.content;
      if (!rawContent) {
        return res.status(500).json({ error: "No response received from AI service." });
      }

      let parsed_response: unknown;
      try {
        parsed_response = JSON.parse(rawContent);
      } catch {
        return res.status(500).json({ error: "AI returned an invalid response format. Please try again." });
      }

      const validated = aiLegalResponseSchema.safeParse(parsed_response);
      if (!validated.success) {
        console.error("AI response failed schema validation:", validated.error.issues);
        return res.status(500).json({ error: "AI response structure was unexpected. Please try again." });
      }

      await trackQuestion(req);
      const userId = (req as any).user?.id as string | undefined;
      if (userId) {
        saveQuestion(userId, {
          jurisdictionState: jurisdiction.state,
          jurisdictionCounty: jurisdiction.county,
          questionText: userQuestion,
          responseJson: validated.data as Record<string, unknown>,
        }).catch(() => {});
      }

      // Auto-publish safe questions to the public SEO repository (fire-and-forget).
      maybePublishQuestion({
        state: jurisdiction.state,
        county: jurisdiction.county,
        questionText: userQuestion,
        responseJson: validated.data as Record<string, unknown>,
      }).catch((err) => console.error("[publicQuestions] maybePublishQuestion error:", err));

      return res.json(validated.data);
    } catch (err: any) {
      console.error("Ask AI error:", err);
      return res.status(500).json({ error: "Failed to get AI response. Please try again." });
    }
  });

  app.post("/api/ask-comparison", requireAuth, async (req, res) => {
    try {
      const schema = z.object({
        stateA: z.string().min(1),
        stateB: z.string().min(1),
        userQuestion: z.string().min(3, "Question must be at least 3 characters").max(2000),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid request", details: parsed.error.issues.map((i) => i.message) });
      }

      const { stateA, stateB, userQuestion } = parsed.data;

      const hasAI = process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
      if (!hasAI) {
        return res.status(503).json({ error: "AI service not configured." });
      }

      const buildLawText = (stateName: string) => {
        const law = getCustodyLaw(stateName);
        if (!law) return `No specific data available for ${stateName}. Use general US family law principles.`;
        return [
          `CUSTODY STANDARD:\n${law.custody_standard}`,
          `CUSTODY TYPES:\n${law.custody_types}`,
          `MODIFICATION RULES:\n${law.modification_rules}`,
          `RELOCATION RULES:\n${law.relocation_rules}`,
          `ENFORCEMENT OPTIONS:\n${law.enforcement_options}`,
          `MEDIATION REQUIREMENTS:\n${law.mediation_requirements}`,
        ].join("\n\n");
      };

      const openai = getOpenAIClient();
      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: buildComparisonSystemPrompt(stateA, stateB) },
          {
            role: "user",
            content: buildComparisonUserPrompt({
              stateA,
              stateB,
              lawAText: buildLawText(stateA),
              lawBText: buildLawText(stateB),
              userQuestion,
            }),
          },
        ],
        response_format: { type: "json_object" },
        max_tokens: 1600,
        temperature: 0.4,
      });

      const rawContent = completion.choices[0]?.message?.content;
      if (!rawContent) return res.status(500).json({ error: "No response from AI service." });

      let parsed_response: unknown;
      try { parsed_response = JSON.parse(rawContent); } catch {
        return res.status(500).json({ error: "AI returned an invalid response format." });
      }

      const validated = aiLegalResponseSchema.safeParse(parsed_response);
      if (!validated.success) {
        console.error("Comparison AI response failed validation:", validated.error.issues);
        return res.status(500).json({ error: "AI response structure was unexpected." });
      }

      return res.json(validated.data);
    } catch (err: any) {
      console.error("Ask comparison error:", err);
      return res.status(500).json({ error: "Failed to get AI comparison response." });
    }
  });

  app.post("/api/analyze-document", requireAuth, checkDocumentLimit, upload.single("file"), async (req, res) => {
    const filePath = req.file?.path;
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded. Please attach a PDF, JPG, or PNG." });
      }

      const allowedTypes = ["application/pdf", "image/jpeg", "image/png", "image/jpg"];
      if (!allowedTypes.includes(req.file.mimetype)) {
        return res.status(400).json({ error: "Unsupported file type. Please upload a PDF, JPG, or PNG." });
      }

      if (req.file.size > 10 * 1024 * 1024) {
        return res.status(400).json({ error: "File is too large. Maximum size is 10MB." });
      }

      const hasAI = process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
      if (!hasAI) {
        return res.status(503).json({ error: "AI service not configured." });
      }

      const hasDocAI =
        process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON &&
        process.env.GOOGLE_PROJECT_ID &&
        process.env.GOOGLE_DOCUMENT_AI_PROCESSOR_ID;
      if (!hasDocAI) {
        return res.status(503).json({ error: "Google Document AI is not configured." });
      }

      const fileBuffer = readFileSync(filePath!);
      let extractedText: string;
      try {
        extractedText = await extractTextFromDocument(fileBuffer, req.file.mimetype);
      } catch (ocrErr: any) {
        console.error("Document AI OCR error:", ocrErr);
        return res.status(422).json({
          error: `OCR failed: ${ocrErr.message || "Could not extract text from this document. Please ensure the file is readable."}`,
        });
      }

      if (extractedText.trim().length < 20) {
        return res.status(422).json({
          error: "The document appears to be blank or could not be read. Please upload a clearer image or a text-based PDF.",
        });
      }

      const truncatedText = extractedText.slice(0, 14000);

      // Read optional metadata sent by the client
      const pageCount = parseInt(req.body?.pageCount ?? "1", 10) || 1;
      const sourceType: string = req.body?.sourceType ?? "unknown";
      const isMultiPage = pageCount > 1;

      const systemPrompt = `You are an assistant that analyzes custody-related legal documents and explains them in plain English.

Rules:
- You are NOT a lawyer. Do not give legal advice.
- Explain legal terms in simple, accessible language.
- Be accurate and thorough in identifying key information.
- Always remind users to consult a licensed family law attorney.
- The document text provided may come from a single PDF, a single scanned image, or multiple scanned pages combined in order. Treat the full text as one complete legal document regardless of how many pages were submitted.
- When analyzing multi-page documents, consider the full context across all pages before generating your response. Important information such as signature blocks, effective dates, and final orders often appear on later pages.

You MUST respond with valid JSON in exactly this structure:
{
  "document_type": "The type of legal document (e.g., Custody Order, Parenting Plan, Visitation Agreement, Motion to Modify, etc.)",
  "summary": "A 2-4 sentence plain-English summary of what this document is and what it does",
  "important_terms": [
    "IMPORTANT: Each item in this array MUST be a plain text STRING — never an object or nested JSON.",
    "Format each item as: 'Term or Provision: plain-English explanation of what it means.'",
    "Example: 'Legal Custody: This means the right to make major decisions about the child's upbringing, such as schooling and medical care.'",
    "Include 3-6 items total. Every item must be a single string."
  ],
  "key_dates": ["Each item is a plain text string. Example: 'March 15, 2024 – Order effective date'. Empty array if no dates found."],
  "possible_implications": ["Each item is a plain text string explaining what this document means for the people involved. 3-5 items."],
  "questions_to_ask_attorney": ["Each item is a plain text string — a specific question to ask an attorney. 3-5 items."]
}

CRITICAL RULE: Every array value in the JSON must be a plain string. Do NOT use nested objects, key-value pairs, or sub-arrays inside any of the arrays.`;

      const pageNote = isMultiPage
        ? `\n\nNote: This text was extracted from a ${pageCount}-page document (source: ${sourceType}). The pages have been combined in their original order. Analyze the full text as one complete document.`
        : "";

      const userPrompt = `Analyze the following custody document text:${pageNote}\n\n${truncatedText}`;

      const openai = getOpenAIClient();
      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
        max_tokens: 1500,
        temperature: 0.3,
      });

      const rawContent = completion.choices[0]?.message?.content;
      if (!rawContent) {
        return res.status(500).json({ error: "No response received from AI service." });
      }

      let parsedResponse: unknown;
      try {
        parsedResponse = JSON.parse(rawContent);
      } catch {
        return res.status(500).json({ error: "AI returned an invalid response format. Please try again." });
      }

      // Defensive normalizer: if the AI returned objects inside any string array,
      // convert them to readable strings so validation doesn't fail.
      const normalizeStringArray = (arr: unknown): string[] => {
        if (!Array.isArray(arr)) return [];
        return arr.map((item) => {
          if (typeof item === "string") return item;
          if (item && typeof item === "object") {
            // Try common object shapes GPT uses: {term, explanation}, {term, definition}, {name, description}, etc.
            const obj = item as Record<string, unknown>;
            const label = obj.term ?? obj.name ?? obj.title ?? obj.provision ?? "";
            const detail = obj.explanation ?? obj.definition ?? obj.description ?? obj.meaning ?? obj.value ?? "";
            if (label && detail) return `${label}: ${detail}`;
            if (label) return String(label);
            if (detail) return String(detail);
            // Last resort: stringify
            return JSON.stringify(item);
          }
          return String(item);
        });
      };

      if (parsedResponse && typeof parsedResponse === "object") {
        const r = parsedResponse as Record<string, unknown>;
        const stringArrayFields = ["important_terms", "key_dates", "possible_implications", "questions_to_ask_attorney"] as const;
        for (const field of stringArrayFields) {
          if (Array.isArray(r[field])) {
            r[field] = normalizeStringArray(r[field]);
          }
        }
      }

      const validated = documentAnalysisResultSchema.safeParse(parsedResponse);
      if (!validated.success) {
        console.error("Document AI response validation error:", validated.error);
        return res.status(500).json({ error: "AI response structure was unexpected. Please try again." });
      }

      // Append the extracted text so the client can use it for follow-up Q&A
      // without requiring the user to re-upload the file.
      await trackDocument(req);
      const docUserId = (req as any).user?.id as string | undefined;
      if (docUserId && req.file) {
        const pageCount = parseInt(String(req.body?.pageCount ?? "1"), 10) || 1;
        saveDocument(docUserId, {
          fileName: req.file.originalname || "document",
          storagePath: null,
          mimeType: req.file.mimetype,
          pageCount,
          analysisJson: validated.data as Record<string, unknown>,
          extractedText: truncatedText,
        }).catch(() => {});
      }
      return res.json({ ...validated.data, extractedText: truncatedText });
    } catch (err: any) {
      console.error("Document analysis error:", err);
      return res.status(500).json({
        error: err.message || "Failed to analyze document. Please try again.",
      });
    } finally {
      if (filePath) {
        try { unlinkSync(filePath); } catch {}
      }
    }
  });

  // ── Document Follow-up Q&A ─────────────────────────────────────────────────
  app.post("/api/ask-document", requireAuth, async (req, res) => {
    try {
      const parsed = documentQARequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: "Invalid request",
          details: parsed.error.issues.map((i) => i.message),
        });
      }

      const hasAI = process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
      if (!hasAI) {
        return res.status(503).json({ error: "AI service not configured." });
      }

      const { documentAnalysis, extractedText, jurisdiction, userQuestion, history } = parsed.data;

      const jurisdictionLine = jurisdiction?.state
        ? `The user is located in ${jurisdiction.state}${jurisdiction.county ? `, ${jurisdiction.county} County` : ""}${jurisdiction.country ? `, ${jurisdiction.country}` : ""}.`
        : "No specific jurisdiction was provided.";

      const systemPrompt = `You are a child custody legal information assistant helping users understand a custody-related document they have uploaded.

READING LEVEL:
Write at an 8th-to-10th grade level. Use short sentences and plain everyday words. Avoid legal jargon; if you must use a legal term, explain it in parentheses right away.

ROLE:
- You are NOT a lawyer. Do not give specific legal advice.
- Answer the user's question using the document summary and extracted text as your primary source.
- If the answer is not clearly supported by the document, say so directly ("The document does not specifically address this").
- Use the user's jurisdiction if provided, but focus primarily on the document's content.
- Be concise, accurate, and compassionate.
- Always end with a short disclaimer encouraging verification with a licensed attorney.

OUTPUT FORMAT:
Respond with valid JSON matching exactly this structure — no markdown fences:
{
  "answer": "2-4 sentences directly answering the question based on the document. Write in plain English.",
  "keyPoints": ["2-4 short bullet points from the document relevant to the answer. Each is a plain string."],
  "documentReferences": ["1-3 specific parts of the document that support the answer, quoted or paraphrased. Each is a plain string. Empty array if none found."],
  "questionsToAskAttorney": ["2-3 specific follow-up questions the user should ask a licensed attorney. Each is a plain string."],
  "caution": "One sentence about something to be careful about regarding this question.",
  "disclaimer": "One short friendly sentence reminding the user this is educational information, not legal advice."
}`;

      const analysisContext = `DOCUMENT TYPE: ${documentAnalysis.document_type}
SUMMARY: ${documentAnalysis.summary}
IMPORTANT TERMS: ${documentAnalysis.important_terms.join(" | ")}
KEY DATES: ${documentAnalysis.key_dates.join(" | ") || "None identified"}
POSSIBLE IMPLICATIONS: ${documentAnalysis.possible_implications.join(" | ")}`;

      const rawTextContext = extractedText
        ? `\n\nEXTRACTED DOCUMENT TEXT (first 6000 characters):\n${extractedText.slice(0, 6000)}`
        : "";

      const userPrompt = `${jurisdictionLine}

DOCUMENT ANALYSIS:
${analysisContext}${rawTextContext}

USER QUESTION:
${userQuestion}`;

      // Inject prior Q&A turns so the AI can follow the conversation thread.
      const docHistoryTurns = (history ?? [])
        .slice(-16)
        .map((h) => ({ role: h.role as "user" | "assistant", content: h.content }));

      const openai = getOpenAIClient();
      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: systemPrompt },
          ...docHistoryTurns,
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
        max_tokens: 1000,
        temperature: 0.3,
      });

      const rawContent = completion.choices[0]?.message?.content;
      if (!rawContent) {
        return res.status(500).json({ error: "No response received from AI service." });
      }

      let parsedResponse: unknown;
      try {
        parsedResponse = JSON.parse(rawContent);
      } catch {
        return res.status(500).json({ error: "AI returned an invalid response format. Please try again." });
      }

      const validated = documentQAResponseSchema.safeParse(parsedResponse);
      if (!validated.success) {
        console.error("Document Q&A response validation error:", validated.error);
        return res.status(500).json({ error: "AI response structure was unexpected. Please try again." });
      }

      return res.json(validated.data);
    } catch (err: any) {
      console.error("Document Q&A error:", err);
      return res.status(500).json({ error: err.message || "Failed to get answer. Please try again." });
    }
  });

  /* ── Public Q&A SEO routes (no auth required) ─────────────────────────── */

  /**
   * GET /api/public-questions/:stateSlug
   * Returns up to 20 public questions for a given state.
   * Optional query param: ?topic=child-support
   */
  app.get("/api/public-questions/:stateSlug", async (req, res) => {
    try {
      const { stateSlug } = req.params;
      const topic = typeof req.query.topic === "string" ? req.query.topic : undefined;
      const limit = Math.min(Number(req.query.limit) || 20, 50);
      const questions = await getPublicQuestionsByState(stateSlug, topic, limit);
      return res.json({ questions, topicLabels: TOPIC_LABELS });
    } catch (err) {
      console.error("[public-questions] list error:", err);
      return res.status(500).json({ error: "Failed to fetch public questions." });
    }
  });

  /**
   * GET /api/public-questions/:stateSlug/:topic/:slug
   * Returns a single public Q&A page and related questions from same state/topic.
   */
  app.get("/api/public-questions/:stateSlug/:topic/:slug", async (req, res) => {
    try {
      const { stateSlug, topic, slug } = req.params;
      const question = await getPublicQuestionBySlug(stateSlug, topic, slug);
      if (!question) return res.status(404).json({ error: "Question not found." });
      const related = await getRelatedQuestions(stateSlug, topic, slug, 4);
      return res.json({ question, related, topicLabels: TOPIC_LABELS });
    } catch (err) {
      console.error("[public-questions] detail error:", err);
      return res.status(500).json({ error: "Failed to fetch question." });
    }
  });

  return httpServer;
}
