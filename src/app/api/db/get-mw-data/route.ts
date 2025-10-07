import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const mwName = searchParams.get('mwName');

    if (!mwName) {
      return NextResponse.json({ error: 'Missing required parameter: mwName' }, { status: 400 });
    }

    // TODO: Implement MarketWatch data fetching
    // For now, return mock data structure
    const mockData = {
      mwName,
      instruments: [],
      lastUpdated: new Date().toISOString(),
    };

    return NextResponse.json(mockData);
  } catch (error) {
    console.error('Error fetching MarketWatch data:', error);
    return NextResponse.json({ error: 'Failed to fetch MarketWatch data' }, { status: 500 });
  }
}
