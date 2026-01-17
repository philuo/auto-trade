/**
 * 规则引擎类型定义
 *
 * 定义现货交易的规则类型、信号类型和规则配置
 */

// =====================================================
// 规则类型枚举
// =====================================================

/**
 * 规则类型
 */
export enum RuleType {
  // DCA (定投) 规则
  DCA = 'dca',
  // 网格交易规则
  GRID = 'grid',
  // 风控规则
  RISK_CONTROL = 'risk_control',
  // 止损规则
  STOP_LOSS = 'stop_loss',
  // 止盈规则
  TAKE_PROFIT = 'take_profit',
  // 趋势跟随规则
  TREND_FOLLOW = 'trend_follow',
}

/**
 * 信号类型
 */
export enum SignalType {
  BUY = 'buy',
  SELL = 'sell',
  HOLD = 'hold',
}

/**
 * 信号强度
 */
export enum SignalStrength {
  WEAK = 'weak',       // 弱信号
  MODERATE = 'moderate', // 中等信号
  STRONG = 'strong',   // 强信号
}

// =====================================================
// 规则基础类型
// =====================================================

/**
 * 规则信号
 */
export interface RuleSignal {
  // 规则类型
  ruleType: RuleType;
  // 信号类型
  signalType: SignalType;
  // 信号强度
  strength: SignalStrength;
  // 目标币种
  coin: string;
  // 信号原因
  reason: string;
  // 建议价格
  suggestedPrice?: number;
  // 建议数量
  suggestedAmount?: number;
  // 信号时间戳
  timestamp: number;
  // 规则分数 (用于与 AI 配合)
  ruleScore: number; // -1 到 1
  // 置信度
  confidence: number; // 0 到 1
}

/**
 * 规则配置基类
 */
export interface BaseRuleConfig {
  // 是否启用
  enabled: boolean;
  // 优先级 (数字越小优先级越高)
  priority: number;
  // 最大单笔交易金额 (USDT)
  maxTradeAmount?: number;
  // 最小单笔交易金额 (USDT)
  minTradeAmount?: number;
}

// =====================================================
// DCA 规则类型
// =====================================================

/**
 * DCA 规则配置
 */
export interface DCARuleConfig extends BaseRuleConfig {
  ruleType: RuleType.DCA;
  // 目标币种列表
  coins: string[];
  // 每次定投金额 (USDT)
  investmentAmount: number;
  // 定投间隔 (小时)
  intervalHours: number;
  // 价格偏离阈值 (百分比)
  // 当前价格低于均价超过此阈值时加倍投资
  priceDeviationThreshold: number;
  // 最大倍数 (价格偏离时的倍数)
  maxMultiplier: number;
}

/**
 * DCA 状态
 */
export interface DCAState {
  // 币种
  coin: string;
  // 平均成本
  avgCost: number;
  // 累计投资金额
  totalInvested: number;
  // 累计获得数量
  totalAmount: number;
  // 上次投资时间
  lastInvestTime: number;
  // 投资次数
  investmentCount: number;
}

// =====================================================
// 网格交易规则类型
// =====================================================

/**
 * 网格交易规则配置
 */
export interface GridRuleConfig extends BaseRuleConfig {
  ruleType: RuleType.GRID;
  // 目标币种
  coin: string;
  // 网格上限价格
  upperPrice: number;
  // 网格下限价格
  lowerPrice: number;
  // 网格数量
  gridCount: number;
  // 每格投资金额 (USDT)
  investmentPerGrid: number;
}

/**
 * 网格状态
 */
export interface GridState {
  // 币种
  coin: string;
  // 当前价格
  currentPrice: number;
  // 持有的网格订单
  gridOrders: GridOrder[];
  // 已实现盈亏
  realizedPnL: number;
  // 未实现盈亏
  positionPnL: number;  // 持仓盈亏（未实现盈亏，用于区分实际盈亏）
}

/**
 * 网格订单
 */
export interface GridOrder {
  // 订单 ID
  orderId: string;
  // 订单类型 (买入/卖出)
  side: 'buy' | 'sell';
  // 价格
  price: number;
  // 数量
  amount: number;
  // 状态
  status: 'pending' | 'filled' | 'cancelled';
  // 创建时间
  createdAt: number;
}

// =====================================================
// 风控规则类型
// =====================================================

