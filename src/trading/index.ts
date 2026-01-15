/**
 * 现货交易协调器模块入口
 *
 * 导出所有交易协调相关的类型、类和函数
 */

// 类型定义
export type {
  WeightConfig,
  SpotCoordinatorConfig,
  CoordinatedDecision,
  ExecutionResult,
  CoordinatorStats,
  MarketContext,
  PositionInfo,
  AsyncTask,
  DecisionCallback,
  ExecutionCallback,
  AnomalyCallback,
} from './types.js';

// 枚举
export { TaskStatus } from './types.js';

// 交易协调器
export { SpotCoordinator } from './coordinator.js';
