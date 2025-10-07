import { cancelOrder, checkAuth } from '@/lib/kiteconnect-service';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    if (!checkAuth()) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { order_id } = await request.json();

    if (!order_id) {
      return NextResponse.json({ error: 'Missing required field: order_id' }, { status: 400 });
    }

    const result = await cancelOrder(order_id);
    return NextResponse.json(result);
  } catch (error) {
    console.error('Error canceling order:', error);
    return NextResponse.json({ error: 'Failed to cancel order' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  // Support DELETE method as well
  return POST(request);
}
