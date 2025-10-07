import upstoxService from '@/lib/upstox-service';
import { getAccountById } from '@/models/account';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// Proxy for Upstox v2 LTP API to get just Last Traded Price
// POST body: { accountId: string, instrumentKeys: string[] }
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { accountId, instrumentKeys } = body as {
      accountId?: string;
      instrumentKeys?: string[];
    };

    if (!accountId) {
      return NextResponse.json({ success: false, error: 'accountId is required' }, { status: 400 });
    }
    if (!Array.isArray(instrumentKeys) || instrumentKeys.length === 0) {
      return NextResponse.json(
        { success: false, error: 'instrumentKeys[] required' },
        { status: 400 }
      );
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

    const isSandbox = account.metadata?.sandbox === true;
    upstoxService.initializeWithCredentials(account.apiKey, account.apiSecret, isSandbox);
    if (!account.accessToken) {
      return NextResponse.json(
        { success: false, error: 'Missing Upstox access token. Re-authenticate this account.' },
        { status: 401 }
      );
    }
    upstoxService.setAccessToken(account.accessToken);

    // Call LTP API directly
    const ltpData = await upstoxService.getLTP(instrumentKeys);

    return NextResponse.json({ success: true, data: ltpData });
  } catch (error: any) {
    console.error('Upstox LTP error:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to fetch LTP' },
      { status: 500 }
    );
  }
}