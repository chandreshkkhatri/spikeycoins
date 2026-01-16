"use client";

/**
 * Settings Sync Service
 *
 * Syncs localStorage settings to the server when user is authenticated.
 * Falls back to localStorage when offline or not logged in.
 */

import api from "./api";

// Settings keys in localStorage
const THEME_KEY = "theme";
const CHART_SETTINGS_KEY = "openMandi_chartSettings";
const WATCHLIST_SETTINGS_KEY = "openMandi_watchlistSettings";

export interface CloudSettings {
  theme: "light" | "dark" | "system";
  chartSettings: {
    selectedTimeframes?: Array<{
      interval: string;
      label: string;
      index: number;
    }>;
    chartTimeframes?: { [index: number]: string };
    autoScale?: boolean;
    isLogScale?: boolean;
    isCollapsed?: boolean;
    collapsedCharts?: { [interval: string]: boolean };
  };
  watchlistSettings: {
    sortKey?: string;
    sortDirection?: "asc" | "desc";
    lastSelectedSymbol?: string;
  };
  tradingDefaults: {
    defaultQuantity?: number;
    defaultLeverage?: number;
    defaultOrderType?: "market" | "limit";
    showConfirmation?: boolean;
  };
}

class SettingsSyncService {
  private saveTimeout: number | null = null;
  private pendingChanges: Partial<CloudSettings> = {};
  private isSyncing = false;

  // Debounce delay in ms
  private readonly DEBOUNCE_DELAY = 2000;

  /**
   * Load settings from server if authenticated, otherwise from localStorage
   */
  async loadSettings(): Promise<CloudSettings> {
    if (typeof window === "undefined") {
      return this.getDefaultSettings();
    }

    const token = localStorage.getItem("openMandi_accessToken");

    if (token) {
      try {
        const response = await api.get("/settings");
        if (response.data.success) {
          const serverSettings = response.data.settings;

          // Save to localStorage as cache
          this.saveToLocalStorage(serverSettings);

          return serverSettings;
        }
      } catch (error) {
        // Fall back to localStorage if server fails
      }
    }

    // Fall back to localStorage
    return this.loadFromLocalStorage();
  }

  /**
   * Save settings - queues changes and debounces API calls
   */
  saveSettings(changes: Partial<CloudSettings>): void {
    if (typeof window === "undefined") return;

    // Merge with pending changes
    this.pendingChanges = {
      ...this.pendingChanges,
      ...changes,
    };

    // Save to localStorage immediately
    this.saveToLocalStorage(this.pendingChanges);

    // Clear existing timeout
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }

    // Debounce server save
    this.saveTimeout = window.setTimeout(() => {
      this.syncToServer();
    }, this.DEBOUNCE_DELAY);
  }

  /**
   * Save a specific setting
   */
  saveSetting<K extends keyof CloudSettings>(
    key: K,
    value: CloudSettings[K],
  ): void {
    this.saveSettings({ [key]: value } as Partial<CloudSettings>);
  }

  /**
   * Sync pending changes to server
   */
  private async syncToServer(): Promise<void> {
    if (typeof window === "undefined") return;

    const token = localStorage.getItem("openMandi_accessToken");

    if (
      !token ||
      this.isSyncing ||
      Object.keys(this.pendingChanges).length === 0
    ) {
      return;
    }

    this.isSyncing = true;
    const changesToSync = { ...this.pendingChanges };
    this.pendingChanges = {};

    try {
      await api.patch("/settings", changesToSync);
    } catch (error) {
      // Re-queue failed changes
      this.pendingChanges = {
        ...changesToSync,
        ...this.pendingChanges,
      };
    } finally {
      this.isSyncing = false;
    }
  }

  /**
   * Force immediate sync to server
   */
  async forceSync(): Promise<void> {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
      this.saveTimeout = null;
    }
    await this.syncToServer();
  }

  /**
   * Get default settings
   */
  private getDefaultSettings(): CloudSettings {
    return {
      theme: "system",
      chartSettings: {},
      watchlistSettings: {},
      tradingDefaults: {},
    };
  }

  /**
   * Load settings from localStorage
   */
  private loadFromLocalStorage(): CloudSettings {
    if (typeof window === "undefined") {
      return this.getDefaultSettings();
    }

    const theme =
      (localStorage.getItem(THEME_KEY) as "light" | "dark" | "system") ||
      "system";

    let chartSettings = {};
    try {
      const stored = localStorage.getItem(CHART_SETTINGS_KEY);
      if (stored) chartSettings = JSON.parse(stored);
    } catch {
      // Ignore parse errors
    }

    let watchlistSettings = {};
    try {
      const stored = localStorage.getItem(WATCHLIST_SETTINGS_KEY);
      if (stored) watchlistSettings = JSON.parse(stored);
    } catch {
      // Ignore parse errors
    }

    return {
      theme,
      chartSettings,
      watchlistSettings,
      tradingDefaults: {},
    };
  }

  /**
   * Save settings to localStorage
   */
  private saveToLocalStorage(settings: Partial<CloudSettings>): void {
    if (typeof window === "undefined") return;

    if (settings.theme !== undefined) {
      localStorage.setItem(THEME_KEY, settings.theme);
    }

    if (settings.chartSettings !== undefined) {
      localStorage.setItem(
        CHART_SETTINGS_KEY,
        JSON.stringify(settings.chartSettings),
      );
    }

    if (settings.watchlistSettings !== undefined) {
      localStorage.setItem(
        WATCHLIST_SETTINGS_KEY,
        JSON.stringify(settings.watchlistSettings),
      );
    }
  }

  /**
   * Migrate localStorage settings to server after login
   */
  async migrateLocalSettingsToServer(): Promise<void> {
    if (typeof window === "undefined") return;

    const token = localStorage.getItem("openMandi_accessToken");
    if (!token) return;

    try {
      // Load current local settings
      const localSettings = this.loadFromLocalStorage();

      // Check if any settings exist locally
      const hasLocalSettings =
        localSettings.theme !== "system" ||
        Object.keys(localSettings.chartSettings).length > 0 ||
        Object.keys(localSettings.watchlistSettings).length > 0;

      if (hasLocalSettings) {
        // Get server settings first
        const response = await api.get("/settings");
        const serverSettings = response.data.settings;

        // Check if server has any settings (not default)
        const hasServerSettings =
          serverSettings.theme !== "system" ||
          Object.keys(serverSettings.chartSettings || {}).length > 0 ||
          Object.keys(serverSettings.watchlistSettings || {}).length > 0;

        // If server is empty but local has settings, migrate
        if (!hasServerSettings && hasLocalSettings) {
          await api.put("/settings", localSettings);
        }
      }
    } catch (error) {
      // Ignore migration failures
    }
  }
}

// Singleton instance
export const settingsService = new SettingsSyncService();

export default settingsService;
