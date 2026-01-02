import { useEffect, useState } from "react";
import axios from "axios";
import { API_ROUTES } from "@/lib/constants";
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
                    `${API_ROUTES.funds}?vendor=${selectedAccount.accountType}&accountId=${selectedAccount._id}`
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
                    setError(true);
                }
            } catch (err) {
                console.error("Failed to fetch header funds", err);
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
            <div className="hidden md:flex items-center gap-2 mr-4 px-3 py-1.5 bg-muted/30 rounded-full border border-border/50">
                <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Loading funds...</span>
            </div>
        );
    }

    if (error) return null;

    if (!funds) return null;

    const pnl = parseFloat(funds.unrealizedPnl || "0");
    const isPnlPositive = pnl >= 0;

    return (
        <div className="hidden md:flex items-center gap-4 mr-4">
            <div className="flex flex-col items-end">
                <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider leading-none mb-1">Available</span>
                <span className="text-sm font-bold leading-none font-mono">
                    {funds.currency}{parseFloat(funds.availableBalance).toFixed(2)}
                </span>
            </div>

            {/* Optional: Show P&L if relevant */}
            {pnl !== 0 && (
                <div className={`flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-md bg-opacity-10 ${isPnlPositive ? 'bg-green-500 text-green-600 dark:text-green-400' : 'bg-red-500 text-red-600 dark:text-red-400'}`}>
                    {isPnlPositive ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                    {funds.currency}{Math.abs(pnl).toFixed(2)}
                </div>
            )}
        </div>
    );
}
