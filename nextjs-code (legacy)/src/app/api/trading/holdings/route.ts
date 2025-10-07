import { tradingService } from '@/lib/trading-service';
import { getAccountsByUserId } from '@/models/account';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');

    if (!userId) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
    }

    // Get all active accounts for the user
    const accounts = await getAccountsByUserId(userId);

    if (accounts.length === 0) {
      return NextResponse.json({ success: true, holdings: [] });
    }

    // Fetch holdings from all accounts
    const holdings = await tradingService.getAllHoldings(accounts);

    return NextResponse.json({ success: true, holdings });
  } catch (error) {
    console.error('Error fetching holdings:', error);
    return NextResponse.json({ error: 'Failed to fetch holdings' }, { status: 500 });
  }
}
