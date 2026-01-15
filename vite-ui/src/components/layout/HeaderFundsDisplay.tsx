import { useEffect, useState } from "react";
import axios from "axios";
import { API_ROUTES, getApiUrl } from "@/lib/constants";
import { useAccount } from "@/lib/account-context";
import { Loader2, TrendingUp, TrendingDown } from "lucide-react";

interface FundsResponse {
    totalBalance: string;
    availableBalance: string;
    unrealizedPnl?: string;
    currency: string;
}

export function HeaderFundsDisplay() {
    const { selectedAccount } = useAccount();
    const [funds, setFunds] = useState<FundsResponse | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(false);

    useEffect(() => {
        if (!selectedAccount) {
            setFunds(null);
            return;
        }

        const fetchFunds = async () => {
            setLoading(true);
            setError(false);
            try {
                const response = await axios.get(
                    getApiUrl(`${API_ROUTES.funds}?vendor=${selectedAccount.accountType}&accountId=${selectedAccount._id}`)
                );

                if (response.data?.success && response.data.funds) {
                    // Determine currency symbol based on vendor
                    const currency = selectedAccount.accountType === 'binance' ? '$' : '₹';

                    setFunds({
                        totalBalance: response.data.funds.totalBalance,
                        availableBalance: response.data.funds.availableBalance,
                        unrealizedPnl: response.data.funds.unrealizedPnl,
                        currency
                    });
                } else {
                    console.error("Failed to fetch header funds: API returned success=false", response.data);
                    setError(true);
                }
            } catch (err: any) {
                console.error("Failed to fetch header funds:", err.message || err);
                setError(true);
            } finally {
                setLoading(false);
            }
        };

        fetchFunds();

        // Refresh every 30 seconds
        const interval = setInterval(fetchFunds, 30000);
        return () => clearInterval(interval);

    }, [selectedAccount, selectedAccount?._id]);

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
