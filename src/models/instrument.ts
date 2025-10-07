import mongoose, { Document, Model, Schema } from 'mongoose';

export interface IInstrument extends Document {
  instrument_token: string;
  exchange_token?: string;
  tradingsymbol: string;
  name: string;
  exchange: string;
  segment?: string;
  instrument_type?: string;
  strike?: number;
  expiry?: Date;
  tick_size?: number;
  lot_size?: number;
  last_price?: number;
  // Additional fields that might vary by vendor
  [key: string]: any;
}

const InstrumentSchema = new Schema<IInstrument>(
  {
    instrument_token: { type: String, required: true, index: true },
    exchange_token: { type: String },
    tradingsymbol: { type: String, required: true, index: true },
    name: { type: String, required: true, index: true },
    exchange: { type: String, required: true, index: true },
    segment: { type: String },
    instrument_type: { type: String },
    strike: { type: Number },
    expiry: { type: Date },
    tick_size: { type: Number },
    lot_size: { type: Number },
    last_price: { type: Number },
  },
  {
    strict: false, // Allow additional fields
    timestamps: false,
  }
);

// Create text index for search
InstrumentSchema.index({
  tradingsymbol: 'text',
  name: 'text',
});

// Create compound index for efficient searching
InstrumentSchema.index({ tradingsymbol: 1, exchange: 1 });
InstrumentSchema.index({ name: 1, exchange: 1 });

// Function to get model for specific vendor collection
export function getInstrumentModel(vendor: string): Model<IInstrument> {
  const collectionName = `instruments_${vendor.toLowerCase()}`;

  // Check if model already exists
  if (mongoose.models[collectionName]) {
    return mongoose.models[collectionName] as Model<IInstrument>;
  }

  // Create new model with vendor-specific collection name
  return mongoose.model<IInstrument>(collectionName, InstrumentSchema, collectionName);
}

export default getInstrumentModel;
