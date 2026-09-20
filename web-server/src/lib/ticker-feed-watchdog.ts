import type WebSocket from 'ws';

/** Transport pongs do not establish that market data is flowing. */
export function watchTickerFeed(socket: WebSocket, onStale: () => void) {
  let lastDataAt = Date.now();
  const timer = setInterval(() => {
    if (Date.now() - lastDataAt >= 60000) {
      clearInterval(timer);
      onStale();
      socket.terminate();
    }
  }, 10000);
  timer.unref();
  socket.once('close', () => clearInterval(timer));
  return {
    receivedData: () => { lastDataAt = Date.now(); },
    stop: () => clearInterval(timer),
  };
}
