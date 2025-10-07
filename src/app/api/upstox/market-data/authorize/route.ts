import upstoxService from '@/lib/upstox-service';
import { getAccountById } from '@/models/account';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const accountId = searchParams.get('accountId');

    if (!accountId) {
      return NextResponse.json({ success: false, error: 'accountId is required' }, { status: 400 });
    }

    const account = await getAccountById(accountId);
    if (!account) {
      return NextResponse.json({ success: false, error: 'Account not found' }, { status: 400 });
    }
    if (account.accountType !== 'upstox') {
      return NextResponse.json(
        { success: false, error: 'Account is not an Upstox account' },
        { status: 400 }
      );
    }

    // Initialize service and set token
    const isSandbox = account.metadata?.sandbox === true;
    upstoxService.initializeWithCredentials(account.apiKey, account.apiSecret, isSandbox);
    if (!account.accessToken) {
      return NextResponse.json(
        { success: false, error: 'Missing Upstox access token. Re-authenticate this account.' },
        { status: 401 }
      );
    }
    upstoxService.setAccessToken(account.accessToken);

    // Call V3 authorize endpoint to get the one-time websocket URL
    const base = isSandbox ? 'https://api-sandbox.upstox.com' : 'https://api.upstox.com';
    const authEndpoint = `${base}/v3/feed/market-data-feed/authorize`;

    const resp = await fetch(authEndpoint, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${account.accessToken}`,
        Accept: 'application/json',
      },
      // No cache – each URL is one-time use
      cache: 'no-store',
    });

    const data = await resp.json().catch(() => ({}) as any);
    if (!resp.ok) {
      const message = data?.errors?.[0]?.message || data?.message || 'Authorization failed';
      return NextResponse.json({ success: false, error: message }, { status: resp.status });
    }

    const url = data?.data?.authorized_redirect_uri;
    if (!url) {
      return NextResponse.json(
        { success: false, error: 'authorized_redirect_uri missing in response' },
        { status: 502 }
      );
    }

    return NextResponse.json({ success: true, url });
  } catch (error: any) {
    console.error('Upstox authorize error:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to authorize Upstox feed' },
      { status: 500 }
    );
  }
}
