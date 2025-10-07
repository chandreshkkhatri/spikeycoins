import kiteConnectService from '@/lib/kiteconnect-service';
import upstoxService from '@/lib/upstox-service';
import { getAccountById } from '@/models/account';
import { NextRequest, NextResponse } from 'next/server';

interface UnifiedOrderResponse {
  id: string;
  symbol: string;
  exchange: string;
  quantity: number;
  price: number;
  averagePrice: number;
  orderType: string;
  transactionType: string;
  status: string;
  product: string;
  validity: string;
  filledQuantity: number;
  pendingQuantity: number;
  timestamp: string;
  vendor: string;
  accountId: string;
  accountName: string;
  details: any;
}

// Fetch Upstox orders
const fetchUpstoxOrders = async (account: any): Promise<any> => {
  try {
    // Initialize Upstox service with account credentials
    const isSandbox = account.metadata?.sandbox === true;
    upstoxService.initializeWithCredentials(account.apiKey, account.apiSecret, isSandbox);

    // Set access token if available
    if (account.accessToken) {
      upstoxService.setAccessToken(account.accessToken);
    } else {
      throw new Error('Access token not found. Please re-authenticate your Upstox account.');
    }

    // Fetch orders
    const orders = await upstoxService.getOrders();
    return orders;
  } catch (error) {
    throw error;
  }
};

// Fetch Kite orders
const fetchKiteOrders = async (account: any): Promise<any> => {
  try {
    if (!account.accessToken) {
      throw new Error('Access token not found. Please re-authenticate your Kite account.');
    }

    kiteConnectService.setAccessToken(account.accessToken);
    const ordersData = await kiteConnectService.getOrders();

    return ordersData || [];
  } catch (error) {
    throw error;
  }
};

// Normalize orders data to unified format
const normalizeOrdersData = (
  vendor: string,
  rawData: any,
  accountId: string,
  accountName: string
): UnifiedOrderResponse[] => {
  const timestamp = new Date().toISOString();

  switch (vendor.toLowerCase()) {
    case 'upstox':
      return rawData.map((order: any) => ({
        id: order.order_id,
        symbol: order.trading_symbol || order.tradingsymbol,
        exchange: order.exchange,
        quantity: order.quantity,
        price: order.price,
        averagePrice: order.average_price || 0,
        orderType: order.order_type,
        transactionType: order.transaction_type,
        status: order.status,
        product: order.product,
        validity: order.validity,
        filledQuantity: order.filled_quantity || 0,
        pendingQuantity: order.pending_quantity || 0,
        timestamp: order.order_timestamp || timestamp,
        vendor: 'upstox',
        accountId,
        accountName,
        details: order,
      }));

    case 'kite':
      return rawData.map((order: any) => ({
        id: order.order_id,
        symbol: order.tradingsymbol,
        exchange: order.exchange,
        quantity: order.quantity,
        price: order.price,
        averagePrice: order.average_price || 0,
        orderType: order.order_type,
        transactionType: order.transaction_type,
        status: order.status,
        product: order.product,
        validity: order.validity,
        filledQuantity: order.filled_quantity || 0,
        pendingQuantity: order.pending_quantity || 0,
        timestamp: order.order_timestamp || timestamp,
        vendor: 'kite',
        accountId,
        accountName,
        details: order,
      }));

    default:
      return [];
  }
};

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const vendor = searchParams.get('vendor');
    const accountId = searchParams.get('accountId');

    if (!vendor) {
      return NextResponse.json({ error: 'Vendor parameter is required' }, { status: 400 });
    }

    if (!accountId) {
      return NextResponse.json({ error: 'Account ID is required' }, { status: 400 });
    }

    // Get account details
    const account = await getAccountById(accountId);
    if (!account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    let ordersData: any;
    let normalizedData: UnifiedOrderResponse[];

    switch (vendor.toLowerCase()) {
      case 'upstox':
        try {
          ordersData = await fetchUpstoxOrders(account);
          normalizedData = normalizeOrdersData(
            'upstox',
            ordersData,
            accountId,
            account.accountName
          );
        } catch (error: any) {
          const errorMessage =
            error instanceof Error ? error.message : 'Failed to fetch Upstox orders';

          // Check if it's a token expiry error
          const statusCode = error.code === 'TOKEN_EXPIRED' || error.statusCode === 401 ? 401 : 500;

          return NextResponse.json(
            {
              error: errorMessage,
              code: error.code || undefined,
              accountName: account?.accountName,
              accountId: accountId,
              requiresReauth: statusCode === 401,
              details: error instanceof Error ? error.stack : undefined,
            },
            { status: statusCode }
          );
        }
        break;

      case 'kite':
        try {
          ordersData = await fetchKiteOrders(account);
          normalizedData = normalizeOrdersData('kite', ordersData, accountId, account.accountName);
        } catch (error: any) {
          const errorMessage =
            error instanceof Error ? error.message : 'Failed to fetch Kite orders';

          // Check if it's a token expiry error
          const statusCode =
            error.code === 'TOKEN_EXPIRED' || error.statusCode === 401 || error.statusCode === 403
              ? 401
              : 500;

          return NextResponse.json(
            {
              error: errorMessage,
              code: error.code || undefined,
              accountName: account?.accountName,
              accountId: accountId,
              requiresReauth: statusCode === 401,
              details: error instanceof Error ? error.stack : undefined,
            },
            { status: statusCode }
          );
        }
        break;

      default:
        return NextResponse.json(
          { error: `Unsupported vendor: ${vendor}. Supported vendors: kite, upstox` },
          { status: 400 }
        );
    }

    return NextResponse.json({
      success: true,
      data: normalizedData,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch orders data',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
