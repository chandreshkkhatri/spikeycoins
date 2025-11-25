import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import axios from "axios";
import { memo, useEffect, useState } from "react";
import MarketDepth from "./MarketDepth";
import MultiTimeframeChart from "./MultiTimeframeChart";

interface TradingWindowProps {
  symbol: string;
  currentPrice: number;
  accounts: Array<{
    _id: string;
    accountName: string;
    accountType: "binance" | "kite" | "upstox";
    isActive: boolean;
  }>;
  selectedAccount?: {
    _id: string;
    accountName: string;
    accountType: "binance" | "kite" | "upstox";
    isActive: boolean;
  } | null;
  onOrderPlaced: () => void;
}

interface OrderForm {
  accountId: string;
  side: "BUY" | "SELL";
  type: "MARKET" | "LIMIT" | "STOP_MARKET" | "TAKE_PROFIT_MARKET";
  quantity: string;
  price: string;
  stopPrice: string;
  leverage: string;
  reduceOnly: boolean;
  stopLoss: string;
  takeProfit: string;
}

const TradingWindow = memo(function TradingWindow({
  symbol,
  currentPrice,
  accounts,
  selectedAccount,
  onOrderPlaced,
}: TradingWindowProps) {
  const [orderForm, setOrderForm] = useState<OrderForm>({
    accountId: selectedAccount?._id || accounts[0]?._id || "",
    side: "BUY",
    type: "LIMIT",
    quantity: "0.001",
    price: currentPrice.toFixed(2),
    stopPrice: "",
    leverage: "1",
    reduceOnly: false,
    stopLoss: "",
    takeProfit: "",
  });

  const [positionSizePercentage, setPositionSizePercentage] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [availableBalance, setAvailableBalance] = useState<number>(0);

  // Update price when current price changes
  useEffect(() => {
    if (orderForm.type === "LIMIT") {
      setOrderForm((prev) => ({ ...prev, price: currentPrice.toFixed(2) }));
    }
  }, [currentPrice, orderForm.type]);

  // Fetch account balance when account changes
  useEffect(() => {
    const fetchBalance = async () => {
      if (!selectedAccount) return;
      try {
        const response = await axios.get(
          `/api/funds?accountId=${selectedAccount._id}`
        );
        if (response.data && response.data.available) {
          // Assuming response structure has available balance
          // Adjust based on actual API response structure
          setAvailableBalance(parseFloat(response.data.available) || 0);
        } else if (response.data && response.data.data) {
           // Handle different response structures
           const balance = response.data.data.availableCash || response.data.data.net || 0;
           setAvailableBalance(parseFloat(balance));
        }
      } catch (err) {
        console.error("Failed to fetch balance:", err);
      }
    };

    fetchBalance();
  }, [selectedAccount]);

  const handleInputChange = (
    field: keyof OrderForm,
    value: string | boolean
  ) => {
    setOrderForm((prev) => ({ ...prev, [field]: value }));
    setError(null);
    setSuccess(null);
  };

  const handleSliderChange = (value: number[]) => {
    const percentage = value[0];
    setPositionSizePercentage(percentage);
    setQuickQuantity(percentage);
  };

  const calculateOrderValue = () => {
    const qty = parseFloat(orderForm.quantity) || 0;
    const price =
      orderForm.type === "MARKET"
        ? currentPrice
        : parseFloat(orderForm.price) || 0;
    return (qty * price).toFixed(2);
  };

  const calculateLiquidationPrice = () => {
    const leverage = parseFloat(orderForm.leverage) || 1;
    const entryPrice =
      orderForm.type === "MARKET"
        ? currentPrice
        : parseFloat(orderForm.price) || currentPrice;

    if (orderForm.side === "BUY") {
      return (entryPrice * (1 - 1 / leverage)).toFixed(2);
    } else {
      return (entryPrice * (1 + 1 / leverage)).toFixed(2);
    }
  };

  const setQuickQuantity = (percentage: number) => {
    if (availableBalance > 0 && currentPrice > 0) {
      const leverage = parseFloat(orderForm.leverage) || 1;
      const maxPositionValue = availableBalance * leverage;
      const quantity = (
        (maxPositionValue / currentPrice) *
        (percentage / 100)
      ).toFixed(6);
      handleInputChange("quantity", quantity);
    } else {
      // Fallback if balance not available
      const baseAmount = 1000;
      const quantity = (
        (baseAmount / currentPrice) *
        (percentage / 100)
      ).toFixed(6);
      handleInputChange("quantity", quantity);
    }
  };

  const submitOrder = async () => {
    if (!orderForm.accountId) {
      setError("Please select a trading account");
      return;
    }

    if (!orderForm.quantity || parseFloat(orderForm.quantity) <= 0) {
      setError("Please enter a valid quantity");
      return;
    }

    // Mandatory Stop Loss check
    if (!orderForm.stopLoss || parseFloat(orderForm.stopLoss) <= 0) {
      setError("Stop Loss is mandatory for risk management");
      return;
    }

    if (
      orderForm.type === "LIMIT" &&
      (!orderForm.price || parseFloat(orderForm.price) <= 0)
    ) {
      setError("Please enter a valid price");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const orderData = {
        accountId: orderForm.accountId,
        symbol: symbol,
        side: orderForm.side,
        type: orderForm.type,
        quantity: parseFloat(orderForm.quantity),
        ...(orderForm.type === "LIMIT" && {
          price: parseFloat(orderForm.price),
        }),
        ...(orderForm.type.includes("STOP") && {
          stopPrice: parseFloat(orderForm.stopPrice),
        }),
        reduceOnly: orderForm.reduceOnly,
        leverage: parseFloat(orderForm.leverage),
        stopLoss: parseFloat(orderForm.stopLoss),
        takeProfit: orderForm.takeProfit
          ? parseFloat(orderForm.takeProfit)
          : undefined,
      };

      const response = await axios.post(
        "/api/trading/binance/place-order",
        orderData
      );

      if (!response.data.success) {
        throw new Error(response.data.error || "Failed to place order");
      }

      setSuccess(
        `${orderForm.side} order placed successfully for ${orderForm.quantity} ${symbol}`
      );
      onOrderPlaced();

      // Reset form
      setOrderForm((prev) => ({
        ...prev,
        quantity: "0.001",
        price: currentPrice.toFixed(2),
        stopPrice: "",
        stopLoss: "",
        takeProfit: "",
      }));
      setPositionSizePercentage(0);
    } catch (err: any) {
      // eslint-disable-next-line no-console -- surfaced during order error handling
      console.error("Order placement error:", err);
      setError(err.response?.data?.error || "Failed to place order");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (accounts.length === 0) {
    return (
      <div className="trading-window-empty">
        <p>No trading accounts available</p>
      </div>
    );
  }

  return (
    <div className="trading-window">
      <MultiTimeframeChart
        symbol={symbol}
        accountId={orderForm.accountId}
        accountType={
          accounts.find((a) => a._id === orderForm.accountId)?.accountType
        }
      />
      <div className="trading-header">
        <h3>{symbol} Trading</h3>
        <div className="current-price">${currentPrice.toFixed(2)}</div>
      </div>

      <div className="trading-content">
        <MarketDepth
          symbol={symbol}
          currentPrice={currentPrice}
          onPriceSelect={(price) => handleInputChange("price", price)}
          accountType={selectedAccount?.accountType}
          marketType="binance-futures"
        />

        <div className="trading-form">
          {/* Order Side */}
          <div className="form-group">
            <label>Side</label>
            <div className="button-group">
              <Button
                type="button"
                variant={orderForm.side === "BUY" ? "success" : "outline"}
                size="sm"
                onClick={() => handleInputChange("side", "BUY")}
              >
                Buy
              </Button>
              <Button
                type="button"
                variant={orderForm.side === "SELL" ? "danger" : "outline"}
                size="sm"
                onClick={() => handleInputChange("side", "SELL")}
              >
                Sell
              </Button>
            </div>
          </div>

          {/* Order Type */}
          <div className="form-group">
            <label>Type</label>
            <select
              value={orderForm.type}
              onChange={(e) => handleInputChange("type", e.target.value as any)}
              className="form-select"
            >
              <option value="MARKET">Market</option>
              <option value="LIMIT">Limit</option>
              <option value="STOP_MARKET">Stop Market</option>
              <option value="TAKE_PROFIT_MARKET">Take Profit Mkt</option>
            </select>
          </div>

          {/* Quantity */}
          <div className="form-group">
            <label>Quantity (Contracts)</label>
            <input
              type="number"
              value={orderForm.quantity}
              onChange={(e) => handleInputChange("quantity", e.target.value)}
              className="form-input"
              placeholder="0.001"
              step="0.000001"
            />
          </div>

          {/* Position Sizing Slider */}
          <div className="form-group">
            <label>Position Size</label>
            <div className="slider-container">
              <Slider
                value={[positionSizePercentage]}
                onValueChange={handleSliderChange}
                max={100}
                step={10}
                className="w-full"
              />
              <div className="slider-labels">
                <span>0%</span>
                <span>50%</span>
                <span>100%</span>
              </div>
            </div>
          </div>

          {/* Price (for limit orders) */}
          {orderForm.type === "LIMIT" && (
            <div className="form-group">
              <label>Price (USDT)</label>
              <input
                type="number"
                value={orderForm.price}
                onChange={(e) => handleInputChange("price", e.target.value)}
                className="form-input"
                placeholder={currentPrice.toFixed(2)}
                step="0.01"
              />
            </div>
          )}

          {/* Stop Loss */}
          <div className="form-group">
            <label>Stop Loss (Mandatory)</label>
            <input
              type="number"
              value={orderForm.stopLoss}
              onChange={(e) => handleInputChange("stopLoss", e.target.value)}
              className="form-input"
              placeholder="Stop Loss Price"
              step="0.01"
              required
            />
          </div>

          {/* Take Profit */}
          <div className="form-group">
            <label>Take Profit</label>
            <input
              type="number"
              value={orderForm.takeProfit}
              onChange={(e) => handleInputChange("takeProfit", e.target.value)}
              className="form-input"
              placeholder="Take Profit Price"
              step="0.01"
            />
          </div>

          {/* Leverage */}
          <div className="form-group">
            <label>Leverage</label>
            <select
              value={orderForm.leverage}
              onChange={(e) => handleInputChange("leverage", e.target.value)}
              className="form-select"
            >
              <option value="1">1x</option>
              <option value="2">2x</option>
              <option value="3">3x</option>
              <option value="5">5x</option>
              <option value="10">10x</option>
              <option value="20">20x</option>
              <option value="50">50x</option>
              <option value="100">100x</option>
            </select>
          </div>

          {/* Reduce Only */}
          <div className="form-group">
            <div className="checkbox-group">
              <input
                type="checkbox"
                id="reduceOnly"
                checked={orderForm.reduceOnly}
                onChange={(e) =>
                  handleInputChange("reduceOnly", e.target.checked)
                }
                className="form-checkbox"
              />
              <label htmlFor="reduceOnly" className="checkbox-label">
                Reduce Only
              </label>
            </div>
          </div>

          {/* Order Summary */}
          <div className="order-summary">
            <div className="summary-row">
              <span>Order Value:</span>
              <span>${calculateOrderValue()}</span>
            </div>
            <div className="summary-row">
              <span>Liquidation Price:</span>
              <span>${calculateLiquidationPrice()}</span>
            </div>
            <div className="summary-row">
              <span>Available:</span>
              <span>${availableBalance.toFixed(2)}</span>
            </div>
          </div>

          {/* Error/Success Messages */}
          {error && <div className="error-message">{error}</div>}
          {success && <div className="success-message">{success}</div>}

          {/* Submit Button */}
          <Button
            variant={orderForm.side === "BUY" ? "success" : "danger"}
            size="sm"
            disabled={isSubmitting}
            onClick={submitOrder}
            className="w-full"
          >
            {isSubmitting ? "Placing Order..." : `${orderForm.side} ${symbol}`}
          </Button>
        </div>
      </div>

      <style>{`
        .trading-window {
          display: flex;
          flex-direction: column;
          height: 100%;
          min-width: 0;
          overflow-y: auto;
          overflow-x: hidden;
        }

        .trading-window-empty {
          display: flex;
          align-items: center;
          justify-content: center;
          height: 100%;
          color: #666;
          font-size: 0.9rem;
        }

        .trading-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px 16px;
          border-bottom: 1px solid #e9ecef;
          background: #ffffff;
          color: #333;
          position: sticky;
          top: 0;
          z-index: 10;
        }

        .dark .trading-header {
          border-bottom: 1px solid #27272a !important;
          background: #18181b !important;
          color: #ffffff !important;
        }

        .trading-header h3 {
          margin: 0;
          font-size: 1rem;
          color: var(--foreground);
        }

        .current-price {
          font-weight: 600;
          font-size: 1rem;
          color: #2196f3;
        }

        .trading-content {
          display: flex;
          flex-shrink: 0;
        }

        .trading-form {
          flex: 1;
          padding: 16px;
          max-width: 100%;
          background: #ffffff;
        }

        .dark .trading-form {
          background: #09090b !important;
        }

        .form-group {
          margin-bottom: 12px;
        }

        .form-group label {
          display: block;
          margin-bottom: 4px;
          font-size: 0.8rem;
          font-weight: 600;
          color: var(--foreground);
        }

        .form-input,
        .form-select {
          width: 100%;
          padding: 6px 8px;
          border: 1px solid #ddd;
          border-radius: 4px;
          font-size: 0.8rem;
          background: #ffffff;
          color: #333;
        }

        .dark .form-input,
        .dark .form-select {
          border: 1px solid #27272a !important;
          background: #18181b !important;
          color: #ffffff !important;
        }

        .form-input:focus,
        .form-select:focus {
          outline: none;
          border-color: #2196f3;
          box-shadow: 0 0 0 2px rgba(33, 150, 243, 0.1);
        }

        .button-group {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 4px;
        }

        .slider-container {
          padding: 8px 0;
        }

        .slider-labels {
          display: flex;
          justify-content: space-between;
          font-size: 0.7rem;
          color: var(--muted-foreground);
          margin-top: 4px;
        }

        .checkbox-group {
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .form-checkbox {
          width: 14px;
          height: 14px;
          cursor: pointer;
        }

        .checkbox-label {
          cursor: pointer;
          font-size: 0.8rem;
          margin: 0;
        }

        .order-summary {
          background: #f8f9fa;
          color: #333;
          padding: 8px;
          border-radius: 4px;
          margin-bottom: 12px;
        }

        .dark .order-summary {
          background: #27272a !important;
          color: #ffffff !important;
        }

        .summary-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 0.8rem;
          margin-bottom: 4px;
        }

        .summary-row:last-child {
          margin-bottom: 0;
        }

        .error-message {
          background: #ffebee;
          color: #c62828;
          padding: 6px 8px;
          border-radius: 4px;
          font-size: 0.8rem;
          margin-bottom: 8px;
        }

        .dark .error-message {
          background: #450a0a;
          color: #fca5a5;
        }

        .success-message {
          background: #e8f5e8;
          color: #2e7d32;
          padding: 6px 8px;
          border-radius: 4px;
          font-size: 0.8rem;
          margin-bottom: 8px;
        }

        .dark .success-message {
          background: #052e16;
          color: #86efac;
        }

        /* Mobile Responsive Styles */
        @media (max-width: 768px) {
          .trading-content {
            flex-direction: column;
          }
          
          .trading-header {
            padding: 8px 12px;
          }

          .trading-header h3 {
            font-size: 0.9rem;
          }

          .current-price {
            font-size: 0.9rem;
          }

          .trading-form {
            padding: 12px;
          }
        }
      `}</style>
    </div>
  );
});

export default TradingWindow;
