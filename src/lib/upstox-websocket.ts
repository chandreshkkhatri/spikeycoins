import * as protobuf from 'protobufjs';

// Client-side WebSocket manager for Upstox Market Data Feed v3
// Uses server API routes to authorize and to resolve instrument keys

interface PriceUpdate {
  symbol: string;
  instrumentToken: string;
  lastPrice: number;
  priceChange: number;
  priceChangePercent: number;
  volume: number;
  high24h: number;
  low24h: number;
  open: number;
  close: number;
  bid: number;
  ask: number;
  bidQty: number;
  askQty: number;
}

// Minimal text-message structure (if any)
interface UpstoxFeedText {
  ltpc?: { ltp: number; ltt: number; cp: number };
  ohlc?: { open: number; high: number; low: number; close: number };
  bidAsk?: { bid: number; ask: number; bidQty: number; askQty: number };
  eFeed?: {
    totalBuyQty: number;
    totalSellQty: number;
    totalTradedQty: number;
    totalTradedValue: number;
  };
}

interface UpstoxWebSocketMessage {
  type: 'success' | 'error';
  data?: { [instrumentKey: string]: UpstoxFeedText };
  error?: string;
  message?: string;
  code?: string;
}

type RequestMode = 'ltpc' | 'option_greeks' | 'full' | 'full_d30';

interface WebSocketManager {
  connect: (
    symbols: string[],
    onMessage: (data: PriceUpdate) => void,
    opts?: { accountId?: string; mode?: RequestMode }
  ) => void | Promise<void>;
  disconnect: () => void;
  addSymbol: (symbol: string) => void | Promise<void>;
  removeSymbol: (symbol: string) => void;
}

export class UpstoxWebSocket implements WebSocketManager {
  private ws: WebSocket | null = null;
  private subscribedSymbols: Map<string, string> = new Map(); // symbol -> instrumentToken
  private onMessageCallback: ((data: PriceUpdate) => void) | null = null;
  private reconnectInterval = 5000;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private isConnecting = false;
  private intentionalDisconnect = false;
  private pingInterval: ReturnType<typeof setInterval> | null = null;
  private symbolToInstrumentMap: Map<string, string> = new Map();
  private instrumentToSymbolMap: Map<string, string> = new Map();
  private priceCache: Map<string, PriceUpdate> = new Map();
  private accountId: string | undefined;
  private mode: RequestMode = 'ltpc';
  private isMarketOpen = false;

  // Protobuf decoding
  private protoLoaded = false;
  private root: protobuf.Root | null = null;
  private FeedResponseType: protobuf.Type | null = null;
  private debugDecodeCount = 0;

  // Normalize a possibly vendor-specific or legacy instrument key prefix to Upstox v3 expectations
  private normalizeInstrumentKey(key: string): string {
    try {
      const trimmed = key.trim();
      if (!trimmed.includes('|')) return trimmed.toUpperCase();
      const [rawPrefix, rest] = trimmed.split('|');
      const prefix = rawPrefix.toUpperCase();
      const token = (rest || '').toUpperCase();

      // Known normalizations
      const directMap: Record<string, string> = {
        NSE_CM: 'NSE_EQ',
        BSE_CM: 'BSE_EQ',
        NSE_COM: 'MCX_FO',
        MCX_COM: 'MCX_FO',
      };
      const normalizedPrefix = directMap[prefix] || prefix;
      return `${normalizedPrefix}|${token}`;
    } catch {
      return key.toUpperCase();
    }
  }

