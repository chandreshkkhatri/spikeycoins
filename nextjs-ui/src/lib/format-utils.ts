/**
 * Smart formatting utilities for trading data
 * Handles price, volume, and percentage formatting with appropriate precision
 */

/**
 * Calculate appropriate decimal places based on price magnitude
 */
export function calculatePriceDecimals(price: number): number {
  if (price === 0) return 2;
  const absPrice = Math.abs(price);

  if (absPrice < 0.00001) return 10;
  if (absPrice < 0.0001) return 8;
  if (absPrice < 0.001) return 6;
  if (absPrice < 0.01) return 5;
  if (absPrice < 0.1) return 4;
  if (absPrice < 1) return 4;
  if (absPrice < 10) return 3;
  if (absPrice < 100) return 2;
  if (absPrice < 1000) return 2;
  return 0;
}

/**
 * Format price with smart decimal places based on magnitude
 * @param price - The price value to format
 * @param symbol - Optional currency symbol prefix
 * @returns Formatted price string
 */
export function formatPrice(price: number | null | undefined, symbol: string = ""): string {
  if (price === null || price === undefined || isNaN(price)) return `${symbol}0.00`;
  if (price === 0) return `${symbol}0.00`;

  const decimals = calculatePriceDecimals(price);
  const formatted = price.toFixed(decimals);

  // Add commas for large numbers
  if (price >= 1000) {
    const parts = formatted.split(".");
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return `${symbol}${parts.join(".")}`;
  }

  return `${symbol}${formatted}`;
}

/**
 * Format volume with K/M/B suffixes
 * @param volume - The volume value to format
 * @returns Formatted volume string
 */
export function formatVolume(volume: number | null | undefined): string {
  if (volume === null || volume === undefined || isNaN(volume)) return "0";
  if (volume === 0) return "0";

  const absVolume = Math.abs(volume);

  if (absVolume >= 1_000_000_000) {
    return `${(volume / 1_000_000_000).toFixed(2)}B`;
  }
  if (absVolume >= 1_000_000) {
    return `${(volume / 1_000_000).toFixed(2)}M`;
  }
  if (absVolume >= 1_000) {
    return `${(volume / 1_000).toFixed(2)}K`;
  }

  return volume.toFixed(2);
}

/**
 * Format percentage with consistent decimal places
 * @param percent - The percentage value to format
 * @param includeSign - Whether to include + sign for positive values
 * @returns Formatted percentage string
 */
export function formatPercent(percent: number | null | undefined, includeSign: boolean = true): string {
  if (percent === null || percent === undefined || isNaN(percent)) return "0.00%";

  const sign = includeSign && percent > 0 ? "+" : "";
  return `${sign}${percent.toFixed(2)}%`;
}

/**
 * Format quantity for order book display
 * @param quantity - The quantity value to format
 * @returns Formatted quantity string
 */
export function formatQuantity(quantity: number | null | undefined): string {
  if (quantity === null || quantity === undefined || isNaN(quantity)) return "0";
  if (quantity === 0) return "0";

  if (quantity >= 1000) {
    return quantity.toLocaleString(undefined, { maximumFractionDigits: 2 });
  }
  if (quantity >= 1) {
    return quantity.toFixed(4);
  }
  if (quantity >= 0.0001) {
    return quantity.toFixed(6);
  }
  return quantity.toFixed(8);
}
