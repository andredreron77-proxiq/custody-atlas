"use client";

import { useEffect, useState } from "react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { buildWhatMattersNow, type RawSignal, type UserTier } from "@/lib/signals";
import WhatMattersNow from "@/components/WhatMattersNow";

interface DismissibleWhatMattersNowProps {
  rawSignals: RawSignal[];
  tier: UserTier;
  totalDocuments: number;
  lastActivityDaysAgo: number;
  loading?: boolean;
  onUpgradeClick?: () => void;
  className?: string;
}

export default function DismissibleWhatMattersNow({
  rawSignals,
  tier,
  totalDocuments,
  lastActivityDaysAgo,
  loading,
  onUpgradeClick,
  className,
}: DismissibleWhatMattersNowProps) {
  const { toast } = useToast();
  const [visibleSignals, setVisibleSignals] = useState<RawSignal[]>(rawSignals);

  useEffect(() => {
    setVisibleSignals(rawSignals);
  }, [rawSignals]);

  const result = buildWhatMattersNow(visibleSignals, {
    tier,
    totalDocuments,
    lastActivityDaysAgo,
  });

  async function handleDismiss(signalId: string) {
    const signalIndex = visibleSignals.findIndex((signal) => signal.id === signalId);
    const dismissedSignal = signalIndex >= 0 ? visibleSignals[signalIndex] : null;
    setVisibleSignals((current) => current.filter((signal) => signal.id !== signalId));

    try {
      await apiRequest("POST", `/api/signals/${signalId}/dismiss`);
    } catch (error: any) {
      if (dismissedSignal) {
        setVisibleSignals((current) => {
          if (current.some((signal) => signal.id === signalId)) return current;
          const next = [...current];
          next.splice(Math.min(signalIndex, next.length), 0, dismissedSignal);
          return next;
        });
      }
      toast({
        title: "Could not dismiss signal",
        description: error?.message ?? "Please try again.",
        variant: "destructive",
      });
    }
  }

  return (
    <WhatMattersNow
      result={result}
      tier={tier}
      loading={loading}
      onDismiss={handleDismiss}
      onUpgradeClick={onUpgradeClick}
      className={className}
    />
  );
}
