import type { Express } from "express";
import { createServer, type Server } from "http";
import { readFileSync } from "fs";
import { join } from "path";
import { z } from "zod";
import { geocodeByCoordinatesSchema, geocodeByZipSchema, askAIRequestSchema, type CustodyLaw, type Jurisdiction } from "@shared/schema";

let custodyLaws: Record<string, CustodyLaw> = {};

try {
  const filePath = join(process.cwd(), "data", "custody_laws.json");
  custodyLaws = JSON.parse(readFileSync(filePath, "utf-8"));
} catch (err) {
  console.error("Failed to load custody_laws.json:", err);
}

async function geocodeWithGoogle(params: { lat: number; lng: number } | { address: string }): Promise<Jurisdiction | null> {
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

  if (data.status !== "OK" || !data.results || data.results.length === 0) {
    return null;
  }

  const result = data.results[0];
  const components = result.address_components as Array<{ long_name: string; short_name: string; types: string[] }>;

  let state = "";
  let county = "";
  let country = "";

  for (const component of components) {
    if (component.types.includes("administrative_area_level_1")) {
      state = component.long_name;
    }
    if (component.types.includes("administrative_area_level_2")) {
      county = component.long_name.replace(" County", "").replace(" Parish", "").replace(" Borough", "");
    }
    if (component.types.includes("country")) {
      country = component.long_name;
    }
  }

  if (!state || !county) {
    return null;
  }

  return {
    state,
    county,
    country,
    formattedAddress: result.formatted_address,
  };
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
        return res.status(404).json({ error: "Could not determine jurisdiction for these coordinates" });
      }

      return res.json(jurisdiction);
    } catch (err: any) {
      if (err.message?.includes("GOOGLE_MAPS_API_KEY")) {
        return res.status(503).json({ error: "Geocoding service not configured. Please add a Google Maps API key." });
      }
      console.error("Geocoding error:", err);
      return res.status(500).json({ error: "Geocoding failed" });
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
      console.error("Geocoding error:", err);
      return res.status(500).json({ error: "Geocoding failed" });
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
        return res.status(400).json({ error: "Invalid request", details: parsed.error.issues });
      }

      const { jurisdiction, question } = parsed.data;
      const law = custodyLaws[jurisdiction.state];

      const systemPrompt = `You are a knowledgeable legal assistant specializing in child custody law. You provide plain-English explanations of custody laws based on the user's jurisdiction. You are NOT a lawyer and your responses are for informational purposes only and do not constitute legal advice.

The user is located in ${jurisdiction.county} County, ${jurisdiction.state}, ${jurisdiction.country}.

${law ? `Here is the relevant custody law information for ${jurisdiction.state}:

CUSTODY STANDARD: ${law.custodyStandard}

CUSTODY TYPES: ${law.custodyTypes}

MODIFICATION RULES: ${law.modificationRules}

RELOCATION RULES: ${law.relocationRules}

ENFORCEMENT OPTIONS: ${law.enforcementOptions}` : `Note: We don't have specific custody law data for ${jurisdiction.state}. Please provide general information and recommend consulting a local family law attorney.`}

Always:
1. Answer in plain English that a non-lawyer can understand
2. Reference the specific state laws when answering
3. Remind users to consult with a licensed family law attorney for advice specific to their situation
4. Be compassionate and supportive, as custody matters are often emotionally difficult
5. Keep responses focused and concise (2-4 paragraphs)`;

      const openaiApiKey = process.env.OPENAI_API_KEY;
      const replitConnectorHost = process.env.REPLIT_CONNECTORS_HOSTNAME;

      let apiUrl: string;
      let headers: Record<string, string>;

      if (replitConnectorHost) {
        apiUrl = `https://${replitConnectorHost}/openai/v1/chat/completions`;
        const replIdentity = process.env.REPL_IDENTITY || "";
        const webReplRenewal = process.env.WEB_REPL_RENEWAL || "";
        headers = {
          "Content-Type": "application/json",
          "X-Replit-Identity": replIdentity,
          "X-Replit-Renewal": webReplRenewal,
        };
      } else if (openaiApiKey) {
        apiUrl = "https://api.openai.com/v1/chat/completions";
        headers = {
          "Content-Type": "application/json",
          Authorization: `Bearer ${openaiApiKey}`,
        };
      } else {
        return res.status(503).json({ error: "AI service not configured. Please connect the OpenAI integration or provide an API key." });
      }

      const aiResponse = await fetch(apiUrl, {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: "gpt-4o",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: question },
          ],
          max_tokens: 1000,
          temperature: 0.7,
        }),
      });

      if (!aiResponse.ok) {
        const errText = await aiResponse.text();
        console.error("OpenAI API error:", errText);
        return res.status(500).json({ error: "AI response failed. Please try again." });
      }

      const aiData = await aiResponse.json() as any;
      const answer = aiData.choices?.[0]?.message?.content;

      if (!answer) {
        return res.status(500).json({ error: "No response received from AI service." });
      }

      return res.json({ answer });
    } catch (err) {
      console.error("Ask AI error:", err);
      return res.status(500).json({ error: "Failed to get AI response" });
    }
  });

  return httpServer;
}
