/**
 * 风险控制模块
 *
 * 提供交易频率控制、操作日志、策略状态管理、交易约束验证等功能
 */

export { TradingFrequencyController, TradingFrequencyMode, FREQUENCY_CONFIGS, type TradingFrequencyConfig } from './trading-frequency.js';
export { TradeReasonLogger, type TradeReason } from './trade-logger.js';
export {
  StrategyStateManager,
  StrategyState,
  type Position,
  type Decision,
  type StrategyStateManagerConfig,
} from './strategy-state.js';

export {
  TradingConstraintsValidator,
  TradingMode,
  WHITELIST_CONFIG,
  LEVERAGE_CONFIG,
  DEFAULT_STOP_CONFIG,
  type ConstraintCheckResult,
  type TradeParams,
  type AllowedSpotCoin,
  type AllowedPerpetualCoin,
} from './trading-constraints.js';