  async connect(
    symbols: string[],
    onMessage: (data: PriceUpdate) => void,
    opts?: { accountId?: string; mode?: RequestMode }
  ): Promise<void> {
    if (this.isConnecting) return;

    if (this.ws?.readyState === WebSocket.OPEN) {
      this.onMessageCallback = onMessage;
      await this.updateSubscriptions(symbols);
      return;
    }

    this.onMessageCallback = onMessage;
    this.isConnecting = true;
    this.intentionalDisconnect = false;
    this.accountId = opts?.accountId ?? this.accountId;
    this.mode = opts?.mode ?? this.mode ?? 'ltpc';

    try {
      if (!this.accountId) throw new Error('accountId is required to authorize Upstox WebSocket');

      // Ensure protobuf schema ready (for binary frames)
      await this.ensureProtoLoaded();

      // Resolve instrument keys
      await this.mapSymbolsToInstruments(symbols);

      // Authorize via server
      const authResp = await fetch(
        `/api/upstox/market-data/authorize?accountId=${encodeURIComponent(this.accountId)}`,
        { cache: 'no-store' }
      );
      const authJson = await authResp.json().catch(() => ({}));
      if (!authResp.ok || !authJson?.success || !authJson?.url) {
        const errMsg = authJson?.error || `Authorization failed (${authResp.status})`;
        throw new Error(errMsg);
      }

      const wsUrl = authJson.url as string;
      console.log('Connecting to authorized Upstox WebSocket v3:', wsUrl.substring(0, 50) + '...');
      this.ws = new WebSocket(wsUrl);
      this.ws.binaryType = 'arraybuffer';

      this.ws.onopen = async (ev: Event) => {
        const socket = ev.target as WebSocket;
        console.log('Upstox WebSocket connected successfully');
        this.isConnecting = false;
        this.reconnectAttempts = 0;
        if (this.reconnectTimer) {
          clearTimeout(this.reconnectTimer);
          this.reconnectTimer = null;
        }

        const instrumentKeys = Array.from(this.subscribedSymbols.values());
        if (instrumentKeys.length > 0) {
          const subscribeMessage = {
            guid: 'watchlist-sub',
            method: 'sub',
            data: {
              mode: this.mode,
              instrumentKeys,
            },
          };
          console.log('Subscribing to instruments:', instrumentKeys);
          console.log('Subscription message:', JSON.stringify(subscribeMessage, null, 2));
          // Use a guarded send and the specific socket to avoid races across HMR
          this.sendWhenOpen(subscribeMessage, socket);
        }
        this.setupPingInterval();
      };

      this.ws.onmessage = async event => {
        try {
          if (typeof event.data === 'string') {
            console.log('Received text message:', event.data);
            const data: UpstoxWebSocketMessage = JSON.parse(event.data);
            this.handleTextMessage(data);
          } else if (event.data instanceof ArrayBuffer) {
            console.log('Received binary message, size:', event.data.byteLength);
            await this.handleBinaryMessage(event.data);
          } else if (event.data && 'arrayBuffer' in event.data) {
            const buff = await (event.data as Blob).arrayBuffer();
            console.log('Received blob message, size:', buff.byteLength);
            await this.handleBinaryMessage(buff);
          }
        } catch (e) {
          console.error('Error handling Upstox message:', e);
        }
      };

      this.ws.onclose = (ev: CloseEvent) => {
        console.log('Upstox WebSocket disconnected', {
          code: ev.code,
          reason: ev.reason,
          wasClean: ev.wasClean,
        });
        this.isConnecting = false;
        this.clearPingInterval();
        if (!this.intentionalDisconnect) this.scheduleReconnect();
      };

      this.ws.onerror = err => {
        console.error('Upstox WebSocket error:', err);
        this.isConnecting = false;
      };
    } catch (error) {
      console.error('Failed to create WebSocket connection:', error);
      this.isConnecting = false;
      this.scheduleReconnect();
    }
  }

