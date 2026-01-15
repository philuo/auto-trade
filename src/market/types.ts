/**
 * 市场数据模块类型定义
 *
 * 定义市场数据获取、缓存和指标计算相关的类型
 */

// =====================================================
// K线周期类型
// =====================================================

/**
 * K线周期
 */
export type KLineInterval =
  | '1m'   // 1分钟
  | '3m'   // 3分钟
  | '5m'   // 5分钟
  | '15m'  // 15分钟
  | '30m'  // 30分钟
  | '1H'   // 1小时
  | '2H'   // 2小时
  | '4H'   // 4小时
  | '6H'   // 6小时
  | '12H'  // 12小时
  | '1D'   // 1天
  | '1W'   // 1周
  | '1M';  // 1月

// =====================================================
// 市场数据类型
// =====================================================

/**
 * 价格数据
 */
export interface PriceData {
  // 币种
  coin: string;
  // 当前价格
  price: number;
  // 24小时变化百分比
  change24h: number;
  // 24小时最高价
  high24h: number;
  // 24小时最低价
  low24h: number;
  // 24小时成交量（基础币）
  volume24h: number;
  // 24小时成交额（计价币，USDT）
  volumeCcy24h: number;
  // 时间戳
  timestamp: number;
}

/**
 * K线数据
 */
export interface CandleData {
  // 时间戳
  timestamp: number;
  // 开盘价
  open: number;
  // 最高价
  high: number;
  // 最低价
  low: number;
  // 收盘价
  close: number;
  // 成交量
  volume: number;
  // 成交额
  volumeCcy: number;
}

/**
 * 技术指标
 */
export interface TechnicalIndicators {
  // 移动平均线
  ma: {
    ma7: number;   // 7周期均线
    ma25: number;  // 25周期均线
    ma99: number;  // 99周期均线
  };
  // 相对强弱指标
  rsi: number;
  // MACD
  macd: {
    macd: number;       // MACD线
    signal: number;     // 信号线
    histogram: number;  // 柱状图
  };
  // 布林带
  bollinger: {
    upper: number;      // 上轨
    middle: number;     // 中轨
    lower: number;      // 下轨
  };
}

/**
 * 市场上下文
 */
export interface MarketContext {
  // 实时价格
  prices: Map<string, PriceData>;
  // K线数据
  klines: Map<string, CandleData[]>;
  // 技术指标
  indicators: Map<string, TechnicalIndicators>;
  // 市场是否正常
  isMarketNormal: boolean;
  // 时间戳
  timestamp: number;
}

/**
 * 市场上下文选项
 */
export interface MarketContextOptions {
  // 是否包含K线数据
  includeKLines?: boolean;
  // K线周期
  klineInterval?: KLineInterval;
  // K线数量
  klineLimit?: number;
  // 是否包含技术指标
  includeIndicators?: boolean;
}

// =====================================================
// 缓存类型
// =====================================================

/**
 * 缓存条目
 */
export interface CacheEntry<T> {
  // 数据
  data: T;
  // 过期时间
  expireAt: number;
  // 创建时间
  createdAt: number;
  // 最后访问时间
  lastAccessAt: number;
}

/**
 * 缓存统计
 */
export interface CacheStats {
  // 命中次数
  hits: number;
  // 未命中次数
  misses: number;
  // 命中率
  hitRate: number;
  // 条目数量
  size: number;
  // 总字节数（估算）
  totalBytes: number;
}

// =====================================================
// 配置类型
// =====================================================

/**
 * 市场数据配置
 */
export interface MarketDataConfig {
  // OKX API 配置
  okx: {
    // API 基础 URL
    baseURL: string;
    // API Key
    apiKey?: string;
    // Secret Key
    secretKey?: string;
    // Passphrase
    passphrase?: string;
    // 请求超时（毫秒）
    timeout: number;
    // 最大重试次数
    maxRetries: number;
    // 重试延迟（毫秒）
    retryDelay: number;
  };

  // 缓存配置
  cache: {
    // 价格缓存 TTL（毫秒）
    priceTTL: number;
    // K线缓存 TTL（毫秒）
    klineTTL: number;
    // 指标缓存 TTL（毫秒）
    indicatorTTL: number;
    // 最大缓存条目数
    maxEntries: number;
  };

  // 更新频率配置（毫秒）
  updateInterval: {
    // 价格更新间隔
    price: number;
    // K线更新间隔（根据周期自动计算）
    kline: Record<KLineInterval, number>;
  };
}

// =====================================================
// OKX API 类型
// =====================================================

/**
 * OKX API 响应基础结构
 */
export interface OKXResponse<T> {
  code: string;
  msg: string;
  data: T;
}

/**
 * OKX Ticker 数据
 */
export interface OKXTicker {
  instId: string;      // 交易对
  last: string;        // 最新成交价
  lastSz: string;      // 最新成交量
  askPx: string;       // 卖一价
  bidPx: string;       // 买一价
  open24h: string;     // 24小时开盘价
  high24h: string;     // 24小时最高价
  low24h: string;      // 24小时最低价
  vol24h: string;      // 24小时成交量
  volCcy24h: string;   // 24小时成交额
  ts: string;          // 数据时间戳
}

/**
 * OKX K线数据（数组格式）
 * [timestamp, open, high, low, close, volume, volumeCcy]
 */
export type OKXKLineData = [
  string,  // timestamp
  string,  // open
  string,  // high
  string,  // low
  string,  // close
  string,  // volume
  string,  // volumeCcy
  string?, // confirm (可选)
];

// =====================================================
// 错误类型
// =====================================================

/**
 * 市场数据错误
 */
export class MarketDataError extends Error {
  constructor(
    message: string,
    public code?: string,
    public details?: unknown
  ) {
    super(message);
    this.name = 'MarketDataError';
  }
}

/**
 * API 请求错误
 */
export class APIRequestError extends MarketDataError {
  constructor(
    message: string,
    public statusCode: number,
    details?: unknown
  ) {
    super(message, 'API_REQUEST_ERROR', details);
    this.name = 'APIRequestError';
  }
}

/**
 * 数据解析错误
 */
export class DataParseError extends MarketDataError {
  constructor(
    message: string,
    public rawData: unknown
  ) {
    super(message, 'DATA_PARSE_ERROR', rawData);
    this.name = 'DataParseError';
  }
}

/**
 * 缓存错误
 */
export class CacheError extends MarketDataError {
  constructor(message: string, details?: unknown) {
    super(message, 'CACHE_ERROR', details);
    this.name = 'CacheError';
  }
}
