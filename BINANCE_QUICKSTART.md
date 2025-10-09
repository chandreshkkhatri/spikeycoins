# Binance Integration - Quick Start Guide

## 🚀 Get Started in 5 Minutes

### Step 1: Get Binance API Credentials

#### For Testing (Recommended First):

1. Visit [Binance Spot Testnet](https://testnet.binance.vision) or [Futures Testnet](https://testnet.binancefuture.com)
2. Create an account (it's separate from main Binance)
3. Generate API Key and Secret
4. Copy both credentials

#### For Production:

1. Visit [Binance API Management](https://www.binance.com/en/my/settings/api-management)
2. Click "Create API"
3. Complete 2FA verification
4. Enable appropriate permissions:
   - For Spot: "Enable Spot & Margin Trading"
   - For Futures: "Enable Futures"
5. (Optional but recommended) Set IP whitelist
6. Copy API Key and Secret

---

### Step 2: Add Binance Account in Flip Safe

1. Open Flip Safe application
2. Navigate to **Accounts** page
3. Click **"+ Add Account"**
4. Select **Binance** (🟡 icon)
5. Fill in the form:
   - **Account Name**: e.g., "My Binance Spot" or "Binance Futures"
   - **API Key**: Paste your Binance API Key
   - **API Secret**: Paste your Binance API Secret
   - **Trading Segment**: Select either:
     - **Spot Trading** - For buying/selling cryptocurrencies
     - **USD(S)-M Futures** - For futures trading with USDT
   - **Use Testnet**: Check if using testnet credentials
6. Click **"Add Binance Account"**
7. Wait for validation ✅

---

### Step 3: Validate Your Account

1. After adding, click **"Authenticate"** on your Binance account card
2. System will:
   - Test API connectivity
   - Verify your API permissions
   - Confirm trading access
3. Success! Your account is now ready 🎉

---

### Step 4: Start Trading

#### View Your Funds/Balances:

- Navigate to **Funds** page
- Select your Binance account
- **Spot**: See all cryptocurrency balances
- **Futures**: See margin balance, unrealized P&L

#### View Holdings (Spot Only):

- Navigate to **Holdings** page
- See all cryptocurrencies you own
- Free and locked balances shown

#### View Positions (Futures Only):

- Navigate to **Positions** page
- See all open futures positions
- Entry price, mark price, P&L shown

#### View & Manage Orders:

- Navigate to **Orders** page
- See all your open orders
- Place new orders
- Cancel orders

#### Market Watch:

- Navigate to **Market Watch** page
- Select Binance account
- Add symbols to watchlist
- See real-time price updates

---

## 📝 Example Use Cases

### Use Case 1: Spot Trading BTCUSDT

```
1. Add Binance Spot account
2. Go to Orders page
3. Click "Place Order"
4. Fill in:
   - Symbol: BTCUSDT
   - Side: BUY
   - Type: MARKET
   - Quantity: 0.001
5. Submit order
6. Check Holdings to see your BTC balance
```

### Use Case 2: Futures Trading with Leverage

```
1. Add Binance USD(S)-M account
2. Go to Funds page
3. Click "Change Leverage" for BTCUSDT
4. Set leverage (e.g., 10x)
5. Go to Orders page
6. Place LONG position:
   - Symbol: BTCUSDT
   - Side: BUY
   - Position Side: LONG
   - Type: MARKET
   - Quantity: 0.01
7. Check Positions to see your open position
8. To close: Place SELL order with same quantity
```

---

## 🎯 Common Operations

### Change Futures Leverage

```http
POST /api/binance/leverage
{
  "accountId": "your_account_id",
  "symbol": "BTCUSDT",
  "leverage": 10
}
```

### Change Futures Margin Type

```http
POST /api/binance/margin-type
{
  "accountId": "your_account_id",
  "symbol": "BTCUSDT",
  "marginType": "ISOLATED"  // or "CROSSED"
}
```

### Get Real-Time Prices

```typescript
import binanceWebSocketService from "@/lib/binance-websocket";

// Connect
await binanceWebSocketService.connect("spot");

// Subscribe to BTCUSDT
binanceWebSocketService.subscribe("btcusdt", (data) => {
  console.log("BTC Price:", data.lastPrice);
  console.log("24h Change:", data.priceChangePercent + "%");
});
```

---

## ⚠️ Important Notes

### Testnet vs Production

**Testnet (for testing)**:

- ✅ Free to use
- ✅ No real money involved
- ✅ Perfect for learning
- ❌ Separate account from main Binance
- ❌ Limited liquidity
- ✅ Check "Use Testnet" box

**Production (real trading)**:

- ⚠️ Real money involved
- ⚠️ Requires careful setup
- ⚠️ Enable security features (2FA, IP whitelist)
- ❌ Uncheck "Use Testnet" box

### Trading Segments

You can create **multiple accounts** for different purposes:

- "Binance Spot Main" - for spot trading
- "Binance Futures Conservative" - 5x leverage
- "Binance Futures Aggressive" - 20x leverage
- "Binance Testnet" - for testing

Each account can have different API keys with different permissions!

### API Key Permissions

Make sure your API key has the right permissions:

- **Read**: Required for viewing balances, orders, positions
- **Trade**: Required for placing/canceling orders (Spot or Futures)
- **Enable Spot Trading**: For spot accounts
- **Enable Futures**: For futures accounts

---

## 🐛 Troubleshooting

### "Invalid API credentials"

- ✅ Check API Key is correct
- ✅ Check API Secret is correct
- ✅ Ensure testnet checkbox matches credential type
- ✅ Verify API key has required permissions
- ✅ Check if API key is not expired

### "Account not authenticated"

- Click "Authenticate" button on account card
- System will validate your credentials

### "symbol is required for Binance orders"

- Make sure to include symbol in cancel requests
- Example: `?symbol=BTCUSDT&orderId=123`

### Orders not showing

- Check if you selected the correct account
- Spot orders won't show in Futures, and vice versa
- Verify account segment matches what you're trading

### WebSocket not connecting

- Check browser console for errors
- Verify segment is correct ('spot' or 'usdm')
- Check testnet flag matches your account setup

---

## 📚 Next Steps

1. ✅ Test with Binance Testnet first
2. ✅ Try placing small test orders
3. ✅ Familiarize yourself with leverage (futures)
4. ✅ Set up IP restrictions for production
5. ✅ Monitor your positions regularly
6. ✅ Set stop-loss orders to manage risk

---

## 🔗 Quick Links

- [Full Integration Guide](./BINANCE_INTEGRATION.md)
- [Binance API Docs](https://developers.binance.com/docs/binance-spot-api-docs/rest-api)
- [Binance API Management](https://www.binance.com/en/my/settings/api-management)
- [Spot Testnet](https://testnet.binance.vision)
- [Futures Testnet](https://testnet.binancefuture.com)

---

**Happy Trading! 🚀**

_Remember: Always test with testnet first, and never invest more than you can afford to lose._
