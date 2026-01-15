/**
 * 现货 DCA + 网格混合策略基础数据模型
 */

import type { AllowedCoin } from './strategy-config';

// Re-export AllowedCoin for convenience
export type { AllowedCoin };

// =====================================================
// 市场数据
// =====================================================

/**
 * K 线数据
 */
export interface Candle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;              // 成交数量（以张计）
  volumeCcy?: number;          // 成交额（以币计）
  volCcyQuote?: number;        // 成交额（以USDT计）
  confirm?: boolean;           // K线是否确定（true=确定，false=未确定）
}

/**
 * 订单簿数据
 */
export interface OrderBook {
  bids: [number, number][];  // [price, size]
  asks: [number, number][];  // [price, size]
  timestamp: number;
}

/**
 * 市场行情数据
 */
export interface MarketData {
  symbol: string;
  coin: AllowedCoin;
  timestamp: number;
  price: number;
  bidPrice: number;
  askPrice: number;
  volume24h: number;
  change24h: number;
  changePercent24h: number;
  high24h: number;
  low24h: number;
}

// =====================================================
// 订单数据
// =====================================================

/**
 * 订单类型
 */
export type OrderType = 'market' | 'limit' | 'post_only' | 'fok' | 'ioc';

/**
 * 订单方向
 */
export type OrderSide = 'buy' | 'sell';

/**
 * 订单状态
 */
export type OrderStatus = 'live' | 'partially_filled' | 'filled' | 'canceled';

/**
 * 策略订单
 */
export interface StrategyOrder {
  id: string;
  clientOrderId?: string;
  symbol: string;
  side: OrderSide;
  type: OrderType;
  price: number;
  size: number;
  filledSize: number;
  avgFillPrice: number;
  status: OrderStatus;
  createdAt: number;
  updatedAt: number;
  fee: number;
  strategy: 'dca' | 'grid';
  metadata?: Record<string, unknown>;
}

/**
 * DCA 订单信息
 */
export interface DCAOrder {
  coin: AllowedCoin;
  type: 'regular_dca' | 'reverse_dca';
  size: number;              // 订单大小（USDT）
  price: number;
  reason: string;
  timestamp: number;
  level?: number;             // 逆向 DCA 层级
  multiplier?: number;        // 买入倍数
}

/**
 * 网格订单信息
 */
export interface GridOrderInfo {
  coin: AllowedCoin;
  gridIndex: number;
  price: number;
  side: OrderSide;
  size: number;
  upperPrice: number;
  lowerPrice: number;
}

// =====================================================
// 仓位数据
// =====================================================

/**
 * 币种仓位
 */
export interface CoinPosition {
  coin: AllowedCoin;
  symbol: string;              // 如 BTC-USDT
  amount: number;              // 持有数量
  avgPrice: number;            // 平均成本价
  currentPrice: number;        // 当前价格
  value: number;               // 当前价值（USDT）
  cost: number;                // 成本（USDT）
  unrealizedPnL: number;       // 未实现盈亏（USDT）
  unrealizedPnLPercent: number; // 未实现盈亏百分比
  lastUpdate: number;
}

/**
 * 账户余额
 */
export interface AccountBalance {
  ccy: string;                 // 币种
  availBal: string;            // 可用余额
  bal: string;                 // 余额
  frozenBal: string;           // 冻结余额
}

// =====================================================
// 波动率数据
// =====================================================

/**
 * 波动率分析结果
 */
export interface VolatilityAnalysis {
  coin: AllowedCoin;
  realtimeVolatility: number;  // 实时波动率（年化 %）
  historicalVolatility: number; // 历史波动率（年化 %）
  classification: 'low' | 'medium' | 'high';
  timestamp: number;
}

/**
 * 波动率得分
 */
export interface VolatilityScore {
  coin: AllowedCoin;
  score: number;               // 0-100
  volatility: number;
  rsi: number;
}

// =====================================================
// 价格区间
// =====================================================

/**
 * 价格区间
 */
export interface PriceRange {
  lower: number;
  upper: number;
  current: number;
  width: number;               // 区间宽度百分比
  volatility: number;
  confidence: number;          // 置信度 0-1
  lastUpdated: number;
  lastAdjusted?: number;
  adjustmentReason?: string;
}

/**
 * 支撑/阻力位
 */
export interface SupportResistance {
  support: number[];
  resistance: number[];
  timestamp: number;
}

// =====================================================
// 趋势分析
// =====================================================

/**
 * 趋势类型
 */
export type TrendType = 'uptrend' | 'downtrend' | 'sideways';

/**
 * 趋势分析结果
 */
export interface TrendAnalysis {
  trend: TrendType;
  strength: number;            // 0-100
  acceleration: AccelerationInfo;
  duration: number;            // 持续时间（小时）
  reliability: number;         // 可靠性 0-1
  timestamp: number;
}

/**
 * 加速度信息
 */
export interface AccelerationInfo {
  value: number;
  direction: 'accelerating' | 'decelerating';
  significance: 'low' | 'medium' | 'high';
}

// =====================================================
// 风险数据
// =====================================================

/**
 * 止损检查结果
 */
