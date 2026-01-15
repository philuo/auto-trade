/**
 * 现货 DCA + 网格混合策略配置类型定义
 */

// =====================================================
// 基础配置
// =====================================================

export interface BaseConfig {
  strategyName: string;
  version: string;
  enabled: boolean;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}

// =====================================================
// 资金配置
// =====================================================

export interface CapitalConfig {
  totalCapital: number;          // 总资金（USDT）
  emergencyReserve: number;      // 应急储备比例 (%)
  maxCapitalPerCoin: number;     // 单币种最大资金比例 (%)
  minCapitalPerCoin: number;     // 单币种最小资金（USDT）
}

// =====================================================
// 币种配置
// =====================================================

export type AllowedCoin = 'BTC' | 'ETH' | 'BNB' | 'SOL' | 'XRP' | 'ADA' | 'DOGE';

export interface CoinsConfig {
  allowedCoins: AllowedCoin[];
  activeCoinLimit: number;       // 同时活跃的币种数量
  rebalanceInterval: number;     // 再平衡间隔（小时）
}

// =====================================================
// DCA 配置
// =====================================================

export interface DCALevel {
  priceDrop: number;             // 价格跌幅 (%)
  multiplier: number;            // 买入倍数
}

export interface ReverseDCAConfig {
  enabled: boolean;
  triggerThreshold: number;      // 触发阈值 (%)
  levels: DCALevel[];
}

export interface DCAConfig {
  enabled: boolean;
  baseOrderSize: number;         // 基础订单大小（USDT）
  frequency: number;             // DCA 频率（小时）
  maxOrders: number;             // 最大 DCA 订单数
  reverseDCA: ReverseDCAConfig;
}

// =====================================================
// 网格配置
// =====================================================

export type RangeMode = 'fixed' | 'dynamic' | 'adaptive';
export type SpacingMode = 'equal' | 'geometric';
export type RebalanceMode = 'immediate' | 'wait' | 'smart';
export type SizeType = 'fixed' | 'percentage';

export interface RangeCalculationConfig {
  mode: RangeMode;
  upperRange: number;            // 上限 (%)
  lowerRange: number;            // 下限 (%)
  adjustOnBreakout: boolean;     // 突破时调整
}

export interface GridSettingsConfig {
  gridCount: number;             // 网格数量
  spacing: SpacingMode;
  geometricRatio: number;        // 几何比例
}

export interface OrderSettingsConfig {
  size: number;                  // 订单大小（USDT）
  sizeType: SizeType;
  percentage?: number;           // 百分比大小
}

export interface GridBehaviorConfig {
  rebalanceMode: RebalanceMode;
  accumulateMode: boolean;
  takeProfit: number;            // 止盈 (%)
}

export interface GridConfig {
  enabled: boolean;
  rangeCalculation: RangeCalculationConfig;
  gridSettings: GridSettingsConfig;
  orderSettings: OrderSettingsConfig;
  behavior: GridBehaviorConfig;
}

// =====================================================
// 风险管理配置
// =====================================================

export interface TrailingStopConfig {
  enabled: boolean;
  distance: number;              // 移动距离 (%)
  activationProfit: number;      // 激活利润 (%)
}

export interface StopLossConfig {
  enabled: boolean;
  percentage: number;            // 百分比止损 (%)
  trailing: TrailingStopConfig;
}

export interface DrawdownConfig {
  warningLevel: number;          // 警告级别 (%)
  pauseLevel: number;            // 暂停级别 (%)
  emergencyLevel: number;        // 紧急级别 (%)
  recoveryLevel: number;         // 恢复级别 (%)
}

export interface PositionConfig {
  maxPositionSize: number;       // 最大仓位大小（USDT）
  maxPositionPercentage: number; // 最大仓位比例 (%)
  diversification: boolean;      // 是否分散投资
}

export interface RiskConfig {
  stopLoss: StopLossConfig;
  drawdown: DrawdownConfig;
  position: PositionConfig;
}

// =====================================================
// 动态区间配置
// =====================================================

export interface RecalculationTriggersConfig {
  priceBreakout: boolean;
  volatilityChange: boolean;
  volumeSpike: boolean;
  timeElapsed: boolean;
  trendChange: boolean;
}

export interface DynamicRangeThresholdsConfig {
  breakoutThreshold: number;     // 突破阈值 (%)
  volatilityChangeThreshold: number;  // 波动率变化阈值 (%)
  volumeSpikeMultiplier: number; // 成交量激增倍数
  maxRangeAge: number;           // 最大区间年龄（小时）
}

export interface DynamicRangeConfig {
  enabled: boolean;
  recalculationTriggers: RecalculationTriggersConfig;
  thresholds: DynamicRangeThresholdsConfig;
}

// =====================================================
// 回测配置
// =====================================================

export type OptimizationMethod = 'grid' | 'genetic' | 'bayesian';
export type OptimizationMetric = 'sharpe' | 'sortino' | 'return' | 'custom';

