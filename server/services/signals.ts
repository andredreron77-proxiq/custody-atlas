import { supabaseAdmin } from "../lib/supabaseAdmin";
import type { RawSignal } from "../lib/signals";
import { buildPersistenceErrorDetail, type PersistenceErrorDetail } from "./documents";
import { getDocumentById } from "./documents";
import { getCaseById } from "./cases";

export interface ReplaceDocumentSignalsResult {
  ok: boolean;
  error?: PersistenceErrorDetail;
  insertedCount?: number;
}

export interface DismissSignalResult {
  ok: boolean;
  error?: PersistenceErrorDetail;
  dismissed?: boolean;
  notFound?: boolean;
}

export interface ListSignalsResult {
  ok: boolean;
  signals?: RawSignal[];
  error?: PersistenceErrorDetail;
  notFound?: boolean;
}

export interface DeleteSignalsResult {
  ok: boolean;
  error?: PersistenceErrorDetail;
  deletedCount?: number;
}

export async function replaceDocumentSignals(
  caseId: string,
  documentId: string,
  rawSignals: RawSignal[],
): Promise<ReplaceDocumentSignalsResult> {
  if (!supabaseAdmin) {
    return {
      ok: false,
      error: {
        operation: "replaceDocumentSignals",
        table: "signals",
        writeMode: "insert",
        code: null,
        message: "Supabase admin client is not configured.",
        details: null,
        hint: null,
        column: null,
        constraint: null,
        isRls: false,
      },
    };
  }

  try {
    const { error: deleteError } = await supabaseAdmin
      .from("signals")
      .delete()
      .eq("document_id", documentId);

    if (deleteError) {
      return {
        ok: false,
        error: buildPersistenceErrorDetail(deleteError, {
          operation: "replaceDocumentSignals",
          table: "signals",
          writeMode: "update",
        }),
      };
    }

    if (rawSignals.length === 0) {
      return { ok: true, insertedCount: 0 };
    }

    const payload = rawSignals.map((signal) => ({
      case_id: caseId,
      document_id: documentId,
      type: signal.type,
      title: signal.title,
      detail: signal.detail,
      due_date: signal.dueDate ?? null,
      source_document_ids: signal.sourceDocumentIds
        ?? (signal.sourceDocumentId ? [signal.sourceDocumentId] : null),
      dismissed: signal.dismissed ?? false,
      score: null,
    }));

    const { error: insertError } = await supabaseAdmin
      .from("signals")
      .insert(payload);

    if (insertError) {
      return {
        ok: false,
        error: buildPersistenceErrorDetail(insertError, {
          operation: "replaceDocumentSignals",
          table: "signals",
          writeMode: "insert",
        }),
      };
    }

    return { ok: true, insertedCount: payload.length };
  } catch (error) {
    return {
      ok: false,
      error: buildPersistenceErrorDetail(error, {
        operation: "replaceDocumentSignals",
        table: "signals",
        writeMode: "insert",
      }),
    };
  }
}

export async function dismissSignalForUser(
  signalId: string,
  userId: string,
): Promise<DismissSignalResult> {
  if (!supabaseAdmin) {
    return {
      ok: false,
      error: {
        operation: "dismissSignalForUser",
        table: "signals",
        writeMode: "update",
        code: null,
        message: "Supabase admin client is not configured.",
        details: null,
        hint: null,
        column: null,
        constraint: null,
        isRls: false,
      },
    };
  }

  try {
    const { data: signalRow, error: selectError } = await supabaseAdmin
      .from("signals")
      .select("id, document_id")
      .eq("id", signalId)
      .maybeSingle();

    if (selectError) {
      return {
        ok: false,
        error: buildPersistenceErrorDetail(selectError, {
          operation: "dismissSignalForUser",
          table: "signals",
          writeMode: "update",
        }),
      };
    }

    if (!signalRow?.document_id) {
      return { ok: true, dismissed: false, notFound: true };
    }

    const ownedDocument = await getDocumentById(signalRow.document_id, userId);
    if (!ownedDocument) {
      return { ok: true, dismissed: false, notFound: true };
    }

    const { error: updateError } = await supabaseAdmin
      .from("signals")
      .update({ dismissed: true })
      .eq("id", signalId);

    if (updateError) {
      return {
        ok: false,
        error: buildPersistenceErrorDetail(updateError, {
          operation: "dismissSignalForUser",
          table: "signals",
          writeMode: "update",
        }),
      };
    }

    return { ok: true, dismissed: true };
  } catch (error) {
    return {
      ok: false,
      error: buildPersistenceErrorDetail(error, {
        operation: "dismissSignalForUser",
        table: "signals",
        writeMode: "update",
      }),
    };
  }
}

