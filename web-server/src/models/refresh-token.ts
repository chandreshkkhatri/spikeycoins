import mongoose from "mongoose";

export interface IRefreshToken {
  _id?: string;
  userId: mongoose.Types.ObjectId | string;
  token: string;
  expiresAt: Date;
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
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// TTL index to auto-delete expired tokens
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Clean up old tokens for a user (keep only last 5)
refreshTokenSchema.statics.cleanupOldTokens = async function (
  userId: string,
  keepCount: number = 5
): Promise<void> {
  const tokens = await this.find({ userId })
    .sort({ createdAt: -1 })
    .skip(keepCount)
    .select("_id");
  
  if (tokens.length > 0) {
    await this.deleteMany({
      _id: { $in: tokens.map((t: { _id: mongoose.Types.ObjectId }) => t._id) },
    });
  }
};

const RefreshToken =
  mongoose.models.RefreshToken ||
  mongoose.model<IRefreshToken>("RefreshToken", refreshTokenSchema);

export default RefreshToken;
