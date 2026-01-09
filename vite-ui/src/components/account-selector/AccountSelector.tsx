import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";

interface TradingAccount {
  _id: string;
  accountName: string;
  accountType: "binance" | "kite" | "upstox";
  isActive: boolean;
  accessToken?: string;
}

interface AccountSelectorProps {
  accounts: TradingAccount[];
  selectedAccount: TradingAccount | null;
  onAccountSelect: (account: TradingAccount) => void;
  loading?: boolean;
  compact?: boolean;
}

export default function AccountSelector({
  accounts,
  selectedAccount,
  onAccountSelect,
  loading = false,
  compact = false,
}: AccountSelectorProps) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 px-3 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="hidden sm:inline">Loading...</span>
      </div>
    );
  }

  // Only show "no accounts" state when we're definitely not loading and have no accounts
  if (accounts.length === 0) {
    return (
      <div className="flex items-center gap-2">
        <span className="hidden text-sm text-muted-foreground sm:inline">
          No accounts
        </span>
        <Button
          size="sm"
          variant="outline"
          onClick={() => (window.location.href = "/accounts")}
          className="h-8"
        >
          Add
        </Button>
      </div>
    );
  }

  const getAccountIcon = (accountType: string) => {
    switch (accountType) {
      case "binance":
        return "🟡";
      case "kite":
        return "🟠";
      case "upstox":
        return "🔵";
      default:
        return "🔗";
    }
  };

  return (
    <Select
      value={selectedAccount?._id}
      onValueChange={(value) => {
        const account = accounts.find((a) => a._id === value);
        if (account) onAccountSelect(account);
      }}
    >
      <SelectTrigger className={compact ? "h-9 w-auto min-w-[40px] md:w-[160px] lg:w-[200px]" : "h-9 w-[160px] sm:w-[200px]"}>
        <SelectValue placeholder="Select Account">
          {selectedAccount && (
            <div className="flex items-center gap-2 overflow-hidden">
              <span className="shrink-0 text-xs">
                {getAccountIcon(selectedAccount.accountType)}
              </span>
              <span className={`truncate text-sm font-medium ${compact ? "hidden md:inline" : ""}`}>
                {selectedAccount.accountName}
              </span>
            </div>
          )}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {accounts.map((account) => (
          <SelectItem key={account._id} value={account._id}>
            <div className="flex items-center gap-2">
              <span className="text-xs">
                {getAccountIcon(account.accountType)}
              </span>
              <span className="font-medium">{account.accountName}</span>
              <span className="ml-1 text-xs capitalize text-muted-foreground">
                ({account.accountType})
              </span>
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
