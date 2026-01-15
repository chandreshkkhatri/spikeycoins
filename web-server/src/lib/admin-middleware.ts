/**
 * Admin Middleware
 * Protects admin-only routes
 */

import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from './auth-middleware';
import User from '../models/user';

/**
 * Require admin role middleware
 * Must be used after authentication middleware
 */
export async function requireAdmin(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // Check if user is authenticated
    if (!req.user || !req.user.id) {
      res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
      return;
    }

    // Fetch fresh user data from database to verify role
    const user = await User.findById(req.user.id);
    
    if (!user) {
      res.status(401).json({
        success: false,
        error: 'User not found',
      });
      return;
    }

    if (user.role !== 'admin') {
      res.status(403).json({
        success: false,
        error: 'Admin access required',
      });
      return;
    }

    // User is admin, proceed
    next();
  } catch (error) {
    console.error('Admin middleware error:', error);
    res.status(500).json({
      success: false,
      error: 'Authorization check failed',
    });
  }
}

export default requireAdmin;
