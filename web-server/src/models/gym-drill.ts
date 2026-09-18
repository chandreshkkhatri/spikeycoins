import mongoose, { Document, Model, Schema } from "mongoose";

export interface IGymDrill extends Document {
  userId: string;
  drillType: "PIVOT" | "MOMENTUM" | "ALIGNMENT" | "IMPULSE_CORRECTIVE";
  symbol: string;
  interval: string;
  candles: any[];
  lowerCandles?: any[];
  higherCandles?: any[];
  answerKey: any;
  userSubmission?: any;
  score?: number | null;
  metrics?: any;
  status: "ACTIVE" | "SUBMITTED" | "ABANDONED";
  createdAt: Date;
  submittedAt?: Date;
}

const GymDrillSchema = new Schema<IGymDrill>(
  {
    userId: { type: String, required: true, index: true },
    drillType: {
      type: String,
      enum: ["PIVOT", "MOMENTUM", "ALIGNMENT", "IMPULSE_CORRECTIVE"],
      required: true,
    },
    symbol: { type: String, required: true },
    interval: { type: String, required: true },
    candles: [Schema.Types.Mixed],
    lowerCandles: [Schema.Types.Mixed],
    higherCandles: [Schema.Types.Mixed],
    answerKey: Schema.Types.Mixed,
    userSubmission: Schema.Types.Mixed,
    score: { type: Number, default: null },
    metrics: Schema.Types.Mixed,
    status: {
      type: String,
      enum: ["ACTIVE", "SUBMITTED", "ABANDONED"],
      default: "ACTIVE",
    },
    submittedAt: { type: Date },
  },
  {
    timestamps: true,
  }
);

GymDrillSchema.index({ userId: 1, drillType: 1, createdAt: -1 });

const GymDrill: Model<IGymDrill> =
  mongoose.models?.GymDrill || mongoose.model<IGymDrill>("GymDrill", GymDrillSchema);

export default GymDrill;
