export interface UploadAssociationPlanInput {
  canonicalDocumentId: string | null;
  existingCaseIds: string[];
  requestedCaseId: string | null;
}

export interface UploadAssociationPlan {
  reuseCanonical: boolean;
  createCanonical: boolean;
  linkToRequestedCase: boolean;
}

/**
 * Deterministic planner for canonical document identity + case association behavior.
 * Pure function used for regression coverage of cross-scope deduplication rules.
 */
export function planUploadAssociation(
  input: UploadAssociationPlanInput,
): UploadAssociationPlan {
  const requestedCaseId = input.requestedCaseId?.trim() || null;
  const canonicalExists = Boolean(input.canonicalDocumentId);

  if (!canonicalExists) {
    return {
      reuseCanonical: false,
      createCanonical: true,
      linkToRequestedCase: Boolean(requestedCaseId),
    };
  }

  return {
    reuseCanonical: true,
    createCanonical: false,
    linkToRequestedCase: Boolean(
      requestedCaseId && !input.existingCaseIds.includes(requestedCaseId),
    ),
  };
}
