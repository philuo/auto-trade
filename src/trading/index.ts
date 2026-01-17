/**
 * 交易模块入口
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

// 技术分析协调器（推荐使用）
export { TechnicalCoordinator } from './technical-coordinator.js';
export type { TechnicalCoordinatorConfig } from './technical-coordinator.js';
