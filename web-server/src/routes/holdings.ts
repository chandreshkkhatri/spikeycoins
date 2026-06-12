import { Router, Response } from "express";
import { requireAuth, requireAccountAccess, AuthenticatedRequest } from "../lib/auth-middleware";
import { asyncHandler } from "../lib/async-handler";
import { BrokerFactory } from "../lib/broker-factory";
import { formatHolding } from "../lib/format-utils";

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
router.get(
  "/",
  requireAuth,
  requireAccountAccess,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const account = req.account!;
    let holdings;

    if (account.accountType === "kite") {
      if (!account.accessToken) {
        return res.status(401).json({ error: "Account not authenticated" });
      }
      const kiteClient = BrokerFactory.getKiteClient(account);
      holdings = await kiteClient.getHoldings();
    } else if (account.accountType === "upstox") {
      if (!account.accessToken) {
        return res.status(401).json({ error: "Account not authenticated" });
      }
      const upstoxClient = BrokerFactory.getUpstoxClient(account);

      try {
        holdings = await upstoxClient.getHoldings();
      } catch (upstoxError: any) {
        console.warn(
          "Upstox SDK error (known superagent issue):",
          upstoxError.message,
        );
        holdings = [];
      }
    } else if (account.accountType === "binance") {
      const binanceClient = BrokerFactory.getBinanceClient(account);

      try {
        holdings = await binanceClient.getSpotBalances();
      } catch (binanceError: any) {
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

    const unifiedHoldings = Array.isArray(holdings)
      ? holdings.map((holding: any) => formatHolding(holding, account))
      : [];

    return res.json({
      success: true,
      data: unifiedHoldings,
      accountType: account.accountType,
    });
  })
);

export default router;
