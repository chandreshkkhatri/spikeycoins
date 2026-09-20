# Market Watch scan filters

The screener supports two optional thresholds:

- **Minimum 24h volume (USD)** uses the existing quote-volume metric, regardless
  of whether the selected price-change period is 24h or 7d.
- **Minimum 24h/7d move (%)** selects moves at least this large in absolute
  value. A value of 5 includes both +5% and -5%. The Gainers/Losers direction
  filter still applies when selected.

Thresholds are inclusive and combine with pair search and direction. Missing
or non-finite measurements cannot satisfy an active threshold. Blank or zero
means unrestricted; negative and malformed URL values are ignored.

The URL stores these as `minVolume` and `minChange`, alongside the scan's
period, search, sorting, and page. Reload and Terminal return preserve them.
Editing thresholds resets pagination. **Clear thresholds** retains the other
scan settings; **Clear filters** in the no-results state clears all filters.

Example: `/market-watch/screener?timeframe=7d&direction=losers&minVolume=1000000&minChange=5`
shows instruments with at least $1 million in 24h volume and a 7d loss of
at least 5%.
