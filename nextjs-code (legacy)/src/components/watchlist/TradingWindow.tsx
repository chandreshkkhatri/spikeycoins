'use client';

import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import axios from 'axios';
import { memo, useEffect, useState } from 'react';
import MultiTimeframeChart from './MultiTimeframeChart';

interface TradingWindowProps {
  symbol: string;
  currentPrice: number;
  accounts: Array<{
    _id: string;
    accountName: string;
    accountType: 'binance' | 'kite' | 'upstox';
    isActive: boolean;
  }>;
  onOrderPlaced: () => void;
}

interface OrderForm {
  accountId: string;
  side: 'BUY' | 'SELL';
  type: 'MARKET' | 'LIMIT' | 'STOP_MARKET' | 'TAKE_PROFIT_MARKET';
  quantity: string;
  price: string;
  stopPrice: string;
  leverage: string;
  reduceOnly: boolean;
}

const TradingWindow = memo(function TradingWindow({
  symbol,
  currentPrice,
  accounts,
  onOrderPlaced,
}: TradingWindowProps) {
  const [orderForm, setOrderForm] = useState<OrderForm>({
    accountId: accounts[0]?._id || '',
    side: 'BUY',
    type: 'LIMIT',
    quantity: '0.001',
    price: currentPrice.toFixed(2),
    stopPrice: '',
    leverage: '1',
    reduceOnly: false,
  });

  const [positionSizePercentage, setPositionSizePercentage] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Update price when current price changes
  useEffect(() => {
    if (orderForm.type === 'LIMIT') {
      setOrderForm(prev => ({ ...prev, price: currentPrice.toFixed(2) }));
    }
  }, [currentPrice, orderForm.type]);

  const handleInputChange = (field: keyof OrderForm, value: string | boolean) => {
    setOrderForm(prev => ({ ...prev, [field]: value }));
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
    const price = orderForm.type === 'MARKET' ? currentPrice : parseFloat(orderForm.price) || 0;
    return (qty * price).toFixed(2);
  };

  const calculateLiquidationPrice = () => {
    const leverage = parseFloat(orderForm.leverage) || 1;
    const entryPrice =
      orderForm.type === 'MARKET' ? currentPrice : parseFloat(orderForm.price) || currentPrice;

    if (orderForm.side === 'BUY') {
      return (entryPrice * (1 - 1 / leverage)).toFixed(2);
    } else {
      return (entryPrice * (1 + 1 / leverage)).toFixed(2);
    }
  };

  const setQuickQuantity = (percentage: number) => {
    // This would normally calculate based on available balance
    // For now, we'll use sample quantities
    const baseAmount = orderForm.side === 'BUY' ? 100 : 0.1; // $100 for BUY, 0.1 for SELL
    const quantity = ((baseAmount / currentPrice) * (percentage / 100)).toFixed(6);
    handleInputChange('quantity', quantity);
  };

  const submitOrder = async () => {
    if (!orderForm.accountId) {
      setError('Please select a trading account');
      return;
    }

    if (!orderForm.quantity || parseFloat(orderForm.quantity) <= 0) {
      setError('Please enter a valid quantity');
      return;
    }

    if (orderForm.type === 'LIMIT' && (!orderForm.price || parseFloat(orderForm.price) <= 0)) {
      setError('Please enter a valid price');
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
        ...(orderForm.type === 'LIMIT' && { price: parseFloat(orderForm.price) }),
        ...(orderForm.type.includes('STOP') && { stopPrice: parseFloat(orderForm.stopPrice) }),
        reduceOnly: orderForm.reduceOnly,
        leverage: parseFloat(orderForm.leverage),
      };

      const response = await axios.post('/api/trading/binance/place-order', orderData);

      if (!response.data.success) {
        throw new Error(response.data.error || 'Failed to place order');
      }

      setSuccess(`${orderForm.side} order placed successfully for ${orderForm.quantity} ${symbol}`);
      onOrderPlaced();

      // Reset form
      setOrderForm(prev => ({
        ...prev,
        quantity: '0.001',
        price: currentPrice.toFixed(2),
        stopPrice: '',
      }));
      setPositionSizePercentage(0);
    } catch (err: any) {
      // eslint-disable-next-line no-console -- surfaced during order error handling
      console.error('Order placement error:', err);
      setError(err.response?.data?.error || 'Failed to place order');
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
      <MultiTimeframeChart symbol={symbol} accountId={orderForm.accountId} />
      <div className="trading-header">
        <h3>{symbol} Trading</h3>
        <div className="current-price">${currentPrice.toFixed(2)}</div>
      </div>

      <div className="trading-form">
        {/* Account Selection */}
        <div className="form-group">
          <label>Account</label>
          <select
            value={orderForm.accountId}
            onChange={e => handleInputChange('accountId', e.target.value)}
            className="form-select"
          >
            {accounts.map((account: any) => (
              <option key={account._id} value={account._id}>
                {account.accountName}
              </option>
            ))}
          </select>
        </div>

        {/* Order Side */}
        <div className="form-group">
          <label>Side</label>
          <div className="button-group">
            <Button
              type="button"
              variant={orderForm.side === 'BUY' ? 'success' : 'outline'}
              size="sm"
              onClick={() => handleInputChange('side', 'BUY')}
            >
              Buy
            </Button>
            <Button
              type="button"
              variant={orderForm.side === 'SELL' ? 'danger' : 'outline'}
              size="sm"
              onClick={() => handleInputChange('side', 'SELL')}
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
            onChange={e => handleInputChange('type', e.target.value as any)}
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
            onChange={e => handleInputChange('quantity', e.target.value)}
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
              <span>10%</span>
              <span>20%</span>
              <span>30%</span>
              <span>40%</span>
              <span>50%</span>
              <span>60%</span>
              <span>70%</span>
              <span>80%</span>
              <span>90%</span>
              <span>100%</span>
            </div>
          </div>
        </div>

        {/* Price (for limit orders) */}
        {orderForm.type === 'LIMIT' && (
          <div className="form-group">
            <label>Price (USDT)</label>
            <input
              type="number"
              value={orderForm.price}
              onChange={e => handleInputChange('price', e.target.value)}
              className="form-input"
              placeholder={currentPrice.toFixed(2)}
              step="0.01"
            />
          </div>
        )}

        {/* Leverage */}
        <div className="form-group">
          <label>Leverage</label>
          <select
            value={orderForm.leverage}
            onChange={e => handleInputChange('leverage', e.target.value)}
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
              onChange={e => handleInputChange('reduceOnly', e.target.checked)}
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
        </div>

        {/* Error/Success Messages */}
        {error && <div className="error-message">{error}</div>}
        {success && <div className="success-message">{success}</div>}

        {/* Submit Button */}
        <Button
          variant={orderForm.side === 'BUY' ? 'success' : 'danger'}
          size="sm"
          disabled={isSubmitting}
          onClick={submitOrder}
        >
          {isSubmitting ? 'Placing Order...' : `${orderForm.side} ${symbol}`}
        </Button>
      </div>

      <style jsx>{`
        .trading-window {
          display: flex;
          flex-direction: column;
          height: 100%;
          min-width: 0;
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
        }

        :global(.dark) .trading-header {
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

        .trading-form {
          flex: 1;
          padding: 16px;
          overflow-y: auto;
          max-width: 100%;
          background: #ffffff;
        }

        :global(.dark) .trading-form {
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

        :global(.dark) .form-input,
        :global(.dark) .form-select {
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

        :global(.dark) .order-summary {
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

        .success-message {
          background: #e8f5e8;
          color: #2e7d32;
          padding: 6px 8px;
          border-radius: 4px;
          font-size: 0.8rem;
          margin-bottom: 8px;
        }

        /* Mobile Responsive Styles */
        @media (max-width: 640px) {
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

          .form-group {
            margin-bottom: 10px;
          }

          .form-group label {
            font-size: 0.75rem;
          }

          .form-input,
          .form-select {
            padding: 8px;
            font-size: 0.9rem;
          }

          .button-group {
            gap: 8px;
          }

          .slider-labels {
            display: none;
          }

          .slider-container {
            padding: 12px 0;
          }

          .order-summary {
            padding: 10px;
          }

          .summary-row {
            font-size: 0.85rem;
          }
        }

        @media (max-width: 480px) {
          .trading-form {
            padding: 8px;
          }

          .form-input,
          .form-select {
            font-size: 16px; /* Prevents zoom on iOS */
          }
        }
      `}</style>
    </div>
  );
});

export default TradingWindow;
