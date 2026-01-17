/**
 * 交易历史记录模块入口
 *
 * 导出交易历史相关的类型、类和函数
 */

// 类型定义
export type {
  TradeRecord,
  PerformanceStats,
  CoinPerformance,
  DecisionPatternAnalysis,
  TradingFeedback,
  MarketCondition,
} from './types;

// 辅助函数
export { getTrendCondition, getRSICondition } from './types;

// 交易历史类
export { TradeHistory } from './trade-history;
