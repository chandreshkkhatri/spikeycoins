import mongoose, { Document } from "mongoose";
import crypto from "crypto";

export interface IInvite extends Document {
  code: string;
  createdBy: mongoose.Types.ObjectId | null; // null for system-generated invites
  usedBy: mongoose.Types.ObjectId[];
  maxUses: number;
  usedCount: number;
  expiresAt: Date | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  
  // Instance methods
  isValid(): { valid: boolean; error?: string };
  useForUser(userId: mongoose.Types.ObjectId): Promise<void>;
}

const inviteSchema = new mongoose.Schema<IInvite>(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      index: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    usedBy: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    }],
    maxUses: {
      type: Number,
      default: 1,
      min: 1,
    },
    usedCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    expiresAt: {
      type: Date,
      default: null,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

// Generate a unique invite code
inviteSchema.statics.generateCode = function (): string {
  // Format: XXXX-XXXX-XXXX (alphanumeric, uppercase)
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // Removed ambiguous chars like 0, O, 1, I
  const segments = 3;
  const segmentLength = 4;
  
  const codeSegments: string[] = [];
  for (let s = 0; s < segments; s++) {
    let segment = "";
    for (let i = 0; i < segmentLength; i++) {
      const randomIndex = crypto.randomInt(0, chars.length);
      segment += chars[randomIndex];
    }
    codeSegments.push(segment);
  }
  
  return codeSegments.join("-");
};

// Check if invite is valid for use
inviteSchema.methods.isValid = function (): { valid: boolean; error?: string } {
  if (!this.isActive) {
    return { valid: false, error: "Invite code is no longer active" };
  }
  
  if (this.expiresAt && new Date() > this.expiresAt) {
    return { valid: false, error: "Invite code has expired" };
  }
  
  if (this.usedCount >= this.maxUses) {
    return { valid: false, error: "Invite code has reached maximum uses" };
  }
  
  return { valid: true };
};

// Use the invite for a user
inviteSchema.methods.useForUser = async function (userId: mongoose.Types.ObjectId): Promise<void> {
  this.usedBy.push(userId);
  this.usedCount += 1;
  await this.save();
};

// Static method to find and validate an invite code
inviteSchema.statics.findAndValidate = async function (code: string): Promise<{
  invite: IInvite | null;
  valid: boolean;
  error?: string;
}> {
  const invite = await this.findOne({ code: code.toUpperCase().trim() });
  
  if (!invite) {
    return { invite: null, valid: false, error: "Invalid invite code" };
  }
  
  const validation = invite.isValid();
  return { invite, ...validation };
};

// Interface for the model with static methods
interface IInviteModel extends mongoose.Model<IInvite> {
  generateCode(): string;
  findAndValidate(code: string): Promise<{
    invite: IInvite | null;
    valid: boolean;
    error?: string;
  }>;
}

// Type assertion needed because mongoose.models.Invite returns Model<any>
// and we need to properly type our custom static methods
const Invite: IInviteModel =
  (mongoose.models.Invite as unknown as IInviteModel) ||
  mongoose.model<IInvite, IInviteModel>("Invite", inviteSchema);

export default Invite;
