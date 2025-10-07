import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    // TODO: Implement actual MarketWatch list fetching from database
    // For now, return mock data structure
    const mockMarketWatches = [
      {
        name: 'NSE_STOCKS',
        appInfo: [
          {
            name: 'flip-safe',
            status: 'active',
          },
        ],
        instrumentCount: 50,
        createdAt: new Date().toISOString(),
      },
      {
        name: 'NIFTY_FUTURES',
        appInfo: [
          {
            name: 'flip-safe',
            status: 'active',
          },
        ],
        instrumentCount: 25,
        createdAt: new Date().toISOString(),
      },
    ];

    return NextResponse.json(mockMarketWatches);
  } catch (error) {
    console.error('Error fetching MarketWatch list:', error);
    return NextResponse.json({ error: 'Failed to fetch MarketWatch list' }, { status: 500 });
  }
}