  private async mapSymbolsToInstruments(symbols: string[]): Promise<void> {
    this.symbolToInstrumentMap.clear();
    this.instrumentToSymbolMap.clear();
    this.subscribedSymbols.clear();
    if (!symbols.length) return;

    try {
      const resp = await fetch('/api/upstox/instruments/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbols }),
      });
      const json = await resp.json().catch(() => ({}));
      const mappings: Record<string, string> = json?.mappings || {};
      for (const s of symbols) {
        const tokenRaw = mappings[s] || (s.includes('|') ? s : `NSE_EQ|${s}`);
        const token = this.normalizeInstrumentKey(tokenRaw);
        this.subscribedSymbols.set(s, token);
        this.symbolToInstrumentMap.set(s, token);
        this.instrumentToSymbolMap.set(token, s);
      }
      console.log(
        'Upstox mapping (symbol -> instrumentKey):',
        Object.fromEntries(this.subscribedSymbols)
      );
      console.log(
        'Upstox reverse mapping (instrumentKey -> symbol):',
        Object.fromEntries(this.instrumentToSymbolMap)
      );
    } catch (e) {
      console.warn('Failed to resolve instruments, using fallbacks:', e);
      for (const s of symbols) {
        const token = this.normalizeInstrumentKey(s.includes('|') ? s : `NSE_EQ|${s}`);
        this.subscribedSymbols.set(s, token);
        this.symbolToInstrumentMap.set(s, token);
        this.instrumentToSymbolMap.set(token, s);
      }
      console.log(
        'Upstox mapping fallback (symbol -> instrumentKey):',
        Object.fromEntries(this.subscribedSymbols)
      );
      console.log(
        'Upstox reverse mapping fallback (instrumentKey -> symbol):',
        Object.fromEntries(this.instrumentToSymbolMap)
      );
    }

    // Skip quotes API seeding if market is closed or no account ID
    if (!this.isMarketOpen || !this.accountId) {
      if (!this.isMarketOpen) {
        console.log('⏸️ Skipping quotes API call - market is closed');
      }
      if (!this.accountId) {
        console.log('⏸️ Skipping quotes API call - no account ID provided');
      }
      return;
    }

