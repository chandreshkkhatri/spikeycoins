/**
 * Admin Routes
 * Protected routes for admin users only
 */

import { Router, Request, Response } from 'express';
import { requireAuth, AuthenticatedRequest } from '../lib/auth-middleware';
import { requireAdmin } from '../lib/admin-middleware';
import User from '../models/user';
import fs from 'fs';
import path from 'path';
import readline from 'readline';
import zlib from 'zlib';

const adminRouter: Router = Router();

// All admin routes require authentication + admin role
// Note: Authentication middleware should be applied before this router

/**
 * GET /api/admin/status
 * Check if current user is admin
 */
adminRouter.get('/status', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user?.id) {
      res.json({ isAdmin: false });
      return;
    }

    const user = await User.findById(req.user.id);
    res.json({
      isAdmin: user?.role === 'admin',
      role: user?.role || 'user',
    });
  } catch (_error) {
    res.json({ isAdmin: false });
  }
});

/**
 * POST /api/admin/sync-marketcap
 * Trigger CoinGecko market cap sync
 */
adminRouter.post('/sync-marketcap', requireAuth, requireAdmin, async (_req: Request, res: Response) => {
  try {
    const CoinGeckoSyncService = (await import('../crypto/services/CoinGeckoSyncService')).default;
    const MarketCapService = (await import('../crypto/services/MarketCapService')).default;

    const syncService = CoinGeckoSyncService.getInstance();
    await syncService.forceSync();
    await MarketCapService.forceReload();

    const symbolCount = MarketCapService.getAllSymbols().size;

    res.json({
      success: true,
      message: 'Market cap data synced from CoinGecko',
      symbolsWithMarketCap: symbolCount,
      lastUpdate: MarketCapService.getLastUpdateTime()?.toISOString() || null,
    });
  } catch (error) {
    console.error('Admin: Error syncing market cap:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to sync market cap data',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * GET /api/admin/users
 * List all users (admin only)
 */
adminRouter.get('/users', requireAuth, requireAdmin, async (_req: Request, res: Response) => {
  try {
    const users = await User.find({})
      .select('email name role createdAt isEmailVerified')
      .sort({ createdAt: -1 })
      .limit(100);

    res.json({
      success: true,
      count: users.length,
      users,
    });
  } catch (error) {
    console.error('Admin: Error fetching users:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch users',
    });
  }
});

/**
 * PATCH /api/admin/users/:userId/role
 * Update user role (admin only)
 */
adminRouter.patch('/users/:userId/role', requireAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const { role } = req.body;

    if (!['user', 'admin'].includes(role)) {
      res.status(400).json({
        success: false,
        error: 'Invalid role. Must be "user" or "admin".',
      });
      return;
    }

    const user = await User.findByIdAndUpdate(
      userId,
      { role },
      { new: true }
    ).select('email name role');

    if (!user) {
      res.status(404).json({
        success: false,
        error: 'User not found',
      });
      return;
    }

    res.json({
      success: true,
      message: `User role updated to "${role}"`,
      user,
    });
  } catch (error) {
    console.error('Admin: Error updating user role:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update user role',
    });
  }
});

/**
 * POST /api/admin/run-research
 * Manually trigger the automated research job
 */
