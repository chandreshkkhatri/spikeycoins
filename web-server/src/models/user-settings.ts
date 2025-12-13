import mongoose, { HydratedDocument } from "mongoose";

export interface IUserSettings {
  userId: mongoose.Types.ObjectId | string;
  theme: "light" | "dark" | "system";
  chartSettings: {
    selectedTimeframes?: Array<{ interval: string; label: string; index: number }>;
    chartTimeframes?: { [index: number]: string };
    autoScale?: boolean;
    isLogScale?: boolean;
    isCollapsed?: boolean;
    collapsedCharts?: { [interval: string]: boolean };
  };
  watchlistSettings: {
    sortKey?: string;
    sortDirection?: "asc" | "desc";
    lastSelectedSymbol?: string;
  };
  tradingDefaults: {
    defaultQuantity?: number;
    defaultLeverage?: number;
    defaultOrderType?: "market" | "limit";
    showConfirmation?: boolean;
  };
  createdAt?: Date;
  updatedAt?: Date;
}

export type UserSettingsDocument = HydratedDocument<IUserSettings>;

const userSettingsSchema = new mongoose.Schema<IUserSettings>(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },
    theme: {
      type: String,
      enum: ["light", "dark", "system"],
      default: "system",
    },
    chartSettings: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    watchlistSettings: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    tradingDefaults: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

// Static method to get or create settings for a user
userSettingsSchema.statics.getOrCreate = async function (
  userId: string
): Promise<UserSettingsDocument> {
  let settings = await this.findOne({ userId });
  
  if (!settings) {
    settings = await this.create({
      userId,
      theme: "system",
      chartSettings: {},
      watchlistSettings: {},
      tradingDefaults: {},
    });
  }
  
  return settings;
};

// Interface for the model with static methods
interface IUserSettingsModel extends mongoose.Model<IUserSettings> {
  getOrCreate(userId: string): Promise<UserSettingsDocument>;
}

const UserSettings: IUserSettingsModel =
  (mongoose.models.UserSettings as unknown as IUserSettingsModel) ||
  mongoose.model<IUserSettings, IUserSettingsModel>("UserSettings", userSettingsSchema);

export default UserSettings;
