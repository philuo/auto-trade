/**
 * 统一类型定义
 *
 * 这是整个项目的类型定义中心，所有模块都应该从这里导入类型
 * 避免在不同文件中重复定义相同的类型
 */

// =====================================================
// 基础类型
// =====================================================

/**
 * 交易模式
 */
export enum TradingMode {
  SPOT = 'SPOT',           // 现货交易
  PERPETUAL = 'SWAP',      // 永续合约
  MARGIN = 'MARGIN',       // 杠杆交易（暂不支持）
}

/**
 * 交易方向
 */
export enum TradingDirection {
  LONG = 'long',           // 做多
  SHORT = 'short',         // 做空
}

/**
 * 订单类型
 */
export enum OrderType {
  LIMIT = 'limit',         // 限价单
  MARKET = 'market',       // 市价单
  POST_ONLY = 'post_only', // 只挂单
}

/**
 * 订单状态
 */
export enum OrderStatus {
  PENDING = 'pending',     // 等待中
  OPEN = 'open',           // 已开放
  FILLED = 'filled',       // 已成交
  PARTIALLY_FILLED = 'partially_filled', // 部分成交
  CANCELLED = 'cancelled', // 已取消
  REJECTED = 'rejected',   // 已拒绝
}

// =====================================================
// 交易动作类型
// =====================================================

/**
 * 统一的交易动作类型
 * 所有策略都应该使用这个类型来表示交易决策
 */
export type TradingAction =
  | 'buy'                  // 买入
  | 'sell'                 // 卖出
  | 'hold'                 // 持有（不操作）
  | 'close_position'       // 平仓
  | 'reduce_position'      // 减仓
  | 'pause'                // 暂停策略
  | 'emergency'            // 紧急停止
  | 'rebalance';           // 再平衡

/**
 * 扩展的交易动作（用于特定策略）
 */
export type ExtendedTradingAction = TradingAction | 'open_long' | 'open_short' | 'close_long' | 'close_short';

// =====================================================
// 币种类型
// =====================================================

/**
 * 现货支持的币种
 */
export type SpotCoin = 'BTC' | 'ETH' | 'BNB' | 'SOL' | 'XRP' | 'ADA' | 'DOGE';

/**
 * 合约支持的币种
 */
export type PerpetualCoin = 'BTC' | 'ETH';

/**
 * 所有支持的币种
 */
export type SupportedCoin = SpotCoin | PerpetualCoin;

/**
 * 交易对符号
 */
export type TradingPair = `${SpotCoin}-USDT` | `${PerpetualCoin}-USDT-SWAP`;

// =====================================================
// 持仓信息
// =====================================================

/**
 * 统一的持仓信息接口
 */
export interface PositionInfo {
  /** 币种 */
  coin: string;
  /** 持仓数量 */
  amount: number;
  /** 平均成本 */
  avgCost: number;
  /** 当前价值 */
  currentValue?: number;
  /** 持仓盈亏 */
  positionPnL: number;
  /** 盈亏百分比 */
  pnlPercent?: number;
  /** 持仓模式 */
  mode: TradingMode;
  /** 杠杆倍数（仅合约） */
  leverage?: number;
}

// =====================================================
// 市场数据
// =====================================================

/**
 * K线数据
 */
export interface Kline {
  /** 时间戳 */
  timestamp: number;
  /** 开盘价 */
  open: number;
  /** 最高价 */
  high: number;
  /** 最低价 */
  low: number;
  /** 收盘价 */
  close: number;
  /** 成交量 */
  volume: number;
  /** 成交额 */
  volumeCcy?: number;
}

/**
 * 行情数据
 */
export interface Ticker {
  /** 交易对 */
  instId: string;
  /** 最新价 */
  last: number;
  /** 24小时开盘价 */
  open24h: number;
  /** 24小时最高价 */
  high24h: number;
  /** 24小时最低价 */
  low24h: number;
  /** 24小时成交量 */
  volume24h: number;
  /** 24小时成交额 */
  volumeCcy24h: number;
  /** 24小时涨跌幅 */
  changePercent24h: number;
}

/**
 * 市场上下文
 * 包含所有策略需要的市场数据
 */
