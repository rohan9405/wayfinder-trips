"use client";

import { Gauge } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { TURN_COMPLETE_EVENT } from "@/lib/chat-storage";

interface Quota {
  answersLeft: number;
  dailyBudget: number;
  resetsAt: string;
}

/**
 * Daily AI answer counter for the sidebar footer: a fixed daily budget minus AI answers given
 * today (cached answers don't count), reset at 00:00 UTC. An estimate shared by all users.
 */
export function QuotaBadge() {
  const [quota, setQuota] = useState<Quota | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/quota", { cache: "no-store" });
      if (res.ok) setQuota(await res.json());
    } catch {
      /* keep the last value */
    }
  }, []);

  useEffect(() => {
    void refresh();
    const onTurn = () => window.setTimeout(refresh, 1_000);
    window.addEventListener(TURN_COMPLETE_EVENT, onTurn);
    window.addEventListener("focus", refresh);
    return () => {
      window.removeEventListener(TURN_COMPLETE_EVENT, onTurn);
      window.removeEventListener("focus", refresh);
    };
  }, [refresh]);

  if (!quota) return null;
  const pct = quota.dailyBudget ? Math.min(100, (quota.answersLeft / quota.dailyBudget) * 100) : 0;
  const resets = new Date(quota.resetsAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const label = `About ${quota.answersLeft} of ${quota.dailyBudget} AI answers left today. Resets at ${resets}. Repeated questions are answered from cache and don't count.`;

  return (
    <div className="tc-quota" title={label} aria-label={label}>
      <Gauge size={16} aria-hidden className="tc-quota__icon" />
      <div className="tc-quota__body">
        <div className="tc-quota__text">
          ≈ {quota.answersLeft} answers left today
        </div>
        <div className="tc-quota__bar" aria-hidden>
          <span style={{ width: `${pct}%` }} />
        </div>
      </div>
    </div>
  );
}
