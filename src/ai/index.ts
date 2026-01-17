/**
 * AI 模块入口
 */

// 类型定义
export type {
  // 基础类型
  CoinPriceData,
  MarketScanResult,
  TradingOpportunity,
  MarketRisk,
  TradingAction,
  AITradingDecision,
  DecisionInputData,
  CoinPosition,
  PerformanceSnapshot,
  PerformanceReport,
  DeepAnalysisResult,
  MarketPattern,
  TradeCase,
  AnomalyEvent,
  AnomalyAnalysisResult,
  // 配置类型
  AIRequestConfig,
  AIResponse,
  AIClientConfig,
  // 市场数据类型
  RealMarketData,
  // 交易类型
  TradingType,
} from './types.js';

// 常量
export {
  DEFAULT_WHITELISTS,
} from './types.js';

// 枚举
export {
  AITaskType,
  AIModel,
} from './types.js';

// AI Client
export {
  AIClient,
  createAIClient,
  loadAIClientConfigFromEnv,
} from './ai-client.js';
