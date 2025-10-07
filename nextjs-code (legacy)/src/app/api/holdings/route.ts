import kiteConnectService from '@/lib/kiteconnect-service';
import upstoxService from '@/lib/upstox-service';
import { getAccountById } from '@/models/account';
import { NextRequest, NextResponse } from 'next/server';

interface UnifiedHoldingResponse {
  id: string;
  symbol: string;
  exchange: string;
  quantity: number;
  averagePrice: number;
  lastPrice: number;
  currentValue: number;
  pnl: number;
  pnlPercentage: number;
  isin?: string;
  companyName?: string;
  vendor: string;
  accountId: string;
  accountName: string;
  timestamp: string;
  details: any;
}

// Fetch Upstox holdings
const fetchUpstoxHoldings = async (account: any): Promise<any> => {
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

    // Fetch holdings
    const holdings = await upstoxService.getHoldings();
    return holdings;
  } catch (error) {
    throw error;
  }
};

// Fetch Kite holdings
const fetchKiteHoldings = async (account: any): Promise<any> => {
  try {
    if (!account.accessToken) {
      throw new Error('Access token not found. Please re-authenticate your Kite account.');
    }

    kiteConnectService.setAccessToken(account.accessToken);
    const holdings = await kiteConnectService.getHoldings();
    return holdings || [];
  } catch (error) {
    throw error;
  }
};

// Normalize holdings data to unified format
const normalizeHoldingsData = (
  vendor: string,
  rawData: any,
  accountId: string,
  accountName: string
): UnifiedHoldingResponse[] => {
  const timestamp = new Date().toISOString();

  switch (vendor.toLowerCase()) {
    case 'upstox':
      return rawData.map((holding: any) => {
        const quantity = holding.quantity || 0;
        const avgPrice = holding.average_price || 0;
        const lastPrice = holding.last_price || 0;
        const currentValue = quantity * lastPrice;
        const investmentValue = quantity * avgPrice;
        const pnl = holding.pnl || currentValue - investmentValue;
        const pnlPercentage = investmentValue > 0 ? (pnl / investmentValue) * 100 : 0;

        return {
          id: `${accountId}_${holding.trading_symbol || holding.tradingsymbol}_${holding.isin}`,
          symbol: holding.trading_symbol || holding.tradingsymbol,
          exchange: holding.exchange || 'NSE',
          quantity: quantity,
          averagePrice: avgPrice,
          lastPrice: lastPrice,
          currentValue: currentValue,
          pnl: pnl,
          pnlPercentage: pnlPercentage,
          isin: holding.isin,
          companyName: holding.company_name,
          vendor: 'upstox',
          accountId,
          accountName,
          timestamp,
          details: holding,
        };
      });

    case 'kite':
      return rawData.map((holding: any) => {
        const quantity = holding.quantity || 0;
        const avgPrice = holding.average_price || 0;
        const lastPrice = holding.last_price || 0;
        const currentValue = quantity * lastPrice;
        const investmentValue = quantity * avgPrice;
        const pnl = holding.pnl || currentValue - investmentValue;
        const pnlPercentage = investmentValue > 0 ? (pnl / investmentValue) * 100 : 0;

        return {
          id: `${accountId}_${holding.tradingsymbol}_${holding.isin}`,
          symbol: holding.tradingsymbol,
          exchange: holding.exchange || 'NSE',
          quantity: quantity,
          averagePrice: avgPrice,
          lastPrice: lastPrice,
          currentValue: currentValue,
          pnl: pnl,
          pnlPercentage: pnlPercentage,
          isin: holding.isin,
          companyName: holding.instrument_token, // Kite doesn't provide company name directly
          vendor: 'kite',
          accountId,
          accountName,
          timestamp,
          details: holding,
        };
      });

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

    let holdingsData: any;
    let normalizedData: UnifiedHoldingResponse[];

    switch (vendor.toLowerCase()) {
      case 'upstox':
        try {
          holdingsData = await fetchUpstoxHoldings(account);
          normalizedData = normalizeHoldingsData(
            'upstox',
            holdingsData,
            accountId,
            account.accountName
          );
        } catch (error: any) {
          const errorMessage =
            error instanceof Error ? error.message : 'Failed to fetch Upstox holdings';

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
          holdingsData = await fetchKiteHoldings(account);
          normalizedData = normalizeHoldingsData(
            'kite',
            holdingsData,
            accountId,
            account.accountName
          );
        } catch (error: any) {
          const errorMessage =
            error instanceof Error ? error.message : 'Failed to fetch Kite holdings';

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
        error: 'Failed to fetch holdings data',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