export interface MarketContext {
  /** 交易对 */
  symbol: string;
  /** 当前价格 */
  currentPrice: number;
  /** 行情数据 */
  ticker: Ticker;
  /** K线数据（按时间周期组织） */
  klines: Map<string, Kline[]>; // timeframe -> klines[]
  /** 技术指标（按指标名称组织） */
  indicators: Map<string, any>; // indicator_name -> value
  /** 持仓信息 */
  position?: PositionInfo;
  /** 市场状态 */
  marketState: MarketState;
}

/**
 * 市场状态
 */
export interface MarketState {
  /** 趋势 */
  trend: TrendState;
  /** 波动率 */
  volatility: VolatilityState;
  /** 趋势强度 */
  strength: StrengthState;
}

/**
 * 趋势状态
 */
export type TrendState =
  | 'strong_uptrend'
  | 'uptrend'
  | 'sideways'
  | 'downtrend'
  | 'strong_downtrend';

/**
 * 波动率状态
 */
export type VolatilityState = 'low' | 'normal' | 'high' | 'extreme';

/**
 * 趋势强度
 */
export type StrengthState = 'strong' | 'weak' | 'none';

// =====================================================
// 交易信号
// =====================================================

/**
 * 基础信号接口
 */
export interface BaseSignal {
  /** 信号ID */
  id: string;
  /** 信号类型 */
  type: string;
  /** 交易对 */
  symbol: string;
  /** 交易方向 */
  direction: TradingDirection;
  /** 信号强度 (0-1) */
  strength: number;
  /** 生成时间 */
  timestamp: number;
  /** 信号来源 */
  source: string;
}

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

/**
 * 信号方向
 */
export enum SignalDirection {
  BULLISH = 'bullish',   // 看涨
  BEARISH = 'bearish',   // 看跌
  NEUTRAL = 'neutral',   // 中性
}

/**
 * 技术信号（完整版本，用于信号生成器）
 */
export interface TechnicalSignal {
  /** 信号ID */
  id: string;
  /** 信号类型 */
  type: SignalType;
  /** 信号方向 */
  direction: SignalDirection;
  /** 币种 */
  coin: string;
  /** 时间周期 */
  timeframe: KLineInterval;
  /** 信号强度 0-1 */
  strength: number;
  /** 生成时间 */
  timestamp: number;
  /** 相关价格 */
  price?: number;
  /** 技术指标快照 */
  indicators?: {
    ma7?: number;
    ma25?: number;
    ma99?: number;
    rsi?: number;
    macd?: number;
    macdSignal?: number;
    macdHistogram?: number;
    bbUpper?: number;
    bbMiddle?: number;
    bbLower?: number;
    volume?: number;
    volumeMA?: number;
    atr?: number;
  };
}

/**
 * 信号类型枚举
 */
export enum SignalType {
  // MA 交叉信号
  MA_7_25_CROSSOVER = 'ma_7_25_crossover',
  MA_7_25_CROSSUNDER = 'ma_7_25_crossunder',
  MA_25_99_CROSSOVER = 'ma_25_99_crossover',
  MA_25_99_CROSSUNDER = 'ma_25_99_crossunder',

  // RSI 信号
  RSI_OVERSOLD = 'rsi_oversold',
  RSI_OVERBOUGHT = 'rsi_overbought',
  RSI_NEUTRAL_CROSS_UP = 'rsi_neutral_cross_up',
  RSI_NEUTRAL_CROSS_DOWN = 'rsi_neutral_cross_down',

  // MACD 信号
  MACD_BULLISH_CROSS = 'macd_bullish_cross',
  MACD_BEARISH_CROSS = 'macd_bearish_cross',

  // 布林带信号
  BB_LOWER_TOUCH = 'bb_lower_touch',
  BB_UPPER_TOUCH = 'bb_upper_touch',
  BB_BREAKOUT_UP = 'bb_breakout_up',
  BB_BREAKOUT_DOWN = 'bb_breakout_down',

  // 成交量信号
  VOLUME_SPIKE = 'volume_spike',
}

// =====================================================
// 交易决策
// =====================================================

/**
 * 统一的交易决策接口
 */
