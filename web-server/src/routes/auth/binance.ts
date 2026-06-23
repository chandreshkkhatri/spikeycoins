import { Router, Request, Response } from "express";
import { BinanceService } from "../../lib/binance-service";
import connectDB from "../../lib/mongodb";
import Account from "../../models/account";

const router: Router = Router();

// POST /api/auth/binance/validate - Validate Binance API credentials
router.post("/binance/validate", async (req: Request, res: Response) => {
  try {
    const { accountId } = req.body;

    if (!accountId) {
      return res.status(400).json({ error: "accountId parameter is required" });
    }

    await connectDB();
    const account = await Account.findById(accountId);

    if (!account) {
      return res.status(404).json({ error: "Account not found" });
    }

    if (account.accountType !== "binance") {
      return res
        .status(400)
        .json({ error: "Invalid account type. Expected Binance account." });
    }

    if (!account.apiKey || !account.apiSecret) {
      return res
        .status(400)
        .json({ error: "API credentials not found for this account" });
    }

    const tradingSegment = account.metadata?.tradingSegment || "spot";
    const isTestnet = account.metadata?.testnet || false;

    // Initialize Binance service with credentials
    const binanceService = new BinanceService();
    binanceService.initializeWithCredentials(
      account.apiKey,
      account.apiSecret,
      isTestnet,
    );

    // Test connectivity based on trading segment
    let validationResult;
    if (tradingSegment === "usdm") {
      await binanceService.testFuturesConnectivity();
      // Get account info to validate permissions
      validationResult = await binanceService.getFuturesAccount();
    } else {
      await binanceService.testSpotConnectivity();
      // Get account info to validate permissions
      validationResult = await binanceService.getSpotAccount();
    }

    // Update account with validation success (no access token needed for Binance)
    account.lastSyncAt = new Date();
    await account.save();

    return res.json({
      success: true,
      message: `Binance ${tradingSegment.toUpperCase()} credentials validated successfully`,
      canTrade:
        validationResult.canTrade !== undefined
          ? validationResult.canTrade
          : true,
      accountId: account._id,
    });
  } catch (error: any) {
    console.error("Error validating Binance credentials:", error);
    return res.status(401).json({
      success: false,
      error: "Invalid Binance API credentials",
      details: error.message,
    });
  }
});

export default router;
