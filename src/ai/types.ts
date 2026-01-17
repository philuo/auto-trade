/**
 * AI 模块类型定义
 *
 * 定义 AI Client 相关的所有类型接口
 */

import type { TradingFeedback } from '../history/types.js';

// =====================================================
// JSON Schema 定义 (用于结构化输出)
// =====================================================

/**
 * 市场扫描结果的 JSON Schema
 */
export const MARKET_SCAN_SCHEMA = {
  type: 'object',
  properties: {
    timestamp: { type: 'number', description: '扫描时间戳（毫秒）' },
    coins: {
      type: 'array',
      description: '币种分析结果',
      items: {
        type: 'object',
        properties: {
          coin: { type: 'string', description: '币种符号' },
          price: { type: 'number', description: '当前价格' },
          change24h: { type: 'number', description: '24小时涨跌幅（%）' },
          volume24h: { type: 'number', description: '24小时成交量' },
          volatility: { type: 'number', description: '波动率' },
          trend: { type: 'string', enum: ['uptrend', 'downtrend', 'sideways'], description: '趋势方向' },
        },
        required: ['coin', 'price', 'change24h', 'volume24h', 'volatility', 'trend'],
      },
    },
    opportunities: {
      type: 'array',
      description: '识别的交易机会（可选）',
      items: {
        type: 'object',
        properties: {
          coin: { type: 'string', description: '币种符号' },
          type: { type: 'string', enum: ['breakout', 'dip', 'reversal', 'trend_follow'], description: '机会类型' },
          confidence: { type: 'number', minimum: 0, maximum: 1, description: '置信度 (0-1)' },
          reason: { type: 'string', description: '原因分析' },
        },
        required: ['coin', 'type', 'confidence', 'reason'],
      },
    },
    risks: {
      type: 'array',
      description: '识别的市场风险（可选）',
      items: {
        type: 'object',
        properties: {
          coin: { type: 'string', description: '币种符号' },
          type: { type: 'string', enum: ['high_volatility', 'downtrend', 'liquidity_low'], description: '风险类型' },
          severity: { type: 'string', enum: ['low', 'medium', 'high'], description: '严重程度' },
          description: { type: 'string', description: '风险描述' },
        },
        required: ['coin', 'type', 'severity', 'description'],
      },
    },
  },
  required: ['timestamp', 'coins'],
} as const;

/**
 * 交易决策的 JSON Schema
 */
export const TRADING_DECISION_SCHEMA = {
  type: 'array',
  description: '交易决策列表',
  items: {
    type: 'object',
    properties: {
      timestamp: { type: 'number', description: '决策时间戳（毫秒）' },
      coin: { type: 'string', description: '币种符号' },
      action: { type: 'string', enum: ['buy', 'sell'], description: '交易动作（只输出buy或sell，不输出hold）' },
      confidence: { type: 'number', minimum: 0, maximum: 1, description: '置信度 (0-1, 根据实际情况给出)' },
      reason: { type: 'string', description: '决策原因' },
      aiScore: { type: 'number', minimum: -1, maximum: 1, description: 'AI得分 (-1到1)' },
      suggestedSize: { type: 'number', minimum: 0, description: '建议交易金额(USDT)' },
    },
    required: ['timestamp', 'coin', 'action', 'confidence', 'reason', 'aiScore'],
  },
} as const;

/**
 * 性能报告的 JSON Schema
 */
export const PERFORMANCE_REPORT_SCHEMA = {
  type: 'object',
  properties: {
    timestamp: { type: 'number', description: '报告时间戳（毫秒）' },
    timeRange: { type: 'string', description: '时间范围' },
    performance: {
      type: 'object',
      properties: {
        timeRange: { type: 'string' },
        totalTrades: { type: 'number' },
        aiDecisions: { type: 'number' },
        ruleDecisions: { type: 'number' },
        totalPnL: { type: 'number' },
        pnlPercent: { type: 'string' },
        winRate: { type: 'number' },
        aiWinRate: { type: 'number' },
        ruleWinRate: { type: 'number' },
        profitFactor: { type: 'number' },
        maxDrawdown: { type: 'number' },
      },
      required: ['timeRange', 'totalTrades', 'aiDecisions', 'ruleDecisions', 'totalPnL', 'winRate'],
    },
    aiAnalysis: { type: 'string', description: 'AI表现分析' },
    recommendations: {
      type: 'array',
      items: { type: 'string' },
      description: '改进建议',
    },
    shouldAdjustWeight: { type: 'boolean', description: '是否需要调整权重' },
    suggestedWeights: {
      type: 'object',
      properties: {
        aiWeight: { type: 'number', minimum: 0, maximum: 1 },
        ruleWeight: { type: 'number', minimum: 0, maximum: 1 },
      },
      required: ['aiWeight', 'ruleWeight'],
    },
  },
  required: ['timestamp', 'timeRange', 'performance', 'aiAnalysis', 'recommendations', 'shouldAdjustWeight'],
} as const;