export interface TradingDecision {
  /** 决策ID */
  id: string;
  /** 交易对 */
  symbol: string;
  /** 交易动作 */
  action: TradingAction;
  /** 交易方向 */
  direction?: TradingDirection;
  /** 数量 */
  amount?: number;
  /** 价格（限价单） */
  price?: number;
  /** 置信度 (0-1) */
  confidence: number;
  /** 触发该决策的信号 */
  signals: BaseSignal[];
  /** 理由说明 */
  reason: string;
  /** 止损价格 */
  stopLoss?: number;
  /** 止盈价格 */
  takeProfit?: number;
  /** 决策时间 */
  timestamp: number;
}

// =====================================================
// 订单
// =====================================================

/**
 * 订单信息
 */
export interface OrderInfo {
  /** 订单ID */
  id: string;
  /** 客户端订单ID */
  clientOrderId?: string;
  /** 交易对 */
  symbol: string;
  /** 订单类型 */
  type: OrderType;
  /** 订单状态 */
  status: OrderStatus;
  /** 交易方向 */
  direction: TradingDirection;
  /** 价格 */
  price: number;
  /** 数量 */
  amount: number;
  /** 已成交数量 */
  filledAmount: number;
  /** 平均成交价 */
  avgFillPrice?: number;
  /** 手续费 */
  fee: number;
  /** 创建时间 */
  createdAt: number;
  /** 更新时间 */
  updatedAt: number;
}

// =====================================================
// 配置类型
// =====================================================

/**
 * 基础配置接口
 */
export interface BaseConfig {
  /** 策略名称 */
  strategyName: string;
  /** 版本号 */
  version: string;
  /** 日志级别 */
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}

/**
 * 资金配置
 */
export interface CapitalConfig {
  /** 总资金 */
  totalCapital: number;
  /** 应急储备比例 (0-1) */
  emergencyReserve: number;
  /** 单币种最大资金比例 (0-1) */
  maxCapitalPerCoin: number;
}

/**
 * 风险配置
 */
export interface RiskConfig {
  /** 最大止损比例 (0-1) */
  maxStopLoss: number;
  /** 最大回撤比例 (0-1) */
  maxDrawdown: number;
  /** 风险回报比 */
  riskRewardRatio: number;
  /** 是否启用止损 */
  stopLossEnabled: boolean;
  /** 是否启用止盈 */
  takeProfitEnabled: boolean;
}

// =====================================================
// 统计数据
// =====================================================

/**
 * 信号统计
 */
export interface SignalStatistics {
  /** 信号ID */
  signalId: string;
  /** 信号类型 */
  signalType: string;
  /** 币种 */
  coin: string;
  /** 时间周期 */
  timeframe: string;
  /** 总交易次数 */
  totalTrades: number;
  /** 获胜次数 */
  winningTrades: number;
  /** 总盈利 */
  totalWin: number;
  /** 总亏损 */
  totalLoss: number;
  /** 最大盈利 */
  maxWin: number;
  /** 最大亏损 */
  maxLoss: number;
  /** 平均持仓时间（秒） */
  avgHoldingTime: number;
  /** 盈亏比 */
  profitFactor: number;
  /** 最后更新时间 */
  lastUpdated: number;
}

/**
 * 策略绩效
 */
export interface StrategyPerformance {
  /** 总收益率 */
  totalReturn: number;
  /** 年化收益率 */
  annualizedReturn: number;
  /** 胜率 */
  winRate: number;
  /** 最大回撤 */
  maxDrawdown: number;
  /** 夏普比率 */
  sharpeRatio: number;
  /** 总交易次数 */
  totalTrades: number;
  /** 盈亏比 */
  profitFactor: number;
}

// =====================================================
// 错误类型
// =====================================================

/**
 * 应用错误基类
 */
export class AppError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: any
  ) {
    super(message);
    this.name = 'AppError';
  }
}

/**
 * API 错误
 */
export class ApiError extends AppError {
  constructor(message: string, code: string, details?: any) {
    super(message, code, details);
    this.name = 'ApiError';
  }
}

/**
 * 配置错误
 */
export class ConfigError extends AppError {
  constructor(message: string, details?: any) {
    super(message, 'CONFIG_ERROR', details);
    this.name = 'ConfigError';
  }
}

/**
 * 风险控制错误
 */
export class RiskControlError extends AppError {
  constructor(message: string, details?: any) {
    super(message, 'RISK_CONTROL_ERROR', details);
    this.name = 'RiskControlError';
  }
}
