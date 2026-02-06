import mongoose, { Document, Model, Schema } from "mongoose";

export interface IJournalSync extends Document {
  accountId: string;
  userId: string;
  lastSyncTime: number;
  lastFillTime: number;
  syncStatus: "idle" | "syncing" | "error";
  lastError: string | null;
  initialSyncCompleted: boolean;
  totalFillsSynced: number;
  symbolsSynced: string[];
  createdAt: Date;
  updatedAt: Date;
}

const JournalSyncSchema = new Schema<IJournalSync>(
  {
    accountId: { type: String, required: true },
    userId: { type: String, required: true },
    lastSyncTime: { type: Number, default: 0 },
    lastFillTime: { type: Number, default: 0 },
    syncStatus: {
      type: String,
      enum: ["idle", "syncing", "error"],
      default: "idle",
    },
    lastError: { type: String, default: null },
    initialSyncCompleted: { type: Boolean, default: false },
    totalFillsSynced: { type: Number, default: 0 },
    symbolsSynced: { type: [String], default: [] },
  },
  {
    timestamps: true,
  },
);

JournalSyncSchema.index({ accountId: 1 }, { unique: true });
JournalSyncSchema.index({ userId: 1 });

const JournalSync: Model<IJournalSync> =
  mongoose.models?.JournalSync ||
  mongoose.model<IJournalSync>("JournalSync", JournalSyncSchema);

export default JournalSync;
