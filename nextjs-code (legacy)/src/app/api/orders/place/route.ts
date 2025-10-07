import { checkAuth, placeOrder } from '@/lib/kiteconnect-service';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    if (!checkAuth()) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const orderParams = await request.json();

    // Validate required parameters
    const requiredFields = [
      'tradingsymbol',
      'quantity',
      'transaction_type',
      'order_type',
      'product',
    ];
    for (const field of requiredFields) {
      if (!orderParams[field]) {
        return NextResponse.json({ error: `Missing required field: ${field}` }, { status: 400 });
      }
    }

    const result = await placeOrder(orderParams);
    return NextResponse.json(result);
  } catch (error) {
    console.error('Error placing order:', error);
    return NextResponse.json({ error: 'Failed to place order' }, { status: 500 });
  }
}
