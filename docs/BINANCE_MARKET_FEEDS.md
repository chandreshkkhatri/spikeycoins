# Binance market feeds

Updated September 20, 2026 after the 2026 stream migrations.

- Spot: `wss://stream.binance.com:9443/ws/!miniTicker@arr`.
  The retired `!ticker@arr` connection may open without delivering messages.
  Mini tickers provide rolling open/close, high/low and volume; the adapter
  derives price change and percentage from the observed open/close values.
  Its rolling time bounds use the event timestamp, since mini tickers omit
  the full ticker's statistics timestamps.
- Futures: `wss://fstream.binance.com/market/ws/!ticker@arr` in both the
  Market Watch client and the shared price service.
- Symbol discovery: Spot and Futures `exchangeInfo` listings are cached for
  five minutes. Only trading USDT pairs (perpetuals for Futures) are eligible
  for candle tracking and new CoinGecko mappings. Spot wins for shared pairs.
  Existing unverified database mappings are preserved but excluded from
  candle requests. An exchange-info failure does not create guessed listings.

After starting the backend, check `GET /api/ticker`: `tickerDataCount` should
increase and both `feedHealth` entries should have recent `lastMessageAt`
values with `isStale: false`. A connected socket alone does not prove that
data is arriving. Streams publish changed symbols, so coverage builds over
successive messages.

Both feed consumers terminate silent sockets after 60 seconds without valid
ticker messages and reconnect with backoff. Transport pongs alone do not
reset this deadline. The crypto health endpoints report degraded status if
either feed is disconnected/stale or the ticker store is empty.

References:
- https://developers.binance.com/docs/binance-spot-api-docs/web-socket-streams
- https://developers.binance.com/en/docs/catalog/core-trading-derivatives-trading-usd-s-m-futures/api/ws-streams/market
