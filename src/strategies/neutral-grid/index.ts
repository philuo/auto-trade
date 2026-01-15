/**
 * 中性合约网格策略模块导出
 */

// 核心引擎
export { NeutralGridStrategyEngine as StrategyEngine } from './core/engine.js';
export { NeutralGridEngine } from './core/neutral-grid-engine.js';
export { FundingRateManager } from './core/funding-manager.js';

// 配置
export {
  DEFAULT_NEUTRAL_GRID_CONFIG,
  CONSERVATIVE_NEUTRAL_GRID_CONFIG,
  AGGRESSIVE_NEUTRAL_GRID_CONFIG,
  getNeutralGridConfig,
  NEUTRAL_GRID_PRESETS,
  type NeutralGridPreset
} from './config/default-params.js';

// 类型
export type {
  NeutralGridConfig,
  SwapAllowedCoin,
  NeutralGridState,
  CoinGridState,
  GridOrder,
  SwapMarketData,
  NeutralGridDecision,
  FeeCalculation,
  PerformanceMetrics,
  BaseConfig,
  CapitalConfig,
  CoinsConfig,
  NeutralGridConfigOptions,
  RiskConfig,
  FundingRateConfig
} from './config/types.js';
