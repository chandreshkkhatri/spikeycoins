"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { IAccount } from "@/models/account";
import { useEffect, useState } from "react";

interface EditAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  account: IAccount | null;
  onSave: (accountId: string, updates: Partial<IAccount>) => Promise<void>;
}

export default function EditAccountModal({
  isOpen,
  onClose,
  account,
  onSave,
}: EditAccountModalProps) {
  const [formData, setFormData] = useState({
    accountName: "",
    apiKey: "",
    apiSecret: "",
    isSandbox: false,
    isTestnet: false,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Update form when account changes
  useEffect(() => {
    if (account) {
      setFormData({
        accountName: account.accountName || "",
        apiKey: account.apiKey || "",
        apiSecret: "", // Don't show existing secret for security
        isSandbox: account.metadata?.sandbox === true,
        isTestnet: account.metadata?.testnet === true,
      });
    }
  }, [account]);

  const handleChange = (field: string, value: string | boolean) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: "" }));
    }
  };

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.accountName.trim()) {
      newErrors.accountName = "Account name is required";
    }

    if (!formData.apiKey.trim()) {
      newErrors.apiKey = "API Key is required";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm() || !account) return;

    setIsSubmitting(true);
    try {
      const updates: Partial<IAccount> = {
        accountName: formData.accountName.trim(),
        apiKey: formData.apiKey.trim(),
      };

      // Only update apiSecret if a new one was provided
      if (formData.apiSecret.trim()) {
        updates.apiSecret = formData.apiSecret.trim();
      }

      // Update metadata based on account type
      if (account.accountType === "upstox") {
        updates.metadata = {
          ...account.metadata,
          sandbox: formData.isSandbox,
        };
      } else if (account.accountType === "binance") {
        updates.metadata = {
          ...account.metadata,
          testnet: formData.isTestnet,
        };
      }

      await onSave(account._id!, updates);
      onClose();
    } catch (error) {
      console.error("Error updating account:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!account) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit {account.accountName}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          {/* Account Name */}
          <div>
            <label className="block text-sm font-medium mb-2">
              Account Name *
            </label>
            <input
              type="text"
              value={formData.accountName}
              onChange={(e) => handleChange("accountName", e.target.value)}
              placeholder="Enter account name"
              className={`
                w-full px-3 py-2 border rounded-md bg-background
                ${errors.accountName ? "border-destructive" : "border-input"}
                focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring
              `}
            />
            {errors.accountName && (
              <p className="text-destructive text-sm mt-1">
                {errors.accountName}
              </p>
            )}
          </div>

          {/* API Key */}
          <div>
            <label className="block text-sm font-medium mb-2">API Key *</label>
            <input
              type="text"
              value={formData.apiKey}
              onChange={(e) => handleChange("apiKey", e.target.value)}
              placeholder="Your API Key"
              className={`
                w-full px-3 py-2 border rounded-md bg-background
                ${errors.apiKey ? "border-destructive" : "border-input"}
                focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring
              `}
            />
            {errors.apiKey && (
              <p className="text-destructive text-sm mt-1">{errors.apiKey}</p>
            )}
          </div>

          {/* API Secret */}
          <div>
            <label className="block text-sm font-medium mb-2">
              API Secret{" "}
              <span className="text-muted-foreground font-normal">
                (Leave empty to keep current)
              </span>
            </label>
            <input
              type="password"
              value={formData.apiSecret}
              onChange={(e) => handleChange("apiSecret", e.target.value)}
              placeholder="Enter new API Secret to update"
              className="w-full px-3 py-2 border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring"
            />
            <p className="text-muted-foreground text-xs mt-1">
              For security, the current API Secret is not shown. Enter a new one
              only if you want to update it.
            </p>
          </div>

          {/* Environment Options */}
          {account.accountType === "upstox" && (
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="sandbox"
                checked={formData.isSandbox}
                onChange={(e) => handleChange("isSandbox", e.target.checked)}
                className="rounded border-input"
              />
              <label htmlFor="sandbox" className="text-sm font-medium">
                Use Sandbox Environment
              </label>
            </div>
          )}

          {account.accountType === "binance" && (
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="testnet"
                checked={formData.isTestnet}
                onChange={(e) => handleChange("isTestnet", e.target.checked)}
                className="rounded border-input"
              />
              <label htmlFor="testnet" className="text-sm font-medium">
                Use Testnet
              </label>
            </div>
          )}

          {/* Account Info */}
          <div className="p-4 bg-muted rounded-lg">
            <h4 className="font-medium text-sm mb-3">Account Information</h4>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Type:</span>
                <span className="ml-2 font-medium">
                  {account.accountType.toUpperCase()}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">Status:</span>
                <span
                  className={`ml-2 font-medium ${
                    account.isActive ? "text-green-600" : "text-red-600"
                  }`}
                >
                  {account.isActive ? "Active" : "Inactive"}
                </span>
              </div>
              {account.accessToken && (
                <div className="col-span-2">
                  <span className="text-muted-foreground">Authentication:</span>
                  <span className="ml-2 font-medium text-blue-600">
                    Connected
                  </span>
                </div>
              )}
            </div>
          </div>

          <DialogFooter className="gap-2 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
