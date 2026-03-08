import { z } from "zod";

export const jurisdictionSchema = z.object({
  state: z.string(),
  county: z.string(),
  country: z.string(),
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
  jurisdiction: jurisdictionSchema,
  question: z.string().min(5).max(2000),
});

export type AskAIRequest = z.infer<typeof askAIRequestSchema>;

export const chatMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string(),
});

export type ChatMessage = z.infer<typeof chatMessageSchema>;
