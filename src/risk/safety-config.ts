/**
 * 高频交易安全策略配置
 *
 * 完整的安全策略定义，包括：
 * - 信号过滤阈值
 * - 风险限制参数
 * - 止盈止损计算
 * - 仓位管理规则
 */

// =====================================================
// 策略类型定义
// =====================================================

/**
 * 风险等级
 */
export enum RiskLevel {
  CONSERVATIVE = 'conservative',  // 保守型
  MODERATE = 'moderate',        // 平衡型
  AGGRESSIVE = 'aggressive',    // 激进型
}

/**
 * 信号质量等级
 */
export enum SignalQuality {
  POOR = 'poor',          // 差：不建议交易
  FAIR = 'fair',          // 一般：谨慎交易
  GOOD = 'good',          // 良好：正常交易
  EXCELLENT = 'excellent', // 优秀：满仓交易
}

// =====================================================
// 信号过滤策略
// =====================================================

/**
 * 信号过滤配置
 */
export interface SignalFilterConfig {
  // 最小信号强度 (0-1)
  minStrength: number;

  // 最小信号置信度 (0-1)
  minConfidence: number;

  // 启用 ADX 趋势过滤
  enableADXFilter: boolean;

  // 最小 ADX 值 (0-100)
  minADX: number;

  // 启用价格确认
  enablePriceConfirmation: boolean;

  // 价格确认 K线数量 (1-5)
  priceConfirmationBars: number;

  // 启用成交量确认
  enableVolumeConfirmation: boolean;

  // 最小成交量倍数 (当前成交量 / 平均成交量)
  minVolumeRatio: number;

  // 启用微观结构指标
  enableMicrostructure: boolean;

  // 微观结构指标最小综合强度 (0-100)
  minMicrostructureStrength: number;
}

/**
 * 默认信号过滤配置
 */
export const DEFAULT_SIGNAL_FILTER_CONFIG: SignalFilterConfig = {
  minStrength: 0.5,           // 50% 强度
  minConfidence: 0.5,         // 50% 置信度
  enableADXFilter: true,
  minADX: 20,                 // 趋势强度阈值
  enablePriceConfirmation: true,
  priceConfirmationBars: 2,   // 2根 K线确认
  enableVolumeConfirmation: true,
  minVolumeRatio: 1.2,        // 成交量需大于平均 1.2 倍
  enableMicrostructure: true,
  minMicrostructureStrength: 50, // 微观结构综合强度 50 分
};

// =====================================================
// 风险限制配置
// =====================================================

/**
 * 风险限制配置
 */
export interface RiskLimitsConfig {
  // 最大持仓数量
  maxPositions: number;

  // 最大风险敞口（占总资金的百分比）
  maxExposure: number;

  // 单笔最大仓位（占总资金的百分比）
  maxPositionSize: number;

  // 连续亏损限制
  consecutiveLossLimit: number;

  // 每日最大亏损限制（占总资金的百分比）
  dailyLossLimit: number;

  // 最大回撤限制（占总资金的百分比）
  maxDrawdownLimit: number;

  // 最大允许滑点（百分比）
  maxSlippage: number;

  // 最小流动性要求（USDT）
  minLiquidity: number;

  // API 超时限制（毫秒）
  maxApiLatency: number;

  // WebSocket 连接超时限制（毫秒）
  maxWebSocketLatency: number;
}

/**
 * 默认风险限制配置
 */
export const DEFAULT_RISK_LIMITS_CONFIG: RiskLimitsConfig = {
  maxPositions: 3,           // 最多 3 个持仓
  maxExposure: 30,           // 最大风险敞口 30%
  maxPositionSize: 10,       // 单笔最大仓位 10%
  consecutiveLossLimit: 3,   // 连续 3 次亏损后暂停
  dailyLossLimit: 5,         // 每日最大亏损 5%
  maxDrawdownLimit: 15,      // 最大回撤 15%
  maxSlippage: 0.05,         // 最大滑点 0.05%
  minLiquidity: 50000,       // 最小流动性 50000 USDT
  maxApiLatency: 500,        // API 超时 500ms
  maxWebSocketLatency: 3000,  // WebSocket 超时 3 秒
};

