import { z } from "zod";

export const jurisdictionSchema = z.object({
  state: z.string(),
  county: z.string(),
  country: z.string().optional().default("United States"),
  formattedAddress: z.string().optional(),
});

export type Jurisdiction = z.infer<typeof jurisdictionSchema>;

export const geocodeByCoordinatesSchema = z.object({
  lat: z.number(),
  lng: z.number(),
});

export const geocodeByZipSchema = z.object({
  zipCode: z.string().min(5).max(10),
});

export const geocodeRequestSchema = z.union([
  geocodeByCoordinatesSchema,
  geocodeByZipSchema,
]);

export type GeocodeRequest = z.infer<typeof geocodeRequestSchema>;

export const custodyLawSchema = z.object({
  custodyStandard: z.string(),
  custodyTypes: z.string(),
  modificationRules: z.string(),
  relocationRules: z.string(),
  enforcementOptions: z.string(),
});

export type CustodyLaw = z.infer<typeof custodyLawSchema>;

export const askAIRequestSchema = z.object({
  jurisdiction: z.object({
    state: z.string().min(1, "State is required"),
    county: z.string().min(1, "County is required"),
    country: z.string().optional().default("United States"),
    formattedAddress: z.string().optional(),
  }),
  legal_context: z.record(z.unknown()).optional(),
  user_question: z.string().min(5, "Question must be at least 5 characters").max(2000),
});

export type AskAIRequest = z.infer<typeof askAIRequestSchema>;

export const aiLegalResponseSchema = z.object({
  summary: z.string(),
  key_points: z.array(z.string()),
  questions_to_ask_attorney: z.array(z.string()),
  disclaimer: z.string(),
});

export type AILegalResponse = z.infer<typeof aiLegalResponseSchema>;

export const chatMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string(),
  structured: aiLegalResponseSchema.optional(),
});

export type ChatMessage = z.infer<typeof chatMessageSchema>;

export const documentAnalysisResultSchema = z.object({
  document_type: z.string(),
  summary: z.string(),
  important_terms: z.array(z.string()),
  key_dates: z.array(z.string()),
  possible_implications: z.array(z.string()),
  questions_to_ask_attorney: z.array(z.string()),
});

export type DocumentAnalysisResult = z.infer<typeof documentAnalysisResultSchema>;
