import { supabaseAdmin } from "../lib/supabaseAdmin";
import type { RawSignal } from "../lib/signals";
import { buildPersistenceErrorDetail, type PersistenceErrorDetail } from "./documents";
import { getDocumentById } from "./documents";

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
