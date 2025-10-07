import connectDB from '@/lib/mongodb';
import getInstrumentModel from '@/models/instrument';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// Resolve display symbols to Upstox instrumentKeys (e.g., NSE_EQ|INE002A01018)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { symbols } = body as { symbols: string[] };
    if (!Array.isArray(symbols) || symbols.length === 0) {
      return NextResponse.json({ success: false, error: 'symbols[] required' }, { status: 400 });
    }

    await connectDB();
    const InstrumentModel = getInstrumentModel('upstox');

    const results: Record<string, string> = {};
    const toQuery: string[] = [];

    for (const s of symbols) {
      // If already looks like an instrumentKey, keep as-is
      if (s.includes('|')) {
        results[s] = s;
      } else {
        toQuery.push(s);
      }
    }

    if (toQuery.length) {
      // Query by trading symbol fields and also by name as a fallback
      const docs = await InstrumentModel.find({
        $or: [
          { trading_symbol: { $in: toQuery } },
          { tradingsymbol: { $in: toQuery } },
          { name: { $in: toQuery } },
        ],
      })
        .limit(toQuery.length * 5)
        .lean();

      const pickBest = (acc: any | undefined, curr: any) => {
        if (!acc) return curr;
        const seg = curr.segment?.toUpperCase?.() || curr.exchange?.toUpperCase?.();
        const accSeg = acc.segment?.toUpperCase?.() || acc.exchange?.toUpperCase?.();
        // Prefer exact NSE_EQ for equities
        if (seg === 'NSE_EQ' && accSeg !== 'NSE_EQ') return curr;
        return acc;
      };

      const bySymbol: Record<string, any> = {};
      for (const doc of docs) {
        const sym = (doc.trading_symbol || doc.tradingsymbol || doc.name || '').toUpperCase();
        if (!sym) continue;
        bySymbol[sym] = pickBest(bySymbol[sym], doc);
      }

      const toInstrumentKey = (doc: any): string | null => {
        // Common fields that might house the proper key/token
        const rawKey: string | undefined =
          doc.instrument_key || doc.instrumentKey || doc.instrumentToken || doc.instrument_token;
        const isin: string | undefined = doc.isin || doc.ISIN || doc.isin_code;
        let exch: string | undefined = (doc.exchange || '').toUpperCase();
        // Normalize segment; Upstox uses patterns like NSE_EQ, NSE_FO, BSE_EQ, NSE_INDEX, MCX_FO
        const seg: string | undefined = (doc.segment || '').toUpperCase();
        const instrType: string | undefined = doc.instrument_type?.toUpperCase?.();

        // Best-effort normalization for common cases
        const normalizePrefix = () => {
          // Fix commodities
          if (seg === 'COM' || exch === 'MCX' || instrType === 'COM') {
            exch = 'MCX';
            return 'MCX_FO';
          }
          // Indices
          if (seg === 'INDEX' || instrType === 'INDEX') {
            return `${exch || 'NSE'}_INDEX`;
          }
          // Equities
          if (seg === 'EQ' || instrType === 'EQ') {
            return `${exch || 'NSE'}_EQ`;
          }
          // Derivatives (F&O)
          if (seg?.includes('FO') || instrType === 'FUT' || instrType === 'OPT') {
            return `${exch || 'NSE'}_FO`;
          }
          // Fallback
          return `${exch || 'NSE'}_${seg || 'EQ'}`;
        };
        const prefix = normalizePrefix();

        // 1) If rawKey already looks like a full instrumentKey (has '|'), return as-is
        if (rawKey && typeof rawKey === 'string' && rawKey.includes('|')) return rawKey;

        // 2) If ISIN exists and this is equity, build NSE_EQ|ISIN by default
        if (isin) {
          const eqPrefix = `${exch || 'NSE'}_EQ`;
          return `${eqPrefix}|${isin}`;
        }

        // 3) If we have exchange/segment + rawKey, compose
        if (rawKey && exch) {
          return `${prefix}|${rawKey}`;
        }

        // 4) Fallback: if just rawKey
        if (rawKey) return rawKey;

        return null;
      };

      for (const raw of toQuery) {
        const key = raw.toUpperCase();
        const doc = bySymbol[key];
        const instKey = doc ? toInstrumentKey(doc) : null;
        results[raw] = instKey || `NSE_EQ|${raw}`;
      }
    }

    return NextResponse.json({ success: true, mappings: results });
  } catch (error: any) {
    console.error('Upstox resolve instruments error:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to resolve instruments' },
      { status: 500 }
    );
  }
}
