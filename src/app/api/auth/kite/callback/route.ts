import kiteConnectService from '@/lib/kiteconnect-service';
import connectDB from '@/lib/mongodb';
import Account from '@/models/account';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * Handle Kite OAuth callback
 * This endpoint receives the request token from Kite after user login
 * GET /api/auth/kite/callback?request_token=xxx&action=login&status=success
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const requestToken = searchParams.get('request_token');
    const status = searchParams.get('status');
    const action = searchParams.get('action');

    // Check if authentication was successful
    if (status !== 'success' || action !== 'login') {
      return NextResponse.redirect(new URL('/accounts?error=kite_auth_failed', request.url));
    }

    if (!requestToken) {
      return NextResponse.redirect(new URL('/accounts?error=no_request_token', request.url));
    }

    // Get account ID from cookie
    const accountId = request.cookies.get('kite_account_id')?.value;
    if (!accountId) {
      return NextResponse.redirect(new URL('/accounts?error=session_expired', request.url));
    }

    // Connect to database and fetch account
    await connectDB();
    const account = await Account.findById(accountId);

    if (!account) {
      return NextResponse.redirect(new URL('/accounts?error=account_not_found', request.url));
    }

    // Initialize KiteConnect service with account credentials
    kiteConnectService.initializeWithCredentials(account.apiKey, account.apiSecret);

    // Generate session (exchange request token for access token)
    const sessionData = await kiteConnectService.generateSession(requestToken);

    // Update account with access token
    account.accessToken = sessionData.access_token;
    account.metadata = {
      ...account.metadata,
      userId: sessionData.user_id,
      userShortname: sessionData.user_shortname,
      publicToken: sessionData.public_token,
      loginTime: new Date().toISOString(),
    };

    await account.save();

    // Clear the temporary cookie
    const response = NextResponse.redirect(
      new URL('/accounts?success=kite_connected', request.url)
    );
    response.cookies.delete('kite_account_id');

    return response;
  } catch (error) {
    console.error('Error in Kite callback:', error);

    // Clear the cookie in case of error
    const response = NextResponse.redirect(
      new URL('/accounts?error=kite_session_failed', request.url)
    );
    response.cookies.delete('kite_account_id');

    return response;
  }
}
