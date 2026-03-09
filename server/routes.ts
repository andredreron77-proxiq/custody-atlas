import type { Express } from "express";
import { createServer, type Server } from "http";
import { readFileSync } from "fs";
import { join } from "path";
import OpenAI from "openai";
import {
  geocodeByCoordinatesSchema,
  geocodeByZipSchema,
  askAIRequestSchema,
  aiLegalResponseSchema,
  type CustodyLaw,
  type Jurisdiction,
} from "@shared/schema";

let custodyLaws: Record<string, CustodyLaw> = {};

try {
  const filePath = join(process.cwd(), "data", "custody_laws.json");
  custodyLaws = JSON.parse(readFileSync(filePath, "utf-8"));
} catch (err) {
  console.error("Failed to load custody_laws.json:", err);
}

function getOpenAIClient(): OpenAI {
  return new OpenAI({
    apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY,
    baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || undefined,
  });
}

async function geocodeWithGoogle(
  params: { lat: number; lng: number } | { address: string }
): Promise<Jurisdiction | null> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    throw new Error("GOOGLE_MAPS_API_KEY is not configured");
  }

  let url: string;
  if ("lat" in params) {
    url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${params.lat},${params.lng}&key=${apiKey}`;
  } else {
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

  return { state, county, country, formattedAddress: result.formatted_address };
}

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
    const law = custodyLaws[stateName];

    if (!law) {
      return res.status(404).json({
        error: `No custody law data available for ${stateName}`,
        availableStates: Object.keys(custodyLaws),
      });
    }

    return res.json(law);
  });

  app.get("/api/custody-laws", (_req, res) => {
    return res.json({ states: Object.keys(custodyLaws).sort() });
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

      const stateLaw = custodyLaws[jurisdiction.state];
      const isUnsupportedState = !stateLaw;

      const legalContextText = stateLaw
        ? `CUSTODY STANDARD:
${stateLaw.custodyStandard}

CUSTODY TYPES:
${stateLaw.custodyTypes}

MODIFICATION RULES:
${stateLaw.modificationRules}

RELOCATION RULES:
${stateLaw.relocationRules}

ENFORCEMENT OPTIONS:
${stateLaw.enforcementOptions}`
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

  return httpServer;
}
