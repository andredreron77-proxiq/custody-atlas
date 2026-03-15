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
 * CustodyLawRecord — the canonical shape of one STATE's custody law dataset.
 *
 * These fields represent LEGAL RULES set by state statute and case law.
 * They apply uniformly across every county in the state (though local
 * courts may have procedural variations captured in CountyProcedureRecord).
 *
 * snake_case field names match the JSON file and any future DB column names.
 */
export const custodyLawSchema = z.object({
  state_code: z.string().length(2),

  /** 1–2 sentence plain-English overview of the state's custody framework. */
  quick_summary: z.string().optional(),

  /** The legal standard the court applies when making custody decisions (e.g. "best interests"). */
  custody_standard: z.string(),

  /** Types of legal and physical custody recognised in this state. */
  custody_types: z.string(),

  /** Rules governing when and how a custody order can be changed after it is entered. */
  modification_rules: z.string(),

  /** Rules a parent must follow before moving away with a child. */
  relocation_rules: z.string(),

  /** Mechanisms available to enforce an existing custody order. */
  enforcement_options: z.string(),

  /**
   * State-level mediation rules (mandatory vs encouraged; who pays; confidentiality).
   * Note: individual counties may impose additional local mediation requirements —
   * those belong in CountyProcedureRecord.mediation_notes.
   */
  mediation_requirements: z.string(),

  /**
   * The age (if codified by statute) at which a child's preference is formally
   * considered by the court.  Many states leave this to judicial discretion;
   * populate this field only when a specific age is written into law.
   */
  child_preference_age: z.string().optional(),

  /**
   * The default parenting-time model used by courts in the absence of agreement
   * (e.g. "equal 50/50 parenting time" in Arizona, "primary/secondary" elsewhere).
   * Only populate when the state has a well-defined statutory or judicial default.
   */
  default_parenting_model: z.string().optional(),
});

export type CustodyLawRecord = z.infer<typeof custodyLawSchema>;

/** @deprecated Use CustodyLawRecord */
export type CustodyLaw = CustodyLawRecord;

/**
 * CountyProcedureRecord — local court procedural information for a specific county.
 *
 * These fields represent HOW TO NAVIGATE a local court — operational details
 * that may vary county-by-county even within the same state.  They complement
 * but do NOT replace the state-level CustodyLawRecord.
 *
 * A county record is OPTIONAL.  When absent, the app falls back gracefully to
 * state-level law only — no county-specific section is shown.
 */
export const countyProcedureSchema = z.object({
  state: z.string(),
  county: z.string(),

  /** Official name of the court that handles family/custody matters in this county. */
  court_name: z.string().optional(),

  /** URL to the court's online filing portal or self-help centre. */
  filing_link: z.string().url().optional(),

  /**
   * Any county-specific mediation program details that go beyond the state mandate
   * (e.g. "Mandatory Mediation Program run by the Conciliation Court — first session free").
   */
  mediation_notes: z.string().optional(),

  /** Whether a parenting education or co-parenting class is required before hearing. */
  parenting_class_required: z.boolean().optional(),

  /** Name or description of the required parenting class programme, if any. */
  parenting_class_name: z.string().optional(),

  /**
   * Free-form notes about local practice in this county
   * (e.g. "judges strongly prefer parenting plans submitted jointly").
   */
  local_procedure_notes: z.string().optional(),

  /** Links to local legal aid, self-help centre, or bar-referral resources. */
  local_resources: z.array(z.object({
    label: z.string(),
    url: z.string().url(),
  })).optional(),
});

export type CountyProcedureRecord = z.infer<typeof countyProcedureSchema>;

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
