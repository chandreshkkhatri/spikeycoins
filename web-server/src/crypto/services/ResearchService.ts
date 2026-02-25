/**
 * Research Service
 * Automated research on top movers to identify market movement causes
 */

import AIClient from "../utils/aiClient";
import { ResearchModel } from "../models/Research";
import { SummaryModel } from "../models/Summary";
import DatabaseConnection from "./DatabaseConnection";
import DataManager from "../core/DataManager";
import DailyCandlestickService from "./DailyCandlestickService";
import logger from "../utils/logger";

interface TopMover {
  symbol: string;
  name: string;
  priceChange: number;
  price: number;
  volume: number;
  timeframe: '24h' | '7d';
}

interface ResearchResult {
  coinSymbol: string;
  coinName: string;
  priceChange: number;
  timeframe: '24h' | '7d';
  headline: string;
  researchContent: string;
  sources: {
    type: string;
    url: string;
    title?: string;
    summary?: string;
  }[];
  isPublishable: boolean;
  publishableReason?: string;
  category: string;
  impact: 'high' | 'medium' | 'low';
}

class ResearchService {
  private static instance: ResearchService;
  private aiClient: AIClient;
  // Configurable deduplication window (default 6 hours, can be overridden via env var)
  private readonly DEDUPLICATION_HOURS = parseInt(process.env.RESEARCH_DEDUP_HOURS || '6', 10);
  // Re-research if price change differs by more than this threshold (default 10%)
  private readonly PRICE_CHANGE_THRESHOLD = parseFloat(process.env.RESEARCH_PRICE_CHANGE_THRESHOLD || '10.0');
  // Very recent research skip window (skip pre-screening if researched < 2 hours ago)
  private readonly VERY_RECENT_HOURS = 2;
  private quotaExceeded: boolean = false;
  private quotaErrorCount: number = 0;
  private readonly MAX_QUOTA_ERRORS = 3; // Stop pre-screening after 3 quota errors

  private constructor() {
    this.aiClient = new AIClient();
    logger.info(`ResearchService: Deduplication window: ${this.DEDUPLICATION_HOURS}h, Price change threshold: ${this.PRICE_CHANGE_THRESHOLD}%, Very recent skip: ${this.VERY_RECENT_HOURS}h`);
  }

  static getInstance(): ResearchService {
    if (!ResearchService.instance) {
      ResearchService.instance = new ResearchService();
    }
    return ResearchService.instance;
  }

  /**
   * Get top 5 gainers and losers from current ticker data
   * For 24h: uses Binance ticker data
   * For 7d: uses DailyCandlestickService
   */
  private async getTopMovers(timeframe: '24h' | '7d' = '24h'): Promise<TopMover[]> {
    try {
      if (timeframe === '24h') {
        // Use 24h data from Binance tickers
        const tickers = DataManager.getAllTickers();

        if (tickers.length === 0) {
          logger.warn('ResearchService: No ticker data available');
          return [];
        }

        // Filter and format ticker data
        const formattedData = tickers
          .map((ticker: any) => ({
            symbol: ticker.s?.replace('USDT', '') || 'Unknown',
            name: ticker.s?.replace('USDT', '') || 'Unknown',
            priceChange: parseFloat(ticker.P || '0'),
            price: parseFloat(ticker.c || '0'),
            volume: parseFloat(ticker.q || '0'),
            timeframe,
          }))
          .filter((item: any) => !isNaN(item.priceChange) && item.priceChange !== 0);

        // Sort by price change
        const sortedByChange = [...formattedData].sort((a, b) => b.priceChange - a.priceChange);

        // Get top 3 gainers and losers (reduced from 5 to optimize quota usage)
        const topGainers = sortedByChange.slice(0, 3);
        const topLosers = sortedByChange.slice(-3).reverse();

        return [...topGainers, ...topLosers];
      } else {
        // Use 7d data from DailyCandlestickService
        const dailyCandlestickService = DailyCandlestickService.getInstance();
        const topMovers7d = await dailyCandlestickService.get7dTopMovers(5);
        
        if (!topMovers7d.gainers || !topMovers7d.losers) {
          logger.warn('ResearchService: No 7d data available');
          return [];
        }

        // Format to TopMover interface
        const formattedGainers: TopMover[] = topMovers7d.gainers.map((item: any) => ({
          symbol: item.symbol,
          name: item.name || item.symbol,
          priceChange: item.change_7d,
          price: parseFloat(item.price),
          volume: parseFloat(item.volume),
          timeframe: '7d',
        }));

        const formattedLosers: TopMover[] = topMovers7d.losers.map((item: any) => ({
          symbol: item.symbol,
          name: item.name || item.symbol,
          priceChange: item.change_7d,
          price: parseFloat(item.price),
          volume: parseFloat(item.volume),
          timeframe: '7d',
        }));

        return [...formattedGainers, ...formattedLosers];
      }
    } catch (error) {
      logger.error('ResearchService: Error getting top movers:', error);
      return [];
    }
  }

