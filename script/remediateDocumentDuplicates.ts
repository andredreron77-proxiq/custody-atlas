import { supabaseAdmin } from "../server/lib/supabaseAdmin";
import { pathToFileURL } from "node:url";

export type DocRow = {
  id: string;
  user_id: string;
  case_id: string | null;
  file_name: string;
  normalized_filename: string | null;
  mime_type: string | null;
  created_at: string;
  updated_at: string;
  analysis_json: Record<string, unknown> | null;
  file_hash: string | null;
  source_file_sha256: string | null;
  intake_text_hash: string | null;
  intake_text_preview: string | null;
  extracted_text: string | null;
  file_size_bytes: number | null;
  duplicate_of_document_id: string | null;
};

type GroupReason =
  | "file_hash_exact"
  | "intake_text_hash_exact"
  | "filename_exact_fallback"
  | "filename_mime_text_similarity"
  | "filename_legacy_batch_semantic_similarity";

type DuplicateGroup = {
  canonical: DocRow;
  duplicates: DocRow[];
  reason: GroupReason;
  confidence: number;
};

function normalizeText(text: string): string {
  return String(text ?? "")
    .toLowerCase()
    .replace(/\r\n/g, "\n")
    .replace(/[^a-z0-9\s:/.-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeFileName(name: string): string {
  return String(name ?? "")
    .trim()
    .toLowerCase()
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function fileExtension(name: string): string {
  const clean = String(name ?? "").trim().toLowerCase();
  const match = clean.match(/\.([a-z0-9]+)$/);
  return match ? match[1] : "";
}

function mimeFamily(value: string | null): string {
  const mime = (value || "").trim().toLowerCase();
  if (!mime) return "unknown";
  if (mime.startsWith("application/pdf")) return "pdf";
  if (mime.includes("wordprocessingml") || mime.includes("msword")) return "word";
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("text/")) return "text";
  if (mime.includes("officedocument")) return "office";
  return mime.split("/")[0] || mime;
}

function textTokenSet(text: string): Set<string> {
  return new Set(
    normalizeText(text)
      .split(/\s+/)
      .map((t) => t.trim())
      .filter((t) => t.length >= 4)
      .slice(0, 600),
  );
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  const intersection = Array.from(a).filter((token) => b.has(token)).length;
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function summarySignature(doc: DocRow): string {
  const summary = typeof doc.analysis_json?.summary === "string" ? String(doc.analysis_json.summary) : "";
  return normalizeText(summary).slice(0, 500);
}

function previewSignature(doc: DocRow): string {
  if (typeof doc.intake_text_preview === "string" && doc.intake_text_preview.trim().length > 0) {
    return normalizeText(doc.intake_text_preview).slice(0, 500);
  }
  if (typeof doc.extracted_text === "string" && doc.extracted_text.trim().length > 0) {
    return normalizeText(doc.extracted_text).slice(0, 500);
  }
  return summarySignature(doc);
}

function strongTextSimilarity(a: DocRow, b: DocRow): number {
  const aTokens = textTokenSet(previewSignature(a));
  const bTokens = textTokenSet(previewSignature(b));
  return jaccardSimilarity(aTokens, bTokens);
}

function extensionCompatible(a: DocRow, b: DocRow): boolean {
  const extA = fileExtension(a.file_name);
  const extB = fileExtension(b.file_name);
  if (extA && extB) return extA === extB;
  return true;
}

function withinLegacyBatchWindow(a: DocRow, b: DocRow): boolean {
  const aTime = new Date(a.created_at).getTime();
  const bTime = new Date(b.created_at).getTime();
  if (!Number.isFinite(aTime) || !Number.isFinite(bTime)) return false;
  const diffMs = Math.abs(aTime - bTime);
  return diffMs <= 3 * 60 * 60 * 1000;
}

function qualityScore(doc: DocRow): number {
  const hasSummary = typeof doc.analysis_json?.summary === "string" && doc.analysis_json.summary.length > 0;
  const hasFacts = Boolean(doc.analysis_json?.extracted_facts);
  const hasFileHash = Boolean((doc.file_hash || doc.source_file_sha256 || "").trim());
  const hasIntakeHash = Boolean((doc.intake_text_hash || "").trim());
  return (hasSummary ? 20 : 0) + (hasFacts ? 20 : 0) + (doc.case_id ? 15 : 0) + (hasFileHash ? 10 : 0) + (hasIntakeHash ? 10 : 0);
}

function pickCanonical(docs: DocRow[]): DocRow {
  return [...docs].sort((a, b) => {
    const score = qualityScore(b) - qualityScore(a);
    if (score !== 0) return score;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  })[0];
}

export function buildDuplicateGroups(docs: DocRow[]): { groups: DuplicateGroup[]; byUser: Map<string, DocRow[]> } {
  const unresolved = docs.filter((d) => !d.duplicate_of_document_id);
  const byUser = new Map<string, DocRow[]>();
  for (const doc of unresolved) {
    const arr = byUser.get(doc.user_id) ?? [];
    arr.push(doc);
    byUser.set(doc.user_id, arr);
  }

  const groups: DuplicateGroup[] = [];
  for (const [, userDocs] of byUser) {
    const assigned = new Set<string>();
    const byFileHash = new Map<string, DocRow[]>();
    const byIntakeHash = new Map<string, DocRow[]>();

    for (const doc of userDocs) {
      const fileHash = (doc.file_hash || doc.source_file_sha256 || "").trim().toLowerCase();
      if (fileHash) {
        const arr = byFileHash.get(fileHash) ?? [];
        arr.push(doc);
        byFileHash.set(fileHash, arr);
      }
      const textHash = (doc.intake_text_hash || "").trim().toLowerCase();
      if (textHash) {
        const arr = byIntakeHash.get(textHash) ?? [];
        arr.push(doc);
        byIntakeHash.set(textHash, arr);
      }
    }

    for (const [, grouped] of byFileHash) {
      if (grouped.length < 2) continue;
      const canonical = pickCanonical(grouped);
      const duplicates = grouped.filter((d) => d.id !== canonical.id && !assigned.has(d.id));
      if (duplicates.length === 0) continue;
      groups.push({ canonical, duplicates, reason: "file_hash_exact", confidence: 1 });
      assigned.add(canonical.id);
      for (const dup of duplicates) assigned.add(dup.id);
    }

    for (const [, grouped] of byIntakeHash) {
      const candidates = grouped.filter((d) => !assigned.has(d.id));
      if (candidates.length < 2) continue;
      const canonical = pickCanonical(candidates);
      const duplicates = candidates.filter((d) => d.id !== canonical.id);
      if (duplicates.length === 0) continue;
      groups.push({ canonical, duplicates, reason: "intake_text_hash_exact", confidence: 0.98 });
      assigned.add(canonical.id);
      for (const dup of duplicates) assigned.add(dup.id);
    }

    const fallbackCandidates = userDocs.filter((d) => !assigned.has(d.id));
    const byName = new Map<string, DocRow[]>();
    for (const doc of fallbackCandidates) {
      const normalizedName = (doc.normalized_filename || "").trim() || normalizeFileName(doc.file_name);
      if (!normalizedName) continue;
      const key = `${normalizedName}`;
      const arr = byName.get(key) ?? [];
      arr.push(doc);
      byName.set(key, arr);
    }

    for (const [, grouped] of byName) {
      if (grouped.length < 2) continue;
      const pending = [...grouped].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      const consumed = new Set<string>();
      for (let i = 0; i < pending.length; i++) {
        const seed = pending[i];
        if (consumed.has(seed.id)) continue;
        const cluster = [seed];
        for (let j = i + 1; j < pending.length; j++) {
          const candidate = pending[j];
          if (consumed.has(candidate.id)) continue;
          if (!extensionCompatible(seed, candidate)) continue;
          const similarity = strongTextSimilarity(seed, candidate);
          const summaryMatch =
            summarySignature(seed).length > 20 &&
            summarySignature(seed) === summarySignature(candidate);
          const sameSize =
            seed.file_size_bytes != null &&
            candidate.file_size_bytes != null &&
            Math.abs(seed.file_size_bytes - candidate.file_size_bytes) <= 64;
          const sameMimeFamily = mimeFamily(seed.mime_type) === mimeFamily(candidate.mime_type);
          const inLegacyBatch = withinLegacyBatchWindow(seed, candidate);
          const bothMissingIdentityHashes =
            !(seed.file_hash || seed.source_file_sha256 || "").trim() &&
            !(candidate.file_hash || candidate.source_file_sha256 || "").trim() &&
            !(seed.intake_text_hash || "").trim() &&
            !(candidate.intake_text_hash || "").trim();
          const fallbackEligible =
            sameMimeFamily ||
            summaryMatch ||
            similarity >= 0.65 ||
            inLegacyBatch;
          if (bothMissingIdentityHashes && fallbackEligible) {
            cluster.push(candidate);
            continue;
          }
          if (sameMimeFamily && (similarity >= 0.72 || (summaryMatch && sameSize))) {
            cluster.push(candidate);
          } else if (inLegacyBatch && similarity >= 0.7 && (summaryMatch || sameSize)) {
            cluster.push(candidate);
          }
        }
        if (cluster.length < 2) continue;
        const canonical = pickCanonical(cluster);
        const duplicates = cluster.filter((d) => d.id !== canonical.id);
        const minSim = Math.min(...duplicates.map((d) => strongTextSimilarity(seed, d)));
        const batchHeuristicUsed = duplicates.some((d) => withinLegacyBatchWindow(seed, d));
        const allMissingIdentityHashes = [seed, ...duplicates].every(
          (d) => !(d.file_hash || d.source_file_sha256 || "").trim() && !(d.intake_text_hash || "").trim(),
        );
        const reason: GroupReason =
          allMissingIdentityHashes
            ? "filename_exact_fallback"
            : minSim >= 0.72 && !batchHeuristicUsed
            ? "filename_mime_text_similarity"
            : "filename_legacy_batch_semantic_similarity";
        const confidence = allMissingIdentityHashes ? 0.84 : minSim >= 0.72 && !batchHeuristicUsed ? 0.91 : 0.87;
        groups.push({ canonical, duplicates, reason, confidence });
        for (const doc of cluster) {
          consumed.add(doc.id);
          assigned.add(doc.id);
        }
      }
    }
  }
  return { groups, byUser };
}

async function repointDocumentId(table: string, canonicalId: string, duplicateId: string) {
  if (!supabaseAdmin) return;
  const { error } = await supabaseAdmin
    .from(table)
    .update({ document_id: canonicalId })
    .eq("document_id", duplicateId);
  if (error) console.warn(`[dedupe-remediation] repoint failed table=${table}:`, error.message);
}

async function repointCaseFactSource(canonicalId: string, duplicateId: string) {
  if (!supabaseAdmin) return;
  const { error } = await supabaseAdmin
    .from("case_facts")
    .update({ source: canonicalId })
    .eq("source", duplicateId);
  if (error) console.warn("[dedupe-remediation] case_facts source repoint failed:", error.message);
}

async function run() {
  const apply = process.argv.includes("--apply");
  if (!supabaseAdmin) {
    console.error("SUPABASE credentials are required.");
    process.exit(1);
  }

  const { data, error } = await supabaseAdmin
    .from("documents")
    .select("id,user_id,case_id,file_name,normalized_filename,mime_type,created_at,updated_at,analysis_json,file_hash,source_file_sha256,intake_text_hash,intake_text_preview,extracted_text,file_size_bytes,duplicate_of_document_id");
  if (error || !data) {
    console.error("Failed to load documents:", error?.message);
    process.exit(1);
  }

  const docs = data as DocRow[];
  const { groups, byUser } = buildDuplicateGroups(docs);

  console.log(`[dedupe-remediation] duplicate groups found: ${groups.length}`);
  const unresolvedDuplicateLooking = Array.from(byUser.entries())
    .flatMap(([userId, userDocs]) => {
      const byKey = new Map<string, DocRow[]>();
      for (const doc of userDocs) {
        const key = `${userId}|${(doc.normalized_filename || normalizeFileName(doc.file_name)).trim()}|${mimeFamily(doc.mime_type)}`;
        const arr = byKey.get(key) ?? [];
        arr.push(doc);
        byKey.set(key, arr);
      }
      return Array.from(byKey.values())
        .filter((rows) => rows.length >= 2)
        .map((rows) => rows.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()));
    })
    .filter((rows) => rows.length >= 2);

  for (const rows of unresolvedDuplicateLooking.slice(0, 10)) {
    console.log("[dedupe-remediation][diagnostic] unresolved duplicate-looking set");
    for (const row of rows) {
      console.log(
        JSON.stringify({
          id: row.id,
          user_id: row.user_id,
          file_name: row.file_name,
          file_size_bytes: row.file_size_bytes,
          mime_type: row.mime_type,
          file_hash: (row.file_hash || row.source_file_sha256 || "").trim().toLowerCase() || null,
          intake_text_hash: (row.intake_text_hash || "").trim().toLowerCase() || null,
          intake_text_preview: previewSignature(row).slice(0, 200) || null,
          duplicate_of_document_id: row.duplicate_of_document_id,
          created_at: row.created_at,
          updated_at: row.updated_at,
        }),
      );
    }
  }

  for (const group of groups) {
    console.log(
      `- canonical=${group.canonical.id} reason=${group.reason} confidence=${group.confidence.toFixed(2)} duplicates=${group.duplicates.map((d) => d.id).join(",")}`,
    );
    if (!apply) continue;
    for (const duplicate of group.duplicates) {
      await repointDocumentId("document_case_links", group.canonical.id, duplicate.id);
      await repointDocumentId("document_analysis_runs", group.canonical.id, duplicate.id);
      await repointDocumentId("document_chunks", group.canonical.id, duplicate.id);
      await repointDocumentId("document_facts", group.canonical.id, duplicate.id);
      await repointDocumentId("document_dates", group.canonical.id, duplicate.id);
      await repointDocumentId("intelligence_audit_logs", group.canonical.id, duplicate.id);
      await repointCaseFactSource(group.canonical.id, duplicate.id);
      await supabaseAdmin
        .from("documents")
        .update({
          duplicate_of_document_id: group.canonical.id,
          duplicate_confidence: group.confidence,
          lifecycle_state: "duplicate_suppressed",
        })
        .eq("id", duplicate.id);
    }
  }

  if (!apply) {
    console.log("Dry run complete. Re-run with --apply to repoint references and suppress duplicates.");
  }
}

const isEntrypoint = (() => {
  const entry = process.argv[1];
  if (!entry) return false;
  return import.meta.url === pathToFileURL(entry).href;
})();

if (isEntrypoint) {
  run().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
