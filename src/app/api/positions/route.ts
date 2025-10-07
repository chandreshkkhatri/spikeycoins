import kiteConnectService from '@/lib/kiteconnect-service';
import upstoxService from '@/lib/upstox-service';
import { getAccountById } from '@/models/account';
import { NextRequest, NextResponse } from 'next/server';

interface UnifiedPositionResponse {
  id: string;
  symbol: string;
  exchange: string;
  quantity: number;
  averagePrice: number;
  lastPrice: number;
  pnl: number;
  pnlPercentage: number;
  product: string;
  vendor: string;
  accountId: string;
  accountName: string;
  timestamp: string;
  details: any;
}

// Fetch Upstox positions
const fetchUpstoxPositions = async (account: any): Promise<any> => {
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

    // Fetch positions
    const positions = await upstoxService.getPositions();
    return positions;
  } catch (error) {
    throw error;
  }
};

// Fetch Kite positions
const fetchKitePositions = async (account: any): Promise<any> => {
  try {
    if (!account.accessToken) {
      throw new Error('Access token not found. Please re-authenticate your Kite account.');
    }

    kiteConnectService.setAccessToken(account.accessToken);
    const positionsData = await kiteConnectService.getPositions();

    // Kite returns { net: [...], day: [...] }
    return positionsData.net || [];
  } catch (error) {
    throw error;
  }
};

// Normalize positions data to unified format
const normalizePositionsData = (
  vendor: string,
  rawData: any,
  accountId: string,
  accountName: string
): UnifiedPositionResponse[] => {
  const timestamp = new Date().toISOString();

  switch (vendor.toLowerCase()) {
    case 'upstox':
      return rawData.map((position: any) => ({
        id: `${accountId}_${position.trading_symbol || position.tradingsymbol}_${position.product}`,
        symbol: position.trading_symbol || position.tradingsymbol,
        exchange: position.exchange,
        quantity: position.quantity,
        averagePrice: position.average_price,
        lastPrice: position.last_price,
        pnl: position.pnl || position.unrealised || 0,
        pnlPercentage:
          position.average_price > 0
            ? ((position.pnl || position.unrealised || 0) /
                (position.average_price * Math.abs(position.quantity))) *
              100
            : 0,
        product: position.product,
        vendor: 'upstox',
        accountId,
        accountName,
        timestamp,
        details: position,
      }));

    case 'kite':
      return rawData.map((position: any) => ({
        id: `${accountId}_${position.tradingsymbol}_${position.product}`,
        symbol: position.tradingsymbol,
        exchange: position.exchange,
        quantity: position.quantity,
        averagePrice: position.average_price,
        lastPrice: position.last_price,
        pnl: position.pnl,
        pnlPercentage:
          position.average_price > 0
            ? (position.pnl / (position.average_price * Math.abs(position.quantity))) * 100
            : 0,
        product: position.product,
        vendor: 'kite',
        accountId,
        accountName,
        timestamp,
        details: position,
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

    let positionsData: any;
    let normalizedData: UnifiedPositionResponse[];

    switch (vendor.toLowerCase()) {
      case 'upstox':
        try {
          positionsData = await fetchUpstoxPositions(account);
          normalizedData = normalizePositionsData(
            'upstox',
            positionsData,
            accountId,
            account.accountName
          );
        } catch (error: any) {
          const errorMessage =
            error instanceof Error ? error.message : 'Failed to fetch Upstox positions';

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
          positionsData = await fetchKitePositions(account);
          normalizedData = normalizePositionsData(
            'kite',
            positionsData,
            accountId,
            account.accountName
          );
        } catch (error: any) {
          const errorMessage =
            error instanceof Error ? error.message : 'Failed to fetch Kite positions';

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
        error: 'Failed to fetch positions data',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
