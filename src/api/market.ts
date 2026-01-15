/**
 * OKX Market API 接口
 *
 * 功能：
 * - 获取单个产品行情
 * - 获取所有产品行情
 * - 获取产品 K 线数据
 * - 获取产品深度数据
 * - 获取交易数据
 * - 获取 24 小时总成交量
 */

import { RestClient } from './rest.js';
import { OkxAuth } from '../core/auth.js';
import type { OkxAuth as OkxAuthType } from '../core/auth.js';
import type { BarSize } from '../core/constants.js';

// =====================================================
// 行情数据
// =====================================================

/**
 * 产品行情
 */
export interface Ticker {
  instType: string;             // 产品类型
  instId: string;               // 产品ID
  last: string;                 // 最新成交价
  lastSz: string;               // 最新成交的数量
  askPx: string;                // 最新卖一价（卖方挂单价）
  bidPx: string;                // 最新买一价（买方挂单价）
  askSz?: string;               // 最新卖一量（卖方数量）
  bidSz?: string;               // 最新买一量（买方数量）
  open24h: string;              // 24小时开盘价
  high24h: string;              // 24小时最高价
  low24h: string;               // 24小时最低价
  volCcy24h: string;            // 24小时成交量，以成交货币计算
  vol24h: string;               // 24小时成交量，以张计算
  sodUtc0: string;              // 0点时的价格
  sodUtc8: string;              // UTC+8 时区0点时的价格
  ts: string;                   // 数据产生时间
}

// =====================================================
// K 线数据
// =====================================================

/**
 * K 线原始数据（OKX API 返回的字符串数组格式）
 * 格式: [timestamp, open, high, low, close, volume, volCcy, volCcyQuote, confirm]
 */
export type CandleRaw = [
  string,  // timestamp (毫秒)
  string,  // open
  string,  // high
  string,  // low
  string,  // close
  string,  // volume (成交数量，以张计)
  string,  // volCcy (成交额，以币计)
  string,  // volCcyQuote (成交额，以USDT计)
  string   // confirm (K线是否确定，0未确定，1确定)
];

/**
 * K 线数据对象格式（便于使用）
 */
export interface Candle {
  timestamp: string;            // 时间戳（毫秒）
  open: string;                 // 开盘价格
  high: string;                 // 最高价格
  low: string;                  // 最低价格
  close: string;                // 收盘价格
  volume: string;               // 交易量
  volCcy: string;               // 交易额，以币计
  volCcyQuote: string;          // 交易额，以USDT计
  confirm: string;              // K线是否确定
}

/**
 * K线数据对象格式（数字类型）
 */
export interface CandleNumber {
  timestamp: number;            // 时间戳（毫秒）
  open: number;                 // 开盘价格
  high: number;                 // 最高价格
  low: number;                  // 最低价格
  close: number;                // 收盘价格
  volume: number;               // 交易量
  volCcy: number;               // 交易额，以币计
  volCcyQuote: number;          // 交易额，以USDT计
  confirm: boolean;             // K线是否确定
}

/**
 * K线请求参数
 */
export interface CandlesParams {
  instId: string;               // 产品ID
  bar: BarSize;                 // 时间粒度
  after?: string;               // 请求此时间戳之前的内容
  before?: string;              // 请求此时间戳之后的内容
  limit?: string;               // 返回结果的数量
}

// =====================================================
// 深度数据
// =====================================================

/**
 * 深度数据（订单簿）
 */
export interface OrderBook {
  asks: [string, string, string, string][];     // 卖方深度 [价格, 数量, 深度, 订单数]
  bids: [string, string, string, string][];     // 买方深度 [价格, 数量, 深度, 订单数]
  ts: string;                   // 数据产生时间
}

/**
 * 深度数据（带订单数）
 */
export interface OrderBookWithNum {
  asks: [string, string, string, string][]; // 卖方深度 [价格, 数量, 深度, 订单数]
  bids: [string, string, string, string][]; // 买方深度 [价格, 数量, 深度, 订单数]
  ts: string;                   // 数据产生时间
}

/**
 * 深度数据请求参数
 */
export interface OrderBookParams {
  instId: string;               // 产品ID
  sz?: string;                  // 深度数量，最大值可传400，默认1
}

// =====================================================
// 交易数据
// =====================================================

/**
 * 交易数据（近期成交）
 */
