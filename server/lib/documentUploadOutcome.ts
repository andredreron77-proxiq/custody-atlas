export interface DocumentUploadOutcomeInput {
  fileName: string;
  isDuplicate: boolean;
}

export interface DocumentUploadOutcome {
  shouldTrackUsage: boolean;
  activityDescription: string;
  userMessage: string | null;
}

/**
 * Canonicalize upload side-effects so analyze/workspace/activity stay aligned:
 * - New canonical docs increment usage and create "Analyzed" activity.
 * - Duplicate uploads reuse the existing doc without incrementing usage and
 *   create a clear "Already uploaded" activity/message.
 */
export function buildDocumentUploadOutcome(
  input: DocumentUploadOutcomeInput,
): DocumentUploadOutcome {
  const safeName = input.fileName?.trim() || "document";

  if (input.isDuplicate) {
    return {
      shouldTrackUsage: false,
      activityDescription: `Already uploaded: ${safeName} (analysis refreshed)`,
      userMessage: "This file was already in your workspace. We refreshed its analysis.",
    };
  }

  return {
    shouldTrackUsage: true,
    activityDescription: `Analyzed document: ${safeName}`,
    userMessage: null,
  };
}
