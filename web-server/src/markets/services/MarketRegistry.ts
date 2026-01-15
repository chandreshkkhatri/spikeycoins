/**
 * Market Registry
 * Central service for managing and routing requests to market data providers
 */

import { IMarketProvider, MarketType } from '../interfaces/IMarketProvider';
import { ITicker } from '../interfaces/ITicker';
import { ICandle } from '../interfaces/ICandle';

class MarketRegistry {
  private static instance: MarketRegistry;
  private providers: Map<string, IMarketProvider> = new Map();
  
  private constructor() {}

  /**
   * Get singleton instance
   */
  static getInstance(): MarketRegistry {
    if (!MarketRegistry.instance) {
      MarketRegistry.instance = new MarketRegistry();
    }
    return MarketRegistry.instance;
  }

  /**
   * Register a market provider
   */
  registerProvider(provider: IMarketProvider): void {
    this.providers.set(provider.providerName, provider);
  }

  /**
   * Unregister a provider
   */
  unregisterProvider(providerName: string): void {
    const provider = this.providers.get(providerName);
    if (provider) {
      provider.disconnect();
      this.providers.delete(providerName);
    }
  }

  /**
   * Get provider by name
   */
  getProvider(providerName: string): IMarketProvider | undefined {
    return this.providers.get(providerName);
  }

  /**
   * Get all registered providers
   */
  getAllProviders(): IMarketProvider[] {
    return Array.from(this.providers.values());
  }

  /**
   * Get providers by market type
   */
  getProvidersByType(marketType: MarketType): IMarketProvider[] {
    return this.getAllProviders().filter(p => p.marketType === marketType);
  }

  /**
   * Get all tickers from all connected providers
   */
  async getAllTickers(): Promise<ITicker[]> {
    const allTickers: ITicker[] = [];
    
    for (const provider of this.providers.values()) {
      if (provider.isConnected()) {
        try {
          const tickers = await provider.getTickers();
          allTickers.push(...tickers);
        } catch (error) {
          console.error(`MarketRegistry: Error fetching tickers from ${provider.providerName}:`, error);
        }
      }
    }
    
    return allTickers;
  }

  /**
   * Get tickers by market type
   */
  async getTickersByType(marketType: MarketType): Promise<ITicker[]> {
    const providers = this.getProvidersByType(marketType);
    const allTickers: ITicker[] = [];
    
    for (const provider of providers) {
      if (provider.isConnected()) {
        try {
          const tickers = await provider.getTickers();
          allTickers.push(...tickers);
        } catch (error) {
          console.error(`MarketRegistry: Error fetching tickers from ${provider.providerName}:`, error);
        }
      }
    }
    
    return allTickers;
  }

  /**
   * Get ticker by symbol (searches all connected providers)
   */
  async getTickerBySymbol(symbol: string): Promise<ITicker | null> {
    for (const provider of this.providers.values()) {
      if (provider.isConnected()) {
        try {
          const ticker = await provider.getTickerBySymbol(symbol);
          if (ticker) return ticker;
        } catch (error) {
          // Continue to next provider
        }
      }
    }
    return null;
  }

  /**
   * Get historical data (from first provider that has the symbol)
   */
  async getHistoricalData(symbol: string, interval: string, limit: number): Promise<ICandle[]> {
    for (const provider of this.providers.values()) {
      if (provider.isConnected()) {
        try {
          const candles = await provider.getHistoricalData(symbol, interval, limit);
          if (candles.length > 0) return candles;
        } catch (error) {
          // Continue to next provider
        }
      }
    }
    return [];
  }

  /**
   * Connect all providers
   */
  async connectAll(): Promise<void> {
    const connectPromises = Array.from(this.providers.values()).map(async provider => {
      try {
        await provider.connect();
      } catch (error) {
        console.error(`MarketRegistry: Failed to connect ${provider.providerName}:`, error);
      }
    });
    
    await Promise.all(connectPromises);
  }

  /**
   * Disconnect all providers
   */
  async disconnectAll(): Promise<void> {
    const disconnectPromises = Array.from(this.providers.values()).map(async provider => {
      try {
        await provider.disconnect();
      } catch (error) {
        console.error(`MarketRegistry: Failed to disconnect ${provider.providerName}:`, error);
      }
    });
    
    await Promise.all(disconnectPromises);
  }

  /**
   * Get registry status
   */
  getStatus() {
    const providerStatuses: Record<string, any> = {};
    
    for (const [name, provider] of this.providers.entries()) {
      providerStatuses[name] = provider.getStatus();
    }
    
    return {
      registeredProviders: this.providers.size,
      connectedProviders: this.getAllProviders().filter(p => p.isConnected()).length,
      providers: providerStatuses,
    };
  }
}

export default MarketRegistry;
