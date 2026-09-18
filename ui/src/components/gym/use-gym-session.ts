"use client";

import { useCallback, useEffect, useState } from "react";
import api from "@/lib/api";
import { API_ROUTES } from "@/lib/constants";
import { GymSession, GymThesis, GymTrade } from "./types";

export interface UseGymSessionReturn {
  session: GymSession | null;
  loading: boolean;
  actionLoading: boolean;
  error: string | null;
  governorRejection: { ruleId: string; reason: string } | null;
  startNewSession: (mode?: "FREE" | "METHOD") => Promise<void>;
  advanceSession: (candlesToAdvance?: number) => Promise<void>;
  placeTrade: (params: {
    side: "LONG" | "SHORT";
    stopLoss: number;
    takeProfit: number;
    type?: "MARKET" | "LIMIT";
    limitPrice?: number;
    thesis?: GymThesis;
  }) => Promise<GymTrade | undefined>;
  cancelPendingTrade: () => Promise<void>;
  closeOpenTrade: () => Promise<void>;
  modifyStop: (tradeIndex: number, newStop: number) => Promise<void>;
  abandonSession: () => Promise<void>;
  revealSession: () => Promise<void>;
  refreshSession: () => Promise<void>;
  clearError: () => void;
}

export function useGymSession(): UseGymSessionReturn {
  const [session, setSession] = useState<GymSession | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [actionLoading, setActionLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [governorRejection, setGovernorRejection] = useState<{ ruleId: string; reason: string } | null>(null);

  const fetchActiveSession = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.get(API_ROUTES.gym.activeSession);
      if (res.data?.success) {
        setSession(res.data.session);
      }
    } catch (err: any) {
      console.error("[useGymSession] Error fetching active session:", err);
      setError(err?.response?.data?.error || "Failed to load active session");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchActiveSession();
  }, [fetchActiveSession]);

  const startNewSession = useCallback(async (mode: "FREE" | "METHOD" = "FREE") => {
    try {
      setActionLoading(true);
      setError(null);
      setGovernorRejection(null);
      const res = await api.post(API_ROUTES.gym.newSession, { mode });
      if (res.data?.success) {
        setSession(res.data.session);
      }
    } catch (err: any) {
      console.error("[useGymSession] Error starting session:", err);
      setError(err?.response?.data?.error || "Failed to start new session");
    } finally {
      setActionLoading(false);
    }
  }, []);

  const advanceSession = useCallback(
    async (candlesToAdvance = 1) => {
      if (!session) return;
      try {
        setActionLoading(true);
        setError(null);
        const res = await api.post(API_ROUTES.gym.wait(session.id), { candlesToAdvance });
        if (res.data?.success) {
          setSession(res.data.session);
        }
      } catch (err: any) {
        console.error("[useGymSession] Error advancing session:", err);
        setError(err?.response?.data?.error || "Failed to advance session");
      } finally {
        setActionLoading(false);
      }
    },
    [session]
  );

  const placeTrade = useCallback(
    async (params: {
      side: "LONG" | "SHORT";
      stopLoss: number;
      takeProfit: number;
      type?: "MARKET" | "LIMIT";
      limitPrice?: number;
      thesis?: GymThesis;
    }) => {
      if (!session) return;
      try {
        setActionLoading(true);
        setError(null);
        setGovernorRejection(null);

        const res = await api.post(API_ROUTES.gym.trade(session.id), params);
        if (res.data?.success) {
          setSession(res.data.session);
          return res.data.trade;
        }
      } catch (err: any) {
        console.error("[useGymSession] Error placing trade:", err);
        const errorData = err?.response?.data;
        if (errorData?.code === "GOVERNOR_HALT" || errorData?.ruleId) {
          setGovernorRejection({
            ruleId: errorData.ruleId || "GOVERNOR_HALT",
            reason: errorData.error || errorData.reason || "Action blocked by risk governor",
          });
        }
        setError(errorData?.error || "Failed to place trade");
      } finally {
        setActionLoading(false);
      }
    },
    [session]
  );

  const cancelPendingTrade = useCallback(async () => {
    if (!session) return;
    try {
      setActionLoading(true);
      setError(null);
      const res = await api.post(API_ROUTES.gym.cancelTrade(session.id));
      if (res.data?.success) {
        setSession(res.data.session);
      }
    } catch (err: any) {
      console.error("[useGymSession] Error cancelling trade:", err);
      setError(err?.response?.data?.error || "Failed to cancel trade");
    } finally {
      setActionLoading(false);
    }
  }, [session]);

  const closeOpenTrade = useCallback(async () => {
    if (!session) return;
    try {
      setActionLoading(true);
      setError(null);
      const res = await api.post(API_ROUTES.gym.closeTrade(session.id));
      if (res.data?.success) {
        setSession(res.data.session);
      }
    } catch (err: any) {
      console.error("[useGymSession] Error closing trade:", err);
      setError(err?.response?.data?.error || "Failed to close trade");
    } finally {
      setActionLoading(false);
    }
  }, [session]);

  const modifyStop = useCallback(
    async (tradeIndex: number, newStop: number) => {
      if (!session) return;
      try {
        setActionLoading(true);
        setError(null);
        const res = await api.post(API_ROUTES.gym.modifyStop(session.id), { tradeIndex, newStop });
        if (res.data?.success) {
          setSession(res.data.session);
        }
      } catch (err: any) {
        console.error("[useGymSession] Error modifying stop:", err);
        setError(err?.response?.data?.error || "Failed to modify stop loss");
      } finally {
        setActionLoading(false);
      }
    },
    [session]
  );

  const abandonSession = useCallback(async () => {
    if (!session) return;
    try {
      setActionLoading(true);
      setError(null);
      const res = await api.post(API_ROUTES.gym.abandonSession(session.id));
      if (res.data?.success) {
        setSession(res.data.session);
      }
    } catch (err: any) {
      console.error("[useGymSession] Error abandoning session:", err);
      setError(err?.response?.data?.error || "Failed to abandon session");
    } finally {
      setActionLoading(false);
    }
  }, [session]);

  const revealSession = useCallback(async () => {
    if (!session) return;
    try {
      setActionLoading(true);
      setError(null);
      const res = await api.post(API_ROUTES.gym.revealSession(session.id));
      if (res.data?.success) {
        setSession(res.data.session);
      }
    } catch (err: any) {
      console.error("[useGymSession] Error revealing session:", err);
      setError(err?.response?.data?.error || "Failed to reveal session");
    } finally {
      setActionLoading(false);
    }
  }, [session]);

  const refreshSession = useCallback(async () => {
    if (!session) return fetchActiveSession();
    try {
      const res = await api.get(API_ROUTES.gym.session(session.id));
      if (res.data?.success) {
        setSession(res.data.session);
      }
    } catch (err: any) {
      console.error("[useGymSession] Error refreshing session:", err);
    }
  }, [session, fetchActiveSession]);

  const clearError = useCallback(() => {
    setError(null);
    setGovernorRejection(null);
  }, []);

  return {
    session,
    loading,
    actionLoading,
    error,
    governorRejection,
    startNewSession,
    advanceSession,
    placeTrade,
    cancelPendingTrade,
    closeOpenTrade,
    modifyStop,
    abandonSession,
    revealSession,
    refreshSession,
    clearError,
  };
}
