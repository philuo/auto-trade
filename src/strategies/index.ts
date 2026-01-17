/**
 * 策略模块统一导出
 *
 * 高频合约量化交易策略
 */

// =====================================================
// 基础设施
// =====================================================

// 策略引擎基类
export {
  BaseStrategyEngine,
  StrategyState,
  type BaseStrategyConfig,
} from './base/strategy-engine;

// 公共工具
export { TrendAnalyzer } from './common/trend-analyzer;
export { RiskManager } from './common/risk-manager;

// =====================================================
// 合约策略
// =====================================================

// Neutral Grid 策略（中性网格）
export {
  StrategyEngine as NeutralGridStrategyEngine,
  NeutralGridEngine,
  FundingRateManager,
  // 配置预设
  DEFAULT_NEUTRAL_GRID_CONFIG,
  CONSERVATIVE_NEUTRAL_GRID_CONFIG,
  AGGRESSIVE_NEUTRAL_GRID_CONFIG,
  getNeutralGridConfig,
  NEUTRAL_GRID_PRESETS,
} from './neutral-grid/index;

export type {
  // Neutral Grid 配置类型
  NeutralGridConfig,
  SwapAllowedCoin,
  NeutralGridState,
  CoinGridState,
  GridOrder,
  SwapMarketData,
  NeutralGridDecision,
  FeeCalculation,
  PerformanceMetrics,
  NeutralGridPreset,
  // 基础配置类型
  BaseConfig,
  CapitalConfig as NeutralGridCapitalConfig,
  CoinsConfig as NeutralGridCoinsConfig,
  NeutralGridConfigOptions,
  RiskConfig as NeutralGridRiskConfig,
  FundingRateConfig,
} from './neutral-grid/index;

// =====================================================
// 动态策略
// =====================================================

export {
  AdaptiveStrategyExecutor,
  MarketConditionAnalyzer,
  DYNAMIC_LEVERAGE_CONFIG,
} from './adaptive-dynamic/adaptive-strategy;

export type {
  MarketCondition,
} from './adaptive-dynamic/adaptive-strategy;

// =====================================================
// 安全策略配置
// =====================================================

// Safe Neutral Grid (保守配置)
export {
  DEFAULT_SAFE_CONFIG,
  ULTRA_SAFE_CONFIG,
  SAFETY_RECOMMENDATIONS,
} from './neutral-safe/index;

export type {
  SafeNeutralGridConfig
} from './neutral-safe/index;