export interface BacktestOptimizationConfig {
  enabled: boolean;
  method: OptimizationMethod;
  iterations: number;
  metric: OptimizationMetric;
}

export interface BacktestConfig {
  enabled: boolean;
  historicalDataDays: number;
  validationDays: number;
  optimization: BacktestOptimizationConfig;
}

// =====================================================
// 完整策略配置
// =====================================================

export interface SpotDCAGridConfig {
  base: BaseConfig;
  capital: CapitalConfig;
  coins: CoinsConfig;
  dca: DCAConfig;
  grid: GridConfig;
  risk: RiskConfig;
  dynamicRange: DynamicRangeConfig;
  backtest: BacktestConfig;
}

// =====================================================
// 运行时状态
// =====================================================

export interface CoinState {
  coin: AllowedCoin;
  enabled: boolean;
  allocatedCapital: number;
  currentPrice: number;
  avgEntryPrice: number;
  totalAmount: number;
  totalValue: number;
  unrealizedPnL: number;
  lastDCA: number;
  gridState?: GridState;
}

export interface GridLine {
  price: number;
  type: 'buy' | 'sell';
  executed: boolean;
  orderId: string | null;
}

export interface GridState {
  upperPrice: number;
  lowerPrice: number;
  grids: GridLine[];
  activeOrders: Map<string, GridLine>;
}

export interface StrategyState {
  config: SpotDCAGridConfig;
  coins: Map<AllowedCoin, CoinState>;
  totalEquity: number;
  peakEquity: number;
  currentDrawdown: number;
  startTime: number;
  lastUpdateTime: number;
}

// =====================================================
// 决策类型
// =====================================================

export type DecisionAction = 'buy' | 'sell' | 'hold' | 'reduce_position' | 'close_position' | 'pause' | 'emergency';

export interface Decision {
  coin: AllowedCoin;
  action: DecisionAction;
  type: 'dca' | 'grid' | 'risk' | 'emergency';
  reason: string;
  size?: number;
  price?: number;
  orderId?: string;
  urgency: 'low' | 'medium' | 'high';
  timestamp: number;
}

// =====================================================
// 配置验证
// =====================================================

export class ConfigValidator {
  /**
   * 验证配置
   */
  static validate(config: SpotDCAGridConfig): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // 验证基础配置
    if (!config.base.strategyName) {
      errors.push('策略名称不能为空');
    }

    // 验证资金配置
    if (config.capital.totalCapital <= 0) {
      errors.push('总资金必须大于 0');
    }
    if (config.capital.emergencyReserve < 0 || config.capital.emergencyReserve > 50) {
      errors.push('应急储备比例必须在 0-50% 之间');
    }

    // 验证 DCA 配置
    if (config.dca.enabled) {
      if (config.dca.baseOrderSize <= 0) {
        errors.push('DCA 基础订单大小必须大于 0');
      }
      if (config.dca.frequency <= 0) {
        errors.push('DCA 频率必须大于 0');
      }
    }

    // 验证网格配置
    if (config.grid.enabled) {
      if (config.grid.gridSettings.gridCount < 2) {
        errors.push('网格数量必须至少为 2');
      }
      if (config.grid.rangeCalculation.upperRange <= 0 || config.grid.rangeCalculation.lowerRange <= 0) {
        errors.push('网格区间必须大于 0');
      }
    }

    // 验证风险配置
    if (config.risk.stopLoss.enabled) {
      if (config.risk.stopLoss.percentage <= 0 || config.risk.stopLoss.percentage > 100) {
        errors.push('止损百分比必须在 0-100% 之间');
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * 获取配置摘要
   */
  static getSummary(config: SpotDCAGridConfig): string {
    return `
策略配置摘要:
============
策略名称: ${config.base.strategyName} v${config.base.version}
总资金: ${config.capital.totalCapital} USDT
应急储备: ${config.capital.emergencyReserve}%

活跃币种: ${config.coins.activeCoinLimit} / ${config.coins.allowedCoins.length}

DCA 配置:
  - 状态: ${config.dca.enabled ? '启用' : '禁用'}
  - 基础订单: ${config.dca.baseOrderSize} USDT
  - 频率: 每 ${config.dca.frequency} 小时
  - 逆向 DCA: ${config.dca.reverseDCA.enabled ? '启用' : '禁用'}

网格配置:
  - 状态: ${config.grid.enabled ? '启用' : '禁用'}
  - 网格数量: ${config.grid.gridSettings.gridCount}
  - 间距模式: ${config.grid.gridSettings.spacing}
  - 每格订单: ${config.grid.orderSettings.size} USDT

风险配置:
  - 止损: ${config.risk.stopLoss.enabled ? `${config.risk.stopLoss.percentage}%` : '禁用'}
  - 回撤警告: ${config.risk.drawdown.warningLevel}%
  - 回撤暂停: ${config.risk.drawdown.pauseLevel}%
  - 回撤紧急: ${config.risk.drawdown.emergencyLevel}%
    `.trim();
  }
}
