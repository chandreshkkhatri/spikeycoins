import { createBinanceClient } from '@/lib/binance';
import kiteConnectService from '@/lib/kiteconnect-service';
import connectDB from '@/lib/mongodb';
import upstoxService from '@/lib/upstox-service';
import Account from '@/models/account';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

interface UnifiedFundsResponse {
  totalBalance: string;
  availableBalance: string;
  usedMargin?: string;
  unrealizedPnl?: string;
  details: any;
  vendor: string;
  accountId: string;
  accountName: string;
  timestamp: string;
}

// Binance funds fetcher - uses the existing BinanceAPI class
const fetchBinanceFunds = async (
  apiKey: string,
  secretKey: string,
  testnet: boolean = false
): Promise<any> => {
  try {
    const binanceClient = createBinanceClient({ apiKey, apiSecret: secretKey, testnet });
    const accountInfo = await binanceClient.getAccountInfo();

    return {
      totalWalletBalance: accountInfo.totalWalletBalance || '0',
      totalMarginBalance: accountInfo.totalMarginBalance || '0',
      totalUnrealizedProfit: accountInfo.totalUnrealizedProfit || '0',
      availableBalance: accountInfo.availableBalance || '0',
      maxWithdrawAmount: accountInfo.maxWithdrawAmount || '0',
      assets: accountInfo.assets || [],
    };
  } catch (error) {
    throw error;
  }
};

// Kite Connect funds fetcher
const fetchKiteFunds = async (account: any): Promise<any> => {
  try {
    // Initialize KiteConnect service with account credentials
    kiteConnectService.initializeWithCredentials(account.apiKey, account.apiSecret);

    // Set access token if available
    if (account.accessToken) {
      kiteConnectService.setAccessToken(account.accessToken);
    } else {
      throw new Error('Access token not found. Please re-authenticate your Kite Connect account.');
    }

    // Fetch margins
    const margins = await kiteConnectService.getMargins();
    return margins;
  } catch (error) {
    throw error;
  }
};

// Upstox funds fetcher
const fetchUpstoxFunds = async (account: any): Promise<any> => {
  try {
    // Initialize Upstox service with account credentials
    // Check if account is using sandbox environment
    const isSandbox = account.metadata?.sandbox === true;
    upstoxService.initializeWithCredentials(account.apiKey, account.apiSecret, isSandbox);

    // Set access token if available
    if (account.accessToken) {
      upstoxService.setAccessToken(account.accessToken);
    } else {
      throw new Error('Access token not found. Please re-authenticate your Upstox account.');
    }

    // Fetch funds
    const funds = await upstoxService.getFunds();
    return funds;
  } catch (error) {
    throw error;
  }
};