/**
 * 风控规则配置
 */
export interface RiskControlRuleConfig extends BaseRuleConfig {
  ruleType: RuleType.RISK_CONTROL;
  // 最大持仓价值 (USDT)
  maxPositionValue: number;
  // 单币种最大持仓比例 (百分比)
  maxCoinPositionRatio: number;
  // 最大回撤限制 (百分比)
  maxDrawdownRatio: number;
  // 日最大亏损限制 (USDT)
  maxDailyLoss: number;
  // 是否启用紧急止损
  enableEmergencyStop: boolean;
  // 紧急止损阈值 (百分比)
  emergencyStopThreshold: number;
}

/**
 * 风险等级
 */
export enum RiskLevel {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

/**
 * 风险评估结果
 */
export interface RiskAssessment {
  // 风险等级
  level: RiskLevel;
  // 总持仓价值
  totalPositionValue: number;
  // 可用资金
  availableBalance: number;
  // 是否触发风控
  triggered: boolean;
  // 触发的风控规则
  triggeredRules: string[];
  // 建议操作
  recommendations: string[];
}

// =====================================================
// 止损止盈规则类型
// =====================================================

/**
 * 止损配置
 */
export interface StopLossConfig {
  // 币种
  coin: string;
  // 止损类型 (百分比/绝对值)
  type: 'percentage' | 'absolute';
  // 止损阈值
  threshold: number;
  // 是否启用追踪止损
  enableTrailing: boolean;
  // 追踪止损回调百分比
  trailingPercentage?: number;
}

/**
 * 止盈配置
 */
export interface TakeProfitConfig {
  // 币种
  coin: string;
  // 止盈类型 (百分比/绝对值)
  type: 'percentage' | 'absolute';
  // 止盈阈值
  threshold: number;
  // 部分止盈比例 (可选)
  partialTakeProfitRatio?: number;
}

// =====================================================
// 趋势跟随规则类型
// =====================================================

/**
 * 趋势跟随规则配置
 */
export interface TrendFollowRuleConfig extends BaseRuleConfig {
  ruleType: RuleType.TREND_FOLLOW;
  // 目标币种
  coins: string[];
  // 趋势判断周期 (分钟)
  trendPeriod: number;
  // 趋势强度阈值
  trendStrengthThreshold: number;
  // 移动平均线周期
  maPeriod: number;
}

// =====================================================
// 市场数据类型
// =====================================================

/**
 * 价格数据 (用于规则引擎)
 */
export interface PriceData {
  // 币种
  coin: string;
  // 当前价格
  price: number;
  // 24小时变化
  change24h: number;
  // 24小时最高价
  high24h: number;
  // 24小时最低价
  low24h: number;
  // 24小时成交量
  volume24h: number;
  // 时间戳
  timestamp: number;
}

/**
 * K线数据 (用于技术分析)
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
}

/**
 * 技术指标
 */
export interface TechnicalIndicators {
  // 移动平均线
  ma: {
    ma7: number;
    ma25: number;
    ma99: number;
  };
  // RSI
  rsi: number;
  // MACD
  macd: {
    macd: number;
    signal: number;
    histogram: number;
  };
  // 布林带
  bollinger: {
    upper: number;
    middle: number;
    lower: number;
  };
}

// =====================================================
// 规则引擎输入输出
// =====================================================

/**
 * 规则引擎输入
 */
export interface RuleEngineInput {
  // 当前价格数据
  prices: PriceData[];
  // K线数据 (可选)
  candles?: Map<string, CandleData[]>;
  // 技术指标 (可选)
  indicators?: Map<string, TechnicalIndicators>;
  // 当前持仓
  positions: Array<{
    coin: string;
    amount: number;
    avgCost: number;
    positionPnL: number;  // 持仓盈亏（未实现盈亏，用于区分实际盈亏）
  }>;
  // 可用余额
  availableBalance: number;
  // 当前时间
  timestamp: number;
}

/**
 * 规则引擎输出
 */
export interface RuleEngineOutput {
  // 生成的信号列表
  signals: RuleSignal[];
  // 风险评估
  riskAssessment?: RiskAssessment;
  // 建议执行的操作
  recommendations: RuleSignal[];
  // 拒绝原因 (如果有)
  rejections: string[];
}