/**
 * 按风险等级的预设配置
 */
export const RISK_PRESETS: Record<RiskLevel, Partial<RiskLimitsConfig>> = {
  [RiskLevel.CONSERVATIVE]: {
    maxPositions: 2,
    maxExposure: 20,
    maxPositionSize: 5,
    consecutiveLossLimit: 2,
    dailyLossLimit: 3,
    maxDrawdownLimit: 10,
  },
  [RiskLevel.MODERATE]: {
    maxPositions: 3,
    maxExposure: 30,
    maxPositionSize: 10,
    consecutiveLossLimit: 3,
    dailyLossLimit: 5,
    maxDrawdownLimit: 15,
  },
  [RiskLevel.AGGRESSIVE]: {
    maxPositions: 5,
    maxExposure: 50,
    maxPositionSize: 15,
    consecutiveLossLimit: 5,
    dailyLossLimit: 8,
    maxDrawdownLimit: 20,
  },
};

// =====================================================
// 止盈止损配置
// =====================================================

/**
 * 止盈止损计算方式
 */
export enum StopLossType {
  FIXED = 'fixed',           // 固定百分比
  ATR_BASED = 'atr_based',   // 基于 ATR 动态计算
  VOLATILITY = 'volatility',  // 基于波动率
}

/**
 * 止盈止损配置
 */
export interface StopLossConfig {
  // 计算方式
  type: StopLossType;

  // 固定百分比模式
  fixedPercent?: {
    stopLoss: number;      // 止损百分比 (如 0.002 = 0.2%)
    takeProfit: number;    // 止盈百分比 (如 0.003 = 0.3%)
  };

  // ATR 模式
  atrMultiplier?: {
    stopLoss: number;      // 止损 ATR 倍数 (如 1.5)
    takeProfit: number;    // 止盈 ATR 倍数 (如 3.0)
  };

  // 波动率模式
  volatilityAdjust?: {
    lowVolatility: number;    // 低波动率时的倍数
    normalVolatility: number; // 正常波动率时的倍数
    highVolatility: number;   // 高波动率时的倍数
  };

  // 追踪止损
  trailingStop?: {
    enabled: boolean;        // 是否启用
    activationPercent: number; // 激活阈值 (如 0.002 = 0.2%)
    distancePercent: number;   // 追踪距离 (如 0.0015 = 0.15%)
  };
}

/**
 * 默认止盈止损配置（高频交易）
 */
export const DEFAULT_STOP_LOSS_CONFIG: StopLossConfig = {
  type: StopLossType.FIXED,
  fixedPercent: {
    stopLoss: 0.002,      // 0.2% 止损
    takeProfit: 0.003,    // 0.3% 止盈
  },
  trailingStop: {
    enabled: true,
    activationPercent: 0.002,  // 盈利 0.2% 后激活追踪止损
    distancePercent: 0.0015,   // 距离当前价格 0.15%
  },
};

// =====================================================
// 持仓时间限制
// =====================================================

/**
 * 各时间周期对应的最大持仓时间
 */
export const MAX_HOLDING_TIME: Record<string, number> = {
  '1m': 60 * 1000,        // 1 分钟
  '3m': 3 * 60 * 1000,     // 3 分钟
  '5m': 5 * 60 * 1000,     // 5 分钟
  '15m': 15 * 60 * 1000,   // 15 分钟
  '30m': 30 * 60 * 1000,   // 30 分钟
  '1H': 60 * 60 * 1000,    // 1 小时
  '2H': 2 * 60 * 60 * 1000,
  '4H': 4 * 60 * 60 * 1000,
  '6H': 6 * 60 * 60 * 1000,
  '12H': 12 * 60 * 60 * 1000,
  '1D': 24 * 60 * 60 * 1000,
  '1W': 7 * 24 * 60 * 60 * 1000,
  '1M': 30 * 24 * 60 * 60 * 1000,
};

// =====================================================
// 仓位管理策略
// =====================================================

/**
 * 仓位大小计算策略
 */
export interface PositionSizingStrategy {
  // 基础仓位（占总资金百分比）
  basePositionSize: number;

