import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import api from "@/lib/api";
import { AxiosRequestConfig } from "axios";
import { TradingAccount, AccountError } from "./account-card-types";

// Shape of the standard API envelope these card endpoints return
interface CardApiResponse {
  success?: boolean;
  error?: string;
  [key: string]: unknown;
}

// Narrowed shape of an axios-style error used for classification
interface AccountFetchError {
  response?: {
    status?: number;
    data?: {
      requiresReauth?: boolean;
      suggestion?: string;
      error?: string;
      details?: string;
      [key: string]: unknown;
    };
  };
  message?: string;
}

// Global promise cache to deduplicate simultaneous fetches
const PROMISE_CACHE = new Map<string, Promise<{ data?: CardApiResponse }>>();

export interface UseAccountCardDataOptions<T> {
  endpoint: string;
  accounts: TradingAccount[];
  selectedAccountId?: string;
  extractItems: (responseData: CardApiResponse, account: TradingAccount) => T[];
  buildRequestUrl?: (account: TradingAccount) => string;
  requestConfig?: AxiosRequestConfig;
  classifyError?: (
    axiosError: AccountFetchError,
    account: TradingAccount
  ) => AccountError | null;
  dedupeInFlight?: boolean;
}

export function useAccountCardData<T>({
  endpoint,
  accounts = [],
  selectedAccountId,
  extractItems,
  buildRequestUrl,
  requestConfig,
  classifyError,
  dedupeInFlight = false,
}: UseAccountCardDataOptions<T>) {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accountErrors, setAccountErrors] = useState<AccountError[]>([]);
  const [refreshing, setRefreshing] = useState<string | null>(null);

  // Store options in a ref to prevent infinite re-render loops from inline function props
  const handlersRef = useRef({
    extractItems,
    buildRequestUrl,
    requestConfig,
    classifyError,
  });

  // Keep handlers up to date on every render
  useEffect(() => {
    handlersRef.current = {
      extractItems,
      buildRequestUrl,
      requestConfig,
      classifyError,
    };
  });

  // Filter accounts to show - if selectedAccountId is provided, show only that account
  const accountsToShow = useMemo(
    () =>
      selectedAccountId
        ? accounts.filter((acc) => acc._id === selectedAccountId)
        : accounts,
    [accounts, selectedAccountId]
  );

  const fetchForAccount = useCallback(
    async (account: TradingAccount, isRefresh = false) => {
      if (isRefresh) {
        setRefreshing(account._id);
      }

      try {
        const {
          buildRequestUrl: currentBuildRequestUrl,
          requestConfig: currentRequestConfig,
          extractItems: currentExtractItems,
        } = handlersRef.current;

        const url = currentBuildRequestUrl
          ? currentBuildRequestUrl(account)
          : `${endpoint}?vendor=${account.accountType}&accountId=${account._id}`;

        const config = currentRequestConfig || {};

        let response: { data?: CardApiResponse } | undefined;

        if (dedupeInFlight) {
          const cacheKey = `${account._id}-${isRefresh}`;
          // If refreshing, bypass cache. Otherwise check cache.
          let promise = !isRefresh ? PROMISE_CACHE.get(cacheKey) : undefined;

          if (!promise) {
            promise = (async () => {
              try {
                return (await api.get(url, config)) as {
                  data?: CardApiResponse;
                };
              } finally {
                // Clear cache after 2 seconds to allow subsequent fetches
                setTimeout(() => {
                  PROMISE_CACHE.delete(cacheKey);
                }, 2000);
              }
            })();

            if (!isRefresh) {
              PROMISE_CACHE.set(cacheKey, promise);
            }
          }
          response = await promise;
        } else {
          response = (await api.get(url, config)) as { data?: CardApiResponse };
        }

        if (response?.data?.success) {
          const items = currentExtractItems(response.data, account);

          setData((prev) => {
            // Filter out old items for this account
            const filtered = prev.filter(
              (item) =>
                item &&
                (item as { accountId?: string }).accountId !== account._id
            );
            return [...filtered, ...items];
          });

          // Clear any previous errors for this account
          setAccountErrors((prev) =>
            prev.filter((e) => e.accountId !== account._id)
          );
          setError(null);
        } else {
          throw new Error(response?.data?.error || "Failed to fetch data");
        }
      } catch (err) {
        const fetchError = err as AccountFetchError;
        const { classifyError: currentClassifyError } = handlersRef.current;
        const classified = currentClassifyError
          ? currentClassifyError(fetchError, account)
          : null;

        if (classified) {
          setAccountErrors((prev) => {
            const filtered = prev.filter((e) => e.accountId !== account._id);
            return [...filtered, classified];
          });
        } else if (fetchError.response?.status === 401) {
          const responseData = fetchError.response?.data;
          setAccountErrors((prev) => {
            const filtered = prev.filter((e) => e.accountId !== account._id);
            return [
              ...filtered,
              {
                accountId: account._id,
                accountName: account.accountName,
                requiresReauth: responseData?.requiresReauth ?? true,
                message:
                  responseData?.error ||
                  "Authentication failed. Please re-authenticate your account.",
              },
            ];
          });
        } else {
          const responseData = fetchError.response?.data;
          const errorMessage =
            responseData?.suggestion ||
            responseData?.error ||
            responseData?.details ||
            fetchError.message ||
            "Failed to fetch data";
          setError(`${account.accountName}: ${errorMessage}`);
        }
      } finally {
        if (isRefresh) {
          setRefreshing(null);
        }
      }
    },
    [endpoint, dedupeInFlight]
  );

  const refetchAll = useCallback(async () => {
    if (accountsToShow.length === 0) return;

    setLoading(true);
    setError(null);
    setAccountErrors([]);
    setData([]);

    try {
      await Promise.allSettled(
        accountsToShow.map((account) => fetchForAccount(account))
      );
    } finally {
      setLoading(false);
    }
  }, [accountsToShow, fetchForAccount]);

  const refresh = useCallback(
    async (account: TradingAccount) => {
      await fetchForAccount(account, true);
    },
    [fetchForAccount]
  );

  // Trigger refetch when the set of accounts to show changes. Keyed off the
  // stringified account ids so a fresh-but-equivalent `accounts` array
  // reference does not cause an extra refetch.
  const accountsKey = JSON.stringify(accountsToShow.map((a) => a._id));
  useEffect(() => {
    if (accountsKey !== "[]") {
      refetchAll();
    } else {
      setData([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountsKey]);

  return {
    data,
    loading,
    error,
    accountErrors,
    refreshing,
    refresh,
    refetchAll,
  };
}
