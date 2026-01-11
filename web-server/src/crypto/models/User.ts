/**
 * User Model and Types
 * Defines user structure and roles for the authentication system
 */

import mongoose, { Document, Schema } from 'mongoose';

export enum AuthProvider {
  LOCAL = 'local',
  GOOGLE = 'google'
}

export interface IUser extends Document {
  username: string;
  email: string;
  password?: string; // Optional for OAuth users
  role: UserRole;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  lastLogin?: Date;
  // OAuth fields
  googleId?: string;
  provider: AuthProvider;
  profilePicture?: string;
}

export interface User {
  _id?: mongoose.Types.ObjectId;
  username: string;
  email: string;
  password?: string; // Optional for OAuth users
  role: UserRole;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  lastLogin?: Date;
  // OAuth fields
  googleId?: string;
  provider: AuthProvider;
  profilePicture?: string;
}

export enum UserRole {
  ADMIN = 'admin',
  USER = 'user'
}

export interface UserCreateRequest {
  username: string;
  email: string;
  password: string;
  role?: UserRole;
}

export interface UserLoginRequest {
  username: string;
  password: string;
}

export interface UserResponse {
  _id: string;
  username: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  createdAt: Date;
  lastLogin?: Date;
  provider?: AuthProvider;
  profilePicture?: string;
}

export interface JWTPayload {
  userId: string;
  username: string;
  role: UserRole;
  iat?: number;
  exp?: number;
}

export interface AuthResponse {
  success: boolean;
  user: UserResponse;
  token: string;
  expiresIn: string;
}

const userSchema = new Schema<IUser>({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    minlength: 3,
    maxlength: 50,
    index: true,
  },
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true,
    index: true,
  },
  password: {
    type: String,
    required: false, // Optional for OAuth users
    minlength: 6,
  },
  role: {
    type: String,
    enum: Object.values(UserRole),
    default: UserRole.USER,
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  lastLogin: {
    type: Date,
  },
  // OAuth fields
  googleId: {
    type: String,
    unique: true,
    sparse: true, // Allows multiple null values
    index: true,
  },
  provider: {
    type: String,
    enum: Object.values(AuthProvider),
    default: AuthProvider.LOCAL,
  },
  profilePicture: {
    type: String,
  },
}, {
  timestamps: true,
});

// Additional indexes
userSchema.index({ role: 1 });
userSchema.index({ provider: 1 });

export const UserModel = mongoose.model<IUser>('User', userSchema);