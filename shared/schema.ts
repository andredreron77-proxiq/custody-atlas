import { z } from "zod";

export const jurisdictionSchema = z.object({
  state: z.string(),
  county: z.string(),
  country: z.string().optional().default("United States"),
  formattedAddress: z.string().optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
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

/**
 * CustodyLawRecord — the canonical shape of one state's custody law dataset.
 * snake_case field names match the JSON file and any future DB column names.
 */
export const custodyLawSchema = z.object({
  state_code: z.string().length(2),
  custody_standard: z.string(),
  custody_types: z.string(),
  modification_rules: z.string(),
  relocation_rules: z.string(),
  enforcement_options: z.string(),
  mediation_requirements: z.string(),
});

export type CustodyLawRecord = z.infer<typeof custodyLawSchema>;

/** @deprecated Use CustodyLawRecord */
export type CustodyLaw = CustodyLawRecord;

export const askAIRequestSchema = z.object({
  jurisdiction: z.object({
    state: z.string().min(1, "State is required"),
    county: z.string().min(1, "County is required"),
    country: z.string().optional().default("United States"),
    formattedAddress: z.string().optional(),
  }),
  legalContext: z.record(z.unknown()).optional(),
  userQuestion: z.string().min(5, "Question must be at least 5 characters").max(2000),
});

export type AskAIRequest = z.infer<typeof askAIRequestSchema>;

export const aiLegalResponseSchema = z.object({
  summary: z.string(),
  key_points: z.array(z.string()),
  questions_to_ask_attorney: z.array(z.string()),
  cautions: z.array(z.string()),
  disclaimer: z.string(),
});

export type AILegalResponse = z.infer<typeof aiLegalResponseSchema>;

export const chatMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string(),
  structured: aiLegalResponseSchema.optional(),
});

export type ChatMessage = z.infer<typeof chatMessageSchema>;

/**
 * documentAnalysisResultSchema — what the AI returns when a document is analyzed.
 * extractedText is NOT from the AI; it is appended by the server after validation
 * so the client can use it for follow-up Q&A without re-uploading.
 */
export const documentAnalysisResultSchema = z.object({
  document_type: z.string(),
  summary: z.string(),
  important_terms: z.array(z.string()),
  key_dates: z.array(z.string()),
  possible_implications: z.array(z.string()),
  questions_to_ask_attorney: z.array(z.string()),
  /** Appended by the server — the OCR-extracted raw text for follow-up Q&A */
  extractedText: z.string().optional(),
});

export type DocumentAnalysisResult = z.infer<typeof documentAnalysisResultSchema>;

/**
 * Document follow-up Q&A — request / response types.
 */
export const documentQARequestSchema = z.object({
  documentAnalysis: documentAnalysisResultSchema,
  extractedText: z.string().optional(),
  jurisdiction: z.object({
    state: z.string(),
    county: z.string().optional(),
    country: z.string().optional().default("United States"),
  }).optional(),
  userQuestion: z.string().min(3, "Question must be at least 3 characters").max(2000),
});

export type DocumentQARequest = z.infer<typeof documentQARequestSchema>;

export const documentQAResponseSchema = z.object({
  answer: z.string(),
  keyPoints: z.array(z.string()),
  documentReferences: z.array(z.string()),
  questionsToAskAttorney: z.array(z.string()),
  caution: z.string(),
  disclaimer: z.string(),
});

export type DocumentQAResponse = z.infer<typeof documentQAResponseSchema>;
