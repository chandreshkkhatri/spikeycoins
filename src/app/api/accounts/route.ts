import { createAccount, getAccountsByUserId } from '@/models/account';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');

    if (!userId) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
    }

    const accounts = await getAccountsByUserId(userId);

    // Remove sensitive data before sending to client
    const safeAccounts = accounts.map(account => ({
      ...account,
      apiSecret: undefined, // Never send API secret to client
      accessToken: account.accessToken ? '***' : undefined,
    }));

    return NextResponse.json({ success: true, accounts: safeAccounts });
  } catch (error) {
    console.error('Error fetching accounts:', error);
    return NextResponse.json({ error: 'Failed to fetch accounts' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, accountType, accountName, apiKey, apiSecret, redirectUri } = body;

    if (!userId || !accountType || !accountName || !apiKey || !apiSecret) {
      return NextResponse.json(
        {
          error: 'Missing required fields: userId, accountType, accountName, apiKey, apiSecret',
        },
        { status: 400 }
      );
    }

    if (!['kite', 'upstox', 'binance'].includes(accountType)) {
      return NextResponse.json({ error: 'Invalid account type' }, { status: 400 });
    }

    // Trim API keys to remove any accidental whitespace
    const accountData = {
      userId,
      accountType,
      accountName,
      apiKey: apiKey.trim(),
      apiSecret: apiSecret.trim(),
      isActive: true,
      metadata: {
        ...(redirectUri && { redirectUri }),
      },
    };

    console.log('Creating account with API key length:', apiKey.trim().length);

    // Handle special fields based on account type
    let metadata = {};

    // For Binance, check testnet flag
    if (accountType === 'binance' && redirectUri === 'testnet') {
      metadata = { testnet: true };
    }

    // For Upstox, check sandbox flag
    if (accountType === 'upstox' && redirectUri === 'sandbox') {
      metadata = { sandbox: true };
    }

    const finalAccountData = {
      ...accountData,
      metadata,
      redirectUri: undefined, // Don't store redirectUri directly
    };

    const newAccount = await createAccount(finalAccountData);

    // Remove sensitive data before sending response
    const safeAccount = {
      ...newAccount,
      apiSecret: undefined,
    };

    return NextResponse.json(
      {
        success: true,
        account: safeAccount,
        message: 'Account created successfully',
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error('Error creating account:', error);

    if (error.code === 11000) {
      return NextResponse.json(
        {
          error: 'Account with this name already exists for this user',
        },
        { status: 409 }
      );
    }

    return NextResponse.json({ error: 'Failed to create account' }, { status: 500 });
  }
}
