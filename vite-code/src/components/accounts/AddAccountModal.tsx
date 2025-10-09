import "./AddAccountModal.css";
import { Button } from "@/components/ui/button";
import Modal from "@/components/ui/Modal";
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
  const [step, setStep] = useState(1); // Step 1: Select broker, Step 2: Enter credentials
  const [selectedBroker, setSelectedBroker] = useState<
    "kite" | "upstox" | "binance" | null
  >(null);
  const [formData, setFormData] = useState({
    accountType: "upstox" as "kite" | "upstox" | "binance",
    accountName: "",
    apiKey: "",
    apiSecret: "",
    redirectUri: "",
    tradingSegment: "spot" as "spot" | "usdm",
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

    // Validate form
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

      // Reset form
      setStep(1);
      setSelectedBroker(null);
      setFormData({
        accountType: "upstox",
        accountName: "",
        apiKey: "",
        apiSecret: "",
        redirectUri: "",
        tradingSegment: "spot",
      });
      setErrors({});
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleModalClose = () => {
    setStep(1);
    setSelectedBroker(null);
    setErrors({});
    setFormData({
      accountType: "upstox",
      accountName: "",
      apiKey: "",
      apiSecret: "",
      redirectUri: "",
      tradingSegment: "spot",
    });
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
      id: "kite",
      name: "Zerodha Kite",
      description: "India's largest stock broker",
      icon: "🟢",
      available: true,
      features: ["Stocks", "Futures", "Options", "Commodities"],
    },
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
    <Modal
      isOpen={isOpen}
      onClose={handleModalClose}
      title={getModalTitle()}
      size="medium"
    >
      {step === 1 ? (
        // Step 1: Broker Selection
        <div className="broker-selection">
          <div className="selection-header">
            <p>Select which trading platform you&apos;d like to connect:</p>
          </div>

          <div className="broker-grid">
            {brokerOptions.map((broker) => (
              <div
                key={broker.id}
                className={`broker-card ${!broker.available ? "disabled" : ""}`}
                onClick={() =>
                  broker.available &&
                  handleBrokerSelect(broker.id as "kite" | "upstox" | "binance")
                }
              >
                <div className="broker-header">
                  <span className="broker-icon">{broker.icon}</span>
                  <div className="broker-info">
                    <h3 className="broker-name">{broker.name}</h3>
                    <p className="broker-description">{broker.description}</p>
                  </div>
                  {!broker.available && (
                    <span className="coming-soon">Coming Soon</span>
                  )}
                </div>

                <div className="broker-features">
                  {broker.features.map((feature, index) => (
                    <span key={index} className="feature-tag">
                      {feature}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        // Step 2: Credentials Form
        <form onSubmit={handleSubmit} className="credentials-form">
          <div className="selected-broker-info">
            <span className="selected-icon">
              {brokerOptions.find((b) => b.id === selectedBroker)?.icon}
            </span>
            <div>
              <h4>
                {brokerOptions.find((b) => b.id === selectedBroker)?.name}
              </h4>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleBackToSelection}
              >
                ← Change Platform
              </Button>
            </div>
          </div>

          {/* Account Name */}
          <div className="form-group">
            <label htmlFor="accountName">Account Name *</label>
            <input
              id="accountName"
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
              className={`form-input ${errors.accountName ? "error" : ""}`}
            />
            {errors.accountName && (
              <span className="error-text">{errors.accountName}</span>
            )}
          </div>

          {/* API Key */}
          <div className="form-group">
            <label htmlFor="apiKey">
              {selectedBroker === "kite"
                ? "Kite Connect"
                : selectedBroker === "upstox"
                ? "Upstox"
                : "Binance"}{" "}
              API Key *
            </label>
            <input
              id="apiKey"
              type="text"
              value={formData.apiKey}
              onChange={(e) => handleChange("apiKey", e.target.value)}
              placeholder={`Your ${
                selectedBroker === "kite"
                  ? "Kite Connect"
                  : selectedBroker === "upstox"
                  ? "Upstox"
                  : "Binance"
              } API Key`}
              className={`form-input ${errors.apiKey ? "error" : ""}`}
            />
            {errors.apiKey && (
              <span className="error-text">{errors.apiKey}</span>
            )}
          </div>

          {/* API Secret */}
          <div className="form-group">
            <label htmlFor="apiSecret">
              {selectedBroker === "kite"
                ? "Kite Connect"
                : selectedBroker === "upstox"
                ? "Upstox"
                : "Binance"}{" "}
              API Secret *
            </label>
            <input
              id="apiSecret"
              type="password"
              value={formData.apiSecret}
              onChange={(e) => handleChange("apiSecret", e.target.value)}
              placeholder={`Your ${
                selectedBroker === "kite"
                  ? "Kite Connect"
                  : selectedBroker === "upstox"
                  ? "Upstox"
                  : "Binance"
              } API Secret`}
              className={`form-input ${errors.apiSecret ? "error" : ""}`}
            />
            {errors.apiSecret && (
              <span className="error-text">{errors.apiSecret}</span>
            )}
          </div>

          {/* Trading Segment Selection (for Binance) */}
          {selectedBroker === "binance" && (
            <div className="form-group">
              <label htmlFor="tradingSegment">Trading Segment *</label>
              <select
                id="tradingSegment"
                value={formData.tradingSegment}
                onChange={(e) => handleChange("tradingSegment", e.target.value)}
                className="form-select"
              >
                <option value="spot">Spot Trading</option>
                <option value="usdm">USD(S)-M Futures</option>
              </select>
              <small className="form-help">
                {formData.tradingSegment === "spot"
                  ? "Spot trading: Buy and sell cryptocurrencies at current market prices"
                  : "USD(S)-M Futures: Trade perpetual and quarterly futures contracts with USDT as collateral"}
              </small>
            </div>
          )}

          {/* Testnet Option (for Binance) */}
          {selectedBroker === "binance" && (
            <div className="form-group">
              <div className="checkbox-group">
                <input
                  id="testnet"
                  type="checkbox"
                  checked={formData.redirectUri === "testnet"}
                  onChange={(e) =>
                    handleChange(
                      "redirectUri",
                      e.target.checked ? "testnet" : ""
                    )
                  }
                  className="form-checkbox"
                />
                <label htmlFor="testnet" className="checkbox-label">
                  Use Testnet (recommended for testing)
                </label>
              </div>
              <small className="form-help">
                Enable this for testing with Binance Testnet. Disable for live
                trading.
              </small>
            </div>
          )}

          {/* Sandbox Option (for Upstox) */}
          {selectedBroker === "upstox" && (
            <div className="form-group">
              <div className="checkbox-group">
                <input
                  id="sandbox"
                  type="checkbox"
                  checked={formData.redirectUri === "sandbox"}
                  onChange={(e) =>
                    handleChange(
                      "redirectUri",
                      e.target.checked ? "sandbox" : ""
                    )
                  }
                  className="form-checkbox"
                />
                <label htmlFor="sandbox" className="checkbox-label">
                  Use Sandbox Environment (for testing)
                </label>
              </div>
              <small className="form-help">
                Enable this if you're using Upstox Sandbox API credentials.
                Disable for production/live trading.
              </small>
            </div>
          )}

          {/* Instructions */}
          <div className="instructions">
            <h4>
              Getting{" "}
              {selectedBroker === "kite"
                ? "Kite Connect"
                : selectedBroker === "upstox"
                ? "Upstox"
                : "Binance"}{" "}
              API Credentials:
            </h4>
            {selectedBroker === "upstox" && (
              <div className="instruction-content">
                <p>
                  1. Visit{" "}
                  <a
                    href="https://upstox.com/developer/"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Upstox Developer Console
                  </a>
                </p>
                <p>2. Create a new app and get your API credentials</p>
                <p>
                  3. Set redirect URI to:{" "}
                  <code>
                    {process.env.NEXT_PUBLIC_BASE_URL ||
                      "http://localhost:3000"}
                    /api/auth/upstox/callback
                  </code>
                </p>
              </div>
            )}
            {selectedBroker === "kite" && (
              <div className="instruction-content">
                <p>
                  1. Visit{" "}
                  <a
                    href="https://kite.zerodha.com/apps"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Kite Connect Apps
                  </a>
                </p>
                <p>2. Create a new app and get your API credentials</p>
                <p>
                  3. Set redirect URI to your application&apos;s callback URL
                </p>
              </div>
            )}
            {selectedBroker === "binance" && (
              <div className="instruction-content">
                <p>
                  1. Visit{" "}
                  <a
                    href="https://www.binance.com/en/my/settings/api-management"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Binance API Management
                  </a>
                </p>
                <p>2. Create a new API key with appropriate permissions:</p>
                <ul style={{ marginLeft: "20px", marginTop: "4px" }}>
                  <li>
                    For <strong>Spot</strong>: Enable &quot;Enable Spot & Margin
                    Trading&quot;
                  </li>
                  <li>
                    For <strong>USD(S)-M Futures</strong>: Enable &quot;Enable
                    Futures&quot;
                  </li>
                </ul>
                <p>
                  3. Configure IP whitelist for security (optional but
                  recommended)
                </p>
                <p>
                  4. For Testnet: Use{" "}
                  <a
                    href="https://testnet.binance.vision/"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Spot Testnet
                  </a>{" "}
                  or{" "}
                  <a
                    href="https://testnet.binancefuture.com/"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Futures Testnet
                  </a>
                </p>
                <p>
                  5. <strong>Important:</strong> Never share your API Secret
                  with anyone
                </p>
              </div>
            )}
          </div>

          {/* Form Actions */}
          <div className="form-actions">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={handleModalClose}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="trading"
              size="sm"
              disabled={isSubmitting}
            >
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
          </div>
        </form>
      )}
    </Modal>
  );
}