  /**
   * Extract JSON from response text, handling markdown code blocks and other formats
   */
  private extractJSON(text: string): string | null {
    if (!text || text.trim().length === 0) {
      return null;
    }

    const trimmed = text.trim();

    // Try to find JSON in markdown code blocks first (handles ```json ... ``` or ``` ... ```)
    const codeBlockPattern = /```(?:json)?\s*([\s\S]*?)\s*```/;
    const codeBlockMatch = trimmed.match(codeBlockPattern);
    if (codeBlockMatch) {
      const codeContent = codeBlockMatch[1].trim();
      if (codeContent.startsWith('{') && codeContent.endsWith('}')) {
        return codeContent;
      }
    }

    // Try to find the first complete JSON object by counting braces
    let braceCount = 0;
    let startIndex = -1;
    
    for (let i = 0; i < trimmed.length; i++) {
      if (trimmed[i] === '{') {
        if (braceCount === 0) {
          startIndex = i;
        }
        braceCount++;
      } else if (trimmed[i] === '}') {
        braceCount--;
        if (braceCount === 0 && startIndex !== -1) {
          // Found a complete JSON object
          const jsonCandidate = trimmed.substring(startIndex, i + 1);
          // Quick validation: try to parse it
          try {
            JSON.parse(jsonCandidate);
            return jsonCandidate;
          } catch {
            // Not valid JSON, continue searching
            startIndex = -1;
          }
        }
      }
    }

    // If the entire response looks like JSON, return it
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      return trimmed;
    }

