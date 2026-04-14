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
