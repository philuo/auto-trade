/**
 * AI 模块入口
 *
 * 导出所有 AI 相关的类型、类和函数
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
} from './types.js';

// 枚举
export {
  AITaskType,
  AIModel,
} from './types.js';

// GLM Client
export {
  GLMClient,
} from './glm-client.js';

// 提示词模板
export {
  MARKET_SCAN_PROMPT,
  TRADING_DECISION_PROMPT,
  PERFORMANCE_REPORT_PROMPT,
  DEEP_ANALYSIS_PROMPT,
  ANOMALY_ANALYSIS_PROMPT,
  getPromptTemplate,
  buildFullPrompt,
  type PromptTemplate,
} from './prompts.js';