    return null;
  }

  /**
   * Parse JSON with multiple attempts and better error handling
   */
  private parseJSONResponse<T>(text: string, fallback: T): T {
    try {
      const jsonString = this.extractJSON(text);
      if (!jsonString) {
        logger.warn(`ResearchService: No JSON found in response, using fallback`);
        return fallback;
      }

      const parsed = JSON.parse(jsonString);
      return parsed as T;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`ResearchService: JSON parsing failed - ${errorMessage}. Response preview: ${text.substring(0, 200)}`);
      return fallback;
    }
  }

  /**
   * Quick pre-screening to check if there's a significant event worth researching
   * Returns true if there's a credible event, false if it's just market noise
   */
  private async hasSignificantEvent(mover: TopMover): Promise<{ hasEvent: boolean; reason: string }> {
    try {
      const prompt = `You are a cryptocurrency analyst. Quickly check if there's a COIN-SPECIFIC SIGNIFICANT EVENT that might explain this price movement.

Coin: ${mover.symbol}
Price Change: ${mover.priceChange > 0 ? '+' : ''}${mover.priceChange.toFixed(2)}% (${mover.timeframe})
Current Price: $${mover.price}

Use web search to quickly check for COIN-SPECIFIC events:
1. Major news specifically about THIS coin (partnerships, listings, regulations)
2. Technical developments specifically for THIS coin (mainnet launches, upgrades)
3. Events specifically affecting THIS coin (hacks, exploits, major announcements)
4. Significant social media buzz with credible sources specifically about THIS coin

CRITICAL: You MUST respond with ONLY valid JSON, no additional text or explanation. Use this exact format:

{
  "hasEvent": false,
  "reason": "Brief explanation (1 sentence)"
}

Mark hasEvent as TRUE only if you find CREDIBLE evidence of a COIN-SPECIFIC significant event that could explain THIS SPECIFIC price movement.

Mark FALSE for:
- Normal market volatility
- Broader market trends affecting all cryptocurrencies
- Bitcoin or macro factors affecting the entire market
- General crypto market weakness/strength
- Old news that doesn't align with the current timeframe
- Pump and dump schemes
- No clear coin-specific cause found
- Speculation without evidence

Remember: Respond with ONLY the JSON object, nothing else.`;

      const responseContent = await this.aiClient.generateCompletion(prompt, {
        useWebSearch: true
      });

      if (!responseContent || responseContent.trim().length === 0) {
        logger.warn(`ResearchService: Empty response from AI for pre-screening ${mover.symbol}, assuming event exists`);
        return { hasEvent: true, reason: "Empty response from AI, proceeding with research" };
      }

      // Parse JSON response with fallback
      const parsed = this.parseJSONResponse(responseContent, { hasEvent: false, reason: "Failed to parse response" });

      return {
        hasEvent: parsed.hasEvent === true,
        reason: parsed.reason || "Unknown",
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`ResearchService: Error in pre-screening for ${mover.symbol}: ${errorMessage}`);
      // On error, assume there might be an event (fail open)
      return { hasEvent: true, reason: "Pre-screening failed, proceeding with research" };
    }
  }

  /**
   * Research a specific coin using AI with web search
   */
  private async researchCoin(mover: TopMover): Promise<ResearchResult> {
    try {
      logger.info(`ResearchService: Researching ${mover.symbol} (${mover.priceChange > 0 ? '+' : ''}${mover.priceChange.toFixed(2)}%)`);

      const prompt = `You are a senior cryptocurrency research analyst writing for active traders. Research why this cryptocurrency had significant price movement and produce a brief, actionable market intelligence report.

Coin: ${mover.name} (${mover.symbol})
Price Change: ${mover.priceChange > 0 ? '+' : ''}${mover.priceChange.toFixed(2)}% (${mover.timeframe})
Current Price: $${mover.price.toFixed(mover.price >= 1 ? 2 : 6)}
Volume: $${mover.volume.toLocaleString()}

Research using web search:
1. Breaking news, announcements, or developments specifically about ${mover.name}
2. On-chain data or tokenomics events (unlocks, burns, staking changes)
3. Exchange listings, delistings, or liquidity changes
4. Community sentiment from Reddit, Twitter/X, or Discord
5. Technical milestones (upgrades, mainnet launches, partnerships)

CRITICAL: Respond with ONLY valid JSON, no extra text. Use this exact format:

{
  "headline": "Concise, engaging headline (max 12 words) — like a news ticker headline, NOT just 'SYMBOL: +X%'",
  "researchContent": "3-5 sentence analysis. Start with WHAT happened (the catalyst). Then WHY it matters for the token. End with what traders should WATCH next (upcoming dates, support/resistance, or follow-up events). Be specific with dates, numbers, and names.",
  "sources": [
    {
      "type": "news|social|onchain|exchange",
      "url": "https://actual-source-url.com",
      "title": "Source headline",
      "summary": "One-line summary"
    }
  ],
  "isPublishable": false,
  "publishableReason": "Why publishable or not (1 sentence)",
  "category": "Choose ONE: Listing/Delisting | Partnership | Technical Upgrade | Tokenomics | Regulatory | Hack/Exploit | Ecosystem Growth | Market Structure | Community Event",
  "impact": "high|medium|low"
}

isPublishable = TRUE only when there is a CREDIBLE, COIN-SPECIFIC catalyst:
- Specific partnership, listing, or announcement for THIS coin
- Technical upgrade, mainnet launch, or protocol change
- Regulatory action targeting THIS coin or its ecosystem
- Security incident, exploit, or governance crisis
- Token unlock, burn, or major supply change

isPublishable = FALSE when:
- Movement is driven by broader crypto/macro trends
- No coin-specific catalyst found
- Only speculation or social hype without substance
- General market conditions (BTC moves, ETF flows, liquidations)

Respond with ONLY the JSON object.`;

      const responseContent = await this.aiClient.generateCompletion(prompt, {
        useWebSearch: true
      });

      if (!responseContent || responseContent.trim().length === 0) {
        logger.error(`ResearchService: Empty response from AI for ${mover.symbol}`);
        throw new Error("No response from Gemini");
      }

      logger.info(`ResearchService: Received response from AI for ${mover.symbol} (length: ${responseContent.length})`);

      // Parse the JSON response with improved error handling
      const fallbackResponse = {
        headline: `${mover.symbol}: ${mover.priceChange > 0 ? '+' : ''}${mover.priceChange.toFixed(2)}% (${mover.timeframe})`,
        researchContent: responseContent.substring(0, 500) || "No research content available",
        sources: [],
        isPublishable: false,
        publishableReason: "Failed to parse research response - using raw content",
        category: "General",
        impact: "medium" as const,
      };

      const parsedResponse = this.parseJSONResponse(responseContent, fallbackResponse);

      return {
        coinSymbol: mover.symbol,
        coinName: mover.name,
        priceChange: mover.priceChange,
        timeframe: mover.timeframe,
        headline: parsedResponse.headline || `${mover.symbol}: ${mover.priceChange > 0 ? '+' : ''}${mover.priceChange.toFixed(2)}% - ${parsedResponse.category || 'General'}`,
        researchContent: parsedResponse.researchContent || "No research content available",
        sources: parsedResponse.sources || [],
        isPublishable: parsedResponse.isPublishable || false,
        publishableReason: parsedResponse.publishableReason,
        category: parsedResponse.category || "General",
        impact: parsedResponse.impact || "medium",
      };
    } catch (error) {
      logger.error(`ResearchService: Error researching ${mover.symbol}:`, error);
      throw error;
    }
  }

  /**
   * Find recent research for a coin
   */
  private async findRecentResearch(
    coinSymbol: string,
    timeframe: '24h' | '7d',
    hoursAgo: number = this.DEDUPLICATION_HOURS
  ): Promise<any | null> {
    try {
      if (!DatabaseConnection.isConnectionReady()) {
        await DatabaseConnection.initialize();
      }

      const cutoffTime = new Date(Date.now() - hoursAgo * 60 * 60 * 1000);

      const recentResearch = await ResearchModel.findOne({
        coinSymbol,
        timeframe,
        researchedAt: { $gte: cutoffTime },
      })
        .sort({ researchedAt: -1 })
        .lean();

      return recentResearch;
    } catch (error) {
      logger.error(`ResearchService: Error finding recent research for ${coinSymbol}:`, error);
      return null;
    }
  }

  /**
   * Check if new research has significant new information compared to old research
   */
  private async hasSignificantNewInfo(
    oldResearch: any,
    newResearch: ResearchResult
  ): Promise<{ hasNewInfo: boolean; reason: string }> {
    try {
      const prompt = `You are comparing two pieces of cryptocurrency research to determine if there's significant new information.

OLD RESEARCH (from ${new Date(oldResearch.researchedAt).toLocaleString()}):
${oldResearch.researchContent}
Sources: ${oldResearch.sources.map((s: any) => s.url).join(', ')}

NEW RESEARCH (just now):
${newResearch.researchContent}
Sources: ${newResearch.sources.map((s: any) => s.url).join(', ')}

Determine if the NEW research contains SIGNIFICANT new information that wasn't in the OLD research. Consider:
- Are there new events, announcements, or developments?
- Are the sources substantially different?
- Has the narrative or understanding of the price movement changed?
- Is there new credible evidence not present before?

Minor differences like rewording, slight timing differences, or the same news from different sources don't count as significant.

Respond with JSON:
{
  "hasNewInfo": true/false,
  "reason": "Brief explanation (1-2 sentences)"
}`;

      const responseContent = await this.aiClient.generateCompletion(prompt);

      if (!responseContent) {
        return { hasNewInfo: true, reason: "Could not determine, assuming new info" };
      }

      const jsonMatch = responseContent.match(/\{[\s\S]*\}/);
      const jsonString = jsonMatch ? jsonMatch[0] : responseContent;
      const parsed = JSON.parse(jsonString);

      return {
        hasNewInfo: parsed.hasNewInfo || false,
        reason: parsed.reason || "Unknown",
      };
    } catch (error) {
      logger.error("ResearchService: Error comparing research:", error);
      // Default to assuming there's new info if we can't determine
      return { hasNewInfo: true, reason: "Error during comparison, assuming new info" };
    }
  }

  /**
   * Save research to database and create summary if publishable
   */
  private async saveResearch(research: ResearchResult): Promise<void> {
    try {
      if (!DatabaseConnection.isConnectionReady()) {
        await DatabaseConnection.initialize();
      }

      // Save research to database
      const researchDoc = await ResearchModel.create({
        coinSymbol: research.coinSymbol,
        coinName: research.coinName,
        priceChange: research.priceChange,
        timeframe: research.timeframe,
        researchContent: research.researchContent,
        sources: research.sources,
        isPublishable: research.isPublishable,
        publishableReason: research.publishableReason,
        category: research.category,
        impact: research.impact,
        researchedAt: new Date(),
      });

      logger.info(`ResearchService: Saved research for ${research.coinSymbol} (publishable: ${research.isPublishable})`);

      // If publishable, create a summary entry
      if (research.isPublishable) {
        const title = research.headline || `${research.coinSymbol}: ${research.priceChange > 0 ? '+' : ''}${research.priceChange.toFixed(2)}% - ${research.category}`;

        await SummaryModel.create({
          researchId: researchDoc._id,
          title,
          isPublished: true,
          publishedAt: new Date(),
        });

        logger.info(`ResearchService: Created summary for ${research.coinSymbol}`);
      }
    } catch (error) {
      logger.error(`ResearchService: Error saving research for ${research.coinSymbol}:`, error);
      throw error;
    }
  }

  /**
   * Run automated research on top movers with smart duplicate handling
   * This is called by the cron job every 2 hours
   * Researches both 24h and 7d top movers with event pre-screening
   * @deprecated timeframe parameter - now always researches both 24h and 7d
   */
  async runAutomatedResearch(timeframe?: '24h' | '7d'): Promise<void> {
    try {
      logger.info(`ResearchService: Starting automated research for both 24h and 7d top movers`);

      // Get top movers from both timeframes
      const topMovers24h = await this.getTopMovers('24h');
      const topMovers7d = await this.getTopMovers('7d');
      
      // Combine and deduplicate (a coin might be in both lists)
      const allMoversMap = new Map<string, TopMover>();
      
      [...topMovers24h, ...topMovers7d].forEach(mover => {
        // If coin exists, keep the one with larger absolute change
        const existing = allMoversMap.get(mover.symbol);
        if (!existing || Math.abs(mover.priceChange) > Math.abs(existing.priceChange)) {
          allMoversMap.set(mover.symbol, mover);
        }
      });
      
      const allMovers = Array.from(allMoversMap.values());

      if (allMovers.length === 0) {
        logger.warn('ResearchService: No top movers found, skipping research');
        return;
      }

      logger.info(`ResearchService: Found ${allMovers.length} unique top movers (${topMovers24h.length} from 24h, ${topMovers7d.length} from 7d)`);

      // Phase 1: Pre-screen all coins to find those with significant events
      // First, check for recent research to skip coins that don't need pre-screening
      logger.info(`ResearchService: Phase 1 - Pre-screening ${allMovers.length} coins for significant events...`);
      
      const coinsWithEvents: TopMover[] = [];
      const coinsWithoutEvents: { symbol: string; reason: string }[] = [];
      const coinsToPreScreen: TopMover[] = [];
      
      // Pre-filter: Check for recent research before making LLM calls
      for (const mover of allMovers) {
        // Check for very recent research (< 2 hours ago) - skip pre-screening entirely
        const veryRecentResearch = await this.findRecentResearch(
          mover.symbol,
          mover.timeframe,
          this.VERY_RECENT_HOURS
        );

        if (veryRecentResearch) {
          const hoursSinceResearch = (Date.now() - new Date(veryRecentResearch.researchedAt).getTime()) / (1000 * 60 * 60);
          logger.info(`ResearchService: ⏭️  Skipping ${mover.symbol} - very recent research exists (${hoursSinceResearch.toFixed(1)}h ago), skipping pre-screening entirely`);
          // Skip this coin completely - it was researched very recently
          continue;
        }

        // Check for recent research (within deduplication window)
        const recentResearch = await this.findRecentResearch(
          mover.symbol,
          mover.timeframe,
          this.DEDUPLICATION_HOURS
        );

        if (recentResearch) {
          const priceChangeDelta = Math.abs(mover.priceChange - recentResearch.priceChange);
          
          // If recent research exists and price change is similar, skip pre-screening
          if (priceChangeDelta < this.PRICE_CHANGE_THRESHOLD) {
            logger.info(`ResearchService: ⏭️  Skipping pre-screening for ${mover.symbol} - recent research exists (delta: ${priceChangeDelta.toFixed(2)}%)`);
            // Don't add to coinsWithEvents - will be handled in Phase 2
            continue;
          }
        }
        
        // Coin needs pre-screening (no recent research or significant price change)
        coinsToPreScreen.push(mover);
      }

      logger.info(`ResearchService: Pre-filtered to ${coinsToPreScreen.length} coins needing pre-screening (${allMovers.length - coinsToPreScreen.length} skipped due to recent research)`);

      // Reset quota state for this run (quotas reset over time)
      this.quotaErrorCount = 0;
      this.quotaExceeded = false;
      
      // Pre-screen only coins that need it
      for (const mover of coinsToPreScreen) {
        // Stop pre-screening if we hit quota errors
        if (this.quotaExceeded || this.quotaErrorCount >= this.MAX_QUOTA_ERRORS) {
          logger.warn(`ResearchService: Quota exceeded or too many quota errors (${this.quotaErrorCount}), skipping remaining pre-screening. Including remaining coins for research.`);
          // Include remaining coins (fail open when quota is exceeded)
          coinsWithEvents.push(...coinsToPreScreen.slice(coinsToPreScreen.indexOf(mover)));
          break;
        }

        try {
          const eventCheck = await this.hasSignificantEvent(mover);
          
          if (eventCheck.hasEvent) {
            logger.info(`ResearchService: ✅ ${mover.symbol} (${mover.priceChange > 0 ? '+' : ''}${mover.priceChange.toFixed(2)}% ${mover.timeframe}) - ${eventCheck.reason}`);
            coinsWithEvents.push(mover);
          } else {
            logger.info(`ResearchService: ❌ ${mover.symbol} (${mover.priceChange > 0 ? '+' : ''}${mover.priceChange.toFixed(2)}% ${mover.timeframe}) - ${eventCheck.reason}`);
            coinsWithoutEvents.push({ symbol: mover.symbol, reason: eventCheck.reason });
          }
          
          // Small delay between pre-screening calls
          await new Promise(resolve => setTimeout(resolve, 1000));
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          
          // Check if it's a quota error
          if (errorMessage.includes('quota') || errorMessage.includes('429') || errorMessage.includes('Quota exceeded')) {
            this.quotaExceeded = true;
            this.quotaErrorCount++;
            logger.error(`ResearchService: Quota exceeded during pre-screening (${this.quotaErrorCount}/${this.MAX_QUOTA_ERRORS}). Stopping pre-screening.`);
            // Include remaining coins (fail open when quota is exceeded)
            coinsWithEvents.push(...coinsToPreScreen.slice(coinsToPreScreen.indexOf(mover)));
            break;
          } else {
            logger.error(`ResearchService: Error pre-screening ${mover.symbol}:`, error);
            // On other errors, include the coin (fail open)
            coinsWithEvents.push(mover);
          }
        }
      }
      
      logger.info(`ResearchService: Pre-screening complete - ${coinsWithEvents.length} coins with events, ${coinsWithoutEvents.length} without`);
      
      // Add coins that were skipped in pre-filtering but have significant price changes
      // These have recent research but price change differs significantly, so they need Phase 2 research
      // (They were added to coinsToPreScreen but we need to make sure they're in coinsWithEvents)
      // Actually, if they have significant price change, they should already be in coinsToPreScreen
      // and would have been pre-screened. So we just need to ensure all coinsToPreScreen with events are included.
      
      if (coinsWithEvents.length === 0) {
        logger.info('ResearchService: No coins with significant events found, skipping full research');
        return;
      }

      // Phase 2: Full research only for coins with significant events
      logger.info(`ResearchService: Phase 2 - Full research for ${coinsWithEvents.length} coins with events...`);

      // Research each coin sequentially to avoid rate limits
      let publishableCount = 0;
      let updatedCount = 0;
      let skippedCount = 0;
      let newCount = 0;
      let errorCount = 0;

      for (const mover of coinsWithEvents) {
        try {
          // Check if this coin was recently researched
          const recentResearch = await this.findRecentResearch(
            mover.symbol,
            mover.timeframe,
            this.DEDUPLICATION_HOURS
          );

          if (recentResearch) {
            const hoursSinceResearch = (Date.now() - new Date(recentResearch.researchedAt).getTime()) / (1000 * 60 * 60);
            const priceChangeDelta = Math.abs(mover.priceChange - recentResearch.priceChange);
            
            logger.info(
              `ResearchService: Found recent research for ${mover.symbol} (${hoursSinceResearch.toFixed(1)}h ago, price change: ${recentResearch.priceChange.toFixed(2)}% → ${mover.priceChange.toFixed(2)}%, delta: ${priceChangeDelta.toFixed(2)}%)`
            );

            // Skip LLM call if price change hasn't changed significantly
            // This saves expensive API calls when the coin movement is similar
            if (priceChangeDelta < this.PRICE_CHANGE_THRESHOLD) {
              logger.info(
                `ResearchService: Skipping ${mover.symbol} - price change similar (delta: ${priceChangeDelta.toFixed(2)}% < ${this.PRICE_CHANGE_THRESHOLD}%), no significant new movement`
              );
              
              // Just update timestamp to show we checked
              await ResearchModel.findByIdAndUpdate(recentResearch._id, {
                $set: {
                  updatedAt: new Date(),
                },
              });

              skippedCount++;
              if (recentResearch.isPublishable) {
                publishableCount++;
              }
              continue; // Skip to next coin, no LLM calls!
            }

            // Price change is significantly different, perform new research
            logger.info(
              `ResearchService: Price change significant (delta: ${priceChangeDelta.toFixed(2)}%), researching ${mover.symbol}...`
            );

            // Perform new research to check for updates
            const newResearch = await this.researchCoin(mover);

            // Compare with previous research
            const comparison = await this.hasSignificantNewInfo(recentResearch, newResearch);

            if (comparison.hasNewInfo) {
              // Update existing research with new information
              logger.info(
                `ResearchService: Updating ${mover.symbol} - ${comparison.reason}`
              );

              await ResearchModel.findByIdAndUpdate(recentResearch._id, {
                $set: {
                  priceChange: newResearch.priceChange,
                  researchContent: newResearch.researchContent,
                  sources: newResearch.sources,
                  isPublishable: newResearch.isPublishable,
                  publishableReason: newResearch.publishableReason,
                  category: newResearch.category,
                  impact: newResearch.impact,
                  researchedAt: new Date(),
                  updatedAt: new Date(),
                },
              });

              // Update summary if it exists and research is publishable
              if (newResearch.isPublishable) {
                const existingSummary = await SummaryModel.findOne({
                  researchId: recentResearch._id,
                });

                const newTitle = newResearch.headline || `${newResearch.coinSymbol}: ${newResearch.priceChange > 0 ? '+' : ''}${newResearch.priceChange.toFixed(2)}% - ${newResearch.category}`;

                if (existingSummary) {
                  await SummaryModel.findByIdAndUpdate(existingSummary._id, {
                    $set: {
                      title: newTitle,
                      isPublished: true,
                      publishedAt: new Date(),
                      updatedAt: new Date(),
                    },
                  });
                } else {
                  // Create new summary if it didn't exist
                  await SummaryModel.create({
                    researchId: recentResearch._id,
                    title: newTitle,
                    isPublished: true,
                    publishedAt: new Date(),
                  });
                }
                publishableCount++;
              }

              updatedCount++;
            } else {
              // No significant new info, just update timestamp
              logger.info(
                `ResearchService: No significant update for ${mover.symbol} - ${comparison.reason}`
              );

              await ResearchModel.findByIdAndUpdate(recentResearch._id, {
                $set: {
                  updatedAt: new Date(),
                },
              });

              skippedCount++;

              if (recentResearch.isPublishable) {
                publishableCount++;
              }
            }
          } else {
            // No recent research found, create new entry
            logger.info(`ResearchService: Creating new research for ${mover.symbol}`);

            const research = await this.researchCoin(mover);
            await this.saveResearch(research);

            if (research.isPublishable) {
              publishableCount++;
            }

            newCount++;
          }

          // Add a small delay between requests to respect rate limits
          await new Promise(resolve => setTimeout(resolve, 2000));
        } catch (error) {
          errorCount++;
          logger.error(`ResearchService: Failed to research ${mover.symbol} (Error ${errorCount}/${coinsWithEvents.length}):`, error);

          // If too many failures, abort early to prevent wasting resources
          if (errorCount >= Math.ceil(coinsWithEvents.length / 2)) {
            logger.error(`ResearchService: Too many failures (${errorCount}/${coinsWithEvents.length}), aborting research`);
            throw new Error(`Research failed for ${errorCount}/${coinsWithEvents.length} coins - possible API issue`);
          }

          continue;
        }
      }

      logger.info(
        `ResearchService: Completed research - New: ${newCount}, Updated: ${updatedCount}, Skipped: ${skippedCount}, Errors: ${errorCount}, Publishable: ${publishableCount}/${coinsWithEvents.length}`
      );
      logger.info(
        `ResearchService: Summary - Screened: ${allMovers.length}, With Events: ${coinsWithEvents.length}, Without Events: ${coinsWithoutEvents.length}, Researched: ${newCount + updatedCount}, Published: ${publishableCount}`
      );

      // Log warning if there were any errors
      if (errorCount > 0) {
        logger.warn(`ResearchService: ${errorCount} research failures occurred during this run`);
      }
    } catch (error) {
      logger.error('ResearchService: Error in automated research:', error);
      throw error;
    }
  }

  /**
   * Get latest published summaries with populated research data
   */
  async getLatestSummaries(limit: number = 10): Promise<any[]> {
    try {
      if (!DatabaseConnection.isConnectionReady()) {
        await DatabaseConnection.initialize();
      }

      const summaries = await SummaryModel
        .find({ isPublished: true })
        .sort({ createdAt: -1 })
        .limit(limit)
        .populate('researchId')
        .lean();

      return summaries.map((summary: any) => {
        const research = summary.researchId;
        return {
          _id: summary._id,
          title: summary.title,
          summary: research?.researchContent || '',
          source: research?.sources?.[0]?.url || 'Research',
          category: research?.category || 'General',
          impact: research?.impact || 'medium',
          url: research?.sources?.[0]?.url,
          coinSymbol: research?.coinSymbol,
          priceChange: research?.priceChange,
          timeframe: research?.timeframe,
          createdAt: summary.createdAt,
          timestamp: summary.publishedAt,
        };
      });
    } catch (error) {
      logger.error('ResearchService: Error getting latest summaries:', error);
      throw error;
    }
  }
}

export default ResearchService;
