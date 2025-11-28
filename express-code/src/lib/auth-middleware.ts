import { Request, Response, NextFunction } from "express";
import crypto from "crypto";

// JWT implementation without external dependencies
const JWT_SECRET = process.env.JWT_SECRET || "flip-safe-jwt-secret-change-in-production";
const JWT_EXPIRY_SECONDS = 15 * 60; // 15 minutes

export interface JWTPayload {
  userId: string;
  email: string;
  iat: number;
  exp: number;
}

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
  };
}

// Simple base64url encoding/decoding
function base64urlEncode(str: string): string {
  return Buffer.from(str)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

function base64urlDecode(str: string): string {
  str = str.replace(/-/g, "+").replace(/_/g, "/");
  while (str.length % 4) str += "=";
  return Buffer.from(str, "base64").toString();
}

// Create HMAC signature
function sign(payload: string): string {
  return crypto
    .createHmac("sha256", JWT_SECRET)
    .update(payload)
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

// Generate JWT token
export function generateToken(userId: string, email: string): string {
  const header = { alg: "HS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const payload: JWTPayload = {
    userId,
    email,
    iat: now,
    exp: now + JWT_EXPIRY_SECONDS,
  };

  const headerEncoded = base64urlEncode(JSON.stringify(header));
  const payloadEncoded = base64urlEncode(JSON.stringify(payload));
  const signature = sign(`${headerEncoded}.${payloadEncoded}`);

  return `${headerEncoded}.${payloadEncoded}.${signature}`;
}

// Generate refresh token (random string)
export function generateRefreshToken(): string {
  return crypto.randomBytes(64).toString("hex");
}

// Verify JWT token
export function verifyToken(token: string): JWTPayload | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;

    const [headerEncoded, payloadEncoded, signature] = parts;
    
    // Verify signature
    const expectedSignature = sign(`${headerEncoded}.${payloadEncoded}`);
    if (signature !== expectedSignature) return null;

    // Decode and parse payload
    const payload: JWTPayload = JSON.parse(base64urlDecode(payloadEncoded));

    // Check expiration
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp < now) return null;

    return payload;
  } catch {
    return null;
  }
}

// Auth middleware - requires valid JWT
export function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "No token provided" });
    return;
  }

  const token = authHeader.substring(7);
  const payload = verifyToken(token);

  if (!payload) {
    res.status(401).json({ error: "Invalid or expired token" });
    return;
  }

  req.user = {
    id: payload.userId,
    email: payload.email,
  };

  next();
}

// Optional auth middleware - attaches user if valid token exists
export function optionalAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers.authorization;

  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.substring(7);
    const payload = verifyToken(token);

    if (payload) {
      req.user = {
        id: payload.userId,
        email: payload.email,
      };
    }
  }

  next();
}

// Get refresh token expiry (30 days)
export function getRefreshTokenExpiry(): Date {
  return new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
}

export { JWT_EXPIRY_SECONDS };
