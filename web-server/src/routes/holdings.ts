import { Router, Request, Response } from "express";
import kiteConnectService from "../lib/kiteconnect-service";
import upstoxService from "../lib/upstox-service";
import { BinanceService } from "../lib/binance-service";
import { getAccountById } from "../models/account";

const router: Router = Router();

/**
 * Parse Binance error and return user-friendly message
 */
function parseBinanceError(error: any): { 
  message: string; 
  code: string;
  isPermissionError: boolean;
  suggestion?: string;
} {
  const errorData = error.response?.data;
  const errorCode = errorData?.code;
  const errorMsg = errorData?.msg || error.message || "Unknown error";

  // Binance error codes related to permissions
  // -2015: Invalid API-key, IP, or permissions for action
  // -1022: Signature for this request is not valid (often means wrong permissions)
  // -2014: API-key format invalid
  // -1102: Mandatory parameter was not sent (could indicate missing feature access)
  
  const permissionErrorCodes = [-2015, -1022, -2014];
  const isPermissionError = permissionErrorCodes.includes(errorCode) || 
    errorMsg.toLowerCase().includes('permission') ||
    errorMsg.toLowerCase().includes('not allowed') ||
    errorMsg.toLowerCase().includes('unauthorized');

  if (isPermissionError || errorCode === -2015) {
    return {
      message: "API key does not have permission to read Spot wallet data",
      code: String(errorCode || "PERMISSION_DENIED"),
      isPermissionError: true,
      suggestion: "Enable 'Enable Reading' permission for Spot wallet in your Binance API key settings"
    };
  }

  // Check for IP restriction errors
  if (errorMsg.includes("IP") || errorCode === -2015) {
    return {
      message: errorMsg,
      code: String(errorCode || "IP_RESTRICTED"),
      isPermissionError: true,
      suggestion: "Ensure your IP address is whitelisted in your Binance API key settings"
    };
  }

  return {
    message: errorMsg,
    code: String(errorCode || "UNKNOWN"),
    isPermissionError: false
  };
}

// GET /api/holdings - Get holdings for an account
router.get("/", async (req: Request, res: Response) => {
  try {
    const { accountId } = req.query;

    if (!accountId) {
      return res.status(400).json({ error: "accountId is required" });
    }

    const account = await getAccountById(accountId as string);

    if (!account) {
      return res.status(404).json({ error: "Account not found" });
    }

    let holdings;

    if (account.accountType === "kite") {
      if (!account.accessToken) {
        return res.status(401).json({ error: "Account not authenticated" });
      }
      kiteConnectService.initializeWithCredentials(
        account.apiKey,
        account.apiSecret,
      );
      kiteConnectService.setAccessToken(account.accessToken);
      holdings = await kiteConnectService.getHoldings();
    } else if (account.accountType === "upstox") {
      if (!account.accessToken) {
        return res.status(401).json({ error: "Account not authenticated" });
      }
      const isSandbox = account.metadata?.sandbox || false;
      upstoxService.initializeWithCredentials(
        account.apiKey,
        account.apiSecret,
        isSandbox,
      );
      upstoxService.setAccessToken(account.accessToken);

      try {
        holdings = await upstoxService.getHoldings();
      } catch (upstoxError: any) {
        // Handle Upstox SDK superagent bug - return empty array for now
        console.warn(
          "Upstox SDK error (known superagent issue):",
          upstoxError.message,
        );
        holdings = [];
      }
    } else if (account.accountType === "binance") {
      const isTestnet = account.metadata?.testnet || false;

      const binanceService = new BinanceService();
      binanceService.initializeWithCredentials(
        account.apiKey,
        account.apiSecret,
        isTestnet,
      );

      // Always fetch spot balances for holdings regardless of trading segment metadata
      try {
        holdings = await binanceService.getSpotBalances();
      } catch (binanceError: any) {
        // Parse Binance-specific errors
        const parsedError = parseBinanceError(binanceError);
        console.error("Binance holdings error:", parsedError);
        
        return res.status(parsedError.isPermissionError ? 403 : 500).json({
          success: false,
          error: parsedError.message,
          code: parsedError.code,
          isPermissionError: parsedError.isPermissionError,
          suggestion: parsedError.suggestion,
          data: [],
        });
      }
    } else {
      return res
        .status(400)
        .json({ error: "Unsupported account type for holdings" });
    }

    // Map holdings to unified format
    const unifiedHoldings = Array.isArray(holdings)
      ? holdings.map((holding: any) => {
          // Transform Binance balance format to unified holding format
          if (account.accountType === "binance") {
            const free = parseFloat(holding.free || 0);
            const locked = parseFloat(holding.locked || 0);
            const quantity = free + locked;

            return {
              id: `${account._id}-${holding.asset}`,
              symbol: holding.asset, // BTC, ETH, USDT, etc.
              exchange: "SPOT",
              quantity: quantity,
              averagePrice: 0, // Binance doesn't provide avg price in balance endpoint
              lastPrice: 0, // Would need to fetch from ticker
              currentValue: 0,
              pnl: 0,
              pnlPercentage: 0,
              vendor: account.accountType,
              accountId: account._id,
              accountName: account.accountName,
              timestamp: new Date().toISOString(),
              details: {
                free: free,
                locked: locked,
                asset: holding.asset,
              },
            };
          }

          // For other vendors, pass through with vendor info
          return {
            ...holding,
            accountId: account._id,
            accountName: account.accountName,
            vendor: account.accountType,
          };
        })
      : [];

    return res.json({
      success: true,
      data: unifiedHoldings,
      accountType: account.accountType,
    });
  } catch (error: any) {
    console.error("Error fetching holdings:", error);
    // Return consistent structure even on error
    // Include actual error message for better debugging
    const errorMessage = error.message || "Unknown error";
    return res.status(500).json({
      success: false,
      error: `Failed to fetch holdings: ${errorMessage}`,
      details: errorMessage,
      data: [], // Ensure data is always present
    });
  }
});

export default router;

