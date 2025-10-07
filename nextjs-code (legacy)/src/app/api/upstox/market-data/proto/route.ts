import { NextResponse } from 'next/server';

// Proxies the Upstox MarketDataFeed.proto so the browser can fetch it from our origin (avoids CORS)
export async function GET() {
  const upstream = 'https://assets.upstox.com/feed/market-data-feed/v3/MarketDataFeed.proto';
  try {
    const res = await fetch(upstream, { cache: 'no-store' });
    if (!res.ok) {
      return NextResponse.json(
        { error: `Upstream fetch failed (${res.status})` },
        { status: res.status }
      );
    }
    const text = await res.text();
    return new Response(text, {
      status: 200,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        // Cache at the edge for a day; client will still reload when page refreshes
        'Cache-Control': 'public, max-age=0, s-maxage=86400, stale-while-revalidate=3600',
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || 'Failed to proxy Upstox proto' },
      { status: 500 }
    );
  }
}