export interface Trade {
  instId: string;               // 产品ID
  tradeId: string;              // 成交ID
  px: string;                   // 成交价格
  sz: string;                   // 成交数量
  side: 'buy' | 'sell';         // 订单方向
  ts: string;                   // 成交时间
}

/**
 * 交易数据请求参数
 */
export interface TradesParams {
  instId: string;               // 产品ID
  limit?: string;               // 返回结果的数量，最大500，默认100
}

// =====================================================
// 24小时总成交量
// =====================================================

/**
 * 24小时总成交量
 */
export interface Volume {
  volCcy: string;               // 以币计的24小时成交量
  volUsd: string;               // 以USDT计的24小时成交量
}

// =====================================================
// 支持和阻力位数据
// =====================================================

/**
 * 支撑和阻力位
 */
export interface SupportResistanceLevel {
  level: number;
  type: 'support' | 'resistance';
  strength: number;             // 0-1
}

// =====================================================
// 市场 API 客户端
// =====================================================

export class MarketApi {
  private client: RestClient;
  private auth: OkxAuthType | null;

  constructor(auth?: OkxAuthType, isDemo = true, proxy?: string) {
    this.auth = auth || null;
    // Create a dummy auth instance if none provided
    // Public endpoints don't require authentication
    const authInstance = auth || new OkxAuth({
      apiKey: '',
      secretKey: '',
      passphrase: ''
    });
    this.client = new RestClient(authInstance, isDemo, proxy);
  }

  /**
   * 获取所有产品行情
   * @param instType 产品类型 SPOT/SWAP/FUTURES/OPTION
   * @param instId 产品ID
   */
  async getTickers(instType?: string, instId?: string): Promise<Ticker[]> {
    const params: Record<string, string> = {};
    if (instType) params.instType = instType;
    if (instId) params.instId = instId;
    return this.client.get<Ticker[]>('/market/tickers', params);
  }

  /**
   * 获取单个产品行情
   * @param instId 产品ID
   */
  async getTicker(instId: string): Promise<Ticker[]> {
    return this.client.get<Ticker[]>('/market/ticker', { instId });
  }

  /**
   * 获取当前最优挂单
   * @param instId 产品ID
   */
  async getBestBidAsk(instId: string): Promise<{ bidPrice: number; askPrice: number; bidSize: number; askSize: number } | null> {
    const ticker = await this.getTicker(instId);
    if (ticker.length === 0) return null;

    const t = ticker[0];
    if (!t) return null;
    return {
      bidPrice: parseFloat(t.bidPx),
      askPrice: parseFloat(t.askPx),
      bidSize: parseFloat(t.bidSz || '0'),
      askSize: parseFloat(t.askSz || '0')
    };
  }

  /**
   * 获取产品 K 线数据
   * @param params K线请求参数
   * @note OKX API 返回的是字符串数组格式，使用 parseCandles 转换为对象
   */
  async getCandles(params: CandlesParams): Promise<CandleRaw[]> {
    const requestParams: Record<string, string | number | boolean> = {
      instId: params.instId,
      bar: params.bar
    };
    if (params.after) requestParams.after = params.after;
    if (params.before) requestParams.before = params.before;
    if (params.limit) requestParams.limit = params.limit;
    return this.client.get<CandleRaw[]>('/market/candles', requestParams);
  }

  /**
   * 获取最新的 N 条 K 线数据
   * @param instId 产品ID
   * @param bar 时间粒度
   * @param limit 数量
   */
  async getLatestCandles(instId: string, bar: BarSize = '1H', limit = 100): Promise<CandleNumber[]> {
    const raw = await this.getCandles({ instId, bar, limit: limit.toString() });
    const candles = raw.map(parseCandle);
    return candles.map(candleToNumberFormat);
  }

  /**
   * 获取 K 线数据（指定时间范围）
   * @param instId 产品ID
   * @param bar 时间粒度
   * @param after 获取此时间戳之前的数据
   */
  async getCandlesBefore(instId: string, bar: BarSize, after: string): Promise<CandleNumber[]> {
    const raw = await this.getCandles({ instId, bar, after });
    const candles = raw.map(parseCandle);
    return candles.map(candleToNumberFormat);
  }

  /**
   * 获取 K 线数据（指定时间范围）
   * @param instId 产品ID
   * @param bar 时间粒度
   * @param before 获取此时间戳之后的数据
   */
  async getCandlesAfter(instId: string, bar: BarSize, before: string): Promise<CandleNumber[]> {
    const raw = await this.getCandles({ instId, bar, before });
    const candles = raw.map(parseCandle);
    return candles.map(candleToNumberFormat);
  }