export async function deleteSignalsForCase(caseId: string): Promise<DeleteSignalsResult> {
  if (!supabaseAdmin) {
    return {
      ok: false,
      error: {
        operation: "deleteSignalsForCase",
        table: "signals",
        writeMode: "update",
        code: null,
        message: "Supabase admin client is not configured.",
        details: null,
        hint: null,
        column: null,
        constraint: null,
        isRls: false,
      },
    };
  }

  try {
    const { data, error } = await supabaseAdmin
      .from("signals")
      .delete()
      .eq("case_id", caseId)
      .select("id");

    if (error) {
      return {
        ok: false,
        error: buildPersistenceErrorDetail(error, {
          operation: "deleteSignalsForCase",
          table: "signals",
          writeMode: "update",
        }),
      };
    }

    return {
      ok: true,
      deletedCount: Array.isArray(data) ? data.length : 0,
    };
  } catch (error) {
    return {
      ok: false,
      error: buildPersistenceErrorDetail(error, {
        operation: "deleteSignalsForCase",
        table: "signals",
        writeMode: "update",
      }),
    };
  }
}

function mapSignalRow(row: Record<string, unknown>): RawSignal {
  const sourceDocumentIds = Array.isArray(row.source_document_ids)
    ? row.source_document_ids.filter((id): id is string => typeof id === "string")
    : undefined;

  return {
    id: typeof row.id === "string" ? row.id : "",
    type: row.type as RawSignal["type"],
    title: typeof row.title === "string" ? row.title : "",
    detail: typeof row.detail === "string" ? row.detail : "",
    dueDate: typeof row.due_date === "string" ? row.due_date : undefined,
    sourceDocumentIds,
    sourceDocumentId: sourceDocumentIds?.[0],
    dismissed: Boolean(row.dismissed),
  };
}

export async function listSignalsForCase(
  caseId: string,
  userId: string,
): Promise<ListSignalsResult> {
  if (!supabaseAdmin) {
    return {
      ok: false,
      error: {
        operation: "listSignalsForCase",
        table: "signals",
        writeMode: "update",
        code: null,
        message: "Supabase admin client is not configured.",
        details: null,
        hint: null,
        column: null,
        constraint: null,
        isRls: false,
      },
    };
  }

  try {
    const ownedCase = await getCaseById(caseId, userId);
    if (!ownedCase) {
      return { ok: true, signals: [], notFound: true };
    }

    const { data, error } = await supabaseAdmin
      .from("signals")
      .select("id, type, title, detail, due_date, source_document_ids, dismissed")
      .eq("case_id", caseId)
      .order("created_at", { ascending: false });

    if (error) {
      return {
        ok: false,
        error: buildPersistenceErrorDetail(error, {
          operation: "listSignalsForCase",
          table: "signals",
          writeMode: "update",
        }),
      };
    }

    return {
      ok: true,
      signals: Array.isArray(data) ? data.map((row) => mapSignalRow(row as Record<string, unknown>)) : [],
    };
  } catch (error) {
    return {
      ok: false,
      error: buildPersistenceErrorDetail(error, {
        operation: "listSignalsForCase",
        table: "signals",
        writeMode: "update",
      }),
    };
  }
}

export async function listSignalsForDocument(
  documentId: string,
  userId: string,
): Promise<ListSignalsResult> {
  if (!supabaseAdmin) {
    return {
      ok: false,
      error: {
        operation: "listSignalsForDocument",
        table: "signals",
        writeMode: "update",
        code: null,
        message: "Supabase admin client is not configured.",
        details: null,
        hint: null,
        column: null,
        constraint: null,
        isRls: false,
      },
    };
  }

  try {
    const ownedDocument = await getDocumentById(documentId, userId);
    if (!ownedDocument) {
      return { ok: true, signals: [], notFound: true };
    }

    const { data, error } = await supabaseAdmin
      .from("signals")
      .select("id, type, title, detail, due_date, source_document_ids, dismissed")
      .eq("document_id", documentId)
      .order("created_at", { ascending: false });

    if (error) {
      return {
        ok: false,
        error: buildPersistenceErrorDetail(error, {
          operation: "listSignalsForDocument",
          table: "signals",
          writeMode: "update",
        }),
      };
    }

    return {
      ok: true,
      signals: Array.isArray(data) ? data.map((row) => mapSignalRow(row as Record<string, unknown>)) : [],
    };
  } catch (error) {
    return {
      ok: false,
      error: buildPersistenceErrorDetail(error, {
        operation: "listSignalsForDocument",
        table: "signals",
        writeMode: "update",
      }),
    };
  }
}
