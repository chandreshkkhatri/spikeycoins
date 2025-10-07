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
      return NextResponse.json({ success: true, orders: [] });
    }

    // Fetch orders from all accounts
    const orders = await tradingService.getAllOrders(accounts);

    return NextResponse.json({ success: true, orders });
  } catch (error) {
    console.error('Error fetching orders:', error);
    return NextResponse.json({ error: 'Failed to fetch orders' }, { status: 500 });
  }
}