  /**
   * 获取产品深度数据
   * @param params 深度数据请求参数
   */
  async getOrderBook(params: OrderBookParams): Promise<OrderBook> {
    const requestParams: Record<string, string | number | boolean> = {
      instId: params.instId
    };
    if (params.sz) requestParams.sz = params.sz;
    const result = await this.client.get<OrderBook[]>('/market/books', requestParams);
    return result[0];
  }

  /**
   * 获取深度快照书籍数据
   * @param instId 产品ID
   * @param sz 深度数量
   */
  async getOrderBookSnapshot(instId: string, sz = 1): Promise<OrderBookWithNum> {
    const result = await this.client.get<OrderBookWithNum[]>('/market/books', { instId, sz: sz.toString() });
    return result[0];
  }

  /**
   * 获取深度数据（含订单数）
   * @param instId 产品ID
   * @param sz 深度数量
   */
  async getOrderBookWithOrders(instId: string, sz = 25): Promise<OrderBookWithNum> {
    const result = await this.client.get<OrderBookWithNum[]>('/market/books', { instId, sz: sz.toString() });
    return result[0];
  }

  /**
   * 获取所有交易产品的公共频道成交数据
   * @param params 交易数据请求参数
   */
  async getTrades(params: TradesParams): Promise<Trade[]> {
    const requestParams: Record<string, string | number | boolean> = {
      instId: params.instId
    };
    if (params.limit) requestParams.limit = params.limit;
    return this.client.get<Trade[]>('/market/trades', requestParams);
  }

  /**
   * 获取最新成交记录
   * @param instId 产品ID
   * @param limit 数量
   */
  async getLatestTrades(instId: string, limit = 100): Promise<Trade[]> {
    return this.getTrades({ instId, limit: limit.toString() });
  }

  /**
   * 获取 24 小时总成交量
   */
  async getVolume(): Promise<Volume> {
    const result = await this.getTickers();
    // Volume API 返回的是 tickers，我们需要计算总成交量
    const totalVolCcy = result.reduce((sum, t) => sum + parseFloat(t.volCcy24h || '0'), 0);
    const totalVolUsd = result.reduce((sum, t) => sum + parseFloat(t.volCcy24h || '0') * parseFloat(t.last || '0'), 0);

    return {
      volCcy: totalVolCcy.toString(),
      volUsd: totalVolUsd.toString()
    };
  }

  /**
   * 获取数据倒计时（即将到期的交割/行权合约）
   */
  async getDeliveryExerciseHistory(): Promise<{ instId: string; type: string; ts: string }[]> {
    return this.client.get('/api/v5/market/open-interest', {});
  }

  /**
   * 获取持仓总量
   * @param instType 产品类型
   * @param instId 产品ID
   */
  async getOpenInterest(instType?: string, instId?: string): Promise<{ instId: string; openInt: string; ts: string }[]> {
    const params: Record<string, string> = {};
    if (instType) params.instType = instType;
    if (instId) params.instId = instId;
    return this.client.get('/api/v5/market/open-interest', params);
  }

  /**
   * 计算价格变动
   * @param instId 产品ID
   */
  async getPriceChange(instId: string): Promise<{
    price: number;
    change24h: number;
    changePercent24h: number;
    high24h: number;
    low24h: number;
  } | null> {
    const ticker = await this.getTicker(instId);
    if (ticker.length === 0) return null;

    const t = ticker[0];
    if (!t) return null;

    const price = parseFloat(t.last);
    const open24h = parseFloat(t.open24h);
    const change24h = price - open24h;
    const changePercent24h = (change24h / open24h) * 100;

    return {
      price,
      change24h,
      changePercent24h,
      high24h: parseFloat(t.high24h),
      low24h: parseFloat(t.low24h)
    };
  }

  /**
   * 计算平均价格（基于订单簿）
   * @param instId 产品ID
   * @param side 买/卖
   * @param amount 数量
   */
  async getAveragePrice(instId: string, side: 'buy' | 'sell', amount: number): Promise<number | null> {
    const orderBook = await this.getOrderBookWithOrders(instId, 25);
    const orders = side === 'buy' ? orderBook.asks : orderBook.bids;

    if (orders.length === 0) return null;

    let remaining = amount;
    let totalCost = 0;

    for (const order of orders) {
      const size = parseFloat(order[1]);
      const price = parseFloat(order[0]);

      if (remaining <= 0) break;

      const take = Math.min(remaining, size);
      totalCost += take * price;
      remaining -= take;
    }

    if (remaining > 0) {
      // 订单簿深度不足
      return null;
    }

    return totalCost / amount;
  }

