/**
 * Markets Module
 * Unified market data abstraction layer
 */

// Re-export interfaces
export * from './interfaces';

// Re-export providers
export { BinanceProvider, UpstoxProvider } from './providers';

// Re-export services
export { MarketRegistry } from './services';

// Convenience: Get registry instance
import MarketRegistry from './services/MarketRegistry';
export const getMarketRegistry = () => MarketRegistry.getInstance();
