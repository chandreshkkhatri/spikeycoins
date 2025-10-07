import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const symbols = searchParams.get('symbols');

    if (!symbols) {
      return NextResponse.json({ error: 'Missing symbols parameter' }, { status: 400 });
    }

    // Parse the symbols (they come as comma-separated)
    const symbolList = symbols.split(',');

    console.log('Original symbols:', symbolList);

    // Clean and filter symbols for Binance API
    const cleanedSymbols = symbolList.map(symbol => {
      // Remove USDT suffix if present to avoid double-suffixing
      if (symbol.endsWith('USDT') && symbol !== 'USDT') {
        return symbol.slice(0, -4);
      }
      return symbol;
    });

    console.log('Cleaned symbols:', cleanedSymbols);

    // Filter out stablecoins and prepare symbols for Binance API
    const cryptoSymbols = cleanedSymbols
      .filter(symbol => {
        // Filter out stablecoins
        if (['USDT', 'USD', 'USDC', 'BUSD', 'FDUSD', 'LDUSD', 'BFUSD'].includes(symbol)) {
          return false;
        }
        // Filter out empty or invalid symbols
        if (!symbol || symbol.trim().length === 0) {
          return false;
        }
        // Filter out symbols with special characters or numbers that might be invalid
        if (!/^[A-Z]+$/.test(symbol.trim())) {
          console.log(`Filtering out potentially invalid symbol: "${symbol}"`);
          return false;
        }
        return true;
      })
      .map(symbol => `${symbol.trim()}USDT`);

    console.log('Final crypto symbols for Binance:', cryptoSymbols);

    if (cryptoSymbols.length === 0) {
      // Return default prices for stablecoins
      const prices: Record<string, number> = {};
      symbolList.forEach(symbol => {
        if (['USDT', 'USD', 'USDC', 'BUSD', 'FDUSD'].includes(symbol)) {
          prices[symbol] = 1;
        }
      });
      return NextResponse.json({ success: true, prices });
    }

    // Fetch prices from Binance - try batch first, then individual on failure
    const prices: Record<string, number> = {};

    if (cryptoSymbols.length > 0) {
      try {
        const url = `https://api.binance.com/api/v3/ticker/price?symbols=[${cryptoSymbols.map(s => `"${s}"`).join(',')}]`;

        console.log('Fetching prices for symbols:', cryptoSymbols);
        console.log('Binance API URL:', url);

        const response = await fetch(url);

        if (!response.ok) {
          const errorText = await response.text();
          console.error('Batch API failed, trying individual symbols:', response.status, errorText);

          // Try fetching individual symbols to isolate the problematic ones
          for (const symbol of cryptoSymbols) {
            try {
              const individualUrl = `https://api.binance.com/api/v3/ticker/price?symbol=${symbol}`;
              const individualResponse = await fetch(individualUrl);

              if (individualResponse.ok) {
                const individualData = await individualResponse.json();
                const asset = symbol.replace('USDT', '');
                prices[asset] = parseFloat(individualData.price);
                console.log(`Successfully fetched price for ${symbol}: ${individualData.price}`);
              } else {
                const individualError = await individualResponse.text();
                console.warn(`Failed to fetch price for ${symbol}:`, individualError);
              }
            } catch (err) {
              console.warn(`Error fetching individual symbol ${symbol}:`, err);
            }
          }
        } else {
          const priceData = await response.json();

          // Handle both single symbol and array responses
          const priceArray = Array.isArray(priceData) ? priceData : [priceData];

          priceArray.forEach((item: any) => {
            if (item.symbol && item.price) {
              const asset = item.symbol.replace('USDT', '');
              prices[asset] = parseFloat(item.price);
            }
          });
        }
      } catch (error) {
        console.error('Error in batch fetch, falling back to individual:', error);

        // Fallback to individual fetching
        for (const symbol of cryptoSymbols) {
          try {
            const individualUrl = `https://api.binance.com/api/v3/ticker/price?symbol=${symbol}`;
            const individualResponse = await fetch(individualUrl);

            if (individualResponse.ok) {
              const individualData = await individualResponse.json();
              const asset = symbol.replace('USDT', '');
              prices[asset] = parseFloat(individualData.price);
            }
          } catch (err) {
            console.warn(`Error fetching individual symbol ${symbol}:`, err);
          }
        }
      }
    }

    // Add stablecoin prices (including cleaned symbols)
    symbolList.forEach(symbol => {
      const cleanedSymbol =
        symbol.endsWith('USDT') && symbol !== 'USDT' ? symbol.slice(0, -4) : symbol;
      if (
        ['USDT', 'USD', 'USDC', 'BUSD', 'FDUSD', 'LDUSD', 'BFUSD'].includes(cleanedSymbol) &&
        !prices[cleanedSymbol]
      ) {
        prices[cleanedSymbol] = 1;
      }
      // Also set price for original symbol name if different
      if (
        symbol !== cleanedSymbol &&
        ['USDT', 'USD', 'USDC', 'BUSD', 'FDUSD', 'LDUSD', 'BFUSD'].includes(cleanedSymbol)
      ) {
        prices[symbol] = 1;
      }
    });

    return NextResponse.json({ success: true, prices });
  } catch (error) {
    console.error('Error fetching crypto prices:', error);

    // Return fallback prices
    return NextResponse.json({
      success: false,
      prices: {
        BTC: 65000,
        ETH: 2500,
        BNB: 300,
        USDT: 1,
        USD: 1,
        USDC: 1,
      },
      error: error instanceof Error ? error.message : 'Failed to fetch prices',
    });
  }
}