  // 信号强度调整
  strengthAdjustment: {
    lowStrength: number;      // 低强度 (< 0.5) 的仓位倍数
    normalStrength: number;   // 正常强度 (0.5-0.7) 的仓位倍数
    highStrength: number;     // 高强度 (> 0.7) 的仓位倍数
  };

  // 信号置信度调整
  confidenceAdjustment: {
    lowConfidence: number;    // 低置信度的仓位倍数
    normalConfidence: number; // 正常置信度的仓位倍数
    highConfidence: number;   // 高置信度的仓位倍数
  };

  // 连续结果调整
  streakAdjustment: {
    consecutiveWins: number;     // 连续盈利的仓位倍数
    consecutiveLosses: number;   // 连续亏损的仓位倍数
  };

  // 市场条件调整
  marketConditionAdjustment: {
    highVolatility: number;  // 高波动率的仓位倍数
    lowVolatility: number;   // 低波动率的仓位倍数
  };
}

/**
 * 默认仓位管理策略
 */
export const DEFAULT_POSITION_SIZING: PositionSizingStrategy = {
  basePositionSize: 0.05,    // 基础 5% 仓位

  strengthAdjustment: {
    lowStrength: 0.5,        // 低强度减半
    normalStrength: 1.0,     // 正常强度不变
    highStrength: 1.5,       // 高强度增加 50%
  },

  confidenceAdjustment: {
    lowConfidence: 0.7,     // 低置信度降至 70%
    normalConfidence: 1.0,   // 正常置信度不变
    highConfidence: 1.2,     // 高置信度增加 20%
  },

  streakAdjustment: {
    consecutiveWins: 1.1,    // 连续盈利增加 10%
    consecutiveLosses: 0.5,  // 连续亏损减半
  },

  marketConditionAdjustment: {
    highVolatility: 0.5,    // 高波动率减半
    lowVolatility: 1.2,      // 低波动率增加 20%
  },
};

// =====================================================
// 市场状态评估
// =====================================================

/**
 * 市场状态
 */
export interface MarketState {
  // 趋势方向
  trend: 'strong_uptrend' | 'uptrend' | 'sideways' | 'downtrend' | 'strong_downtrend';

  // 波动率水平
  volatility: 'low' | 'normal' | 'high' | 'extreme';

  // 动量强度
  momentum: 'strong' | 'weak' | 'neutral';

  // 流动性
  liquidity: 'sufficient' | 'tight' | 'dry';

  // 综合评分 (0-100)
  score: number;

  // 可交易性等级
  tradeability: SignalQuality;
}

/**
 * 市场状态评估配置
 */
export interface MarketStateConfig {
  // 趋势判断
  trend: {
    strongUptrendThreshold: number;  // 强上升趋势阈值
    strongDowntrendThreshold: number; // 强下降趋势阈值
  };

  // 波动率判断
  volatility: {
    lowThreshold: number;    // 低波动率阈值
    highThreshold: number;   // 高波动率阈值
    extremeThreshold: number; // 极端波动率阈值
  };

  // 综合评分权重
  scoreWeights: {
    trend: number;      // 趋势权重
    volatility: number; // 波动率权重
    momentum: number;  // 动量权重
    liquidity: number;  // 流动性权重
  };
}

/**
 * 默认市场状态评估配置
 */
export const DEFAULT_MARKET_STATE_CONFIG: MarketStateConfig = {
  trend: {
    strongUptrendThreshold: 2,   // 24h 涨幅 > 2%
    strongDowntrendThreshold: -2, // 24h 跌幅 > -2%
  },

  volatility: {
    lowThreshold: 0.5,      // ATR < 0.5%
    highThreshold: 1.5,     // ATR > 1.5%
    extremeThreshold: 3.0,   // ATR > 3.0%
  },

  scoreWeights: {
    trend: 30,       // 趋势权重 30%
    volatility: 25,  // 波动率权重 25%
    momentum: 25,   // 动量权重 25%
    liquidity: 20,   // 流动性权重 20%
  },
};

// =====================================================
// 可交易性评估标准
// =====================================================

/**
 * 根据市场状态评分判断可交易性
 */
