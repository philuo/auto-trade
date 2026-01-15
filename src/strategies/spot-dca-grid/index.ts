/**
 * DCA + 网格混合策略模块导出
 *
 * 提供统一的模块导出接口
 */

// 策略引擎核心
export { SpotDCAGridStrategyEngine as StrategyEngine } from './core/engine.js';
export { DCAEngine } from './core/dca-engine.js';
export { GridEngine } from './core/grid-engine.js';
export { Coordinator } from './core/coordinator.js';

// 订单管理
export { OrderGenerator } from './order-management/order-generator.js';
export { OrderTracker } from './order-management/order-tracker.js';

// 风险管理
export { StopLossManager } from './risk-management/stop-loss.js';
export { DrawdownController, DrawdownState } from './risk-management/drawdown-controller.js';
export { PositionController } from './risk-management/position-controller.js';

// 多币种管理
export { VolatilityCalculator } from './multi-coin/volatility-calculator.js';

// 动态区间
export { RangeCalculator } from './dynamic-range/range-calculator.js';

// 数据适配器
export { DataAdapter } from './infrastructure/data-adapter.js';

// 配置
export { DEFAULT_CONFIG } from './config/default-params.js';
export type {
  SpotDCAGridConfig,
  AllowedCoin,
  DCAConfig,
  GridConfig,
  RiskConfig,
  CapitalConfig,
  CoinsConfig,
  Decision
} from './config/strategy-config.js';

export type {
  Candle,
  MarketData,
  CoinPosition,
  PriceRange,
  StrategyOrder,
  OrderSide,
  OrderStatus,
  OrderType
} from './config/types.js';

// 策略运行器
export { StrategyRunner } from './run-strategy.js';
