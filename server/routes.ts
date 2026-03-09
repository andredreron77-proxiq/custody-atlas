import type { Express } from "express";
import { createServer, type Server } from "http";
import { mkdirSync, unlinkSync, readFileSync } from "fs";
import { join } from "path";
import multer from "multer";
import OpenAI from "openai";
import { extractTextFromDocument } from "./documentai";
import { getCustodyLaw, listStates } from "./custody-laws-store";
import {
  geocodeByCoordinatesSchema,
  geocodeByZipSchema,
  askAIRequestSchema,
  aiLegalResponseSchema,
  documentAnalysisResultSchema,
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
  }

  if (!state || !county) return null;

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

  app.post("/api/ask", async (req, res) => {
    try {
      const parsed = askAIRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: "Invalid request",
          details: parsed.error.issues.map((i) => i.message),
        });
      }

      const { jurisdiction, legal_context, user_question } = parsed.data;

      if (!jurisdiction.state || !jurisdiction.county) {
        return res.status(400).json({ error: "Jurisdiction must include both state and county." });
      }

      const hasAI = process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
      if (!hasAI) {
        return res.status(503).json({
          error: "AI service not configured. Please connect an OpenAI integration.",
        });
      }

      const stateLaw = getCustodyLaw(jurisdiction.state);
      const isUnsupportedState = !stateLaw;

      const legalContextText = stateLaw
        ? `CUSTODY STANDARD:
${stateLaw.custody_standard}

CUSTODY TYPES:
${stateLaw.custody_types}

MODIFICATION RULES:
${stateLaw.modification_rules}

RELOCATION RULES:
${stateLaw.relocation_rules}

ENFORCEMENT OPTIONS:
${stateLaw.enforcement_options}

MEDIATION REQUIREMENTS:
${stateLaw.mediation_requirements}`
        : legal_context
          ? JSON.stringify(legal_context, null, 2)
          : `No specific custody law data is available for ${jurisdiction.state} in our database. Provide general US family law principles applicable to this state, and be clear that the user should verify with a local attorney.`;

      const systemPrompt = `You are a jurisdiction-aware legal information assistant that explains child custody law in plain English.

Rules:
- You are NOT a lawyer and must never claim to be one.
- Do NOT give definitive legal advice or tell users what they should do.
- Use the user's jurisdiction as the primary context for your response.
- Explain laws simply and clearly so a non-lawyer can understand.
- Be compassionate — custody matters are emotionally difficult.
- Always encourage consulting a licensed family law attorney.

You MUST respond with valid JSON in exactly this structure:
{
  "summary": "A 2-3 sentence plain-English summary directly answering the user's question",
  "key_points": ["Array of 3-5 specific, actionable key points relevant to the question"],
  "questions_to_ask_attorney": ["Array of 3-4 specific questions the user should ask their attorney"],
  "disclaimer": "A brief, compassionate reminder that this is general information only"
}`;

      const userPrompt = `USER CONTEXT:
State: ${jurisdiction.state}
County: ${jurisdiction.county}${isUnsupportedState ? "\n(Note: Limited state-specific data available — provide general applicable law)" : ""}

Relevant law data:
${legalContextText}

User question:
${user_question}`;

      const openai = getOpenAIClient();

      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
        max_tokens: 1200,
        temperature: 0.5,
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
        console.error("AI response failed schema validation:", validated.error);
        return res.status(500).json({ error: "AI response structure was unexpected. Please try again." });
      }

      return res.json(validated.data);
    } catch (err: any) {
      console.error("Ask AI error:", err);
      return res.status(500).json({ error: "Failed to get AI response. Please try again." });
    }
  });

  app.post("/api/analyze-document", upload.single("file"), async (req, res) => {
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

      const truncatedText = extractedText.slice(0, 12000);

      const systemPrompt = `You are an assistant that analyzes custody-related legal documents and explains them in plain English.

Rules:
- You are NOT a lawyer. Do not give legal advice.
- Explain legal terms in simple, accessible language.
- Be accurate and thorough in identifying key information.
- Always remind users to consult a licensed family law attorney.

You MUST respond with valid JSON in exactly this structure:
{
  "document_type": "The type of legal document (e.g., Custody Order, Parenting Plan, Visitation Agreement, Motion to Modify, etc.)",
  "summary": "A 2-4 sentence plain-English summary of what this document is and what it does",
  "important_terms": ["Array of 3-6 important legal terms or provisions found in the document with brief plain-English explanations"],
  "key_dates": ["Array of important dates mentioned in the document, or empty array if none found"],
  "possible_implications": ["Array of 3-5 plain-English explanations of what this document means for the parties involved"],
  "questions_to_ask_attorney": ["Array of 3-5 specific questions the user should ask their attorney about this document"]
}`;

      const userPrompt = `Analyze the following custody document text:\n\n${truncatedText}`;

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

      const validated = documentAnalysisResultSchema.safeParse(parsedResponse);
      if (!validated.success) {
        console.error("Document AI response validation error:", validated.error);
        return res.status(500).json({ error: "AI response structure was unexpected. Please try again." });
      }

      return res.json(validated.data);
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

  return httpServer;
}
