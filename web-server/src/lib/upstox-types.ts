export interface UpstoxSessionResponse {
  access_token: string;
  email?: string;
  name?: string;
  user_id?: string;
  user_type?: string;
  broker?: string;
  exchanges?: string[];
  products?: string[];
  extended_token?: string;
}

export interface UpstoxProfile {
  email?: string;
  name?: string;
  user_id?: string;
  user_type?: string;
  broker?: string;
  exchanges?: string[];
  products?: string[];
}

export interface UpstoxFundsLimit {
  used_margin?: number | string;
  payin_amount?: number | string;
  span_margin?: number | string;
  adhoc_margin?: number | string;
  notional_cash?: number | string;
  available_margin?: number | string;
  exposure_margin?: number | string;
  option_premium?: number | string;
  collateral_amount?: number | string;
  coverage_margin?: number | string;
  liquidity_before?: number | string;
  cash_deposit?: number | string;
  liquid_collateral?: number | string;
  stock_collateral?: number | string;
  unrealized_mtm?: number | string;
  realized_mtm?: number | string;
  opening_balance?: number | string;
  payin_amount_t1?: number | string;
  payin_amount_t0?: number | string;
  additional_leverage_amount?: number | string;
  utilized_amount?: number | string;
  available_credits?: number | string;
  unrealised_pnl?: number | string;
}

export interface UpstoxFunds {
  segment?: string;
  equity?: UpstoxFundsLimit;
  commodity?: UpstoxFundsLimit;
  totalMarginBalance?: string | number;
  availableBalance?: string | number;
  totalInitialMargin?: string | number;
  totalUnrealizedProfit?: string | number;
}

export interface UpstoxPosition {
  symbol?: string;
  tradingsymbol?: string;
  tradingSymbol?: string;
  instrument_token?: string;
  instrumentToken?: string;
  quantity?: number;
  netQty?: number;
  net_qty?: number;
  netQuantity?: number;
  net_quantity?: number;
  averagePrice?: number;
  average_price?: number;
  avgPrice?: number;
  avg_price?: number;
  lastPrice?: number;
  last_price?: number;
  ltp?: number;
  lastTradedPrice?: number;
  last_traded_price?: number;
  pnl?: number;
  mtm?: number;
  realizedPnl?: number;
  unrealized?: number;
  pnlPercentage?: number;
  pnl_percentage?: number;
  id?: string;
  exchange?: string;
  product?: string;
  productType?: string;
  product_type?: string;
  timestamp?: string;
  lastTradeTime?: string;
  last_trade_time?: string;
}

export interface UpstoxHolding {
  isin?: string;
  company_name?: string;
  quantity?: number;
  collateral_quantity?: number;
  haircut?: number;
  average_price?: number;
  last_price?: number;
  close_price?: number;
  pnl?: number;
  trading_symbol?: string;
  exchange?: string;
  [key: string]: any;
}

export interface UpstoxOrder {
  order_id: string;
  status: string;
  symbol: string;
  transaction_type: string;
  order_type: string;
  quantity: number;
  price: number;
  trigger_price?: number;
  average_price?: number;
  pending_quantity?: number;
  filled_quantity?: number;
  order_timestamp?: string;
  exchange?: string;
  product?: string;
  [key: string]: any;
}

export interface UpstoxQuote {
  ohlc?: {
    open?: number;
    high?: number;
    low?: number;
    close?: number;
  };
  depth?: {
    buy?: Array<{ quantity?: number; price?: number; orders?: number }>;
    sell?: Array<{ quantity?: number; price?: number; orders?: number }>;
  };
  timestamp?: string;
  instrument_token?: string;
  last_price?: number;
  volume?: number;
  average_price?: number;
  oi?: number;
  oi_day_high?: number;
  oi_day_low?: number;
  [key: string]: any;
}

export interface UpstoxLTP {
  last_price: number;
  instrument_token?: string;
}

export interface UpstoxOHLC {
  ohlc: {
    open: number;
    high: number;
    low: number;
    close: number;
  };
  last_price: number;
  instrument_token?: string;
}

export type UpstoxCandle = [
  string, // timestamp
  number | string, // open
  number | string, // high
  number | string, // low
  number | string, // close
  number | string, // volume
  number | string  // open interest
];

export interface UpstoxPlaceOrderParams {
  quantity: number;
  product: string;
  validity: string;
  price: number;
  tag?: string;
  instrument_token: string;
  order_type: string;
  transaction_type: string;
  disclosed_quantity?: number;
  trigger_price?: number;
  is_amo?: boolean;
  [key: string]: any;
}

export interface UpstoxModifyOrderParams {
  quantity?: number;
  price?: number;
  order_type?: string;
  trigger_price?: number;
  validity?: string;
  disclosed_quantity?: number;
  [key: string]: any;
}

export interface UpstoxConvertPositionParams {
  instrument_token: string;
  transaction_type: string;
  quantity: number;
  product_from: string;
  product_to: string;
  [key: string]: any;
}
