import { checkAuth, modifyOrder } from '@/lib/kiteconnect-service';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    if (!checkAuth()) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { order_id, ...orderParams } = await request.json();

    if (!order_id) {
      return NextResponse.json({ error: 'Missing required field: order_id' }, { status: 400 });
    }

    const result = await modifyOrder(order_id, orderParams);
    return NextResponse.json(result);
  } catch (error) {
    console.error('Error modifying order:', error);
    return NextResponse.json({ error: 'Failed to modify order' }, { status: 500 });
  }
}
