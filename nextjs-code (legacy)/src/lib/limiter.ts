import Bottleneck from 'bottleneck';

// Rate limiter for KiteConnect API calls
// Zerodha has rate limits, so we need to throttle requests
const limiter = new Bottleneck({
  minTime: 333, // Minimum time between requests (3 requests per second)
  maxConcurrent: 1, // Only one concurrent request
  reservoir: 10, // Start with 10 requests
  reservoirRefreshAmount: 10, // Refresh 10 requests
  reservoirRefreshInterval: 1000, // Every second
});

export default limiter;