adminRouter.post('/run-research', requireAuth, requireAdmin, async (_req: Request, res: Response) => {
  try {
    const { runResearchNow, isResearchRunning } = await import('../jobs/researchCron');

    if (isResearchRunning()) {
      res.status(409).json({
        success: false,
        message: 'Research job is already running',
      });
      return;
    }

    // Run async - don't wait for completion
    runResearchNow().then((result) => {
      console.log('[Admin] Research job result:', result);
    });

    res.json({
      success: true,
      message: 'Research job started. Check /api/summaries for results.',
    });
  } catch (error) {
    console.error('Admin: Error triggering research:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to trigger research job',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * GET /api/admin/research-status
 * Check if research job is currently running
 */
adminRouter.get('/research-status', requireAuth, requireAdmin, async (_req: Request, res: Response) => {
  try {
    const { isResearchRunning } = await import('../jobs/researchCron');

    res.json({
      success: true,
      isRunning: isResearchRunning(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to check research status',
    });
  }
});

/**
 * GET /api/admin/system
 * Get system status with detailed memory and service stats (admin only)
 */
adminRouter.get('/system', requireAuth, requireAdmin, async (_req: Request, res: Response) => {
  try {
    const os = await import('os');
    const memoryUsage = process.memoryUsage();
    const systemMemory = {
      total: os.totalmem(),
      free: os.freemem(),
    };

    // Get service-level stats
    const DataManager = (await import('../crypto/core/DataManager')).default;
    const CandlestickStorage = (await import('../crypto/services/CandlestickStorage')).default;
    
    const dataManagerStats = DataManager.getStats();
    const storageStats = await CandlestickStorage.getStats();

    const formatBytes = (bytes: number): string => {
      const sizes = ['Bytes', 'KB', 'MB', 'GB'];
      if (bytes === 0) return '0 Byte';
      const i = Math.floor(Math.log(bytes) / Math.log(1024));
      return Math.round(bytes / Math.pow(1024, i)) + ' ' + sizes[i];
    };

    res.json({
      success: true,
      uptime: process.uptime(),
      process: {
        rss: formatBytes(memoryUsage.rss),
        heapTotal: formatBytes(memoryUsage.heapTotal),
        heapUsed: formatBytes(memoryUsage.heapUsed),
        external: formatBytes(memoryUsage.external),
      },
      system: {
        total: formatBytes(systemMemory.total),
        free: formatBytes(systemMemory.free),
        usedPercent: ((1 - systemMemory.free / systemMemory.total) * 100).toFixed(2) + '%',
      },
      services: {
        dataManager: dataManagerStats,
        candlestickStorage: storageStats,
      },
      nodeVersion: process.version,
      platform: process.platform,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Admin: Error fetching system status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch system status',
    });
  }
});

// ─── Log Management Endpoints ────────────────────────────────────────────────

const LOGS_DIR = path.join(process.cwd(), 'logs');

/**
 * GET /api/admin/logs/files
 * List available log files with size and last modified time
 */
adminRouter.get('/logs/files', requireAuth, requireAdmin, async (_req: Request, res: Response) => {
  try {
    if (!fs.existsSync(LOGS_DIR)) {
      return res.json({ success: true, files: [] });
    }

    const entries = fs.readdirSync(LOGS_DIR);
    const files = entries
      .filter((f) => f.endsWith('.log') || f.endsWith('.log.gz'))
      .map((name) => {
        const stat = fs.statSync(path.join(LOGS_DIR, name));
        return {
          name,
          size: stat.size,
          sizeHuman: formatBytes(stat.size),
          modified: stat.mtime.toISOString(),
          compressed: name.endsWith('.gz'),
        };
      })
      .sort((a, b) => b.modified.localeCompare(a.modified));

    res.json({ success: true, files });
  } catch (error) {
    console.error('Admin: Error listing log files:', error);
    res.status(500).json({ success: false, error: 'Failed to list log files' });
  }
});

/**
 * GET /api/admin/logs/read
 * Read log file content with optional filtering
 * Query params:
 *   file     - log file name (default: today's application log)
 *   lines    - max lines to return (default: 500, max: 5000)
 *   level    - filter by level: INFO, WARN, ERROR (comma-separated)
 *   search   - text search filter (case-insensitive)
 *   tail     - if 'true', return last N lines (default: true)
 */
adminRouter.get('/logs/read', requireAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const fileName = (req.query.file as string) || `application-${today}.log`;
    const maxLines = Math.min(parseInt(req.query.lines as string) || 500, 5000);
    const levelFilter = (req.query.level as string)?.toUpperCase().split(',').filter(Boolean) || [];
    const searchFilter = (req.query.search as string)?.toLowerCase() || '';
    const tailMode = (req.query.tail as string) !== 'false';

    // Sanitize filename to prevent path traversal
    const safeName = path.basename(fileName);
    const filePath = path.join(LOGS_DIR, safeName);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, error: `Log file not found: ${safeName}` });
    }

    const isGz = safeName.endsWith('.gz');
    let allLines: string[] = [];

    // Read lines from file (or gzipped file)
    const readStream = isGz
      ? fs.createReadStream(filePath).pipe(zlib.createGunzip())
      : fs.createReadStream(filePath, { encoding: 'utf8' });

    const rl = readline.createInterface({ input: readStream, crlfDelay: Infinity });

    for await (const line of rl) {
      if (!line.trim()) continue;

      // Apply level filter
      if (levelFilter.length > 0) {
        const lineUpper = line.toUpperCase();
        if (!levelFilter.some((lvl) => lineUpper.includes(`[${lvl}]`))) continue;
      }

      // Apply search filter
      if (searchFilter && !line.toLowerCase().includes(searchFilter)) continue;

      allLines.push(line);
    }

    // Return last N lines (tail) or first N lines
    const resultLines = tailMode
      ? allLines.slice(-maxLines)
      : allLines.slice(0, maxLines);

    res.json({
      success: true,
      file: safeName,
      totalMatching: allLines.length,
      returned: resultLines.length,
      truncated: allLines.length > maxLines,
      lines: resultLines,
    });
  } catch (error) {
    console.error('Admin: Error reading log file:', error);
    res.status(500).json({ success: false, error: 'Failed to read log file' });
  }
});

