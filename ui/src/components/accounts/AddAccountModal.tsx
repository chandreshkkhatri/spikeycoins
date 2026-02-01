"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useState } from "react";

interface AddAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (accountData: {
    accountType: "kite" | "upstox" | "binance";
    accountName: string;
    apiKey: string;
    apiSecret: string;
    redirectUri?: string;
    tradingSegment?: "spot" | "usdm";
  }) => void;
}

export default function AddAccountModal({
  isOpen,
  onClose,
  onSubmit,
}: AddAccountModalProps) {
  const [step, setStep] = useState(1);
  const [selectedBroker, setSelectedBroker] = useState<
    "kite" | "upstox" | "binance" | null
  >(null);
  const [formData, setFormData] = useState({
    accountType: "upstox" as "kite" | "upstox" | "binance",
    accountName: "",
    apiKey: "",
    apiSecret: "",
    redirectUri: "",
    tradingSegment: "usdm" as "spot" | "usdm",
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleBrokerSelect = (brokerType: "kite" | "upstox" | "binance") => {
    setSelectedBroker(brokerType);
    setFormData((prev) => ({ ...prev, accountType: brokerType }));
    setStep(2);
  };

  const handleBackToSelection = () => {
    setStep(1);
    setSelectedBroker(null);
    setErrors({});
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const newErrors: Record<string, string> = {};
    if (!formData.accountName.trim())
      newErrors.accountName = "Account name is required";
    if (!formData.apiKey.trim()) newErrors.apiKey = "API Key is required";
    if (!formData.apiSecret.trim())
      newErrors.apiSecret = "API Secret is required";

    setErrors(newErrors);

    if (Object.keys(newErrors).length > 0) {
      return;
    }

    setIsSubmitting(true);
    try {
      await onSubmit({
        ...formData,
        accountName: formData.accountName.trim(),
        apiKey: formData.apiKey.trim(),
        apiSecret: formData.apiSecret.trim(),
        ...(formData.redirectUri && {
          redirectUri: formData.redirectUri.trim(),
        }),
        ...(selectedBroker === "binance" && {
          tradingSegment: formData.tradingSegment,
        }),
      });

      resetForm();
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    setStep(1);
    setSelectedBroker(null);
    setFormData({
      accountType: "upstox",
      accountName: "",
      apiKey: "",
      apiSecret: "",
      redirectUri: "",
      tradingSegment: "usdm",
    });
    setErrors({});
  };

  const handleModalClose = () => {
    resetForm();
    onClose();
  };

  const handleChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: "" }));
    }
  };

  const brokerOptions = [
    {
      id: "upstox",
      name: "Upstox",
      description: "Technology-first discount broker",
      icon: "🟠",
      available: true,
      features: ["Stocks", "Futures", "Options", "Currency"],
    },
    {
      id: "binance",
      name: "Binance",
      description: "Global cryptocurrency trading platform",
      icon: "🟡",
      available: true,
      features: ["Spot Trading", "USD(S)-M Futures", "Leverage", "API Trading"],
    },
  ];

  const getModalTitle = () => {
    if (step === 1) return "Choose Trading Platform";
    return `Add ${
      selectedBroker === "kite"
        ? "Zerodha Kite"
        : selectedBroker === "upstox"
        ? "Upstox"
        : selectedBroker === "binance"
        ? "Binance"
        : "Trading"
    } Account`;
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleModalClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold">
            {getModalTitle()}
          </DialogTitle>
        </DialogHeader>

        {step === 1 ? (
          <div className="space-y-6 py-4">
            <p className="text-center text-muted-foreground">
              Select which trading platform you&apos;d like to connect:
            </p>

            <div className="grid gap-4">
              {brokerOptions.map((broker) => (
                <div
                  key={broker.id}
                  className={`
                    p-6 border-2 rounded-lg cursor-pointer transition-all duration-200
                    hover:border-primary hover:shadow-md
                    ${
                      !broker.available
                        ? "opacity-50 cursor-not-allowed bg-muted/50"
                        : ""
                    }
                  `}
                  onClick={() =>
                    broker.available &&
                    handleBrokerSelect(
                      broker.id as "kite" | "upstox" | "binance"
                    )
                  }
                >
                  <div className="flex items-start gap-4">
                    <span className="text-3xl">{broker.icon}</span>
                    <div className="flex-1">
                      <h3 className="font-semibold text-lg mb-1">
                        {broker.name}
                      </h3>
                      <p className="text-muted-foreground text-sm">
                        {broker.description}
                      </p>
                      <div className="flex flex-wrap gap-2 mt-3">
                        {broker.features.map((feature, index) => (
                          <span
                            key={index}
                            className="bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300 px-2 py-1 rounded text-xs"
                          >
                            {feature}
                          </span>
                        ))}
                      </div>
                    </div>
                    {!broker.available && (
                      <span className="bg-yellow-100 text-yellow-800 text-xs px-2 py-1 rounded-full">
                        Coming Soon
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6 py-4">
            <div className="flex items-center gap-3 p-4 bg-muted rounded-lg">
              <span className="text-2xl">
                {brokerOptions.find((b) => b.id === selectedBroker)?.icon}
              </span>
              <div>
                <h4 className="font-medium">
                  {brokerOptions.find((b) => b.id === selectedBroker)?.name}
                </h4>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleBackToSelection}
                  className="p-0 h-auto text-primary hover:text-primary/80"
                >
                  ← Change Platform
                </Button>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">
                  Account Name *
                </label>
                <input
                  type="text"
                  value={formData.accountName}
                  onChange={(e) => handleChange("accountName", e.target.value)}
                  placeholder={`e.g., My ${
                    selectedBroker === "kite"
                      ? "Kite"
                      : selectedBroker === "upstox"
                      ? "Upstox"
                      : "Binance"
                  } Account`}
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

              <div>
                <label className="block text-sm font-medium mb-2">
                  API Key *
                </label>
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
                  <p className="text-destructive text-sm mt-1">
                    {errors.apiKey}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">
                  API Secret *
                </label>
                <input
                  type="password"
                  value={formData.apiSecret}
                  onChange={(e) => handleChange("apiSecret", e.target.value)}
                  placeholder="Your API Secret"
                  className={`
                    w-full px-3 py-2 border rounded-md bg-background
                    ${errors.apiSecret ? "border-destructive" : "border-input"}
                    focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring
                  `}
                />
                {errors.apiSecret && (
                  <p className="text-destructive text-sm mt-1">
                    {errors.apiSecret}
                  </p>
                )}
              </div>

              {selectedBroker === "binance" && (
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Trading Segment *
                  </label>
                  <select
                    value={formData.tradingSegment}
                    onChange={(e) =>
                      handleChange("tradingSegment", e.target.value)
                    }
                    className="w-full px-3 py-2 border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring"
                  >
                    <option value="usdm">USD(S)-M Futures</option>
                    <option value="spot">Spot Trading</option>
                  </select>
                  <p className="text-muted-foreground text-sm mt-1">
                    {formData.tradingSegment === "usdm"
                      ? "USD(S)-M Futures: Trade perpetual and quarterly futures contracts with USDT as collateral"
                      : "Spot trading: Buy and sell cryptocurrencies at current market prices"}
                  </p>
                </div>
              )}

              {selectedBroker === "binance" && (
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="testnet"
                    checked={formData.redirectUri === "testnet"}
                    onChange={(e) =>
                      handleChange("redirectUri", e.target.checked ? "testnet" : "")
                    }
                    className="rounded border-input"
                  />
                  <label htmlFor="testnet" className="text-sm font-medium">
                    Use Testnet (recommended for testing)
                  </label>
                </div>
              )}

              {selectedBroker === "upstox" && (
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="sandbox"
                    checked={formData.redirectUri === "sandbox"}
                    onChange={(e) =>
                      handleChange("redirectUri", e.target.checked ? "sandbox" : "")
                    }
                    className="rounded border-input"
                  />
                  <label htmlFor="sandbox" className="text-sm font-medium">
                    Use Sandbox Environment (for testing)
                  </label>
                </div>
              )}

              {/* Instructions */}
              <div className="bg-muted p-4 rounded-lg border-l-4 border-primary">
                <h4 className="font-medium mb-2">
                  Getting{" "}
                  {selectedBroker === "kite"
                    ? "Kite Connect"
                    : selectedBroker === "upstox"
                    ? "Upstox"
                    : "Binance"}{" "}
                  API Credentials:
                </h4>
                {selectedBroker === "upstox" && (
                  <div className="text-sm text-muted-foreground space-y-1">
                    <p>
                      1. Visit{" "}
                      <a
                        href="https://upstox.com/developer/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline"
                      >
                        Upstox Developer Console
                      </a>
                    </p>
                    <p>2. Create a new app and get your API credentials</p>
                    <p>
                      3. Set redirect URI to:{" "}
                      <code className="bg-background px-1 rounded text-xs">
                        {typeof window !== "undefined"
                          ? window.location.origin
                          : "http://localhost:3000"}
                        /api/auth/upstox/callback
                      </code>
                    </p>
                  </div>
                )}
                {selectedBroker === "binance" && (
                  <div className="text-sm text-muted-foreground space-y-1">
                    <p>
                      1. Visit{" "}
                      <a
                        href="https://www.binance.com/en/my/settings/api-management"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline"
                      >
                        Binance API Management
                      </a>
                    </p>
                    <p>2. Create a new API key with appropriate permissions</p>
                    <p>3. For Testnet: Use testnet.binance.vision or testnet.binancefuture.com</p>
                    <p>4. Never share your API Secret with anyone</p>
                  </div>
                )}
              </div>
            </div>

            <DialogFooter className="gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={handleModalClose}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting
                  ? "Adding Account..."
                  : `Add ${
                      selectedBroker === "kite"
                        ? "Kite"
                        : selectedBroker === "upstox"
                        ? "Upstox"
                        : "Binance"
                    } Account`}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