/**
 * 深度分析的 JSON Schema
 */
export const DEEP_ANALYSIS_SCHEMA = {
  type: 'object',
  properties: {
    timestamp: { type: 'number', description: '分析时间戳（毫秒）' },
    timeRange: { type: 'string', description: '时间范围' },
    patterns: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          description: { type: 'string' },
          occurrences: { type: 'number' },
          successRate: { type: 'number' },
        },
        required: ['name', 'description', 'occurrences', 'successRate'],
      },
    },
    successCases: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          timestamp: { type: 'number' },
          coin: { type: 'string' },
          action: { type: 'string', enum: ['buy', 'sell'] },
          result: { type: 'string', enum: ['success', 'failure'] },
          pnl: { type: 'number' },
          analysis: { type: 'string' },
        },
        required: ['timestamp', 'coin', 'action', 'result', 'pnl', 'analysis'],
      },
    },
    failureCases: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          timestamp: { type: 'number' },
          coin: { type: 'string' },
          action: { type: 'string', enum: ['buy', 'sell'] },
          result: { type: 'string', enum: ['success', 'failure'] },
          pnl: { type: 'number' },
          analysis: { type: 'string' },
        },
        required: ['timestamp', 'coin', 'action', 'result', 'pnl', 'analysis'],
      },
    },
    recommendations: {
      type: 'array',
      items: { type: 'string' },
    },
    summary: { type: 'string' },
  },
  required: ['timestamp', 'timeRange', 'patterns', 'successCases', 'failureCases', 'recommendations', 'summary'],
} as const;

/**
 * 异常分析的 JSON Schema
 */
export const ANOMALY_ANALYSIS_SCHEMA = {
  type: 'object',
  properties: {
    timestamp: { type: 'number', description: '分析时间戳（毫秒）' },
    anomaly: {
      type: 'object',
      properties: {
        type: { type: 'string' },
        severity: { type: 'string' },
        description: { type: 'string' },
      },
      required: ['type', 'severity', 'description'],
    },
    severity: { type: 'string', enum: ['low', 'medium', 'high', 'critical'], description: '严重程度评估' },
    rootCause: { type: 'string', description: '根本原因' },
    recommendedAction: { type: 'string', enum: ['ignore', 'monitor', 'pause_trading', 'emergency_close'], description: '建议行动' },
    analysis: { type: 'string', description: '详细分析' },
  },
  required: ['timestamp', 'anomaly', 'severity', 'rootCause', 'recommendedAction', 'analysis'],
} as const;

// =====================================================
// AI 任务类型
// =====================================================

/**
 * AI 任务类型
 */
export enum AITaskType {
  /** 市场扫描 - 轻量级，只看数据 */
  MARKET_SCAN = 'market_scan',

  /** 交易决策 - 基于扫描+规则做决策 */
  TRADING_DECISION = 'trading_decision',

  /** 性能报告 - 评估策略表现 */
  PERFORMANCE_REPORT = 'performance_report',

  /** 深度分析 - 全面复盘 */
  DEEP_ANALYSIS = 'deep_analysis',

  /** 异常分析 - 紧急情况 */
  ANOMALY_ANALYSIS = 'anomaly_analysis',
}

/**
 * AI 模型类型
 */
export enum AIModel {
  /** GLM-4.7 - 主要使用的模型 */
  GLM_4_7 = 'glm-4.7',
}

// =====================================================
// 市场数据类型
// =====================================================

/**
 * 币种价格数据
 */
export interface CoinPriceData {
  /** 币种 */
  coin: string;
  /** 当前价格 */
  price: number;
  /** 24小时变化百分比 */
  change24h: number;
  /** 24小时成交量 */
  volume24h: number;
  /** 波动率 */
  volatility: number;
  /** 趋势 */
  trend: 'uptrend' | 'downtrend' | 'sideways';
}

/**
 * 真实市场数据输入（用于 scanMarket）
 */
