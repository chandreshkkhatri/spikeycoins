/**
 * Debug API Route Handlers
 * Endpoints for system monitoring and debugging
 */
import { Request, Response } from "express";
import os from "os";
import logger from "../utils/logger";
import DataManager from "../core/DataManager";
import CandlestickStorage from "../services/CandlestickStorage";

/**
 * Get memory usage statistics
 */
export async function getMemoryStats(req: Request, res: Response): Promise<void> {
  try {
    const memoryUsage = process.memoryUsage();
    const systemMemory = {
      total: os.totalmem(),
      free: os.freemem(),
      uptime: os.uptime(),
    };

    // Get service-level stats
    const dataManagerStats = DataManager.getStats();
    const storageStats = await CandlestickStorage.getStats();

    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      process: {
        rss: formatBytes(memoryUsage.rss),
        heapTotal: formatBytes(memoryUsage.heapTotal),
        heapUsed: formatBytes(memoryUsage.heapUsed),
        external: formatBytes(memoryUsage.external),
        raw: memoryUsage
      },
      system: {
        total: formatBytes(systemMemory.total),
        free: formatBytes(systemMemory.free),
        usedPercent: ((1 - systemMemory.free / systemMemory.total) * 100).toFixed(2) + '%'
      },
      services: {
        dataManager: dataManagerStats,
        candlestickStorage: storageStats
      }
    });
  } catch (error) {
    logger.error("Debug: Error getting memory stats:", error);
    res.status(500).json({
      success: false,
      error: "Failed to retrieve memory statistics"
    });
  }
}

function formatBytes(bytes: number): string {
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  if (bytes === 0) return '0 Byte';
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return Math.round(bytes / Math.pow(1024, i)) + ' ' + sizes[i];
}
