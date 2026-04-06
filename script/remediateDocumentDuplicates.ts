import { supabaseAdmin } from "../server/lib/supabaseAdmin";

type DocRow = {
  id: string;
  user_id: string;
  case_id: string | null;
  file_name: string;
  normalized_filename: string | null;
  created_at: string;
  analysis_json: Record<string, unknown> | null;
  file_hash: string | null;
  source_file_sha256: string | null;
  intake_text_hash: string | null;
  extracted_text: string | null;
  file_size_bytes: number | null;
  duplicate_of_document_id: string | null;
};

type GroupReason = "file_hash_exact" | "intake_text_hash_exact" | "filename_case_text_similarity" | "filename_case_semantic_similarity";

type DuplicateGroup = {
  canonical: DocRow;
  duplicates: DocRow[];
  reason: GroupReason;
  confidence: number;
};

type CaseLinkRow = {
  document_id: string;
  case_id: string;
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
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
  })[0];
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
    .select("id,user_id,case_id,file_name,normalized_filename,created_at,analysis_json,file_hash,source_file_sha256,intake_text_hash,extracted_text,file_size_bytes,duplicate_of_document_id");
  if (error || !data) {
    console.error("Failed to load documents:", error?.message);
    process.exit(1);
  }

  const { data: caseLinks, error: caseLinkError } = await supabaseAdmin
    .from("document_case_links")
    .select("document_id,case_id");
  if (caseLinkError) {
    console.error("Failed to load document_case_links:", caseLinkError.message);
    process.exit(1);
  }

  const docs = data as DocRow[];
  const links = (caseLinks ?? []) as CaseLinkRow[];
  const caseIdsByDocumentId = new Map<string, string[]>();
  for (const link of links) {
    const arr = caseIdsByDocumentId.get(link.document_id) ?? [];
    arr.push(link.case_id);
    caseIdsByDocumentId.set(link.document_id, arr);
  }

  const caseScopeKey = (doc: DocRow): string => {
    const caseIds = caseIdsByDocumentId.get(doc.id) ?? [];
    if (caseIds.length > 0) return [...new Set(caseIds)].sort().join("|");
    return doc.case_id ?? "NO_CASE";
  };

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
    const byCaseAndName = new Map<string, DocRow[]>();
    for (const doc of fallbackCandidates) {
      const normalizedName = (doc.normalized_filename || "").trim() || normalizeFileName(doc.file_name);
      if (!normalizedName) continue;
      const key = `${caseScopeKey(doc)}|${normalizedName}`;
      const arr = byCaseAndName.get(key) ?? [];
      arr.push(doc);
      byCaseAndName.set(key, arr);
    }

    for (const [, grouped] of byCaseAndName) {
      if (grouped.length < 2) continue;
      const pending = [...grouped].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      const consumed = new Set<string>();
      for (let i = 0; i < pending.length; i++) {
        const seed = pending[i];
        if (consumed.has(seed.id)) continue;
        const seedTokens = textTokenSet(seed.extracted_text ?? summarySignature(seed));
        const seedSummary = summarySignature(seed);
        const cluster = [seed];
        for (let j = i + 1; j < pending.length; j++) {
          const candidate = pending[j];
          if (consumed.has(candidate.id)) continue;
          const candidateTokens = textTokenSet(candidate.extracted_text ?? summarySignature(candidate));
          const similarity = jaccardSimilarity(seedTokens, candidateTokens);
          const summaryMatch = seedSummary.length > 20 && seedSummary === summarySignature(candidate);
          const sameSize =
            seed.file_size_bytes != null &&
            candidate.file_size_bytes != null &&
            Math.abs(seed.file_size_bytes - candidate.file_size_bytes) <= 64;
          if (similarity >= 0.82 || (summaryMatch && sameSize)) {
            cluster.push(candidate);
          } else if (similarity >= 0.68 && summaryMatch) {
            cluster.push(candidate);
          }
        }
        if (cluster.length < 2) continue;
        const canonical = pickCanonical(cluster);
        const duplicates = cluster.filter((d) => d.id !== canonical.id);
        const minSim = Math.min(
          ...duplicates.map((d) =>
            jaccardSimilarity(seedTokens, textTokenSet(d.extracted_text ?? summarySignature(d))),
          ),
        );
        const reason: GroupReason =
          minSim >= 0.82 ? "filename_case_text_similarity" : "filename_case_semantic_similarity";
        const confidence = minSim >= 0.82 ? 0.93 : 0.86;
        groups.push({ canonical, duplicates, reason, confidence });
        for (const doc of cluster) {
          consumed.add(doc.id);
          assigned.add(doc.id);
        }
      }
    }
  }

  console.log(`[dedupe-remediation] duplicate groups found: ${groups.length}`);
  const unresolvedDuplicateLooking = Array.from(byUser.entries())
    .flatMap(([userId, userDocs]) => {
      const byKey = new Map<string, DocRow[]>();
      for (const doc of userDocs) {
        const key = `${userId}|${caseScopeKey(doc)}|${(doc.normalized_filename || normalizeFileName(doc.file_name)).trim()}`;
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
          normalized_filename: row.normalized_filename || normalizeFileName(row.file_name),
          file_hash: (row.file_hash || row.source_file_sha256 || "").trim().toLowerCase() || null,
          intake_text_hash: (row.intake_text_hash || "").trim().toLowerCase() || null,
          file_size_bytes: row.file_size_bytes,
          case_scope: caseScopeKey(row),
          summary_signature: summarySignature(row).slice(0, 120) || null,
          created_at: row.created_at,
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

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
