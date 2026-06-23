import { Router, Request, Response } from "express";
import connectDB from "../../lib/mongodb";
import User from "../../models/user";
import UserSettings from "../../models/user-settings";
import RefreshToken from "../../models/refresh-token";
import Invite from "../../models/invite";
import {
  generateToken,
  generateRefreshToken,
  getRefreshTokenExpiry,
} from "../../lib/auth-middleware";
import { FRONTEND_URL } from "./constants";

const router: Router = Router();

// Google OAuth configuration
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "";
const GOOGLE_REDIRECT_URI =
  process.env.GOOGLE_REDIRECT_URI ||
  "http://localhost:8000/api/auth/google/callback";

// Allowed redirect origins for OAuth (prevents open redirect vulnerability)
const ALLOWED_REDIRECT_ORIGINS = (
  process.env.ALLOWED_ORIGINS ||
  "http://localhost:3000,http://localhost:5173,http://localhost:8000"
)
  .split(",")
  .map((origin) => origin.trim());

// Validate if a redirect URL is allowed
function isValidRedirectUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return ALLOWED_REDIRECT_ORIGINS.some((origin) => {
      const allowedOrigin = new URL(origin);
      return (
        parsed.protocol === allowedOrigin.protocol &&
        parsed.host === allowedOrigin.host
      );
    });
  } catch {
    return false;
  }
}

// GET /api/auth/google - Initiate Google OAuth
router.get("/google", (req: Request, res: Response) => {
  if (!GOOGLE_CLIENT_ID) {
    return res.status(500).json({
      error: "Google OAuth is not configured",
    });
  }

  // Accept optional invite code and redirect URL to pass through OAuth flow
  const inviteCode = req.query.invite as string | undefined;
  const clientRedirect = req.query.redirect as string | undefined;

  // Validate redirect URL if provided, otherwise use default
  const validatedRedirect =
    clientRedirect && isValidRedirectUrl(clientRedirect)
      ? clientRedirect
      : FRONTEND_URL;

  // Encode invite code and redirect in state parameter (will be returned in callback)
  const stateData: { invite?: string; redirect: string } = {
    redirect: validatedRedirect,
  };
  if (inviteCode) {
    stateData.invite = inviteCode;
  }
  const state = Buffer.from(JSON.stringify(stateData)).toString("base64");

  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: GOOGLE_REDIRECT_URI,
    response_type: "code",
    scope: "openid email profile",
    access_type: "offline",
    prompt: "consent",
    state,
  });

  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  return res.redirect(authUrl);
});

// GET /api/auth/google/callback - Handle Google OAuth callback
router.get("/google/callback", async (req: Request, res: Response) => {
  // Parse state to get redirect URL early (needed for error redirects)
  let clientRedirectUrl = FRONTEND_URL;
  let inviteCodeFromState: string | null = null;

  const { state } = req.query;
  if (state && typeof state === "string") {
    try {
      const stateData = JSON.parse(Buffer.from(state, "base64").toString());
      inviteCodeFromState = stateData.invite || null;
      // Validate redirect URL from state
      if (stateData.redirect && isValidRedirectUrl(stateData.redirect)) {
        clientRedirectUrl = stateData.redirect;
      }
    } catch {
      // Invalid state, use defaults
    }
  }

  try {
    const { code, error: oauthError } = req.query;

    if (oauthError) {
      return res.redirect(`${clientRedirectUrl}/login?error=google_auth_cancelled`);
    }

    if (!code) {
      return res.redirect(`${clientRedirectUrl}/login?error=no_authorization_code`);
    }

    // Exchange code for tokens
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        code: code as string,
        grant_type: "authorization_code",
        redirect_uri: GOOGLE_REDIRECT_URI,
      }),
    });

    if (!tokenResponse.ok) {
      console.error(
        "Google token exchange failed:",
        await tokenResponse.text(),
      );
      return res.redirect(`${clientRedirectUrl}/login?error=google_token_failed`);
    }

    const tokens = await tokenResponse.json() as any;

    // Get user info
    const userInfoResponse = await fetch(
      "https://www.googleapis.com/oauth2/v2/userinfo",
      {
        headers: {
          Authorization: `Bearer ${tokens.access_token}`,
        },
      },
    );

    if (!userInfoResponse.ok) {
      return res.redirect(`${clientRedirectUrl}/login?error=google_userinfo_failed`);
    }

    const googleUser = await userInfoResponse.json() as any;

    await connectDB();

    // Check if user already exists (by googleId or email)
    const existingUser = await User.findOne({
      $or: [
        { googleId: googleUser.id },
        { email: googleUser.email.toLowerCase() },
      ],
    });

    // If user doesn't exist, check bootstrap case or validate invite code
    let validatedInvite = null;
    if (!existingUser) {
      const userCount = await User.countDocuments();
      
      // Allow first user to sign up via Google without invite code
      if (userCount === 0) {
        console.log(`First user bootstrap: Creating account for ${googleUser.email}`);
      } else if (inviteCodeFromState) {
        // Validate the invite code
        const {
          invite,
          valid,
          error: inviteError,
        } = await (Invite as any).findAndValidate(inviteCodeFromState);
        
        if (!valid || !invite) {
          console.log(`Invalid invite code for Google signup: ${inviteCodeFromState} - ${inviteError}`);
          return res.redirect(`${clientRedirectUrl}/login?error=invalid_invite`);
        }
        
        validatedInvite = invite;
        console.log(`Google signup with invite code: ${inviteCodeFromState} for ${googleUser.email}`);
      } else {
        // Not the first user and no invite code provided
        return res.redirect(`${clientRedirectUrl}/login?error=invite_required`);
      }
    }

    // Find or update existing user with Google info
    const user = await (User as any).findOrCreateFromGoogle({
      id: googleUser.id,
      email: googleUser.email,
      name: googleUser.name,
      picture: googleUser.picture,
    });

    // Mark invite as used if this was a new user signup with invite code
    if (validatedInvite && !existingUser) {
      await validatedInvite.useForUser(user._id);
    }

    // Ensure user settings exist
    await (UserSettings as any).getOrCreate(user._id.toString());

    // Generate tokens
    const accessToken = generateToken(user._id.toString(), user.email);
    const refreshToken = generateRefreshToken();

    // Save refresh token
    await RefreshToken.create({
      userId: user._id,
      token: refreshToken,
      expiresAt: getRefreshTokenExpiry(),
    });

    // Redirect to the originating client with tokens
    const params = new URLSearchParams({
      accessToken,
      refreshToken,
    });

    return res.redirect(`${clientRedirectUrl}/auth/callback?${params.toString()}`);
  } catch (error) {
    console.error("Error in Google callback:", error);
    return res.redirect(`${clientRedirectUrl}/login?error=google_auth_failed`);
  }
});

export default router;