export interface StopLossCheck {
  triggered: boolean;
  type?: 'percentage' | 'trailing' | 'time_based' | 'volatility';
  urgency?: 1 | 2 | 3;         // 1=低, 2=中, 3=高
  reason?: string;
  action?: 'close_position' | 'partial_close' | 'hold';
  params?: {
    percentage?: number;
  };
}

/**
 * 回撤检查结果
 */
export interface DrawdownCheck {
  level: 0 | 1 | 2 | 3;        // 0=正常, 1=警告, 2=暂停, 3=紧急
  drawdown: number;
  action?: 'continue' | 'reduce_position_sizes' | 'pause_new_entries' | 'emergency_close_all';
  params?: Record<string, unknown>;
  message?: string;
}

/**
 * 触发检查
 */
export interface TriggerCheck {
  type: string;
  trigger: boolean;
  reason: string;
  urgency: 'low' | 'medium' | 'high';
}

// =====================================================
// 性能指标
// =====================================================

/**
 * 性能指标
 */
export interface PerformanceMetrics {
  totalReturn: number;         // 总收益率
  annualizedReturn: number;     // 年化收益率
  sharpeRatio: number;          // 夏普比率
  sortinoRatio: number;         // 索提诺比率
  maxDrawdown: number;          // 最大回撤
  winRate: number;              // 胜率
  profitFactor: number;         // 盈亏比
  totalTrades: number;          // 总交易次数
  profitableTrades: number;     // 盈利交易次数
  losingTrades: number;         // 亏损交易次数
  avgProfit: number;            // 平均盈利
  avgLoss: number;              // 平均亏损
  largestProfit: number;        // 最大盈利
  largestLoss: number;          // 最大亏损
  avgHoldingTime: number;       // 平均持仓时间（小时）
}

// =====================================================
// 交易记录
// =====================================================

/**
 * 交易记录
 */
export interface TradeRecord {
  id: string;
  coin: AllowedCoin;
  symbol: string;
  side: OrderSide;
  price: number;
  size: number;
  value: number;                // 交易价值（USDT）
  fee: number;
  strategy: 'dca' | 'grid';
  timestamp: number;
  pnl?: number;                 // 已实现盈亏
}

/**
 * 持仓历史
 */
export interface PositionHistory {
  coin: AllowedCoin;
  openTime: number;
  closeTime?: number;
  openPrice: number;
  closePrice?: number;
  amount: number;
  realizedPnL?: number;
  duration?: number;            // 持仓时长（小时）
}

// =====================================================
// 币种选择分析
// =====================================================

/**
 * 币种分析
 */
export interface CoinAnalysis {
  coin: AllowedCoin;
  volume24h: number;
  volatility: number;
  trend: TrendType;
  liquidity: number;            // 0-1
  correlation: number;          // 与 BTC 相关性 -1 到 1
  timestamp: number;
}

/**
 * 币种候选
 */
export interface CoinCandidate {
  coin: AllowedCoin;
  score: number;
  analysis: CoinAnalysis;
}

/**
 * 资金分配
 */
export interface FundAllocation {
  coin: AllowedCoin;
  amount: number;               // 分配金额（USDT）
  percentage: number;           // 分配百分比
  reason: string;
}

// =====================================================
// 回测数据
// =====================================================

/**
 * 回测结果
 */
export interface BacktestResult {
  config: unknown;
  metrics: PerformanceMetrics;
  trades: TradeRecord[];
  equityCurve: { timestamp: number; equity: number }[];
  drawdownCurve: { timestamp: number; drawdown: number }[];
  timestamp: number;
}

/**
 * 历史数据请求
 */
export interface HistoricalDataRequest {
  coin: AllowedCoin;
  startDate: Date;
  endDate: Date;
  timeframe: '1m' | '3m' | '5m' | '15m' | '30m' | '1H' | '2H' | '4H' | '6H' | '12H' | '1D';
}

/**
 * 完整市场数据
 */
export interface CompleteMarketData {
  coin: AllowedCoin;
  candles: Candle[];
  trades?: TradeRecord[];
  metadata: {
    startDate: Date;
    endDate: Date;
    dataPoints: number;
    quality: number;            // 0-1
  };
}

// =====================================================
// 响应动作
// =====================================================

/**
 * 响应动作
 */
export interface ResponseAction {
  action: string;
  reason: string;
  params?: Record<string, unknown>;
}

// =====================================================
// 价格聚类
// =====================================================

/**
 * 价格聚类
 */
export interface PriceCluster {
  center: number;
  size: number;
  prices: number[];
}

// =====================================================
// 工具函数
// =====================================================

/**
 * 格式化币种交易对
 */
export function formatSymbol(coin: AllowedCoin, quote: string = 'USDT'): string {
  return `${coin}-${quote}`;
}

/**
 * 计算盈亏百分比
 */
export function calcPnLPercent(currentPrice: number, avgPrice: number, side: 'buy' | 'sell'): number {
  if (side === 'buy') {
    return ((currentPrice - avgPrice) / avgPrice) * 100;
  } else {
    return ((avgPrice - currentPrice) / avgPrice) * 100;
  }
}

/**
 * 格式化数字
 */
export function formatNumber(num: number, decimals: number = 2): string {
  return num.toFixed(decimals);
}

/**
 * 格式化百分比
 */
export function formatPercent(value: number, decimals: number = 2): string {
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(decimals)}%`;
}
