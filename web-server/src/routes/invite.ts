import { Router, Response } from "express";
import connectDB from "../lib/mongodb";
import Invite from "../models/invite";
import {
  requireAuth,
  AuthenticatedRequest,
} from "../lib/auth-middleware";

const router = Router();

// POST /api/invites - Create a new invite code
router.post("/", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { maxUses = 1, expiresInDays } = req.body;

    // Validate expiresInDays parameter
    if (expiresInDays !== null && expiresInDays !== undefined) {
      if (typeof expiresInDays !== 'number' || !Number.isFinite(expiresInDays)) {
        return res.status(400).json({
          error: "expiresInDays must be a valid number",
        });
      }
      if (expiresInDays < 1 || expiresInDays > 365) {
        return res.status(400).json({
          error: "expiresInDays must be between 1 and 365 days",
        });
      }
    }

    await connectDB();

    // Generate unique code
    let code: string;
    let attempts = 0;
    const maxAttempts = 10;

    do {
      code = (Invite as any).generateCode();
      const existing = await Invite.findOne({ code });
      if (!existing) break;
      attempts++;
    } while (attempts < maxAttempts);

    if (attempts >= maxAttempts) {
      return res.status(500).json({
        error: "Failed to generate unique invite code",
      });
    }

    // Calculate expiration date if specified
    let expiresAt = null;
    if (expiresInDays && expiresInDays > 0) {
      expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + expiresInDays);
    }

    const invite = await Invite.create({
      code,
      createdBy: req.user!.id,
      maxUses: Math.max(1, Math.min(100, maxUses)), // Limit between 1-100
      expiresAt,
    });

    return res.status(201).json({
      success: true,
      invite: {
        code: invite.code,
        maxUses: invite.maxUses,
        expiresAt: invite.expiresAt,
        createdAt: invite.createdAt,
      },
    });
  } catch (error) {
    console.error("Error creating invite:", error);
    return res.status(500).json({
      error: "Failed to create invite",
    });
  }
});

// GET /api/invites - List invites created by current user
router.get("/", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    await connectDB();

    const invites = await Invite.find({ createdBy: req.user!.id })
      .sort({ createdAt: -1 })
      .select("code maxUses usedCount expiresAt isActive createdAt");

    return res.json({
      success: true,
      invites,
    });
  } catch (error) {
    console.error("Error listing invites:", error);
    return res.status(500).json({
      error: "Failed to list invites",
    });
  }
});

// DELETE /api/invites/:code - Deactivate an invite
router.delete("/:code", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { code } = req.params;

    await connectDB();

    const invite = await Invite.findOne({ 
      code: code.toUpperCase(),
      createdBy: req.user!.id,
    });

    if (!invite) {
      return res.status(404).json({
        error: "Invite not found",
      });
    }

    invite.isActive = false;
    await invite.save();

    return res.json({
      success: true,
      message: "Invite deactivated",
    });
  } catch (error) {
    console.error("Error deactivating invite:", error);
    return res.status(500).json({
      error: "Failed to deactivate invite",
    });
  }
});

export default router;
