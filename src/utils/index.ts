/**
 * 工具模块导出
 */

// 日志系统
export {
  Logger,
  LogLevel,
  LogType,
  SQLiteLogStorage,
  FileLogStorage,
  logger
} from './logger';

// 日志分析
export {
  LogAnalyzer,
  analyzeDecisions,
  analyzeTrades,
  generateDecisionReport,
  generateTradeReport,
  generateComprehensiveReport,
  exportDecisionsToCSV,
  exportTradesToCSV,
  getRecentDecisions,
  getRecentTrades,
  getCoinDecisionHistory,
  getCoinTradeHistory
} from './log-analyzer';

// 手续费计算
export {
  FeeCalculator,
  estimateVIPLevel,
  calculateVolumeForVIP,
} from './fee-calculator';
export type {
  FeeCalculationResult,
} from './fee-calculator';
export {
  TradeType,
  OrderType,
} from './fee-calculator';

// 类型导出
export type {
  LogEntry,
  DecisionLogEntry,
  TradeLogEntry
} from './logger';
