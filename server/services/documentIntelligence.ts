import { supabaseAdmin } from "../lib/supabaseAdmin";

export interface PersistAnalysisRunInput {
  documentId: string;
  userId: string;
  caseId?: string | null;
  modelName: string;
  promptVersion: string;
  analysisJson: Record<string, unknown>;
  extractedText: string;
  retentionTier: "free" | "pro" | "attorney_firm";
  expiresAt: string;
}

export interface PersistChunkInput {
  documentId: string;
  userId: string;
  caseId?: string | null;
  chunkIndex: number;
  chunkText: string;
  tokenEstimate: number;
  retentionTier: "free" | "pro" | "attorney_firm";
  expiresAt: string;
}

const MAX_CHUNK_CHARS = 1800;
const OVERLAP_CHARS = 180;

export function buildChunks(text: string): PersistChunkInput[] {
  const clean = text.trim();
  if (!clean) return [];

  const chunks: PersistChunkInput[] = [];
  let idx = 0;
  let cursor = 0;
  while (cursor < clean.length) {
    const end = Math.min(cursor + MAX_CHUNK_CHARS, clean.length);
    const chunkText = clean.slice(cursor, end).trim();
    if (chunkText) {
      chunks.push({
        documentId: "",
        userId: "",
        caseId: null,
        chunkIndex: idx,
        chunkText,
        tokenEstimate: Math.ceil(chunkText.length / 4),
        retentionTier: "free",
        expiresAt: new Date().toISOString(),
      });
      idx += 1;
    }
    if (end >= clean.length) break;
    cursor = Math.max(end - OVERLAP_CHARS, cursor + 1);
  }

  return chunks;
}

export async function createAnalysisRun(input: PersistAnalysisRunInput): Promise<string | null> {
  if (!supabaseAdmin) return null;

  try {
    const { data, error } = await supabaseAdmin
      .from("document_analysis_runs")
      .insert({
        document_id: input.documentId,
        user_id: input.userId,
        case_id: input.caseId ?? null,
        model_name: input.modelName,
        prompt_version: input.promptVersion,
        analysis_json: input.analysisJson,
        extracted_text_snapshot: input.extractedText,
        status: "completed",
        retention_tier: input.retentionTier,
        expires_at: input.expiresAt,
      })
      .select("id")
      .single();

    if (error) {
      console.error("[documentIntelligence] createAnalysisRun error:", error.message);
      return null;
    }
    return (data as any)?.id ?? null;
  } catch (err) {
    console.error("[documentIntelligence] createAnalysisRun exception:", err);
    return null;
  }
}

export async function replaceDocumentChunks(chunks: PersistChunkInput[]): Promise<number> {
  if (!supabaseAdmin || chunks.length === 0) return 0;

  const head = chunks[0];
  try {
    await supabaseAdmin
      .from("document_chunks")
      .delete()
      .eq("document_id", head.documentId)
      .eq("user_id", head.userId);

    const payload = chunks.map((chunk) => ({
      document_id: chunk.documentId,
      user_id: chunk.userId,
      case_id: chunk.caseId ?? null,
      chunk_index: chunk.chunkIndex,
      chunk_text: chunk.chunkText,
      token_estimate: chunk.tokenEstimate,
      retention_tier: chunk.retentionTier,
      expires_at: chunk.expiresAt,
    }));

    const { error } = await supabaseAdmin.from("document_chunks").insert(payload);
    if (error) {
      console.error("[documentIntelligence] replaceDocumentChunks error:", error.message);
      return 0;
    }
    return payload.length;
  } catch (err) {
    console.error("[documentIntelligence] replaceDocumentChunks exception:", err);
    return 0;
  }
}

export async function replaceDocumentFacts(params: {
  documentId: string;
  userId: string;
  caseId?: string | null;
  extractedFacts: Record<string, unknown>;
  retentionTier: "free" | "pro" | "attorney_firm";
  expiresAt: string;
}): Promise<number> {
  if (!supabaseAdmin) return 0;

  try {
    await supabaseAdmin
      .from("document_facts")
      .delete()
      .eq("document_id", params.documentId)
      .eq("user_id", params.userId);

    const normalized = Object.entries(params.extractedFacts)
      .filter(([, value]) => typeof value === "string" && value.trim().length > 0)
      .map(([factType, value]) => ({
        document_id: params.documentId,
        user_id: params.userId,
        case_id: params.caseId ?? null,
        fact_type: factType,
        fact_value: String(value).trim(),
        confidence: "high",
        source: "analysis",
        retention_tier: params.retentionTier,
        expires_at: params.expiresAt,
      }));

    if (normalized.length === 0) return 0;

    const { error } = await supabaseAdmin.from("document_facts").insert(normalized);
    if (error) {
      console.error("[documentIntelligence] replaceDocumentFacts error:", error.message);
      return 0;
    }
    return normalized.length;
  } catch (err) {
    console.error("[documentIntelligence] replaceDocumentFacts exception:", err);
    return 0;
  }
}

export async function replaceDocumentDates(params: {
  documentId: string;
  userId: string;
  caseId?: string | null;
  keyDates: string[];
  retentionTier: "free" | "pro" | "attorney_firm";
  expiresAt: string;
}): Promise<number> {
  if (!supabaseAdmin) return 0;

  try {
    await supabaseAdmin
      .from("document_dates")
      .delete()
      .eq("document_id", params.documentId)
      .eq("user_id", params.userId);

    const payload = params.keyDates
      .filter((value) => typeof value === "string" && value.trim().length > 0)
      .map((value) => ({
        document_id: params.documentId,
        user_id: params.userId,
        case_id: params.caseId ?? null,
        date_label: value.trim(),
        source: "analysis",
        retention_tier: params.retentionTier,
        expires_at: params.expiresAt,
      }));

    if (payload.length === 0) return 0;

    const { error } = await supabaseAdmin.from("document_dates").insert(payload);
    if (error) {
      console.error("[documentIntelligence] replaceDocumentDates error:", error.message);
      return 0;
    }
    return payload.length;
  } catch (err) {
    console.error("[documentIntelligence] replaceDocumentDates exception:", err);
    return 0;
  }
}

export async function getDocumentIntelligenceChunks(params: {
  userId: string;
  documentIds: string[];
  maxChunks?: number;
}): Promise<Array<{ documentId: string; chunkText: string; chunkIndex: number }>> {
  if (!supabaseAdmin || params.documentIds.length === 0) return [];

  const maxChunks = params.maxChunks ?? 16;
  try {
    const { data, error } = await supabaseAdmin
      .from("document_chunks")
      .select("document_id,chunk_text,chunk_index")
      .eq("user_id", params.userId)
      .in("document_id", params.documentIds)
      .order("chunk_index", { ascending: true })
      .limit(maxChunks);

    if (error || !data) return [];

    return data.map((row: any) => ({
      documentId: row.document_id,
      chunkText: row.chunk_text,
      chunkIndex: row.chunk_index ?? 0,
    }));
  } catch (err) {
    console.error("[documentIntelligence] getDocumentIntelligenceChunks exception:", err);
    return [];
  }
}
