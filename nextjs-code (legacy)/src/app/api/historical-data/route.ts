import { checkAuth, getHistoricalData } from '@/lib/kiteconnect-service';
import connectDB from '@/lib/mongodb';
import { getAccountById } from '@/models/account';
import getInstrumentModel from '@/models/instrument';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// Binance historical data fetcher
const fetchBinanceKlines = async (symbol: string, interval: string) => {
  try {
    const limit = 100;
    const binanceInterval =
      interval === '1m'
        ? '1m'
        : interval === '5m'
          ? '5m'
          : interval === '15m'
            ? '15m'
            : interval === '1h'
              ? '1h'
              : interval === '4h'
                ? '4h'
                : interval === '1d'
                  ? '1d'
                  : interval === '1w'
                    ? '1w'
                    : '1h';

    const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${binanceInterval}&limit=${limit}`;

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Binance API error: ${response.status}`);
    }

    const klines = await response.json();

    const formattedData = klines.map((kline: any[]) => ({
      date: new Date(kline[0]).toISOString(),
      open: parseFloat(kline[1]),
      high: parseFloat(kline[2]),
      low: parseFloat(kline[3]),
      close: parseFloat(kline[4]),
      volume: parseFloat(kline[5]),
    }));

    return formattedData;
  } catch (error) {
    console.error('Error fetching Binance klines:', error);
    throw error;
  }
};

// Kite Connect historical data fetcher
const fetchKiteHistoricalData = async (params: {
  instrument_token: string;
  interval: string;
  from_date: string;
  to_date: string;
  instrument_type?: string;
}) => {
  if (!checkAuth()) {
    throw new Error('Not authenticated for Kite Connect');
  }

  const { instrument_token, interval, from_date, to_date, instrument_type } = params;
  const continuous = instrument_type === 'derivative' ? 1 : 0;

  return await getHistoricalData(instrument_token, interval, from_date, to_date, continuous);
};

// Helper to aggregate candles to a higher timeframe
const aggregateCandles = (
  candles: Array<{
    date: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  }>,
  targetMinutes: number
) => {
  if (!candles?.length) return [] as typeof candles;
  const targetMs = targetMinutes * 60 * 1000;
  const buckets = new Map<
    number,
    { date: number; open: number; high: number; low: number; close: number; volume: number }
  >();

  // Ensure ascending order
  const sorted = [...candles].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  for (const c of sorted) {
    const ts = new Date(c.date).getTime();
    const bucketStart = Math.floor(ts / targetMs) * targetMs;
    const existing = buckets.get(bucketStart);
    if (!existing) {
      buckets.set(bucketStart, {
        date: bucketStart,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.volume ?? 0,
      });
    } else {
      existing.high = Math.max(existing.high, c.high);
      existing.low = Math.min(existing.low, c.low);
      // Close updates to latest candle in bucket
      existing.close = c.close;
      existing.volume += c.volume ?? 0;
    }
  }

  return Array.from(buckets.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([, v]) => ({
      date: new Date(v.date).toISOString(),
      open: v.open,
      high: v.high,
      low: v.low,
      close: v.close,
      volume: v.volume,
    }));
};

// Ensure ascending order and de-duplicate by timestamp
const normalizeCandlesAsc = (
  candles: Array<{
    date: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  }>
) => {
  if (!Array.isArray(candles) || candles.length === 0) return [] as typeof candles;
  const seen = new Set<number>();
  const cleaned = candles
    .filter(c => c && c.date && !Number.isNaN(new Date(c.date).getTime()))
    .map(c => ({ ...c, _t: new Date(c.date).getTime() }))
    .sort((a, b) => a._t - b._t)
    .filter(c => {
      if (seen.has(c._t)) return false;
      seen.add(c._t);
      return true;
    })
    .map(({ _t, ...rest }) => rest);
  return cleaned;
};

