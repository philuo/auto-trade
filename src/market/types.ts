/**
 * 市场数据模块类型定义
 *
 * 定义市场数据获取、缓存和指标计算相关的类型
 */

// =====================================================
// 导入统一类型（用于内部引用）
// =====================================================

import type {
  TradingMode,
  TradingDirection,
  OrderType,
  OrderStatus,
  TradingAction,
  SpotCoin,
  PerpetualCoin,
  SupportedCoin,
  TradingPair,
  PositionInfo,
  MarketContext,
  BaseSignal,
  TradingDecision,
  OrderInfo,
  BaseConfig,
  CapitalConfig,
  RiskConfig,
  StrategyPerformance,
  SignalStatistics,
  SignalType,
  KLineInterval,
  TechnicalSignal,
} from '../types/index';

import { SignalType as SignalTypeEnum, SignalDirection as SignalDirectionEnum } from '../types/index';

// =====================================================
// 重新导出统一类型（优先使用）
// =====================================================

export type {
  TradingMode,
  TradingDirection,
  OrderType,
  OrderStatus,
  TradingAction,
  SpotCoin,
  PerpetualCoin,
  SupportedCoin,
  TradingPair,
  PositionInfo,
  MarketContext,
  BaseSignal,
  TradingDecision,
  OrderInfo,
  BaseConfig,
  CapitalConfig,
  RiskConfig,
  StrategyPerformance,
  SignalStatistics,
  KLineInterval,
  TechnicalSignal,
} from '../types/index';

// 重新导出信号相关类型
export { SignalType, SignalDirection } from '../types/index';

// 重新导出时间周期策略类型
export * from './timeframe-strategy';

// =====================================================
// Market 模块特有类型
// =====================================================

/**
 * 验证后的信号（包含统计信息）
 */
export interface ValidatedSignal extends TechnicalSignal {
  // 明确声明继承的属性以确保类型推断正确
  /** 信号类型 */
  type: import('../types/index').SignalType;
  /** 信号强度 0-1 */
  strength: number;
  /** 信号方向 */
  direction: import('../types/index').SignalDirection;

  /** 统计信息 */
  statistics: {
    /** 总交易次数 */
    totalTrades: number;
    /** 盈利次数 */
    winningTrades: number;
    /** 胜率 */
    winRate: number;
    /** 平均盈利 */
    avgWin: number;
    /** 平均亏损 */
    avgLoss: number;
    /** 盈亏比 */
    profitFactor: number;
    /** 最大回撤 */
    maxDrawdown: number;
    /** 夏普比率 */
    sharpeRatio: number;
    /** 是否统计显著 */
    isSignificant: boolean;
    /** 最后更新时间 */
    lastUpdated: number;
  };
  /** 置信度信息 */
  confidence: {
    /** 置信度值 0-1 */
    value: number;
    /** 建议仓位比例 0-1 */
    positionSize: number;
    /** 风险等级 */
    riskLevel: 'low' | 'medium' | 'high';
    /** 止损距离（百分比，如 0.02 = 2%） */
    stopLossDistance: number;
    /** 止盈距离（百分比，如 0.03 = 3%） */
    takeProfitDistance: number;
  };
  /** 是否通过验证 */
  isValid: boolean;
  /** 验证失败原因 */
  validationErrors?: string[];
}

/**
 * 市场环境
 */
export interface MarketCondition {
  /** 趋势方向 */
  trend: 'strong_uptrend' | 'uptrend' | 'sideways' | 'downtrend' | 'strong_downtrend';
  /** 波动率水平 */
  volatility: 'low' | 'normal' | 'high' | 'extreme';
  /** 成交量水平 */
  volume: 'low' | 'normal' | 'high';
}

// =====================================================
// 市场数据类型（特有，不与统一类型冲突）
// =====================================================

// 注意：PositionInfo 已从 ../types/index 导入

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
  volumeCcy?: number;
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
 * 市场数据包（市场模块特有的完整数据结构）
 * 注意：这与 types/index.ts 中的 MarketContext 不同
 */
export interface MarketDataPackage {
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
 * [timestamp, open, high, low, close, volume, volumeCcy, confirm?]
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

/**
 * K线原始数据（从 API 直接返回）
 */
export type CandleRaw = [
  string,  // timestamp
  string,  // open
  string,  // high
  string,  // low
  string,  // close
  string,  // volume
  string,  // volCcy
  string?, // volCcyQuote (可选)
  string?, // confirm (可选)
];

/**
 * K线数字格式（所有值转为数字）
 */
export interface CandleNumber {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  volCcy: number;
  volCcyQuote?: number;
  confirm: boolean;
}

/**
 * 完整的 Ticker 数据（扩展自 OKXTicker）
 */
export interface Ticker extends OKXTicker {
  instType: string;  // 产品类型
  askSz?: string;    // 卖一量
  bidSz?: string;    // 买一量
  sodUtc0?: string;  // UTC 0 时区开盘时间
  sodUtc8?: string;  // UTC 8 时区开盘时间
  // 计算字段
  price?: number;           // 最新价格（数字格式）
  change24h?: number;       // 24h变化率（百分比）
}

/**
 * 订单簿数据
 */
export interface OrderBook {
  asks: [string, string, string, string][];  // 卖单 [price, size, orders, orders]
  bids: [string, string, string, string][];  // 买单 [price, size, orders, orders]
  ts: string;  // 时间戳
}

/**
 * 订单簿数据（含订单数）
 */
export interface OrderBookWithNum {
  asks: [string, string, string, string][];  // 卖单 [price, size, orders, orders]
  bids: [string, string, string, string][];  // 买单 [price, size, orders, orders]
  ts: string;  // 时间戳
}

/**
 * 订单簿查询参数
 */
export interface OrderBookParams {
  instId: string;  // 产品ID
  sz?: number;     // 订单簿深度（默认1）
}

/**
 * K线查询参数
 */
export interface CandlesParams {
  instId: string;  // 产品ID
  bar?: KLineInterval;  // K线周期
  after?: string;  // 请求此时间戳之前的数据
  before?: string; // 请求此时间戳之后的数据
  limit?: string;  // 返回数量（默认100，最大300）
}

/**
 * 成交数据
 */
export interface Trade {
  instId: string;  // 产品ID
  tradeId: string;  // 成交ID
  px: string;  // 成交价格
  sz: string;  // 成交数量
  side: string;  // 成交方向 buy/sell
  ts: string;  // 成交时间戳
}

/**
 * 成交查询参数
 */
export interface TradesParams {
  instId: string;  // 产品ID
  limit?: string;  // 返回数量（默认100，最大500）
}

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
