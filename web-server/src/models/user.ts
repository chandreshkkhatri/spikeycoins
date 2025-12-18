import mongoose, { Document } from "mongoose";
import crypto from "crypto";

export interface IUser {
  email: string;
  passwordHash?: string;
  passwordSalt?: string;
  name: string;
  googleId?: string;
  avatar?: string;
  isEmailVerified: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

// Document type with instance methods
export interface IUserDocument extends Document, IUser {
  setPassword(password: string): void;
  validatePassword(password: string): boolean;
}

const userSchema = new mongoose.Schema<IUserDocument>(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    passwordHash: {
      type: String,
      default: null,
    },
    passwordSalt: {
      type: String,
      default: null,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    googleId: {
      type: String,
      unique: true,
      sparse: true, // Allows null values while still enforcing uniqueness
      index: true,
    },
    avatar: {
      type: String,
      default: null,
    },
    isEmailVerified: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

// Password hashing methods
userSchema.methods.setPassword = function (password: string): void {
  this.passwordSalt = crypto.randomBytes(16).toString("hex");
  this.passwordHash = crypto
    .pbkdf2Sync(password, this.passwordSalt, 10000, 64, "sha512")
    .toString("hex");
};

userSchema.methods.validatePassword = function (password: string): boolean {
  if (!this.passwordSalt || !this.passwordHash) return false;
  const hash = crypto
    .pbkdf2Sync(password, this.passwordSalt, 10000, 64, "sha512")
    .toString("hex");
  return this.passwordHash === hash;
};

// Static method to find or create user from Google OAuth
userSchema.statics.findOrCreateFromGoogle = async function (profile: {
  id: string;
  email: string;
  name: string;
  picture?: string;
}): Promise<IUserDocument> {
  let user = await this.findOne({ googleId: profile.id });
  
  if (user) {
    // Update avatar if changed
    if (profile.picture && user.avatar !== profile.picture) {
      user.avatar = profile.picture;
      await user.save();
    }
    return user;
  }

  // Check if user exists with same email (registered via email/password)
  user = await this.findOne({ email: profile.email.toLowerCase() });
  
  if (user) {
    // Link Google account to existing user
    user.googleId = profile.id;
    user.isEmailVerified = true;
    if (profile.picture) user.avatar = profile.picture;
    await user.save();
    return user;
  }

  // Create new user
  user = await this.create({
    email: profile.email.toLowerCase(),
    name: profile.name,
    googleId: profile.id,
    avatar: profile.picture,
    isEmailVerified: true,
  });

  return user;
};

// Don't return sensitive fields in JSON
userSchema.set("toJSON", {
  transform: function (_doc, ret) {
    const obj = ret as unknown as Record<string, unknown>;
    delete obj.passwordHash;
    delete obj.passwordSalt;
    delete obj.__v;
    return obj;
  },
});

// Interface for the model with static methods
interface IUserModel extends mongoose.Model<IUserDocument> {
  findOrCreateFromGoogle(profile: {
    id: string;
    email: string;
    name: string;
    picture?: string;
  }): Promise<IUserDocument>;
}

// Type assertion needed because mongoose.models.User returns Model<any>
// and we need to properly type our custom static methods
const User: IUserModel =
  (mongoose.models.User as unknown as IUserModel) ||
  mongoose.model<IUserDocument, IUserModel>("User", userSchema);

export default User;
