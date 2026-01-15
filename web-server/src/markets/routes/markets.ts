/**
 * Markets API Routes
 * Unified endpoints for all market data (crypto, stocks)
 */

import { Router, Request, Response } from 'express';
import MarketRegistry from '../services/MarketRegistry';
import { MarketType } from '../interfaces/IMarketProvider';

const marketsRouter: Router = Router();
const registry = MarketRegistry.getInstance();

/**
 * GET /api/markets/health
 * Health check and status
 */
marketsRouter.get('/health', (req: Request, res: Response) => {
  const status = registry.getStatus();
  res.json({
    success: true,
    message: 'Markets API is running',
    ...status,
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /api/markets/tickers
 * Get all tickers from all connected providers
 * Query params: ?type=crypto|stocks (optional)
 */
marketsRouter.get('/tickers', async (req: Request, res: Response) => {
  try {
    const marketTypeParam = req.query.type as string | undefined;
    
    let tickers;
    if (marketTypeParam && ['crypto', 'stocks'].includes(marketTypeParam)) {
      tickers = await registry.getTickersByType(marketTypeParam as MarketType);
    } else {
      tickers = await registry.getAllTickers();
    }
    
    res.json({
      success: true,
      count: tickers.length,
      data: tickers,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Markets API: Error fetching tickers:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch tickers',
    });
  }
});

/**
 * GET /api/markets/tickers/:symbol
 * Get ticker for specific symbol
 */
marketsRouter.get('/tickers/:symbol', async (req: Request, res: Response) => {
  try {
    const symbol = req.params.symbol.toUpperCase();
    const ticker = await registry.getTickerBySymbol(symbol);
    
    if (!ticker) {
      res.status(404).json({
        success: false,
        error: `Ticker not found: ${symbol}`,
      });
      return;
    }
    
    res.json({
      success: true,
      data: ticker,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Markets API: Error fetching ticker:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch ticker',
    });
  }
});

/**
 * GET /api/markets/candles/:symbol
 * Get historical candlestick data
 * Query params: ?interval=5m&limit=288
 */
marketsRouter.get('/candles/:symbol', async (req: Request, res: Response) => {
  try {
    const symbol = req.params.symbol.toUpperCase();
    const interval = (req.query.interval as string) || '5m';
    const limit = parseInt(req.query.limit as string) || 288;
    
    const candles = await registry.getHistoricalData(symbol, interval, limit);
    
    if (candles.length === 0) {
      res.status(404).json({
        success: false,
        error: `No candlestick data found for ${symbol}`,
      });
      return;
    }
    
    res.json({
      success: true,
      symbol,
      interval,
      count: candles.length,
      data: candles,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Markets API: Error fetching candles:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch candlestick data',
    });
  }
});

/**
 * GET /api/markets/providers
 * List all registered providers and their status
 */
marketsRouter.get('/providers', (req: Request, res: Response) => {
  const providers = registry.getAllProviders().map(p => ({
    name: p.providerName,
    type: p.marketType,
    ...p.getStatus(),
  }));
  
  res.json({
    success: true,
    count: providers.length,
    providers,
    timestamp: new Date().toISOString(),
  });
});

export default marketsRouter;
