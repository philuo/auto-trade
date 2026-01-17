/**
 * 策略模块统一导出
 *
 * 提供所有策略和基础设施的统一访问入口
 */

// =====================================================
// 基础设施
// =====================================================

// 策略引擎基类
export {
  BaseStrategyEngine,
  StrategyState,
  type BaseStrategyConfig,
} from './base/strategy-engine.js';

// 策略管理器
export { StrategyManager } from './manager/strategy-manager.js';

// 公共工具
export { TrendAnalyzer } from './common/trend-analyzer.js';
export { RiskManager } from './common/risk-manager.js';

// =====================================================
// 现货策略
// =====================================================

// Spot DCA-Grid 策略
export {
  // 核心
  StrategyEngine as SpotDCAGridStrategyEngine,
  DCAEngine,
  GridEngine,
  Coordinator,
  // 订单管理
  OrderGenerator,
  OrderTracker,
  // 风险管理
  StopLossManager,
  DrawdownController,
  PositionController,
  // 工具
  VolatilityCalculator,
  RangeCalculator,
  DataAdapter,
  // 配置
  DEFAULT_CONFIG as SPOT_DCA_GRID_DEFAULT_CONFIG,
  // 运行器
  StrategyRunner,
} from './spot-dca-grid/index.js';

export type {
  // Spot DCA-Grid 配置类型
  SpotDCAGridConfig,
  AllowedCoin,
  DCAConfig,
  GridConfig,
  RiskConfig,
  CapitalConfig,
  CoinsConfig,
  Decision,
  // Spot DCA-Grid 数据类型
  Candle,
  MarketData,
  CoinPosition,
  PriceRange,
  StrategyOrder,
  OrderSide,
  OrderStatus,
  OrderType,
} from './spot-dca-grid/index.js';

// =====================================================
// 合约策略
// =====================================================

// Neutral Grid 策略
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
} from './neutral-grid/index.js';

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
} from './neutral-grid/index.js';

// =====================================================
// 动态策略
// =====================================================

export {
  AdaptiveStrategyExecutor,
  MarketConditionAnalyzer,
  DYNAMIC_LEVERAGE_CONFIG,
} from './adaptive-dynamic/adaptive-strategy.js';

export type {
  MarketCondition,
} from './adaptive-dynamic/adaptive-strategy.js';

// =====================================================
// 安全策略配置
// =====================================================

// Safe Neutral Grid (保守配置)
export {
  DEFAULT_SAFE_CONFIG,
  ULTRA_SAFE_CONFIG,
  SAFETY_RECOMMENDATIONS,
} from './neutral-safe/index.js';

export type {
  SafeNeutralGridConfig
} from './neutral-safe/index.js';
