import mongoose from "mongoose";

// Grace period in milliseconds - old tokens are still valid for this duration after being replaced
export const REFRESH_TOKEN_GRACE_PERIOD_MS = 30 * 1000; // 30 seconds

export interface IRefreshToken {
  _id?: string;
  userId: mongoose.Types.ObjectId | string;
  token: string;
  expiresAt: Date;
  replacedAt?: Date; // When this token was used and replaced with a new one
  replacedByToken?: string; // The new token that replaced this one
  createdAt?: Date;
}

const refreshTokenSchema = new mongoose.Schema<IRefreshToken>(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    token: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    expiresAt: {
      type: Date,
      required: true,
      // Note: TTL index defined at schema level (line 50) handles auto-deletion
    },
    replacedAt: {
      type: Date,
      default: null,
    },
    replacedByToken: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// TTL index to auto-delete expired tokens
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Also delete tokens that were replaced more than grace period ago
// This helps clean up old replaced tokens
refreshTokenSchema.index({ replacedAt: 1 }, { 
  expireAfterSeconds: 60, // Clean up replaced tokens after 60 seconds
  partialFilterExpression: { replacedAt: { $exists: true, $ne: null } }
});

// Clean up old tokens for a user (keep only last 5 active tokens)
refreshTokenSchema.statics.cleanupOldTokens = async function (
  userId: string,
  keepCount: number = 5
): Promise<void> {
  // Only count non-replaced tokens
  const tokens = await this.find({ userId, replacedAt: null })
    .sort({ createdAt: -1 })
    .skip(keepCount)
    .select("_id");
  
  if (tokens.length > 0) {
    await this.deleteMany({
      _id: { $in: tokens.map((t: { _id: mongoose.Types.ObjectId }) => t._id) },
    });
  }
  
  // Also clean up any replaced tokens that are past grace period
  const gracePeriodCutoff = new Date(Date.now() - REFRESH_TOKEN_GRACE_PERIOD_MS);
  await this.deleteMany({
    userId,
    replacedAt: { $ne: null, $lt: gracePeriodCutoff },
  });
};

const RefreshToken =
  mongoose.models.RefreshToken ||
  mongoose.model<IRefreshToken>("RefreshToken", refreshTokenSchema);

export default RefreshToken;
