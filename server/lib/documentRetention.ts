export type RetentionTier = "free" | "pro" | "attorney_firm";

export interface RetentionPolicy {
  originalFileDays: number;
  intelligenceDays: number;
  caseIntelligenceDays: number;
  preserveOriginalIndefinitely: boolean;
}

const RETENTION_POLICIES: Record<RetentionTier, RetentionPolicy> = {
  free: {
    originalFileDays: 30,
    intelligenceDays: 180,
    caseIntelligenceDays: 365,
    preserveOriginalIndefinitely: false,
  },
  pro: {
    originalFileDays: 365,
    intelligenceDays: 3650,
    caseIntelligenceDays: 3650,
    preserveOriginalIndefinitely: false,
  },
  attorney_firm: {
    originalFileDays: 3650,
    intelligenceDays: 3650,
    caseIntelligenceDays: 3650,
    preserveOriginalIndefinitely: true,
  },
};

function addDays(base: Date, days: number): Date {
  const next = new Date(base);
  next.setUTCDate(next.getUTCDate() + Math.max(0, days));
  return next;
}

export function retentionPolicyForTier(tier: RetentionTier): RetentionPolicy {
  return RETENTION_POLICIES[tier];
}

export function buildRetentionWindow(tier: RetentionTier, now = new Date()) {
  const policy = retentionPolicyForTier(tier);
  return {
    policy,
    originalExpiresAt: policy.preserveOriginalIndefinitely ? null : addDays(now, policy.originalFileDays).toISOString(),
    intelligenceExpiresAt: addDays(now, policy.intelligenceDays).toISOString(),
    caseIntelligenceExpiresAt: addDays(now, policy.caseIntelligenceDays).toISOString(),
  };
}