    // After building the map, seed initial prices via REST quotes (only when market is open)
    try {
      const instrumentKeys = Array.from(this.subscribedSymbols.values());
      if (instrumentKeys.length) {
        console.log('📈 Market is open - fetching initial quotes for seeding');
        const resp = await fetch('/api/upstox/market-data/quotes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ accountId: this.accountId, instrumentKeys }),
        });
        const json = await resp.json().catch(() => ({}));
        if (json?.success && json?.data) {
          const entries = Object.entries(json.data) as [string, any][];
          for (const [ik, feed] of entries) {
            const key = ik.toUpperCase();
            const symbol = this.instrumentToSymbolMap.get(key) || key;
            const upd: PriceUpdate = this.priceCache.get(symbol) || {
              symbol,
              instrumentToken: key,
              lastPrice: 0,
              priceChange: 0,
              priceChangePercent: 0,
              volume: 0,
              high24h: 0,
              low24h: 0,
              open: 0,
              close: 0,
              bid: 0,
              ask: 0,
              bidQty: 0,
              askQty: 0,
            };
            if (feed?.ltpc) {
              const ltp = feed.ltpc.ltp ?? upd.lastPrice;
              const cp = feed.ltpc.cp ?? upd.close;
              upd.lastPrice = ltp;
              upd.close = cp;
              if (cp && cp > 0 && ltp) {
                upd.priceChange = ltp - cp;
                upd.priceChangePercent = ((ltp - cp) / cp) * 100;
              }
            }
            if (feed?.ohlc) {
              upd.open = feed.ohlc.open ?? upd.open;
              upd.high24h = feed.ohlc.high ?? upd.high24h;
              upd.low24h = feed.ohlc.low ?? upd.low24h;
              upd.close = feed.ohlc.close ?? upd.close;
            }
            if (feed?.bidAsk) {
              upd.bid = feed.bidAsk.bid ?? upd.bid;
              upd.ask = feed.bidAsk.ask ?? upd.ask;
              upd.bidQty = feed.bidAsk.bidQty ?? upd.bidQty;
              upd.askQty = feed.bidAsk.askQty ?? upd.askQty;
            }
            this.priceCache.set(symbol, upd);
            this.onMessageCallback?.(upd);
          }
        }
      }
    } catch (e) {
      console.warn('Failed to seed Upstox quotes snapshot:', e);
    }
  }

  private handleTextMessage(data: UpstoxWebSocketMessage): void {
    console.log('Handling text message:', data);
    if (data.type === 'error') {
      console.error('Upstox WebSocket error:', data.error || data.message);
      return;
    }
    if (data.type !== 'success' || !data.data) {
      console.log('Message not success type or no data:', data.type, !!data.data);
      return;
    }
    for (const [instrumentToken, feed] of Object.entries(data.data)) {
      const key = instrumentToken.toUpperCase();
      const symbol = this.instrumentToSymbolMap.get(key) || key;
      const upd: PriceUpdate = this.priceCache.get(symbol) || {
        symbol,
        instrumentToken: key,
        lastPrice: 0,
        priceChange: 0,
        priceChangePercent: 0,
        volume: 0,
        high24h: 0,
        low24h: 0,
        open: 0,
        close: 0,
        bid: 0,
        ask: 0,
        bidQty: 0,
        askQty: 0,
      };
      if (feed.ltpc) {
        const ltp = feed.ltpc.ltp ?? upd.lastPrice;
        const cp = feed.ltpc.cp ?? upd.close;
        upd.lastPrice = ltp;
        upd.close = cp;
        if (cp && cp > 0 && ltp) {
          upd.priceChange = ltp - cp;
          upd.priceChangePercent = ((ltp - cp) / cp) * 100;
        }
      }
      if (feed.ohlc) {
        upd.open = feed.ohlc.open ?? upd.open;
        upd.high24h = feed.ohlc.high ?? upd.high24h;
        upd.low24h = feed.ohlc.low ?? upd.low24h;
        upd.close = feed.ohlc.close ?? upd.close;
      }
      if (feed.bidAsk) {
        upd.bid = feed.bidAsk.bid ?? upd.bid;
        upd.ask = feed.bidAsk.ask ?? upd.ask;
        upd.bidQty = feed.bidAsk.bidQty ?? upd.bidQty;
        upd.askQty = feed.bidAsk.askQty ?? upd.askQty;
      }
      this.priceCache.set(symbol, upd);
      this.onMessageCallback?.(upd);
    }
  }

  private async handleBinaryMessage(buffer: ArrayBuffer): Promise<void> {
    try {
      console.log('Processing binary message...');
      if (!this.protoLoaded) await this.ensureProtoLoaded();
      if (!this.FeedResponseType) {
        console.error('FeedResponseType not loaded');
        return;
      }
      const bytes = new Uint8Array(buffer);
      console.log('Decoding protobuf bytes, length:', bytes.length);
      const decoded: any = this.FeedResponseType.decode(bytes);
      const messageType = decoded?.type || 'unknown';

      // Type mapping: 1 = feed data, 2 = market info
      const typeNames: Record<number, string> = {
        1: 'feed_data',
        2: 'market_info',
      };
      const typeName = typeof messageType === 'number' ? typeNames[messageType] || `unknown_${messageType}` : messageType;

      console.log(`📨 Upstox message type: ${messageType} (${typeName})`);

      if (messageType === 2 || typeName === 'market_info') {
        console.log('📊 Market status update received:', decoded.marketInfo?.segmentStatus);
        const nseEqStatus = decoded.marketInfo?.segmentStatus?.NSE_EQ;
        if (nseEqStatus === 'CLOSING_END' || nseEqStatus === 'NORMAL_CLOSE') {
          console.log('🔴 Market is closed - no live price data expected');
          this.isMarketOpen = false;
        } else if (nseEqStatus === 'NORMAL_OPEN' || nseEqStatus === 'OPENING_START') {
          console.log('🟢 Market is open - price data should be flowing');
          this.isMarketOpen = true;
        }
        return; // Skip further processing for market info messages
      }

      // If this is feed data (type 1), process it
      console.log('Decoded protobuf:', decoded);
      console.log('Message type:', messageType, 'Properties:', Object.keys(decoded || {}));

      const feeds = decoded?.feeds || {};
      console.log('Feeds extracted:', feeds);
      const keys = Object.keys(feeds);
      console.log('Feed keys found:', keys);
      if (keys.length === 0) {
        console.log('⚠️ No feed data in this message - likely market closed or subscription pending');
        return;
      }

      console.log(`📈 Processing ${keys.length} instrument feed(s):`, keys);
      for (const instrumentKey of Object.keys(feeds)) {
        const keyUpper = String(instrumentKey).toUpperCase();
        const feed = feeds[instrumentKey];
        const symbol = this.instrumentToSymbolMap.get(keyUpper) || keyUpper;
        console.log(`Processing feed for instrument: ${instrumentKey} -> ${keyUpper} -> symbol: ${symbol}`);
        console.log(`Feed data:`, feed);
        console.log(`Feed structure keys:`, Object.keys(feed || {}));

        const upd: PriceUpdate = this.priceCache.get(symbol) || {
          symbol,
          instrumentToken: keyUpper,
          lastPrice: 0,
          priceChange: 0,
          priceChangePercent: 0,
          volume: 0,
          high24h: 0,
          low24h: 0,
          open: 0,
          close: 0,
          bid: 0,
          ask: 0,
          bidQty: 0,
          askQty: 0,
        };

        // ltpc direct
        if (feed?.ltpc) {
          console.log(`Found direct ltpc for ${symbol}:`, feed.ltpc);
          const ltp = feed.ltpc.ltp ?? upd.lastPrice;
          const cp = feed.ltpc.cp ?? upd.close;
          upd.lastPrice = ltp;
          upd.close = cp;
          if (cp && cp > 0 && ltp) {
            upd.priceChange = ltp - cp;
            upd.priceChangePercent = ((ltp - cp) / cp) * 100;
          }
          console.log(`Updated prices for ${symbol}: ltp=${ltp}, cp=${cp}, change=${upd.priceChange}`);
        }

        // fullFeed.marketFF and fullFeed.indexFF
        const marketFF = feed?.fullFeed?.marketFF;
        const indexFF = feed?.fullFeed?.indexFF;
        console.log(`Checking fullFeed for ${symbol}:`, { hasFullFeed: !!feed?.fullFeed, hasMarketFF: !!marketFF, hasIndexFF: !!indexFF });
        if (marketFF?.ltpc) {
          console.log(`Found marketFF ltpc for ${symbol}:`, marketFF.ltpc);
          const ltp = marketFF.ltpc.ltp ?? upd.lastPrice;
          const cp = marketFF.ltpc.cp ?? upd.close;
          upd.lastPrice = ltp;
          upd.close = cp;
          if (cp && cp > 0 && ltp) {
            upd.priceChange = ltp - cp;
            upd.priceChangePercent = ((ltp - cp) / cp) * 100;
          }
          console.log(`Updated prices from marketFF for ${symbol}: ltp=${ltp}, cp=${cp}`);
        }
        if (indexFF?.ltpc) {
          console.log(`Found indexFF ltpc for ${symbol}:`, indexFF.ltpc);
          const ltp = indexFF.ltpc.ltp ?? upd.lastPrice;
          const cp = indexFF.ltpc.cp ?? upd.close;
          upd.lastPrice = ltp;
          upd.close = cp;
          if (cp && cp > 0 && ltp) {
            upd.priceChange = ltp - cp;
            upd.priceChangePercent = ((ltp - cp) / cp) * 100;
          }
          console.log(`Updated prices from indexFF for ${symbol}: ltp=${ltp}, cp=${cp}`);
        }
        if (marketFF?.marketOHLC?.ohlc?.length) {
          const last = marketFF.marketOHLC.ohlc[marketFF.marketOHLC.ohlc.length - 1];
          upd.open = last.open ?? upd.open;
          upd.high24h = last.high ?? upd.high24h;
          upd.low24h = last.low ?? upd.low24h;
          upd.close = last.close ?? upd.close;
          upd.volume = last.vol ?? upd.volume;
        }
        if (indexFF?.marketOHLC?.ohlc?.length) {
          const last = indexFF.marketOHLC.ohlc[indexFF.marketOHLC.ohlc.length - 1];
          upd.open = last.open ?? upd.open;
          upd.high24h = last.high ?? upd.high24h;
          upd.low24h = last.low ?? upd.low24h;
          upd.close = last.close ?? upd.close;
          upd.volume = last.vol ?? upd.volume;
        }

        // firstLevelWithGreeks
        const flg = feed?.firstLevelWithGreeks;
        if (flg?.ltpc) {
          const ltp = flg.ltpc.ltp ?? upd.lastPrice;
          const cp = flg.ltpc.cp ?? upd.close;
          upd.lastPrice = ltp;
          upd.close = cp;
          if (cp && cp > 0 && ltp) {
            upd.priceChange = ltp - cp;
            upd.priceChangePercent = ((ltp - cp) / cp) * 100;
          }
        }
        if (flg?.firstDepth) {
          upd.bidQty = flg.firstDepth.bidQ ?? upd.bidQty;
          upd.bid = flg.firstDepth.bidP ?? upd.bid;
          upd.askQty = flg.firstDepth.askQ ?? upd.askQty;
          upd.ask = flg.firstDepth.askP ?? upd.ask;
        }

        this.priceCache.set(symbol, upd);
        console.log(`Final price update for ${symbol}:`, {
          symbol,
          instrument: keyUpper,
          ltp: upd.lastPrice,
          change: upd.priceChange,
          changePercent: upd.priceChangePercent,
          callbackExists: !!this.onMessageCallback
        });

        if (this.onMessageCallback) {
          console.log(`Calling onMessage callback for ${symbol} with update:`, upd);
          this.onMessageCallback(upd);
        } else {
          console.warn(`No onMessage callback available for ${symbol}`);
        }
      }
    } catch (e) {
      console.error('Failed to decode Upstox binary feed:', e);
    }
  }

  private setupPingInterval(): void {
    this.clearPingInterval();
    this.pingInterval = setInterval(() => {
      this.sendWhenOpen({ type: 'ping' });
    }, 30000);
  }

  private clearPingInterval(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    // Exponential backoff with jitter (base 5s, max 60s)
    const base = this.reconnectInterval;
    const attempt = Math.min(this.reconnectAttempts, 6); // cap exponent to reach ~60s
    const delay = Math.min(base * Math.pow(2, attempt), 60000);
    const jitter = Math.floor(Math.random() * 500);
    this.reconnectAttempts += 1;
    this.reconnectTimer = setTimeout(() => {
      console.log('Attempting to reconnect Upstox WebSocket...');
      this.reconnectTimer = null;
      if (this.onMessageCallback && this.subscribedSymbols.size > 0) {
        this.connect(Array.from(this.subscribedSymbols.keys()), this.onMessageCallback, {
          accountId: this.accountId,
          mode: this.mode,
        });
      }
    }, delay + jitter);
  }

  private sendWhenOpen(message: unknown, socket?: WebSocket): void {
    const ws = socket ?? this.ws;
    if (!ws) return;
    let attempts = 0;
    const trySend = () => {
      if (ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(JSON.stringify(message));
        } catch (e) {
          console.error('Failed to send over Upstox WebSocket:', e);
        }
      } else if (ws.readyState === WebSocket.CONNECTING && attempts < 40) {
        attempts += 1;
        setTimeout(trySend, 50);
      } else {
        // Give up silently if closed or max attempts reached
      }
    };
    trySend();
  }

  private async updateSubscriptions(symbols: string[]): Promise<void> {
    await this.mapSymbolsToInstruments(symbols);
    const instrumentKeys = Array.from(this.subscribedSymbols.values());
    // Send a clean subscribe; Upstox treats sub as idempotent, but send unsub to be safe
    const unsubMessage = {
      guid: 'watchlist-unsub',
      method: 'unsub',
      data: {
        mode: this.mode,
        instrumentKeys,
      },
    };
    this.sendWhenOpen(unsubMessage);
    const updateMessage = {
      guid: 'watchlist-sub',
      method: 'sub',
      data: {
        mode: this.mode,
        instrumentKeys,
      },
    };
    this.sendWhenOpen(updateMessage);
  }

  disconnect(): void {
    this.intentionalDisconnect = true;
    this.isConnecting = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.clearPingInterval();
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.onerror = null;
      this.ws.onmessage = null;
      this.ws.onopen = null;
      if (this.ws.readyState === WebSocket.OPEN) {
        const unsubMessage = {
          guid: 'watchlist-unsub',
          method: 'unsub',
          data: {
            mode: this.mode,
            instrumentKeys: Array.from(this.subscribedSymbols.values()),
          },
        };
        this.sendWhenOpen(unsubMessage, this.ws);
        this.ws.close(1000, 'Normal closure');
      }
      this.ws = null;
    }
    this.subscribedSymbols.clear();
    this.symbolToInstrumentMap.clear();
    this.instrumentToSymbolMap.clear();
    this.priceCache.clear();
    this.onMessageCallback = null;
    this.isConnecting = false;
  }

  async addSymbol(symbol: string): Promise<void> {
    const instrumentToken = (
      this.symbolToInstrumentMap.get(symbol) || `NSE_EQ|${symbol}`
    ).toUpperCase();
    this.subscribedSymbols.set(symbol, instrumentToken);
    this.symbolToInstrumentMap.set(symbol, instrumentToken);
    this.instrumentToSymbolMap.set(instrumentToken, symbol);
    if (this.ws?.readyState === WebSocket.OPEN) {
      const subMessage = {
        guid: 'watchlist-sub',
        method: 'sub',
        data: { mode: this.mode, instrumentKeys: [instrumentToken] },
      };
      this.sendWhenOpen(subMessage);
    }
  }

  removeSymbol(symbol: string): void {
    const instrumentToken = this.symbolToInstrumentMap.get(symbol)?.toUpperCase();
    if (instrumentToken && this.ws?.readyState === WebSocket.OPEN) {
      const unsubMessage = {
        guid: 'watchlist-unsub',
        method: 'unsub',
        data: { mode: this.mode, instrumentKeys: [instrumentToken] },
      };
      this.sendWhenOpen(unsubMessage);
    }
    this.subscribedSymbols.delete(symbol);
    this.symbolToInstrumentMap.delete(symbol);
    if (instrumentToken) this.instrumentToSymbolMap.delete(instrumentToken);
    this.priceCache.delete(symbol);
  }

  private async ensureProtoLoaded(): Promise<void> {
    if (this.protoLoaded && this.root && this.FeedResponseType) return;
    try {
      // Load via our server proxy to avoid CORS in the browser
      const url = '/api/upstox/market-data/proto';
      this.root = await protobuf.load(url);
      const ns = 'com.upstox.marketdatafeederv3udapi.rpc.proto';
      this.FeedResponseType = this.root.lookupType(`${ns}.FeedResponse`) as protobuf.Type;
      this.protoLoaded = true;
    } catch (e) {
      console.error('Failed to load Upstox proto schema:', e);
      this.protoLoaded = false;
    }
  }
}

// Singleton instance resilient to Fast Refresh/HMR
declare global {
  // eslint-disable-next-line no-var
  var __UPSTOX_WS__: UpstoxWebSocket | undefined;
}

const __globalAny: any = globalThis as any;
const existing = __globalAny.__UPSTOX_WS__ as UpstoxWebSocket | undefined;
const instance = existing ?? new UpstoxWebSocket();
__globalAny.__UPSTOX_WS__ = instance;
export const upstoxWebSocket = instance;