  /**
   * 分析支撑和阻力位
   * @param instId 产品ID
   * @param bar 时间粒度
   * @param lookback 回看 K 线数量
   */
  async analyzeSupportResistance(instId: string, bar: BarSize = '1H', lookback = 100): Promise<SupportResistanceLevel[]> {
    const candles = await this.getLatestCandles(instId, bar, lookback);
    if (candles.length === 0) return [];

    const levels: SupportResistanceLevel[] = [];
    const highs = candles.map(c => c.high);
    const lows = candles.map(c => c.low);

    // 找出局部高点和低点
    for (let i = 2; i < candles.length - 2; i++) {
      const currentHigh = highs[i];
      const currentLow = lows[i];

      // 检查是否为局部高点（阻力位）
      if (currentHigh !== undefined && highs[i - 1] !== undefined && highs[i - 2] !== undefined &&
          highs[i + 1] !== undefined && highs[i + 2] !== undefined &&
          currentHigh > highs[i - 1] && currentHigh > highs[i - 2] &&
          currentHigh > highs[i + 1] && currentHigh > highs[i + 2]) {
        // 计算强度（基于相对高度）
        const minLow = Math.min(
          lows[i - 2] ?? 0,
          lows[i - 1] ?? 0,
          lows[i] ?? 0,
          lows[i + 1] ?? 0,
          lows[i + 2] ?? 0
        );
        const strength = (currentHigh - minLow) / currentHigh;
        levels.push({ level: currentHigh, type: 'resistance', strength });
      }

      // 检查是否为局部低点（支撑位）
      if (currentLow !== undefined && lows[i - 1] !== undefined && lows[i - 2] !== undefined &&
          lows[i + 1] !== undefined && lows[i + 2] !== undefined &&
          currentLow < lows[i - 1] && currentLow < lows[i - 2] &&
          currentLow < lows[i + 1] && currentLow < lows[i + 2]) {
        // 计算强度（基于相对深度）
        const maxHigh = Math.max(
          highs[i - 2] ?? 0,
          highs[i - 1] ?? 0,
          highs[i] ?? 0,
          highs[i + 1] ?? 0,
          highs[i + 2] ?? 0
        );
        const strength = (maxHigh - currentLow) / maxHigh;
        levels.push({ level: currentLow, type: 'support', strength });
      }
    }

    // 按强度排序
    return levels.sort((a, b) => b.strength - a.strength);
  }

