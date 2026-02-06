import mongoose from "mongoose";
import { encrypt, decrypt } from "../lib/encryption";

export interface IAppConfig {
  key: string;
  value: any;
  description?: string;
  sensitive?: boolean;
}

const appConfigSchema = new mongoose.Schema<IAppConfig>(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    value: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
    description: {
      type: String,
      trim: true,
    },
    sensitive: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
    collection: "app_config",
  }
);

const SENSITIVE_FIELDS = ["apiKey", "apiSecret", "accessToken", "refreshToken"];

function isEncrypted(val: string): boolean {
  if (typeof val !== "string") return false;
  const parts = val.split(":");
  // Encrypted format from encryption.ts: {32-hex-char IV}:{hex-encrypted-data}
  return parts.length === 2 && /^[0-9a-f]{32}$/.test(parts[0]);
}

// Auto-encrypt sensitive fields before save
appConfigSchema.pre("save", function (next) {
  if (this.sensitive && this.value && typeof this.value === "object") {
    for (const field of SENSITIVE_FIELDS) {
      if (this.value[field] && !isEncrypted(this.value[field])) {
        this.value[field] = encrypt(this.value[field]);
        this.markModified("value");
      }
    }
  }
  next();
});

const AppConfig = mongoose.model<IAppConfig>("AppConfig", appConfigSchema);

/**
 * Get a config value by key. Auto-decrypts sensitive fields.
 */
export async function getConfigByKey(
  key: string
): Promise<IAppConfig | null> {
  const config = await AppConfig.findOne({ key }).lean();
  if (!config) return null;

  if (config.sensitive && config.value && typeof config.value === "object") {
    const decrypted = { ...config.value };
    for (const field of SENSITIVE_FIELDS) {
      if (decrypted[field] && isEncrypted(decrypted[field])) {
        try {
          decrypted[field] = decrypt(decrypted[field]);
        } catch {
          // Leave as-is if decryption fails (might be plaintext)
        }
      }
    }
    return { ...config, value: decrypted };
  }

  return config;
}

/**
 * Set a config value by key (upsert). Auto-encrypts sensitive fields.
 */
export async function setConfig(
  key: string,
  value: any,
  options?: { description?: string; sensitive?: boolean }
): Promise<IAppConfig> {
  const doc = await AppConfig.findOne({ key });

  if (doc) {
    doc.value = value;
    if (options?.description !== undefined) doc.description = options.description;
    if (options?.sensitive !== undefined) doc.sensitive = options.sensitive;
    await doc.save();
    return doc.toObject();
  }

  const created = await AppConfig.create({
    key,
    value,
    description: options?.description,
    sensitive: options?.sensitive ?? false,
  });
  return created.toObject();
}

export default AppConfig;
