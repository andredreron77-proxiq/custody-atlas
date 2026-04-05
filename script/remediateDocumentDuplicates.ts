import { supabaseAdmin } from "../server/lib/supabaseAdmin";

type DocRow = {
  id: string;
  user_id: string;
  case_id: string | null;
  file_name: string;
  created_at: string;
  analysis_json: Record<string, unknown> | null;
  file_hash: string | null;
  source_file_sha256: string | null;
  intake_text_hash: string | null;
  extracted_text: string | null;
};

function qualityScore(doc: DocRow): number {
  const hasSummary = typeof doc.analysis_json?.summary === "string" && doc.analysis_json.summary.length > 0;
  const hasFacts = Boolean(doc.analysis_json?.extracted_facts);
  return (hasSummary ? 20 : 0) + (hasFacts ? 20 : 0) + (doc.case_id ? 15 : 0);
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
    .select("id,user_id,case_id,file_name,created_at,analysis_json,file_hash,source_file_sha256,intake_text_hash,extracted_text");
  if (error || !data) {
    console.error("Failed to load documents:", error?.message);
    process.exit(1);
  }

  const docs = data as DocRow[];
  const byUser = new Map<string, DocRow[]>();
  for (const doc of docs) {
    const arr = byUser.get(doc.user_id) ?? [];
    arr.push(doc);
    byUser.set(doc.user_id, arr);
  }

  const groups: Array<{ canonical: DocRow; duplicates: DocRow[]; reason: string }> = [];
  for (const [, userDocs] of byUser) {
    const byIdentity = new Map<string, DocRow[]>();
    for (const doc of userDocs) {
      const fileHash = (doc.file_hash || doc.source_file_sha256 || "").trim().toLowerCase();
      const textHash = (doc.intake_text_hash || "").trim().toLowerCase();
      const key = fileHash ? `file:${fileHash}` : textHash ? `text:${textHash}` : "";
      if (!key) continue;
      const arr = byIdentity.get(key) ?? [];
      arr.push(doc);
      byIdentity.set(key, arr);
    }
    for (const [key, grouped] of byIdentity) {
      if (grouped.length < 2) continue;
      const canonical = pickCanonical(grouped);
      const duplicates = grouped.filter((d) => d.id !== canonical.id);
      groups.push({ canonical, duplicates, reason: key.startsWith("file:") ? "file_hash" : "intake_text_hash" });
    }
  }

  console.log(`[dedupe-remediation] duplicate groups found: ${groups.length}`);
  for (const group of groups) {
    console.log(`- canonical=${group.canonical.id} reason=${group.reason} duplicates=${group.duplicates.map((d) => d.id).join(",")}`);
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
          duplicate_confidence: 1,
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
