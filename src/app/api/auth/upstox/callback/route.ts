import connectDB from '@/lib/mongodb';
import upstoxService from '@/lib/upstox-service';
import Account from '@/models/account';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * Handle Upstox OAuth callback
 * This endpoint receives the authorization code from Upstox after user login
 * GET /api/auth/upstox/callback?code=xxx&state=upstox_auth
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const authorizationCode = searchParams.get('code');
    const state = searchParams.get('state');
    const error = searchParams.get('error');

    // Check if authentication was successful
    if (error) {
      return NextResponse.redirect(
        new URL(`/accounts?error=upstox_auth_failed&details=${error}`, request.url)
      );
    }

    if (state !== 'upstox_auth') {
      return NextResponse.redirect(new URL('/accounts?error=invalid_state', request.url));
    }

    if (!authorizationCode) {
      return NextResponse.redirect(new URL('/accounts?error=no_authorization_code', request.url));
    }

    // Get account ID from cookie
    const accountId = request.cookies.get('upstox_account_id')?.value;
    if (!accountId) {
      return NextResponse.redirect(new URL('/accounts?error=session_expired', request.url));
    }

    // Connect to database and fetch account
    await connectDB();
    const account = await Account.findById(accountId);

    if (!account) {
      return NextResponse.redirect(new URL('/accounts?error=account_not_found', request.url));
    }

    // Initialize Upstox service with account credentials
    // Check if account is using sandbox environment
    const isSandbox = account.metadata?.sandbox === true;
    upstoxService.initializeWithCredentials(account.apiKey, account.apiSecret, isSandbox);

    // Generate session (exchange authorization code for access token)
    const sessionData = await upstoxService.generateSession(authorizationCode);

    // Update account with access token
    account.accessToken = sessionData.access_token;
    account.metadata = {
      ...account.metadata,
      tokenType: sessionData.token_type,
      expiresIn: sessionData.expires_in,
      scope: sessionData.scope,
      loginTime: new Date().toISOString(),
    };

    await account.save();

    // Clear the temporary cookie
    const response = NextResponse.redirect(
      new URL('/accounts?success=upstox_connected', request.url)
    );
    response.cookies.delete('upstox_account_id');

    return response;
  } catch (error) {
    console.error('Error in Upstox callback:', error);

    // Clear the cookie in case of error
    const response = NextResponse.redirect(
      new URL('/accounts?error=upstox_session_failed', request.url)
    );
    response.cookies.delete('upstox_account_id');

    return response;
  }
}
