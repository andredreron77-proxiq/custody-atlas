import OpenAI from "openai";
import { z } from "zod";
import { supabaseAdmin } from "../lib/supabaseAdmin";

const RESOURCE_TAGS = [
  "free",
  "income-qualified",
  "in-person",
  "remote",
  "government",
  "family-law",
  "custody-specialist",
] as const;

const resourceItemSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  url: z.string().url(),
  phone: z.string().optional(),
  tags: z.array(z.enum(RESOURCE_TAGS)).max(6),
});

export const resourcesResponseSchema = z.object({
  legal_aid: z.array(resourceItemSchema).max(4),
  government_resources: z.array(resourceItemSchema).max(4),
  court_self_help: z.array(resourceItemSchema).max(4),
  mediation: z.array(resourceItemSchema).max(4),
});

export type ResourceItem = z.infer<typeof resourceItemSchema>;
export type ResourcesResponse = z.infer<typeof resourcesResponseSchema>;

const EMPTY_RESOURCES_RESPONSE: ResourcesResponse = {
  legal_aid: [],
  government_resources: [],
  court_self_help: [],
  mediation: [],
};

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function getEmptyResourcesResponse(): ResourcesResponse {
  return EMPTY_RESOURCES_RESPONSE;
}

function buildResourcesPrompt(params: { state: string; county: string }): string {
  return [
    "You are a legal aid resource specialist. Return ONLY a valid JSON object with no preamble.",
    "Find real, currently operating legal aid organizations, court self-help centers, and mediation services",
    "for the specified US state and county. Only include organizations you are confident exist.",
    "Never invent organizations. If unsure, return fewer results rather than guessing.",
    "",
    "For government_resources: include the state child support enforcement agency,",
    "Department of Human Services or equivalent state agency, CASA (Court Appointed",
    "Special Advocates) program if present in the county, state bar lawyer referral",
    "service, family court facilitator or self-help coordinator office, and any",
    "state-funded mediation programs run through the court system. These must be",
    "government or government-funded entities. Include phone numbers prominently —",
    "these offices are often more reachable by phone than online.",
    "",
    "Return this exact shape:",
    "{",
    '  "legal_aid": [{ "name": string, "description": string, "url": string, "phone"?: string, "tags": string[] }],',
    '  "government_resources": [{ "name": string, "description": string, "url": string, "phone": string, "tags": string[] }],',
    '  "court_self_help": [{ "name": string, "description": string, "url": string, "phone"?: string, "tags": string[] }],',
    '  "mediation": [{ "name": string, "description": string, "url": string, "phone"?: string, "tags": string[] }]',
    "}",
    "",
    "tags must be from: free, income-qualified, in-person, remote, government, family-law, custody-specialist",
    "Maximum 4 results per category.",
    "",
    `State: ${params.state}`,
    `County: ${params.county}`,
  ].join("\n");
}

function normalizeLookupValue(value: string): string {
  return value.trim().toLowerCase();
}

function sanitizeItem(item: ResourceItem): ResourceItem {
  return {
    name: item.name.trim(),
    description: item.description.trim(),
    url: item.url.trim(),
    phone: item.phone?.trim() || undefined,
    tags: Array.from(new Set(item.tags)).slice(0, 6),
  };
}

export function normalizeResourcesResponse(input: unknown): ResourcesResponse {
  const parsed = resourcesResponseSchema.parse(input);
  return {
    legal_aid: parsed.legal_aid.map(sanitizeItem),
    government_resources: parsed.government_resources.map(sanitizeItem),
    court_self_help: parsed.court_self_help.map(sanitizeItem),
    mediation: parsed.mediation.map(sanitizeItem),
  };
}

export async function generateResourcesForJurisdiction(
  state: string,
  county: string,
): Promise<ResourcesResponse | null> {
  const hasAI = process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
  if (!hasAI) {
    return null;
  }

  const openai = new OpenAI({
    apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY,
    baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || undefined,
  });

  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content: buildResourcesPrompt({ state, county }),
      },
    ],
    response_format: { type: "json_object" },
    max_tokens: 1200,
    temperature: 0.2,
  });

  const rawContent = completion.choices[0]?.message?.content;
  if (!rawContent) {
    return null;
  }

  let parsedResponse: unknown;
  try {
    parsedResponse = JSON.parse(rawContent);
  } catch {
    console.error("[resources] OpenAI returned invalid JSON.");
    return null;
  }

  try {
    return normalizeResourcesResponse(parsedResponse);
  } catch (error) {
    console.error("[resources] OpenAI resources validation failed:", error);
    return null;
  }
}

export async function getCachedResources(
  state: string,
  county: string,
): Promise<ResourcesResponse | null> {
  if (!supabaseAdmin) return null;

  const normalizedState = normalizeLookupValue(state);
  const normalizedCounty = normalizeLookupValue(county);

  const { data, error } = await supabaseAdmin
    .from("resources_cache")
    .select("response_json, created_at")
    .eq("state_normalized", normalizedState)
    .eq("county_normalized", normalizedCounty)
    .maybeSingle();

  if (error || !data?.response_json || !data.created_at) {
    return null;
  }

  const ageMs = Date.now() - new Date(data.created_at).getTime();
  if (Number.isNaN(ageMs) || ageMs > CACHE_TTL_MS) {
    return null;
  }

  try {
    return normalizeResourcesResponse(data.response_json);
  } catch {
    return null;
  }
}

export async function cacheResources(
  state: string,
  county: string,
  response: ResourcesResponse,
): Promise<void> {
  if (!supabaseAdmin) return;

  const normalizedState = normalizeLookupValue(state);
  const normalizedCounty = normalizeLookupValue(county);

  await supabaseAdmin
    .from("resources_cache")
    .upsert({
      state,
      county,
      state_normalized: normalizedState,
      county_normalized: normalizedCounty,
      response_json: response,
      created_at: new Date().toISOString(),
    }, {
      onConflict: "state_normalized,county_normalized",
    });
}

export async function addAttorneyWaitlistEntry(params: {
  userId: string;
  email: string;
  state: string;
  county: string;
}): Promise<void> {
  if (!supabaseAdmin) {
    throw new Error("Supabase admin client is not configured.");
  }

  const { error } = await supabaseAdmin
    .from("attorney_waitlist")
    .upsert({
      user_id: params.userId,
      email: params.email,
      state: params.state,
      county: params.county,
      created_at: new Date().toISOString(),
    }, {
      onConflict: "user_id,state,county",
      ignoreDuplicates: false,
    });

  if (error) {
    throw new Error(error.message || "Failed to save waitlist entry.");
  }
}
