import connectDB from '@/lib/mongodb';
import upstoxService from '@/lib/upstox-service';
import Account from '@/models/account';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * Handle Upstox Sandbox Direct Token Authentication
 * This endpoint directly sets the access token for sandbox accounts
 * POST /api/auth/upstox/sandbox-token
 */
export async function POST(request: NextRequest) {
  try {
    const { accountId, accessToken } = await request.json();

    if (!accountId) {
      return NextResponse.json(
        {
          success: false,
          error: 'Account ID is required',
        },
        { status: 400 }
      );
    }

    if (!accessToken) {
      return NextResponse.json(
        {
          success: false,
          error: 'Access token is required for sandbox authentication',
        },
        { status: 400 }
      );
    }

    // Connect to database and fetch account
    await connectDB();
    const account = await Account.findById(accountId);

    if (!account) {
      return NextResponse.json(
        {
          success: false,
          error: 'Account not found',
        },
        { status: 404 }
      );
    }

    if (account.accountType !== 'upstox') {
      return NextResponse.json(
        {
          success: false,
          error: 'Account is not an Upstox account',
        },
        { status: 400 }
      );
    }

    if (account.metadata?.sandbox !== true) {
      return NextResponse.json(
        {
          success: false,
          error: 'This endpoint is only for sandbox accounts',
        },
        { status: 400 }
      );
    }

    // Initialize Upstox service with account credentials
    upstoxService.initializeWithCredentials(account.apiKey, account.apiSecret, true);

    // For sandbox tokens, we skip validation since:
    // 1. Sandbox tokens are pre-validated by Upstox when generated
    // 2. Many validation APIs are not available in sandbox mode
    // 3. User generates token directly from Upstox Developer Portal

    console.log('Setting sandbox access token directly (skipping validation)');

    // Set the access token directly without validation
    upstoxService.setAccessToken(accessToken);

    // Update account with access token
    account.accessToken = accessToken;
    account.metadata = {
      ...account.metadata,
      tokenType: 'bearer',
      loginTime: new Date().toISOString(),
      tokenSource: 'sandbox_direct',
      tokenValidated: false, // We skip validation for sandbox
      tokenNote: 'Sandbox token set directly from Developer Portal',
    };

    await account.save();

    console.log('Sandbox access token saved successfully for account:', account.accountName);

    return NextResponse.json({
      success: true,
      message:
        'Sandbox access token saved successfully. Note: Token validation was skipped as many APIs are not available in sandbox mode.',
    });
  } catch (error: any) {
    console.error('Error in Upstox sandbox token authentication:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to authenticate with sandbox token',
      },
      { status: 500 }
    );
  }
}