export interface RealMarketData {
  /** 价格数据 */
  prices: Map<string, {
    price: number;
    change24h: number;
    high24h: number;
    low24h: number;
    volume24h: number;
    timestamp: number;
  }>;
  /** 技术指标（可选） */
  indicators?: Map<string, {
    ma: { ma7: number; ma25: number; ma99: number };
    rsi: number;
    macd: { macd: number; signal: number; histogram: number };
    bollinger: { upper: number; middle: number; lower: number };
  }>;
  /** K线摘要（可选） */
  klines?: Map<string, Array<{
    timestamp: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  }>>;
}

/**
 * 市场扫描结果
 */
export interface MarketScanResult {
  /** 扫描时间戳 */
  timestamp: number;
  /** 扫描的币种数据 */
  coins: CoinPriceData[];
  /** 识别的机会 */
  opportunities?: TradingOpportunity[];
  /** 识别的风险 */
  risks?: MarketRisk[];
}

/**
 * 交易机会
 */
export interface TradingOpportunity {
  /** 币种 */
  coin: string;
  /** 机会类型 */
  type: 'breakout' | 'dip' | 'reversal' | 'trend_follow';
  /** 置信度 0-1 */
  confidence: number;
  /** 原因 */
  reason: string;
}

/**
 * 市场风险
 */
export interface MarketRisk {
  /** 币种 */
  coin: string;
  /** 风险类型 */
  type: 'high_volatility' | 'downtrend' | 'liquidity_low';
  /** 严重程度 */
  severity: 'low' | 'medium' | 'high';
  /** 描述 */
  description: string;
}

// =====================================================
// 交易决策类型
// =====================================================

/**
 * 交易动作
 */
export type TradingAction = 'buy' | 'sell' | 'hold';

/**
 * AI 交易决策
 */
export interface AITradingDecision {
  /** 时间戳 */
  timestamp: number;
  /** 决策的币种 */
  coin: string;
  /** 动作 */
  action: TradingAction;
  /** 置信度 0-1 */
  confidence: number;
  /** 原因 */
  reason: string;
  /** AI 得分 (-1 到 1) */
  aiScore: number;
  /** 建议数量 (USDT) */
  suggestedSize?: number;
}

/**
 * 决策输入数据
 */
export interface DecisionInputData {
  /** 市场扫描结果 */
  marketScan: MarketScanResult;
  /** 当前持仓 */
  currentPositions: CoinPosition[];
  /** 最近表现 */
  recentPerformance: PerformanceSnapshot;
  /** 交易历史反馈（学习闭环） */
  tradingFeedback?: TradingFeedback;
}

/**
 * 交易反馈数据（从历史模块导入的类型别名）
 */
export type TradingFeedbackData = TradingFeedback;

/**
 * 币种持仓
 */
export interface CoinPosition {
  /** 币种 */
  coin: string;
  /** 持仓数量 */
  amount: number;
  /** 平均成本 */
  avgCost: number;
  /** 当前价值 */
  currentValue: number;
  /** 持仓盈亏（未实现盈亏，用于区分实际盈亏） */
  positionPnL: number;
  /** 盈亏百分比 */
  pnlPercent: number;
}

// =====================================================
// 性能报告类型
// =====================================================

/**
 * 性能快照
 */
export interface PerformanceSnapshot {
  /** 时间范围 */
  timeRange: string;
  /** 总交易次数 */
  totalTrades: number;
  /** AI 决策次数 */
  aiDecisions: number;
  /** 规则决策次数 */
  ruleDecisions: number;
  /** 总盈亏 */
  totalPnL: number;
  /** 盈亏百分比 */
  pnlPercent: number;
  /** 胜率 */
  winRate: number;
  /** AI 胜率 */
  aiWinRate: number;
  /** 规则胜率 */
  ruleWinRate: number;
  /** 盈亏比 */
  profitFactor: number;
  /** 最大回撤 */
  maxDrawdown: number;
  /** 夏普比率 */
  sharpeRatio?: number;
}

/**
 * 性能报告
 */
export interface PerformanceReport {
  /** 报告时间 */
  timestamp: number;
  /** 时间范围 */
  timeRange: string;
  /** 性能快照 */
  performance: PerformanceSnapshot;
  /** AI 表现分析 */
  aiAnalysis: string;
  /** 建议 */
  recommendations: string[];
  /** 是否需要调整权重 */
  shouldAdjustWeight: boolean;
  /** 建议的新权重 (如果需要调整) */
  suggestedWeights?: {
    aiWeight: number;
    ruleWeight: number;
  };
}

