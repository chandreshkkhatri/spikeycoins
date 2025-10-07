import mongoose, { Document, Model, Schema } from 'mongoose';

export interface IWatchlistItem {
  symbol: string;
  name?: string;
  exchange?: string;
  token?: string;
  segment?: string;
  instrument_type?: string;
  isin?: string;
  addedAt: Date;
}

export interface IWatchlist extends Document {
  userId: string;
  accountId: string;
  name: string;
  marketType: string;
  symbols: IWatchlistItem[];
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const WatchlistItemSchema = new Schema<IWatchlistItem>({
  symbol: { type: String, required: true },
  name: { type: String },
  exchange: { type: String },
  token: { type: String },
  segment: { type: String },
  instrument_type: { type: String },
  isin: { type: String },
  addedAt: { type: Date, default: Date.now },
});

const WatchlistSchema = new Schema<IWatchlist>(
  {
    userId: { type: String, required: true },
    accountId: { type: String, required: true },
    name: { type: String, required: true },
    marketType: { type: String, required: true },
    symbols: [WatchlistItemSchema],
    isDefault: { type: Boolean, default: false },
  },
  {
    timestamps: true,
  }
);

// Index for quick lookups
WatchlistSchema.index({ userId: 1, accountId: 1 });
WatchlistSchema.index({ userId: 1, accountId: 1, isDefault: 1 });

const Watchlist: Model<IWatchlist> =
  mongoose.models?.Watchlist || mongoose.model<IWatchlist>('Watchlist', WatchlistSchema);

export default Watchlist;