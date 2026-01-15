import mongoose from "mongoose";
import crypto from "crypto";

export type UserRole = 'user' | 'admin';

export interface IUser {
  _id?: string;
  email: string;
  passwordHash?: string;
  passwordSalt?: string;
  name: string;
  googleId?: string;
  avatar?: string;
  isEmailVerified: boolean;
  role: UserRole;
  createdAt?: Date;
  updatedAt?: Date;
}

const userSchema = new mongoose.Schema<IUser>(
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
    role: {
      type: String,
      enum: ['user', 'admin'],
      default: 'user',
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
}): Promise<IUser> {
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

const User = mongoose.models.User || mongoose.model<IUser>("User", userSchema);

export default User;
