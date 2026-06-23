import connectDB from "../lib/mongodb";
import { encrypt, decrypt } from "../lib/encryption";
import mongoose from "mongoose";

export interface IAccount {
  _id?: string;
  userId: string;
  accountType: "upstox" | "binance";
  accountName: string;
  apiKey: string;
  apiSecret: string;
  accessToken?: string;
  refreshToken?: string;
  isActive: boolean;
  lastSyncAt?: Date;
  metadata?: {
    clientId?: string;
    redirectUri?: string;
    scope?: string;
    testnet?: boolean;
    sandbox?: boolean;
    tradingSegment?: "spot" | "usdm"; // Binance: spot or USD(S)-M Futures
    [key: string]: any;
  };
  createdAt?: Date;
  updatedAt?: Date;
}

const accountSchema = new mongoose.Schema<IAccount>(
  {
    userId: {
      type: String,
      required: true,
      index: true,
    },
    accountType: {
      type: String,
      required: true,
      enum: ["upstox", "binance"],
    },
    accountName: {
      type: String,
      required: true,
      trim: true,
    },
    apiKey: {
      type: String,
      required: true,
    },
    apiSecret: {
      type: String,
      required: true,
    },
    accessToken: {
      type: String,
      default: null,
    },
    refreshToken: {
      type: String,
      default: null,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    lastSyncAt: {
      type: Date,
      default: null,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

// Compound index to ensure unique account per user and type
accountSchema.index(
  { userId: 1, accountType: 1, accountName: 1 },
  { unique: true }
);

// Pre-save middleware: encrypt apiKey and apiSecret before saving
accountSchema.pre('save', function (next: any) {
  if (this.isModified('apiKey') && this.apiKey && !this.apiKey.includes(':')) {
    this.apiKey = encrypt(this.apiKey);
  }
  if (this.isModified('apiSecret') && this.apiSecret && !this.apiSecret.includes(':')) {
    this.apiSecret = encrypt(this.apiSecret);
  }
  next();
});

// Pre-update middleware: encrypt apiKey and apiSecret for findOneAndUpdate/updateOne
accountSchema.pre('findOneAndUpdate', function (next: any) {
  const update = this.getUpdate() as any;
  if (update.$set) {
    if (update.$set.apiKey && !update.$set.apiKey.includes(':')) {
      update.$set.apiKey = encrypt(update.$set.apiKey);
    }
    if (update.$set.apiSecret && !update.$set.apiSecret.includes(':')) {
      update.$set.apiSecret = encrypt(update.$set.apiSecret);
    }
  } else {
    if (update.apiKey && !update.apiKey.includes(':')) {
      update.apiKey = encrypt(update.apiKey);
    }
    if (update.apiSecret && !update.apiSecret.includes(':')) {
      update.apiSecret = encrypt(update.apiSecret);
    }
  }
  next();
});

// Post-retrieval middleware: decrypt apiKey and apiSecret after finding
accountSchema.post('find', function (docs: any[]) {
  docs.forEach((doc: any) => {
    if (doc && doc.apiKey && doc.apiKey.includes(':')) {
      try {
        doc.apiKey = decrypt(doc.apiKey);
      } catch (error) {
        console.error('Failed to decrypt apiKey:', error);
      }
    }
    if (doc && doc.apiSecret && doc.apiSecret.includes(':')) {
      try {
        doc.apiSecret = decrypt(doc.apiSecret);
      } catch (error) {
        console.error('Failed to decrypt apiSecret:', error);
      }
    }
  });
});

// Post-retrieval middleware: decrypt apiKey and apiSecret after findOne
accountSchema.post('findOne', function (doc: any) {
  if (doc) {
    if (doc.apiKey && doc.apiKey.includes(':')) {
      try {
        doc.apiKey = decrypt(doc.apiKey);
      } catch (error) {
        console.error('Failed to decrypt apiKey:', error);
      }
    }
    if (doc.apiSecret && doc.apiSecret.includes(':')) {
      try {
        doc.apiSecret = decrypt(doc.apiSecret);
      } catch (error) {
        console.error('Failed to decrypt apiSecret:', error);
      }
    }
  }
});

// Post-retrieval middleware: decrypt apiKey and apiSecret after findOneAndUpdate
accountSchema.post('findOneAndUpdate', function (doc: any) {
  if (doc) {
    if (doc.apiKey && doc.apiKey.includes(':')) {
      try {
        doc.apiKey = decrypt(doc.apiKey);
      } catch (error) {
        console.error('Failed to decrypt apiKey:', error);
      }
    }
    if (doc.apiSecret && doc.apiSecret.includes(':')) {
      try {
        doc.apiSecret = decrypt(doc.apiSecret);
      } catch (error) {
        console.error('Failed to decrypt apiSecret:', error);
      }
    }
  }
});

const Account =
  mongoose.models.Account || mongoose.model<IAccount>("Account", accountSchema);

// Account management functions
export const createAccount = async (
  accountData: Omit<IAccount, "_id" | "createdAt" | "updatedAt">
): Promise<IAccount> => {
  try {
    await connectDB();
    const account = new Account(accountData);
    const savedAccount = await account.save();
    return savedAccount.toObject();
  } catch (error) {
    console.error("Error creating account:", error);
    throw error;
  }
};

export const getAccountsByUserId = async (
  userId: string
): Promise<IAccount[]> => {
  try {
    await connectDB();
    const accounts = await Account.find({ userId, isActive: true });
    return accounts.map((account) => account.toObject());
  } catch (error) {
    console.error("Error fetching accounts:", error);
    return [];
  }
};

export const getAccountById = async (
  accountId: string
): Promise<IAccount | null> => {
  try {
    await connectDB();

    // Validate ObjectId format before querying
    if (!mongoose.Types.ObjectId.isValid(accountId)) {
      return null;
    }

    const account = await Account.findById(accountId);
    return account ? account.toObject() : null;
  } catch (error) {
    console.error("Error fetching account:", error);
    return null;
  }
};

export const updateAccount = async (
  accountId: string,
  updates: Partial<IAccount>
): Promise<IAccount | null> => {
  try {
    await connectDB();
    const account = await Account.findByIdAndUpdate(
      accountId,
      { ...updates, updatedAt: new Date() },
      { new: true }
    );
    return account ? account.toObject() : null;
  } catch (error) {
    console.error("Error updating account:", error);
    throw error;
  }
};

export const deleteAccount = async (accountId: string): Promise<boolean> => {
  try {
    await connectDB();
    const result = await Account.findByIdAndUpdate(
      accountId,
      { isActive: false, updatedAt: new Date() },
      { new: true }
    );
    return !!result;
  } catch (error) {
    console.error("Error deleting account:", error);
    return false;
  }
};

export const getAccountByType = async (
  userId: string,
  accountType: string
): Promise<IAccount | null> => {
  try {
    await connectDB();
    const account = await Account.findOne({
      userId,
      accountType,
      isActive: true,
    });
    return account ? account.toObject() : null;
  } catch (error) {
    console.error("Error fetching account by type:", error);
    return null;
  }
};

export default Account;
