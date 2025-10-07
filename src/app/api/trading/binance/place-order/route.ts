import { createBinanceClient } from '@/lib/binance';
import connectDB from '@/lib/mongodb';
import Account from '@/models/account';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    await connectDB();

    const { accountId, symbol, side, type, quantity, price, stopPrice, reduceOnly, leverage } =
      await request.json();

    // Validate required fields
    if (!accountId || !symbol || !side || !type || !quantity) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Find the Binance account
    const account = await Account.findById(accountId);
    if (!account) {
      return NextResponse.json({ success: false, error: 'Account not found' }, { status: 404 });
    }

    if (account.accountType !== 'binance') {
      return NextResponse.json(
        { success: false, error: 'Invalid account type for Binance trading' },
        { status: 400 }
      );
    }

    if (!account.isActive) {
      return NextResponse.json({ success: false, error: 'Account is not active' }, { status: 400 });
    }

    // Create Binance client
    const client = createBinanceClient({
      apiKey: account.apiKey,
      apiSecret: account.apiSecret,
      testnet: account.metadata?.testnet || false,
    });

    // Test connection first
    const isConnected = await client.testConnection();
    if (!isConnected) {
      return NextResponse.json(
        { success: false, error: 'Failed to connect to Binance API' },
        { status: 500 }
      );
    }

    // Set leverage if specified
    if (leverage && leverage > 1) {
      try {
        // Note: In real implementation, you'd need to call the leverage endpoint
        // await client.setLeverage(symbol, leverage);
        console.log(`Setting leverage to ${leverage}x for ${symbol}`);
      } catch (error) {
        console.error('Failed to set leverage:', error);
        // Continue with order placement even if leverage setting fails
      }
    }

    // Prepare order parameters
    const orderParams: any = {
      symbol: symbol,
      side: side,
      type: type,
      quantity: quantity,
    };

    // Add price for limit orders
    if (type === 'LIMIT' && price) {
      orderParams.price = price;
      orderParams.timeInForce = 'GTC'; // Good Till Canceled
    }

    // Add stop price for stop orders
    if ((type === 'STOP_MARKET' || type === 'TAKE_PROFIT_MARKET') && stopPrice) {
      orderParams.stopPrice = stopPrice;
    }

    // Add reduce only flag
    if (reduceOnly) {
      orderParams.reduceOnly = true;
    }

    // Place the order
    const orderResult = await client.placeOrder(orderParams);

    // Update account's last sync time
    account.lastSyncAt = new Date();
    await account.save();

    return NextResponse.json({
      success: true,
      order: {
        orderId: orderResult.orderId,
        symbol: orderResult.symbol,
        side: orderResult.side,
        type: orderResult.type,
        quantity: orderResult.origQty,
        price: orderResult.price,
        status: orderResult.status,
        clientOrderId: orderResult.clientOrderId,
        timestamp: orderResult.updateTime,
      },
      message: `${side} order placed successfully for ${quantity} ${symbol}`,
    });
  } catch (error: any) {
    console.error('Order placement error:', error);

    // Handle specific Binance API errors
    if (error.response?.data?.code) {
      const binanceError = error.response.data;
      let errorMessage = binanceError.msg || 'Binance API error';

      // Map common error codes to user-friendly messages
      switch (binanceError.code) {
        case -2010:
          errorMessage = 'Insufficient balance';
          break;
        case -1013:
          errorMessage = 'Invalid quantity or price precision';
          break;
        case -2019:
          errorMessage = 'Margin is insufficient';
          break;
        case -1021:
          errorMessage = 'Request timestamp expired';
          break;
        case -1022:
          errorMessage = 'Invalid signature';
          break;
        case -2015:
          errorMessage = 'Invalid API key, IP, or permissions for action';
          break;
        default:
          errorMessage = `${errorMessage} (Code: ${binanceError.code})`;
      }

      return NextResponse.json({ success: false, error: errorMessage }, { status: 400 });
    }

    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to place order',
      },
      { status: 500 }
    );
  }
}
