/**
 * Admin Routes
 * Protected routes for admin users only
 */

import { Router, Request, Response } from 'express';
import { requireAuth, AuthenticatedRequest } from '../lib/auth-middleware';
import { requireAdmin } from '../lib/admin-middleware';
import User from '../models/user';

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

export default adminRouter;
