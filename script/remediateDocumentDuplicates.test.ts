import test from "node:test";
import assert from "node:assert/strict";
import { buildDuplicateGroups, isMissingRelationError, type DocRow } from "./remediateDocumentDuplicates";

function baseDoc(overrides: Partial<DocRow>): DocRow {
  return {
    id: "doc-default",
    user_id: "user-1",
    case_id: null,
    file_name: "placeholder.docx",
    normalized_filename: null,
    mime_type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    created_at: "2026-04-01T00:00:00.000Z",
    updated_at: "2026-04-01T00:00:00.000Z",
    analysis_json: null,
    file_hash: null,
    source_file_sha256: null,
    intake_text_hash: null,
    intake_text_preview: null,
    extracted_text: null,
    file_size_bytes: 1024,
    duplicate_of_document_id: null,
    ...overrides,
  };
}

test("fallback groups same-user exact filename duplicates even when hashes are missing", () => {
  const docs: DocRow[] = [
    baseDoc({
      id: "doc-legacy-a",
      user_id: "user-1",
      file_name: "fictional_custody_document_real_addresses_ocr_test.docx",
      normalized_filename: "fictional custody document real addresses ocr test",
      created_at: "2026-03-05T09:00:00.000Z",
      updated_at: "2026-03-05T09:00:00.000Z",
      analysis_json: { summary: "Older partial analysis." },
    }),
    baseDoc({
      id: "doc-legacy-b",
      user_id: "user-1",
      file_name: "  Fictional_Custody_Document_Real_Addresses_OCR_Test.docx  ",
      normalized_filename: "fictional custody document real addresses ocr test",
      created_at: "2026-03-06T12:00:00.000Z",
      updated_at: "2026-03-06T12:00:00.000Z",
      analysis_json: { summary: "Richer analysis", extracted_facts: [{ type: "address" }] },
      intake_text_preview: "Sample intake preview text from OCR.",
    }),
  ];

  const { groups } = buildDuplicateGroups(docs);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].reason, "filename_exact_fallback");
  assert.equal(groups[0].canonical.id, "doc-legacy-b");
  assert.deepEqual(groups[0].duplicates.map((d) => d.id), ["doc-legacy-a"]);
  assert.equal(groups[0].confidence, 0.84);
});

test("fallback never dedupes across different users", () => {
  const docs: DocRow[] = [
    baseDoc({
      id: "doc-user-1",
      user_id: "user-1",
      file_name: "same_name.pdf",
      normalized_filename: "same name",
      mime_type: "application/pdf",
    }),
    baseDoc({
      id: "doc-user-2",
      user_id: "user-2",
      file_name: "same_name.pdf",
      normalized_filename: "same name",
      mime_type: "application/pdf",
    }),
  ];

  const { groups } = buildDuplicateGroups(docs);
  assert.equal(groups.length, 0);
});

test("missing relation detection catches Postgres undefined-table errors", () => {
  assert.equal(isMissingRelationError({ code: "42P01", message: 'relation "document_chunks" does not exist' }), true);
  assert.equal(isMissingRelationError({ code: "23505", message: "duplicate key value violates unique constraint" }), false);
  assert.equal(isMissingRelationError(null), false);
});
