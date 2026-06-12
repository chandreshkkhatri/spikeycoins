"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import axios from "axios";
import api from "@/lib/api";
import { API_ROUTES, getApiUrl } from "@/lib/constants";
import { useAccount } from "@/contexts/account-context";
import { useAuth } from "@/contexts/auth-context";
import { Loader2, TrendingUp, TrendingDown } from "lucide-react";

interface FundsResponse {
    totalBalance: string;
    availableBalance: string;
    unrealizedPnl?: string;
    currency: string;
}

const FUNDS_REQUEST_TIMEOUT = 12_000; // 12s client-side timeout
const FUNDS_POLL_INTERVAL = 30_000;   // 30s polling
const FUNDS_RETRY_DELAY = 3_000;      // 3s retry delay on failure
const FUNDS_MAX_RETRIES = 3;          // max retries before falling back to poll

export function HeaderFundsDisplay() {
    const { selectedAccount } = useAccount();
    const { isLoggedIn } = useAuth();
    const [funds, setFunds] = useState<FundsResponse | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(false);
    const abortControllerRef = useRef<AbortController | null>(null);
    const mountedRef = useRef(true);
    const hasFundsRef = useRef(false);
    const retryCountRef = useRef(0);
    const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const fetchFunds = useCallback(async (signal: AbortSignal) => {
        if (!selectedAccount) return;

        // Only show loading spinner on first fetch (funds is null)
        // Subsequent fetches keep showing stale data instead of spinner
        if (!hasFundsRef.current) setLoading(true);
        setError(false);

        try {
            const response = await api.get(
                `/funds?vendor=${selectedAccount.accountType}&accountId=${selectedAccount._id}`,
                {
                    signal,
                    timeout: FUNDS_REQUEST_TIMEOUT,
                }
            );

            if (!mountedRef.current) return;

            if (response.data?.success && response.data.funds) {
                const currency = selectedAccount.accountType === 'binance' ? '$' : '₹';
                setFunds({
                    totalBalance: response.data.funds.totalBalance,
                    availableBalance: response.data.funds.availableBalance,
                    unrealizedPnl: response.data.funds.unrealizedPnl,
                    currency
                });
                hasFundsRef.current = true;
                retryCountRef.current = 0;
                setError(false);
            } else {
                console.error("Failed to fetch header funds: API returned success=false", response.data);
                if (mountedRef.current) setError(true);
            }
        } catch (err: any) {
            if (axios.isCancel(err)) return; // Intentional abort, skip error handling
            if (!mountedRef.current) return;
            console.error("Failed to fetch header funds:", err.message || err);
            setError(true);

            // If we don't have funds yet (first load) or lost them, retry quickly
            if (!hasFundsRef.current && retryCountRef.current < FUNDS_MAX_RETRIES) {
                retryCountRef.current++;
                const delay = FUNDS_RETRY_DELAY * retryCountRef.current; // 3s, 6s, 9s
                console.log(`[HeaderFunds] Retry ${retryCountRef.current}/${FUNDS_MAX_RETRIES} in ${delay}ms`);
                retryTimerRef.current = setTimeout(() => {
                    if (!mountedRef.current) return;
                    const retryController = new AbortController();
                    abortControllerRef.current = retryController;
                    fetchFunds(retryController.signal);
                }, delay);
            }
        } finally {
            if (mountedRef.current) setLoading(false);
        }
    }, [selectedAccount]);

    useEffect(() => {
        mountedRef.current = true;
        retryCountRef.current = 0;

        if (!selectedAccount) {
            setFunds(null);
            return;
        }

        // Skip funds polling for demo accounts when not signed in
        if (selectedAccount.isDemo && !isLoggedIn) {
            setFunds(null);
            return;
        }

        // Abort any previous in-flight request
        abortControllerRef.current?.abort();
        if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
        const controller = new AbortController();
        abortControllerRef.current = controller;

        fetchFunds(controller.signal);

        // Refresh every 30 seconds with a fresh AbortController each time
        const interval = setInterval(() => {
            abortControllerRef.current?.abort();
            if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
            retryCountRef.current = 0; // reset retry count for each poll cycle
            const newController = new AbortController();
            abortControllerRef.current = newController;
            fetchFunds(newController.signal);
        }, FUNDS_POLL_INTERVAL);

        return () => {
            mountedRef.current = false;
            clearInterval(interval);
            if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
            abortControllerRef.current?.abort();
        };
    }, [selectedAccount, selectedAccount?._id, isLoggedIn, fetchFunds]);

    if (!selectedAccount) return null;

    if (loading && !funds) {
        return (
            <div className="flex items-center gap-2 mr-2 md:mr-4 px-2 md:px-3 py-1.5 bg-muted/30 rounded-full border border-border/50 flex-shrink-0">
                <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                <span className="text-xs text-muted-foreground hidden md:inline">Loading...</span>
            </div>
        );
    }

    // Fallback if funds are null or error occurred
    const displayFunds = funds || {
        totalBalance: "---",
        availableBalance: "---",
        unrealizedPnl: "0",
        currency: selectedAccount?.accountType === 'binance' ? '$' : '₹'
    };

    const pnl = parseFloat(displayFunds.unrealizedPnl || "0");
    const isPnlPositive = pnl >= 0;

    return (
        <div className="flex items-center gap-2 md:gap-4 mr-2 md:mr-4 flex-shrink-0">
            <div className="flex flex-col items-end">
                <span className="text-[9px] md:text-[10px] text-muted-foreground font-medium uppercase tracking-wider leading-none mb-0.5 md:mb-1">Equity</span>
                <span className={`text-xs md:text-sm font-bold leading-none font-mono ${error ? 'text-destructive' : ''}`}>
                    {displayFunds.currency !== '$' && displayFunds.currency !== '₹' ? (selectedAccount?.accountType === 'binance' ? '$' : '₹') : displayFunds.currency}
                    {displayFunds.totalBalance === "---" ? "---" : parseFloat(displayFunds.totalBalance).toFixed(2)}
                </span>
            </div>

            {/* Optional: Show P&L if relevant - hide on mobile */}
            {pnl !== 0 && (
                <div className={`hidden md:flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-md bg-opacity-10 ${isPnlPositive ? 'bg-green-500 text-green-600 dark:text-green-400' : 'bg-red-500 text-red-600 dark:text-red-400'}`}>
                    {isPnlPositive ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                    {displayFunds.currency}{Math.abs(pnl).toFixed(2)}
                </div>
            )}
        </div>
    );
}