// Normalize funds data to unified format
const normalizeFundsData = (
  vendor: string,
  rawData: any,
  accountId: string,
  accountName: string
): UnifiedFundsResponse => {
  let totalBalance = '0';
  let availableBalance = '0';
  let usedMargin = undefined;
  let unrealizedPnl = undefined;

  switch (vendor.toLowerCase()) {
    case 'binance':
      totalBalance = rawData.totalWalletBalance || '0';
      availableBalance = rawData.availableBalance || '0';
      unrealizedPnl = rawData.totalUnrealizedProfit || '0';
      break;

    case 'kite':
    case 'kiteconnect':
      // Kite margins structure varies, adapt based on actual response
      if (rawData.equity) {
        totalBalance = rawData.equity.net?.toString() || '0';
        availableBalance = rawData.equity.available?.cash?.toString() || '0';
        usedMargin = rawData.equity.utilised?.debits?.toString() || '0';
      } else {
        totalBalance = rawData.net?.toString() || '0';
        availableBalance = rawData.available?.cash?.toString() || '0';
        usedMargin = rawData.utilised?.debits?.toString() || '0';
      }
      break;

    case 'upstox':
      // Adapt based on Upstox funds response structure
      if (rawData.equity) {
        const usedMarginValue = rawData.equity.used_margin || 0;
        const availableMarginValue = rawData.equity.available_margin || 0;
        totalBalance = (usedMarginValue + availableMarginValue).toString();
        availableBalance = availableMarginValue.toString();
        usedMargin = usedMarginValue.toString();
        unrealizedPnl = rawData.equity.unrealized_mtm?.toString() || '0';
      }
      // Check if this is a service hours error response
      if (rawData._serviceHoursError) {
        totalBalance = 'Service Unavailable';
        availableBalance = 'Service hours: 5:30 AM - 12:00 AM IST';
      }
      break;
  }

  return {
    totalBalance,
    availableBalance,
    usedMargin,
    unrealizedPnl,
    details: rawData,
    vendor,
    accountId,
    accountName,
    timestamp: new Date().toISOString(),
  };
};

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const vendor = searchParams.get('vendor');
    const accountId = searchParams.get('accountId');

    // If vendor is specified, it must have accountId
    if (vendor && !accountId) {
      return NextResponse.json(
        { error: 'accountId is required when vendor is specified' },
        { status: 400 }
      );
    }

    // If no vendor specified, try to determine from symbol or default logic
    if (!vendor) {
      return NextResponse.json(
        { error: 'vendor parameter is required. Supported vendors: binance, kite, upstox' },
        { status: 400 }
      );
    }

    await connectDB();

    let account = null;
    if (accountId) {
      account = await Account.findById(accountId);
      if (!account) {
        return NextResponse.json({ error: 'Account not found' }, { status: 404 });
      }

      // Validate vendor matches account type
      if (account.accountType !== vendor.toLowerCase()) {
        return NextResponse.json(
          { error: `Account type mismatch. Expected ${vendor}, got ${account.accountType}` },
          { status: 400 }
        );
      }
    }

    let fundsData;
    let normalizedData;

    switch (vendor.toLowerCase()) {
      case 'binance':
        if (!account || !account.apiKey || !account.apiSecret) {
          return NextResponse.json(
            { error: 'Binance API credentials not found for this account' },
            { status: 400 }
          );
        }

        try {
          const isTestnet = account.metadata?.testnet || false;
          fundsData = await fetchBinanceFunds(
            account.apiKey.trim(),
            account.apiSecret.trim(),
            isTestnet
          );
          normalizedData = normalizeFundsData(
            'binance',
            fundsData,
            accountId!,
            account.accountName
          );
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          if (errorMessage.includes('Invalid API') || errorMessage.includes('signature')) {
            return NextResponse.json(
              {
                success: false,
                error: 'Invalid API credentials. Please check your API key and secret.',
                details: errorMessage,
              },
              { status: 401 }
            );
          }
          throw error;
        }
        break;

      case 'kite':
      case 'kiteconnect':
        if (!account) {
          return NextResponse.json(
            { error: 'Account not found for Kite Connect' },
            { status: 404 }
          );
        }

        try {
          fundsData = await fetchKiteFunds(account);
          normalizedData = normalizeFundsData('kite', fundsData, accountId!, account.accountName);
        } catch (error: any) {
          const errorMessage =
            error instanceof Error ? error.message : 'Failed to fetch Kite funds';

          // Check if it's a token expiry error (Kite returns 403 for invalid sessions)
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

      case 'upstox':
        if (!account) {
          return NextResponse.json({ error: 'Account not found for Upstox' }, { status: 404 });
        }

        try {
          fundsData = await fetchUpstoxFunds(account);
          normalizedData = normalizeFundsData('upstox', fundsData, accountId!, account.accountName);
        } catch (error: any) {
          const errorMessage =
            error instanceof Error ? error.message : 'Failed to fetch Upstox funds';

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

      default:
        return NextResponse.json(
          { error: `Unsupported vendor: ${vendor}. Supported vendors: binance, kite, upstox` },
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
        error: 'Failed to fetch funds data',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { vendor, accountId, ...vendorParams } = body;

    if (!vendor) {
      return NextResponse.json(
        { error: 'vendor parameter is required in request body' },
        { status: 400 }
      );
    }

    if (!accountId) {
      return NextResponse.json(
        { error: 'accountId parameter is required in request body' },
        { status: 400 }
      );
    }

    await connectDB();
    const account = await Account.findById(accountId);
    if (!account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    // Validate vendor matches account type
    if (account.accountType !== vendor.toLowerCase()) {
      return NextResponse.json(
        { error: `Account type mismatch. Expected ${vendor}, got ${account.accountType}` },
        { status: 400 }
      );
    }

    let fundsData;
    let normalizedData;

    switch (vendor.toLowerCase()) {
      case 'binance':
        if (!account.apiKey || !account.apiSecret) {
          return NextResponse.json(
            { error: 'Binance API credentials not found for this account' },
            { status: 400 }
          );
        }

        try {
          const isTestnet = account.metadata?.testnet || false;
          fundsData = await fetchBinanceFunds(
            account.apiKey.trim(),
            account.apiSecret.trim(),
            isTestnet
          );
          normalizedData = normalizeFundsData('binance', fundsData, accountId, account.accountName);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          if (errorMessage.includes('Invalid API') || errorMessage.includes('signature')) {
            return NextResponse.json(
              {
                success: false,
                error: 'Invalid API credentials. Please check your API key and secret.',
                details: errorMessage,
              },
              { status: 401 }
            );
          }
          throw error;
        }
        break;

      case 'kite':
      case 'kiteconnect':
        try {
          fundsData = await fetchKiteFunds(account);
          normalizedData = normalizeFundsData('kite', fundsData, accountId, account.accountName);
        } catch (error) {
          return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to fetch Kite funds' },
            { status: 500 }
          );
        }
        break;

      case 'upstox':
        try {
          fundsData = await fetchUpstoxFunds(account);
          normalizedData = normalizeFundsData('upstox', fundsData, accountId, account.accountName);
        } catch (error) {
          return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to fetch Upstox funds' },
            { status: 500 }
          );
        }
        break;

      default:
        return NextResponse.json(
          { error: `Unsupported vendor: ${vendor}. Supported vendors: binance, kite, upstox` },
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
        error: 'Failed to fetch funds data',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
