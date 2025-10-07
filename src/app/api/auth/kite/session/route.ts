import kiteConnectService from '@/lib/kiteconnect-service';
import connectDB from '@/lib/mongodb';
import Account from '@/models/account';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * Generate Kite session manually (alternative to callback flow)
 * POST /api/auth/kite/session
 * Body: { accountId: string, requestToken: string }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { accountId, requestToken } = body;

    if (!accountId || !requestToken) {
      return NextResponse.json(
        { error: 'accountId and requestToken are required' },
        { status: 400 }
      );
    }

    // Connect to database and fetch account
    await connectDB();
    const account = await Account.findById(accountId);

    if (!account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    if (account.accountType !== 'kite') {
      return NextResponse.json(
        { error: 'Invalid account type. Expected Kite account.' },
        { status: 400 }
      );
    }

    if (!account.apiKey || !account.apiSecret) {
      return NextResponse.json(
        { error: 'API credentials not found for this account' },
        { status: 400 }
      );
    }

    // Initialize KiteConnect service with account credentials
    kiteConnectService.initializeWithCredentials(account.apiKey, account.apiSecret);

    // Generate session (exchange request token for access token)
    const sessionData = await kiteConnectService.generateSession(requestToken);

    // Update account with access token and user info
    account.accessToken = sessionData.access_token;
    account.metadata = {
      ...account.metadata,
      userId: sessionData.user_id,
      userShortname: sessionData.user_shortname,
      publicToken: sessionData.public_token,
      loginTime: new Date().toISOString(),
    };

    await account.save();

    // Remove sensitive data before sending response
    const safeAccount = {
      ...account.toObject(),
      apiSecret: undefined,
      accessToken: '***',
    };

    return NextResponse.json({
      success: true,
      message: 'Kite session generated successfully',
      account: safeAccount,
      sessionInfo: {
        userId: sessionData.user_id,
        userShortname: sessionData.user_shortname,
        loginTime: account.metadata.loginTime,
      },
    });
  } catch (error) {
    console.error('Error generating Kite session:', error);

    // Handle specific Kite errors
    let errorMessage = 'Failed to generate Kite session';
    if (error instanceof Error) {
      if (error.message.includes('Invalid request token')) {
        errorMessage = 'Invalid or expired request token. Please try logging in again.';
      } else if (error.message.includes('Network error')) {
        errorMessage = 'Network error. Please check your connection and try again.';
      } else if (error.message.includes('API key')) {
        errorMessage = 'Invalid API credentials. Please check your Kite API key.';
      }
    }

    return NextResponse.json(
      {
        error: errorMessage,
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
