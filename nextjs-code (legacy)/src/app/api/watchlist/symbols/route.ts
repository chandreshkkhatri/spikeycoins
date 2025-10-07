import connectDB from '@/lib/mongodb';
import Watchlist from '@/models/watchlist';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const accountId = searchParams.get('accountId');
    const marketType = searchParams.get('marketType');
    const watchlistId = searchParams.get('watchlistId');
    const userId = searchParams.get('userId') || 'default_user';

    if (!accountId) {
      return NextResponse.json(
        {
          success: false,
          error: 'Account ID is required',
          symbols: [],
        },
        { status: 400 }
      );
    }

    await connectDB();

    // Get all watchlists for the user and account
    const watchlists = await Watchlist.find({ userId, accountId }) || [];

    if (watchlistId) {
      // Get specific watchlist
      const watchlist = await Watchlist.findOne({ _id: watchlistId, userId, accountId });
      if (!watchlist) {
        return NextResponse.json(
          {
            success: false,
            error: 'Watchlist not found',
            symbols: [],
          },
          { status: 404 }
        );
      }

      return NextResponse.json({
        success: true,
        symbols: watchlist.symbols ? watchlist.symbols.map((s: any) => s.symbol) : [],
        items: watchlist.symbols || [],
        watchlist: {
          id: watchlist._id,
          name: watchlist.name,
          isDefault: watchlist.isDefault,
        },
        watchlists: Array.isArray(watchlists) ? watchlists.map((w: any) => ({
          id: w._id,
          name: w.name,
          isDefault: w.isDefault,
        })) : [],
        marketType: watchlist.marketType,
        accountId,
      });
    } else {
      // Get default watchlist or create one if it doesn't exist
      let defaultWatchlist = await Watchlist.findOne({ userId, accountId, isDefault: true });

      if (!defaultWatchlist) {
        // Create default watchlist
        defaultWatchlist = await Watchlist.create({
          userId,
          accountId,
          name: 'Default Watchlist',
          marketType: marketType || 'binance-futures',
          symbols: [],
          isDefault: true,
        });
      }

      return NextResponse.json({
        success: true,
        symbols: defaultWatchlist.symbols ? defaultWatchlist.symbols.map((s: any) => s.symbol) : [],
        items: defaultWatchlist.symbols || [],
        watchlist: {
          id: defaultWatchlist._id,
          name: defaultWatchlist.name,
          isDefault: defaultWatchlist.isDefault,
        },
        watchlists:
          Array.isArray(watchlists) && watchlists.length > 0
            ? watchlists.map((w: any) => ({
                id: w._id,
                name: w.name,
                isDefault: w.isDefault,
              }))
            : [
                {
                  id: defaultWatchlist._id,
                  name: defaultWatchlist.name,
                  isDefault: defaultWatchlist.isDefault,
                },
              ],
        marketType: defaultWatchlist.marketType,
        accountId,
      });
    }
  } catch (error) {
    console.error('Error fetching watchlist symbols:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch watchlist symbols',
        symbols: [],
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { accountId, marketType, symbols, items, watchlistId, userId = 'default_user', action } = body;

    if (!accountId) {
      return NextResponse.json(
        { success: false, error: 'Account ID is required' },
        { status: 400 }
      );
    }

    await connectDB();

    // Handle creating a new watchlist
    if (action === 'create') {
      const { name } = body;
      if (!name) {
        return NextResponse.json(
          { success: false, error: 'Watchlist name is required' },
          { status: 400 }
        );
      }

      const newWatchlist = await Watchlist.create({
        userId,
        accountId,
        name,
        marketType: marketType || 'binance-futures',
        symbols: [],
        isDefault: false,
      });

      return NextResponse.json({
        success: true,
        message: 'Watchlist created successfully',
        watchlist: {
          id: newWatchlist._id,
          name: newWatchlist.name,
          isDefault: newWatchlist.isDefault,
        },
      });
    }

    // Handle deleting a watchlist
    if (action === 'delete') {
      if (!watchlistId) {
        return NextResponse.json(
          { success: false, error: 'Watchlist ID is required for deletion' },
          { status: 400 }
        );
      }

      const watchlist = await Watchlist.findOne({ _id: watchlistId, userId, accountId });
      if (!watchlist) {
        return NextResponse.json({ success: false, error: 'Watchlist not found' }, { status: 404 });
      }

      if (watchlist.isDefault) {
        return NextResponse.json(
          { success: false, error: 'Cannot delete default watchlist' },
          { status: 400 }
        );
      }

      await Watchlist.deleteOne({ _id: watchlistId });

      return NextResponse.json({
        success: true,
        message: 'Watchlist deleted successfully',
      });
    }

    // Handle updating items in a watchlist
    // Support both 'items' (new) and 'symbols' (for backward compatibility if needed)
    const watchlistItems = items || symbols;
    if (!watchlistItems || !marketType) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      );
    }

    let watchlist;
    if (watchlistId) {
      watchlist = await Watchlist.findOne({ _id: watchlistId, userId, accountId });
    } else {
      watchlist = await Watchlist.findOne({ userId, accountId, isDefault: true });
      if (!watchlist) {
        watchlist = await Watchlist.create({
          userId,
          accountId,
          name: 'Default Watchlist',
          marketType,
          symbols: [],
          isDefault: true,
        });
      }
    }

    if (!watchlist) {
      return NextResponse.json({ success: false, error: 'Watchlist not found' }, { status: 404 });
    }

    // Update symbols - handle both items array and symbols array
    if (items && Array.isArray(items)) {
      // New format with full item data
      watchlist.symbols = items.map((item: any) => ({
        symbol: item.symbol || item,
        name: item.name,
        exchange: item.exchange,
        token: item.token,
        segment: item.segment,
        instrument_type: item.instrument_type,
        isin: item.isin,
        addedAt: new Date(),
      }));
    } else if (symbols && Array.isArray(symbols)) {
      // Old format for backward compatibility
      watchlist.symbols = symbols.map((symbol: string) => ({
        symbol,
        addedAt: new Date(),
      }));
    }
    watchlist.marketType = marketType;
    await watchlist.save();

    return NextResponse.json({
      success: true,
      message: 'Watchlist updated successfully',
      symbols: watchlist.symbols ? watchlist.symbols.map((s: any) => s.symbol) : [],
      items: watchlist.symbols || [],
      watchlist: {
        id: watchlist._id,
        name: watchlist.name,
        isDefault: watchlist.isDefault,
      },
    });
  } catch (error) {
    console.error('Error updating watchlist:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update watchlist' },
      { status: 500 }
    );
  }
}