/**
 * GET /api/admin/logs/pm2
 * Read PM2 stdout/stderr logs (where console.log/console.error go)
 * Query params:
 *   type     - 'out' or 'error' (default: 'out')
 *   lines    - max lines to return (default: 500, max: 5000)
 *   search   - text search filter (case-insensitive)
 */
adminRouter.get('/logs/pm2', requireAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const type = (req.query.type as string) === 'error' ? 'error' : 'out';
    const maxLines = Math.min(parseInt(req.query.lines as string) || 500, 5000);
    const searchFilter = (req.query.search as string)?.toLowerCase() || '';

    // Find the PM2 log file
    const pm2LogDir = path.join(process.env.HOME || '/home/ubuntu', '.pm2', 'logs');
    const possibleNames = [
      `spikey-coins-prod-${type}.log`,
      `spikey-coins-backend-${type}.log`,
    ];

    let logFilePath = '';
    for (const name of possibleNames) {
      const p = path.join(pm2LogDir, name);
      if (fs.existsSync(p)) {
        logFilePath = p;
        break;
      }
    }

    if (!logFilePath) {
      return res.status(404).json({
        success: false,
        error: `PM2 ${type} log not found. Checked: ${possibleNames.join(', ')}`,
      });
    }

    let allLines: string[] = [];
    const readStream = fs.createReadStream(logFilePath, { encoding: 'utf8' });
    const rl = readline.createInterface({ input: readStream, crlfDelay: Infinity });

    for await (const line of rl) {
      if (!line.trim()) continue;
      if (searchFilter && !line.toLowerCase().includes(searchFilter)) continue;
      allLines.push(line);
    }

    const resultLines = allLines.slice(-maxLines);

    res.json({
      success: true,
      file: path.basename(logFilePath),
      totalMatching: allLines.length,
      returned: resultLines.length,
      truncated: allLines.length > maxLines,
      lines: resultLines,
    });
  } catch (error) {
    console.error('Admin: Error reading PM2 logs:', error);
    res.status(500).json({ success: false, error: 'Failed to read PM2 logs' });
  }
});

export default adminRouter;