  /**
   * 计算波动率
   * @param instId 产品ID
   * @param bar 时间粒度
   * @param lookback 回看 K 线数量
   */
  async calculateVolatility(instId: string, bar: BarSize = '1H', lookback = 24): Promise<number | null> {
    const candles = await this.getLatestCandles(instId, bar, lookback);
    if (candles.length < 2) return null;

    const closes = candles.map(c => c.close);

    // 计算对数收益率
    const returns: number[] = [];
    for (let i = 1; i < closes.length; i++) {
      const prev = closes[i - 1];
      const curr = closes[i];
      if (prev > 0) {
        const ret = Math.log(curr / prev);
        returns.push(ret);
      }
    }

    if (returns.length === 0) return null;

    // 计算标准差
    const mean = returns.reduce((sum, r) => sum + r, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length;
    const stdDev = Math.sqrt(variance);

    // 年化波动率（假设 365 天）
    const periodsPerYear = bar.includes('H') ? 24 * 365 : (bar.includes('D') ? 365 : 365 * 24 * 60);
    const annualizedVolatility = stdDev * Math.sqrt(periodsPerYear) * 100;

    return annualizedVolatility;
  }
}

// =====================================================
// 工具函数
// =====================================================

/**
 * 创建市场数据 API 客户端实例
 */
export function createMarketApi(auth?: OkxAuth, isDemo = true, proxy?: string): MarketApi {
  return new MarketApi(auth, isDemo, proxy);
}

/**
 * 格式化 K 线数据
 */
export function formatCandle(candle: Candle): {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  volCcy: number;
  volCcyQuote: number;
  confirmed: boolean;
} {
  return {
    timestamp: parseInt(candle.timestamp),
    open: parseFloat(candle.open),
    high: parseFloat(candle.high),
    low: parseFloat(candle.low),
    close: parseFloat(candle.close),
    volume: parseFloat(candle.volume),
    volCcy: parseFloat(candle.volCcy || '0'),
    volCcyQuote: parseFloat(candle.volCcyQuote || '0'),
    confirmed: candle.confirm === '1'
  };
}

/**
 * 计算价格变化百分比
 */
export function calculateChangePercent(current: number, previous: number): number {
  if (previous === 0) return 0;
  return ((current - previous) / previous) * 100;
}

/**
 * 找出 K 线中的最高价和最低价
 */
export function findHighLow(candles: Candle[]): {
  high: number;
  low: number;
  highIndex: number;
  lowIndex: number;
} {
  if (candles.length === 0) {
    return { high: 0, low: 0, highIndex: -1, lowIndex: -1 };
  }

  let high = parseFloat(candles[0].high);
  let low = parseFloat(candles[0].low);
  let highIndex = 0;
  let lowIndex = 0;

  for (let i = 1; i < candles.length; i++) {
    const h = parseFloat(candles[i].high);
    const l = parseFloat(candles[i].low);

    if (h > high) {
      high = h;
      highIndex = i;
    }
    if (l < low) {
      low = l;
      lowIndex = i;
    }
  }

  return { high, low, highIndex, lowIndex };
}

/**
 * 计算简单移动平均
 */
export function calculateSMA(candles: Candle[], period: number): number[] {
  const closes = candles.map(c => parseFloat(c.close));
  const sma: number[] = [];

  for (let i = period - 1; i < closes.length; i++) {
    const sum = closes.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);
    sma.push(sum / period);
  }

  return sma;
}

/**
 * 计算指数移动平均
 */
export function calculateEMA(candles: Candle[], period: number): number[] {
  const closes = candles.map(c => parseFloat(c.close));
  const multiplier = 2 / (period + 1);
  const ema: number[] = [];

  if (closes.length === 0) return ema;

  // 初始化 EMA 为第一个价格
  ema[0] = closes[0];

  for (let i = 1; i < closes.length; i++) {
    ema[i] = (closes[i] - (ema[i - 1] ?? 0)) * multiplier + (ema[i - 1] ?? 0);
  }

  return ema;
}

/**
 * 计算 RSI
 */
export function calculateRSI(candles: Candle[], period = 14): number[] {
  const closes = candles.map(c => parseFloat(c.close));
  const rsi: number[] = [];

  if (closes.length < period + 1) return rsi;

  // 计算价格变化
  const changes: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    const prev = closes[i - 1];
    const curr = closes[i];
    changes.push(curr - prev);
  }

  // 初始平均涨跌幅
  let gains = 0;
  let losses = 0;

  for (let i = 0; i < period; i++) {
    const change = changes[i] ?? 0;
    if (change > 0) {
      gains += change;
    } else {
      losses += Math.abs(change);
    }
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;

  // 计算 RSI
  for (let i = period; i < changes.length; i++) {
    const change = changes[i] ?? 0;
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? Math.abs(change) : 0;

    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;

    if (avgLoss === 0) {
      rsi.push(100);
    } else {
      const rs = avgGain / avgLoss;
      rsi.push(100 - (100 / (1 + rs)));
    }
  }

  return rsi;
}

/**
 * 计算布林带
 */
export function calculateBollingerBands(candles: Candle[], period = 20, stdDevMultiplier = 2): {
  middle: number[];
  upper: number[];
  lower: number[];
} {
  const closes = candles.map(c => parseFloat(c.close));
  const sma = calculateSMA(candles, period);
  const upper: number[] = [];
  const lower: number[] = [];

  for (let i = period - 1; i < closes.length; i++) {
    const slice = closes.slice(i - period + 1, i + 1);
    const mean = sma[i - period + 1] ?? 0;

    // 计算标准差
    const variance = slice.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / period;
    const stdDev = Math.sqrt(variance);

    upper.push(mean + stdDevMultiplier * stdDev);
    lower.push(mean - stdDevMultiplier * stdDev);
  }

  return { middle: sma, upper, lower };
}

/**
 * 识别趋势
 */
