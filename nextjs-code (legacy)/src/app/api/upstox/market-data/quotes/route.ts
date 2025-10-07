import upstoxService from '@/lib/upstox-service';
import { getAccountById } from '@/models/account';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// Proxy for Upstox v3 market quotes API to fetch initial snapshot for instrument keys
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

    // Use SDK method instead of direct API call
    const quotes = await upstoxService.getQuote(instrumentKeys);
    const data = { data: quotes };

    // Normalize into a simpler map keyed by instrumentKey
    const out: Record<string, any> = {};
    const items = data?.data || [];
    // Response shapes can vary; try to extract conservatively
    // Common shapes:
    // data: [ { instrument_key, last_price/ltp, ohlc: { open, high, low, close }, depth: { buy/ sell }, vtt } ]
    for (const item of items) {
      const ik: string = (item.instrument_key || item.instrumentKey || '').toUpperCase();
      if (!ik) continue;
      const ltp =
        item.last_price ??
        item.ltp ??
        item.lastTradedPrice ??
        item.ltpc?.ltp ??
        (typeof item.price === 'number' ? item.price : undefined);
      const cp = item.close_price ?? item.cp ?? item.ohlc?.close;
      const ohlc = item.ohlc || {
        open: item.open_price ?? item.open,
        high: item.high_price ?? item.high,
        low: item.low_price ?? item.low,
        close: cp,
      };
      const bidAsk = item.depth?.firstLevel || item.depth?.best || item.best_bid_ask || null;
      const bid = bidAsk?.bid_price ?? bidAsk?.bidP ?? bidAsk?.bid ?? undefined;
      const bidQty = bidAsk?.bid_quantity ?? bidAsk?.bidQ ?? undefined;
      const ask = bidAsk?.ask_price ?? bidAsk?.askP ?? bidAsk?.ask ?? undefined;
      const askQty = bidAsk?.ask_quantity ?? bidAsk?.askQ ?? undefined;

      out[ik] = {
        ltpc:
          ltp !== undefined || cp !== undefined
            ? { ltp, cp, ltt: item.ltt ?? 0, cp_ts: item.cp_ts ?? 0 }
            : undefined,
        ohlc: ohlc?.open !== undefined ? ohlc : undefined,
        bidAsk:
          bid !== undefined || ask !== undefined
            ? { bid, ask, bidQty: bidQty ?? 0, askQty: askQty ?? 0 }
            : undefined,
      };
    }

    return NextResponse.json({ success: true, data: out });
  } catch (error: any) {
    console.error('Upstox quotes error:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to fetch quotes' },
      { status: 500 }
    );
  }
}
