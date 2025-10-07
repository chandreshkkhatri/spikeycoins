import { tradingService } from '@/lib/trading-service';
import { getAccountsByUserId } from '@/models/account';
import { NextRequest, NextResponse } from 'next/server';

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
      return NextResponse.json({ success: true, positions: [] });
    }

    // Fetch positions from all accounts
    const positions = await tradingService.getAllPositions(accounts);

    return NextResponse.json({ success: true, positions });
  } catch (error) {
    console.error('Error fetching positions:', error);
    return NextResponse.json({ error: 'Failed to fetch positions' }, { status: 500 });
  }
}
