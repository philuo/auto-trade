/**
 * 统计模块
 *
 * 提供信号统计数据库、验证和聚合功能
 */

export { SignalStatisticsDB, getGlobalStatsDB } from './signal-statistics.js';
export { StatisticsValidator } from './validator.js';
export { SignalAggregator } from './aggregator.js';
export type { SignalStatistics, CalculatedStats, FullSignalStatistics, TradeRecord } from './signal-statistics.js';
export type { ValidatorConfig } from './validator.js';
export type { AggregatorConfig, AggregatedSignal } from './aggregator.js';