export function identifyTrend(candles: Candle[]): {
  trend: 'uptrend' | 'downtrend' | 'sideways';
  strength: number;
} {
  if (candles.length < 3) {
    return { trend: 'sideways', strength: 0 };
  }

  const closes = candles.map(c => ({ close: parseFloat(c.close), high: parseFloat(c.high), low: parseFloat(c.low) }));

  // 计算简单线性回归斜率
  const n = closes.length;
  const sumX = (n * (n - 1)) / 2;
  const sumY = closes.reduce((sum, c) => sum + c.close, 0);
  const sumXY = closes.reduce((sum, c, i) => sum + i * c.close, 0);
  const sumX2 = (n * (n - 1) * (2 * n - 1)) / 6;

  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const avgPrice = sumY / n;

  // 计算趋势强度
  const maxHigh = Math.max(...closes.map(c => c.high));
  const minLow = Math.min(...closes.map(c => c.low));
  const priceRange = maxHigh - minLow;
  const strength = priceRange > 0 ? Math.abs(slope) * n / avgPrice : 0;

  // 判断趋势方向
  let trend: 'uptrend' | 'downtrend' | 'sideways';
  if (slope > avgPrice * 0.0001) {
    trend = 'uptrend';
  } else if (slope < -avgPrice * 0.0001) {
    trend = 'downtrend';
  } else {
    trend = 'sideways';
  }

  return { trend, strength };
}

// =====================================================
// 数据转换工具函数
// =====================================================

/**
 * 将 OKX 原始 K 线数组转换为 Candle 对象
 * OKX API 返回格式: [timestamp, open, high, low, close, volume, volCcy, volCcyQuote, confirm]
 */
export function parseCandle(raw: CandleRaw): Candle {
  return {
    timestamp: raw[0],
    open: raw[1],
    high: raw[2],
    low: raw[3],
    close: raw[4],
    volume: raw[5],
    volCcy: raw[6],
    volCcyQuote: raw[7],
    confirm: raw[8]
  };
}

/**
 * 批量转换 K 线数组
 */
export function parseCandles(raw: CandleRaw[]): Candle[] {
  return raw.map(parseCandle);
}

/**
 * 将 Candle 对象转换为策略模块使用的数字格式
 */
export function candleToNumberFormat(candle: Candle): {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  volCcy: number;
  volCcyQuote: number;
  confirm: boolean;
} {
  return {
    timestamp: parseInt(candle.timestamp, 10),
    open: parseFloat(candle.open),
    high: parseFloat(candle.high),
    low: parseFloat(candle.low),
    close: parseFloat(candle.close),
    volume: parseFloat(candle.volume),
    volCcy: parseFloat(candle.volCcy),
    volCcyQuote: parseFloat(candle.volCcyQuote),
    confirm: candle.confirm === '1'
  };
}

/**
 * 将 Ticker 转换为策略模块使用的 MarketData 格式
 */
export function tickerToMarketData(ticker: Ticker, coin: string): {
  coin: string;
  price: number;
  bidPrice: number;
  askPrice: number;
  volume24h: number;
  change24h: number;
  high24h: number;
  low24h: number;
  timestamp: number;
} {
  const last = parseFloat(ticker.last);
  const open24h = parseFloat(ticker.open24h);

  return {
    coin,
    price: last,
    bidPrice: parseFloat(ticker.bidPx || '0'),
    askPrice: parseFloat(ticker.askPx || '0'),
    volume24h: parseFloat(ticker.volCcy24h || '0'),
    change24h: ((last - open24h) / open24h) * 100,
    high24h: parseFloat(ticker.high24h),
    low24h: parseFloat(ticker.low24h),
    timestamp: parseInt(ticker.ts, 10)
  };
}

/**
 * 格式化订单价格（number -> string）
 * OKX API 要求订单参数中的数字都传字符串
 */
export function formatOrderPrice(price: number, decimals: number = 2): string {
  return price.toFixed(decimals);
}

/**
 * 格式化订单数量（number -> string）
 * OKX API 要求订单参数中的数字都传字符串
 */
export function formatOrderSize(size: number, decimals: number = 8): string {
  return size.toFixed(decimals);
}

/**
 * 安全解析数字（string -> number）
 */
export function safeParseNumber(value: string | number | undefined | null): number {
  if (value === undefined || value === null || value === '') {
    return 0;
  }
  return typeof value === 'string' ? parseFloat(value) : value;
}