// =====================================================
// 深度分析类型
// =====================================================

/**
 * 深度分析结果
 */
export interface DeepAnalysisResult {
  /** 分析时间 */
  timestamp: number;
  /** 时间范围 */
  timeRange: string;
  /** 识别的模式 */
  patterns: MarketPattern[];
  /** 成功案例 */
  successCases: TradeCase[];
  /** 失败案例 */
  failureCases: TradeCase[];
  /** 建议 */
  recommendations: string[];
  /** 总结 */
  summary: string;
}

/**
 * 市场模式
 */
export interface MarketPattern {
  /** 模式名称 */
  name: string;
  /** 描述 */
  description: string;
  /** 出现次数 */
  occurrences: number;
  /** 成功率 */
  successRate: number;
}

/**
 * 交易案例
 */
export interface TradeCase {
  /** 时间 */
  timestamp: number;
  /** 币种 */
  coin: string;
  /** 动作 */
  action: TradingAction;
  /** 结果 */
  result: 'success' | 'failure';
  /** 盈亏 */
  pnl: number;
  /** 分析 */
  analysis: string;
}

// =====================================================
// 异常分析类型
// =====================================================

/**
 * 异常事件
 */
export interface AnomalyEvent {
  /** 事件时间 */
  timestamp: number;
  /** 事件类型 */
  type: 'price_spike' | 'volume_spike' | 'connectivity_issue' | 'order_failure';
  /** 严重程度 */
  severity: 'low' | 'medium' | 'high' | 'critical';
  /** 描述 */
  description: string;
  /** 相关数据 */
  data?: Record<string, unknown>;
}

/**
 * 异常分析结果
 */
export interface AnomalyAnalysisResult {
  /** 分析时间 */
  timestamp: number;
  /** 异常事件 */
  anomaly: AnomalyEvent;
  /** 严重程度评估 */
  severity: 'low' | 'medium' | 'high' | 'critical';
  /** 根本原因 */
  rootCause: string;
  /** 建议行动 */
  recommendedAction: 'ignore' | 'monitor' | 'pause_trading' | 'emergency_close';
  /** 详细分析 */
  analysis: string;
}

// =====================================================
// AI 请求/响应类型
// =====================================================

/**
 * AI 请求配置
 */
export interface AIRequestConfig {
  /** 任务类型 */
  taskType: AITaskType;
  /** 输入数据 */
  input: {
    /** 用户提示词 */
    prompt: string;
    /** 系统提示词（可选） */
    systemPrompt?: string;
  };
  /** 模型 (默认使用 GLM-4.7) */
  model?: AIModel;
  /** 最大 token 数 */
  maxTokens?: number;
  /** 温度 (0-1) */
  temperature?: number;
}

/**
 * AI 响应
 */
export interface AIResponse<T = unknown> {
  /** 是否成功 */
  success: boolean;
  /** 数据 */
  data?: T;
  /** 错误信息 */
  error?: string;
  /** 使用的 token 数 */
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

// =====================================================
// AI 客户端配置
// =====================================================

/**
 * 交易类型
 */
export type TradingType = 'spot' | 'swap';

/**
 * 默认币种白名单配置
 */
export const DEFAULT_WHITELISTS = {
  /** 现货交易白名单 */
  spot: ['BTC', 'ETH', 'BNB', 'SOL', 'XRP', 'ADA', 'DOGE'] as const,
  /** 合约交易白名单 */
  swap: ['BTC', 'ETH'] as const,
} as const;

/**
 * AI 客户端配置
 * GLM-4.7 是推理模型，内置thinking模式，无需额外配置
 */
export interface AIClientConfig {
  /** API Key (可选，如果不提供则从 OPENAI_API_KEY 环境变量读取) */
  apiKey?: string;
  /** 模型 (默认使用 GLM-4.7) */
  model?: AIModel;
  /** API 基础 URL (可选，如果不提供则从 OPENAI_URL 环境变量读取) */
  baseURL?: string;
  /** 超时时间 (毫秒) */
  timeout?: number;
  /** 最大重试次数 */
  maxRetries?: number;
  /** 是否启用日志 */
  enableLogging?: boolean;
  /** 交易类型（决定使用哪个白名单） */
  tradingType?: TradingType;
  /** 自定义币种白名单（可选，覆盖默认值） */
  coinWhitelist?: string[];
}
