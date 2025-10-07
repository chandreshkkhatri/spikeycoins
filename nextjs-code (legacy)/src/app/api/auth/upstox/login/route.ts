import connectDB from '@/lib/mongodb';
import upstoxService from '@/lib/upstox-service';
import Account from '@/models/account';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * Initiate Upstox login flow for a specific account
 * GET /api/auth/upstox/login?accountId=123 (redirects to Upstox)
 * POST /api/auth/upstox/login { accountId } (returns JSON with login URL)
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const accountId = searchParams.get('accountId');

    if (!accountId) {
      return NextResponse.json({ error: 'accountId parameter is required' }, { status: 400 });
    }

    // Connect to database and fetch account
    await connectDB();
    const account = await Account.findById(accountId);

    if (!account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    if (account.accountType !== 'upstox') {
      return NextResponse.json(
        { error: 'Invalid account type. Expected Upstox account.' },
        { status: 400 }
      );
    }

    if (!account.apiKey || !account.apiSecret) {
      return NextResponse.json(
        { error: 'API credentials not found for this account' },
        { status: 400 }
      );
    }

    // Initialize Upstox service with account credentials
    // Check if account is using sandbox environment
    const isSandbox = account.metadata?.sandbox === true;
    upstoxService.initializeWithCredentials(account.apiKey, account.apiSecret, isSandbox);

    // Get the login URL
    const loginUrl = upstoxService.getLoginURL();

    // Set cookie to track which account is being authenticated
    const response = NextResponse.redirect(loginUrl);
    response.cookies.set('upstox_account_id', accountId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 10, // 10 minutes - enough time for auth flow
    });

    return response;
  } catch (error) {
    console.error('Error initiating Upstox login:', error);
    return NextResponse.json(
      {
        error: 'Failed to initiate Upstox login',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * POST method - Returns login URL as JSON instead of redirecting
 * Useful for frontend applications that want to handle the redirect themselves
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { accountId } = body;

    if (!accountId) {
      return NextResponse.json({ error: 'accountId is required in request body' }, { status: 400 });
    }

    // Connect to database and fetch account
    await connectDB();
    const account = await Account.findById(accountId);

    if (!account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    if (account.accountType !== 'upstox') {
      return NextResponse.json(
        { error: 'Invalid account type. Expected Upstox account.' },
        { status: 400 }
      );
    }

    if (!account.apiKey || !account.apiSecret) {
      return NextResponse.json(
        { error: 'API credentials not found for this account' },
        { status: 400 }
      );
    }

    // Initialize Upstox service with account credentials
    // Check if account is using sandbox environment
    const isSandbox = account.metadata?.sandbox === true;
    upstoxService.initializeWithCredentials(account.apiKey, account.apiSecret, isSandbox);

    // Get the login URL
    const loginUrl = upstoxService.getLoginURL();

    // Create response with JSON data
    const response = NextResponse.json({
      success: true,
      loginUrl,
      accountId,
      message:
        'Login URL generated successfully. Redirect user to loginUrl to complete authentication.',
    });

    // Set cookie to track which account is being authenticated
    // This is crucial for the callback to work
    response.cookies.set('upstox_account_id', accountId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 10, // 10 minutes - enough time for auth flow
    });

    return response;
  } catch (error) {
    console.error('Error generating Upstox login URL:', error);
    return NextResponse.json(
      {
        error: 'Failed to generate Upstox login URL',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