// Upstox historical data fetcher
const fetchUpstoxHistoricalData = async (params: {
  symbol: string;
  interval: string;
  from_date?: string;
  to_date?: string;
  account: any;
  instrument_token?: string;
}) => {
  try {
    // Import the Upstox service
    const upstoxService = (await import('@/lib/upstox-service')).default;

    // Initialize Upstox service with account credentials
    const isSandbox = params.account.metadata?.sandbox === true;
    upstoxService.initializeWithCredentials(
      params.account.apiKey,
      params.account.apiSecret,
      isSandbox
    );

    // Set access token if available
    if (params.account.accessToken) {
      upstoxService.setAccessToken(params.account.accessToken);
    } else {
      throw new Error('Access token not found. Please re-authenticate your Upstox account.');
    }

    // Use instrument_token if provided, otherwise we need to look up the proper instrument token
    let instrumentKey = params.instrument_token;

    if (!instrumentKey) {
      // Search for instrument token in database
      try {
        await connectDB();
        const InstrumentModel = getInstrumentModel('upstox');

        // Search for the symbol in instruments_upstox collection
        const instrument = await InstrumentModel.findOne({
          $or: [
            { trading_symbol: params.symbol },
            { tradingsymbol: params.symbol },
            { name: { $regex: new RegExp(`^${params.symbol}$`, 'i') } },
          ],
        });

        if (instrument) {
          instrumentKey = instrument.instrument_token || instrument.instrument_key;
        } else {
          throw new Error(
            `Instrument token not found for symbol: ${params.symbol}. Please make sure the symbol exists in the instruments database.`
          );
        }
      } catch (dbError) {
        console.error('Database lookup error:', dbError);
        throw new Error(
          `Failed to lookup instrument token for ${params.symbol}: ${dbError instanceof Error ? dbError.message : 'Database error'}`
        );
      }
    }

    // Calculate dates if not provided
    const toDate = params.to_date || new Date().toISOString().split('T')[0];
    const fromDate =
      params.from_date ||
      new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    // Map interval to Upstox V3 format (unit + interval). V3 supports minutes(1..300), hours(1..5), days/weeks/months:1
    const intervalMapping = {
      '1m': { unit: 'minutes' as const, interval: 1 },
      '2m': { unit: 'minutes' as const, interval: 2 },
      '3m': { unit: 'minutes' as const, interval: 3 },
      '5m': { unit: 'minutes' as const, interval: 5 },
      '10m': { unit: 'minutes' as const, interval: 10 },
      '15m': { unit: 'minutes' as const, interval: 15 },
      '30m': { unit: 'minutes' as const, interval: 30 },
      '60m': { unit: 'minutes' as const, interval: 60 },
      '1h': { unit: 'hours' as const, interval: 1 },
      '2h': { unit: 'hours' as const, interval: 2 },
      '3h': { unit: 'hours' as const, interval: 3 },
      '4h': { unit: 'hours' as const, interval: 4 },
      '5h': { unit: 'hours' as const, interval: 5 },
      '1d': { unit: 'days' as const, interval: 1 },
      '1w': { unit: 'weeks' as const, interval: 1 },
      '1M': { unit: 'months' as const, interval: 1 },
    } as const;

    const upstoxParams = (intervalMapping as any)[params.interval] || {
      unit: 'hours',
      interval: 1,
    };

    // Prefer V3 endpoint: no aggregation needed if supported
    const useV3Direct = (() => {
      // V3 supports minutes up to 300, hours up to 5, days/weeks/months = 1
      const u = upstoxParams.unit;
      const iv = Number(upstoxParams.interval);
      if (u === 'minutes') return iv >= 1 && iv <= 300;
      if (u === 'hours') return iv >= 1 && iv <= 5;
      if (u === 'days' || u === 'weeks' || u === 'months') return iv === 1;
      return false;
    })();


    try {
      if (useV3Direct) {
        const v3Candles: any[] = await upstoxService.getHistoricalDataV3(
          instrumentKey!,
          upstoxParams.unit,
          upstoxParams.interval,
          toDate,
          fromDate
        );
        const formatted = v3Candles.map((c: any[]) => ({
          date: new Date(c[0]).toISOString(),
          open: parseFloat(c[1]),
          high: parseFloat(c[2]),
          low: parseFloat(c[3]),
          close: parseFloat(c[4]),
          volume: parseFloat(c[5]),
        }));
        return normalizeCandlesAsc(formatted);
      }
    } catch (e) {
      // V3 failed, fallback to V2 + aggregation
    }

    // Fallback: V2 + aggregation
    let sdkInterval: string;
    if (upstoxParams.unit === 'minutes') {
      const minutes = Number(upstoxParams.interval);
      sdkInterval = minutes <= 1 ? '1minute' : '30minute';
    } else if (upstoxParams.unit === 'hours') {
      sdkInterval = '30minute';
    } else if (upstoxParams.unit === 'days') {
      sdkInterval = 'day';
    } else if (upstoxParams.unit === 'weeks') {
      sdkInterval = 'week';
    } else if (upstoxParams.unit === 'months') {
      sdkInterval = 'month';
    } else {
      sdkInterval = '30minute';
    }

    const baseCandles: any[] = await upstoxService.getHistoricalData(
      instrumentKey!,
      sdkInterval,
      toDate,
      fromDate
    );

    let formatted = baseCandles.map((c: any[]) => ({
      date: new Date(c[0]).toISOString(),
      open: parseFloat(c[1]),
      high: parseFloat(c[2]),
      low: parseFloat(c[3]),
      close: parseFloat(c[4]),
      volume: parseFloat(c[5]),
    }));

    // Determine target minutes from requested interval
    const intervalToMinutes: Record<string, number> = {
      '1m': 1,
      '2m': 2,
      '3m': 3,
      '5m': 5,
      '10m': 10,
      '15m': 15,
      '30m': 30,
      '60m': 60,
      '1h': 60,
      '2h': 120,
      '3h': 180,
      '4h': 240,
      '5h': 300,
    };

    if (sdkInterval === '1minute') {
      const target = intervalToMinutes[params.interval] ?? 0;
      if (target > 1) formatted = aggregateCandles(formatted, target);
    } else if (sdkInterval === '30minute') {
      const target = intervalToMinutes[params.interval] ?? 0;
      if (target > 30) formatted = aggregateCandles(formatted, target);
    }

    return normalizeCandlesAsc(formatted);
  } catch (error) {
    console.error('Error fetching Upstox historical data:', error);
    throw error;
  }
};

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const vendor = searchParams.get('vendor') || 'binance'; // Default to binance
    const symbol = searchParams.get('symbol');
    const interval = searchParams.get('interval') || '1h';
    const accountId = searchParams.get('accountId');

    if (!symbol) {
      return NextResponse.json({ error: 'Missing symbol parameter' }, { status: 400 });
    }

    let historicalData: any;

    switch (vendor.toLowerCase()) {
      case 'binance':
        try {
          historicalData = await fetchBinanceKlines(symbol, interval);
        } catch (error) {
          return NextResponse.json(
            {
              error:
                error instanceof Error ? error.message : 'Failed to fetch Binance historical data',
            },
            { status: 500 }
          );
        }
        break;

      case 'kite':
      case 'kiteconnect':
        try {
          const instrument_token = searchParams.get('instrument_token');
          const from_date = searchParams.get('from_date');
          const to_date = searchParams.get('to_date');
          const instrument_type = searchParams.get('instrument_type');

          if (!instrument_token || !from_date || !to_date) {
            return NextResponse.json(
              {
                error:
                  'Missing required parameters for Kite Connect: instrument_token, from_date, to_date',
              },
              { status: 400 }
            );
          }

          historicalData = await fetchKiteHistoricalData({
            instrument_token,
            interval,
            from_date,
            to_date,
            instrument_type: instrument_type || undefined,
          });
        } catch (error) {
          return NextResponse.json(
            {
              error:
                error instanceof Error ? error.message : 'Failed to fetch Kite historical data',
            },
            { status: 500 }
          );
        }
        break;

      case 'upstox':
        try {
          if (!accountId) {
            return NextResponse.json(
              { error: 'Account ID is required for Upstox' },
              { status: 400 }
            );
          }

          // Get account details
          const account = await getAccountById(accountId);
          if (!account) {
            return NextResponse.json({ error: 'Account not found' }, { status: 404 });
          }

          const instrument_token = searchParams.get('instrument_token');
          const from_date = searchParams.get('from_date');
          const to_date = searchParams.get('to_date');

          historicalData = await fetchUpstoxHistoricalData({
            symbol,
            interval,
            from_date: from_date || undefined,
            to_date: to_date || undefined,
            account,
            instrument_token: instrument_token || undefined,
          });
        } catch (error) {
          return NextResponse.json(
            {
              error:
                error instanceof Error ? error.message : 'Failed to fetch Upstox historical data',
            },
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
      vendor,
      symbol,
      interval,
      timestamp: new Date().toISOString(),
      data: historicalData,
    });
  } catch (error) {
    console.error('Error fetching historical data:', error);
    return NextResponse.json({ error: 'Failed to fetch historical data' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { vendor = 'binance', symbol, interval = '1h', accountId, ...vendorParams } = body;

    if (!symbol) {
      return NextResponse.json({ error: 'Missing symbol parameter' }, { status: 400 });
    }

    let historicalData: any;

    switch (vendor.toLowerCase()) {
      case 'binance':
        try {
          historicalData = await fetchBinanceKlines(symbol, interval);
        } catch (error) {
          return NextResponse.json(
            {
              error:
                error instanceof Error ? error.message : 'Failed to fetch Binance historical data',
            },
            { status: 500 }
          );
        }
        break;

      case 'kite':
      case 'kiteconnect':
        try {
          const { instrument_token, from_date, to_date, instrument_type } = vendorParams;

          if (!instrument_token || !from_date || !to_date) {
            return NextResponse.json(
              {
                error:
                  'Missing required parameters for Kite Connect: instrument_token, from_date, to_date',
              },
              { status: 400 }
            );
          }

          historicalData = await fetchKiteHistoricalData({
            instrument_token,
            interval,
            from_date,
            to_date,
            instrument_type,
          });
        } catch (error) {
          return NextResponse.json(
            {
              error:
                error instanceof Error ? error.message : 'Failed to fetch Kite historical data',
            },
            { status: 500 }
          );
        }
        break;

      case 'upstox':
        try {
          if (!accountId) {
            return NextResponse.json(
              { error: 'Account ID is required for Upstox' },
              { status: 400 }
            );
          }

          // Get account details
          const account = await getAccountById(accountId);
          if (!account) {
            return NextResponse.json({ error: 'Account not found' }, { status: 404 });
          }

          const { from_date, to_date, instrument_token } = vendorParams;

          historicalData = await fetchUpstoxHistoricalData({
            symbol,
            interval,
            from_date,
            to_date,
            account,
            instrument_token,
          });
        } catch (error) {
          return NextResponse.json(
            {
              error:
                error instanceof Error ? error.message : 'Failed to fetch Upstox historical data',
            },
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
      vendor,
      symbol,
      interval,
      timestamp: new Date().toISOString(),
      data: historicalData,
    });
  } catch (error) {
    console.error('Error fetching historical data:', error);
    return NextResponse.json({ error: 'Failed to fetch historical data' }, { status: 500 });
  }
}
