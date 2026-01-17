/**
 * 统计模块
 *
 * 提供信号统计数据库、验证和聚合功能
 */

export { SignalStatisticsDB, getGlobalStatsDB } from './signal-statistics';
export { StatisticsValidator } from './validator';
export { SignalAggregator } from './aggregator';
export type { SignalStatistics, CalculatedStats, FullSignalStatistics, TradeRecord } from './signal-statistics';
export type { ValidatorConfig } from './validator';
export type { AggregatorConfig, AggregatedSignal } from './aggregator';