export function evaluateTradeability(
  marketState: MarketState
): SignalQuality {
  const score = marketState.score;

  if (marketState.volatility === 'extreme' || marketState.liquidity === 'dry') {
    return SignalQuality.POOR;
  }

  if (score >= 80) {
    return SignalQuality.EXCELLENT;
  } else if (score >= 65) {
    return SignalQuality.GOOD;
  } else if (score >= 50) {
    return SignalQuality.FAIR;
  } else {
    return SignalQuality.POOR;
  }
}

/**
 * 根据可交易性等级获取仓位调整倍数
 */
export function getPositionSizeMultiplier(tradeability: SignalQuality): number {
  switch (tradeability) {
    case SignalQuality.EXCELLENT:
      return 1.2;  // 满仓交易
    case SignalQuality.GOOD:
      return 1.0;  // 正常仓位
    case SignalQuality.FAIR:
      return 0.5;  // 减半仓位
    case SignalQuality.POOR:
      return 0;    // 不交易
  }
}

// =====================================================
// 导出完整的安全策略配置
// =====================================================

/**
 * 完整的安全策略配置
 */
export interface SafetyPolicyConfig {
  // 风险等级
  riskLevel: RiskLevel;

  // 信号过滤
  signalFilter: SignalFilterConfig;

  // 风险限制
  riskLimits: RiskLimitsConfig;

  // 止盈止损
  stopLoss: StopLossConfig;

  // 仓位管理
  positionSizing: PositionSizingStrategy;

  // 市场状态评估
  marketState: MarketStateConfig;
}

/**
 * 默认完整安全策略配置（平衡型）
 */
export const DEFAULT_SAFETY_POLICY: SafetyPolicyConfig = {
  riskLevel: RiskLevel.MODERATE,
  signalFilter: DEFAULT_SIGNAL_FILTER_CONFIG,
  riskLimits: { ...DEFAULT_RISK_LIMITS_CONFIG, ...RISK_PRESETS[RiskLevel.MODERATE] },
  stopLoss: DEFAULT_STOP_LOSS_CONFIG,
  positionSizing: DEFAULT_POSITION_SIZING,
  marketState: DEFAULT_MARKET_STATE_CONFIG,
};

/**
 * 保守型安全策略配置
 */
export const CONSERVATIVE_SAFETY_POLICY: SafetyPolicyConfig = {
  riskLevel: RiskLevel.CONSERVATIVE,
  signalFilter: {
    ...DEFAULT_SIGNAL_FILTER_CONFIG,
    minStrength: 0.6,        // 更高的信号强度要求
    minConfidence: 0.6,
    minADX: 25,
  },
  riskLimits: {
    ...DEFAULT_RISK_LIMITS_CONFIG,
    ...RISK_PRESETS[RiskLevel.CONSERVATIVE],
  },
  stopLoss: {
    ...DEFAULT_STOP_LOSS_CONFIG,
    fixedPercent: {
      stopLoss: 0.0015,   // 更小的止损 0.15%
      takeProfit: 0.0025, // 更小的止盈 0.25%
    },
  },
  positionSizing: {
    ...DEFAULT_POSITION_SIZING,
    basePositionSize: 0.03,   // 更小的基础仓位 3%
  },
  marketState: DEFAULT_MARKET_STATE_CONFIG,
};

/**
 * 激进型安全策略配置
 */
export const AGGRESSIVE_SAFETY_POLICY: SafetyPolicyConfig = {
  riskLevel: RiskLevel.AGGRESSIVE,
  signalFilter: {
    ...DEFAULT_SIGNAL_FILTER_CONFIG,
    minStrength: 0.4,        // 更低的信号强度要求
    minConfidence: 0.4,
    minADX: 15,
  },
  riskLimits: {
    ...DEFAULT_RISK_LIMITS_CONFIG,
    ...RISK_PRESETS[RiskLevel.AGGRESSIVE],
  },
  stopLoss: {
    ...DEFAULT_STOP_LOSS_CONFIG,
    fixedPercent: {
      stopLoss: 0.0025,   // 更大的止损 0.25%
      takeProfit: 0.004,   // 更大的止盈 0.4%
    },
  },
  positionSizing: {
    ...DEFAULT_POSITION_SIZING,
    basePositionSize: 0.08,   // 更大的基础仓位 8%
  },
  marketState: DEFAULT_MARKET_STATE_CONFIG,
};
