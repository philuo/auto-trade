/**
 * 现货交易协调器类型定义
 *
 * 定义现货交易协调器的类型和接口
 */

import type { RuleSignal } from '../rules/types.js';
import type { AITradingDecision, MarketScanResult } from '../ai/types.js';
import type { MarketContext as BaseMarketContext } from '../market/types.js';

// =====================================================
// 协调器配置类型
// =====================================================

/**
 * 权重配置
 */
export interface WeightConfig {
  // AI 决策权重 (0-1)
  aiWeight: number;
  // 规则决策权重 (0-1)
  ruleWeight: number;
}

// =====================================================
// 协调器配置类型
// =====================================================

/**
 * 权重配置
 */
export interface WeightConfig {
  // AI 决策权重 (0-1)
  aiWeight: number;
  // 规则决策权重 (0-1)
  ruleWeight: number;
}

/**
 * 现货交易协调器配置
 */
export interface SpotCoordinatorConfig {
  // 是否启用协调器
  enabled: boolean;
  // 权重配置
  weights: WeightConfig;
  // 交易币种列表
  coins: string[];
  // 每次最大交易金额 (USDT)
  maxTradeAmount: number;
  // 单币种最大持仓比例 (百分比)
  maxCoinPositionRatio: number;
  // 是否启用 AI
  enableAI: boolean;
  // 是否启用规则
  enableRules: boolean;
  // 是否启用安全验证
  enableSafety: boolean;
  // AI 调用间隔 (毫秒)
  aiCallInterval: number;
  // 性能报告间隔 (毫秒)
  performanceReportInterval: number;
  // 深度分析间隔 (毫秒)
  deepAnalysisInterval: number;
}

// =====================================================
// 决策类型
// =====================================================

/**
 * 协调后的交易决策
 */
export interface CoordinatedDecision {
  // 决策时间戳
  timestamp: number;
  // 币种
  coin: string;
  // 操作类型
  action: 'buy' | 'sell' | 'hold';
  // 置信度
  confidence: number;
  // 综合分数 (AI 和规则的加权)
  combinedScore: number;
  // AI 分数
  aiScore?: number;
  // 规则分数
  ruleScore?: number;
  // 决策原因
  reason: string;
  // 建议价格
  suggestedPrice?: number;
  // 建议数量 (USDT)
  suggestedAmount?: number;
  // 决策来源
  source: 'ai' | 'rule' | 'coordinated';
}

/**
 * 执行结果
 */
export interface ExecutionResult {
  // 是否成功
  success: boolean;
  // 决策
  decision: CoordinatedDecision;
  // 执行时间
  executedAt: number;
  // 订单ID (如果已执行)
  orderId?: string;
  // 实际价格
  actualPrice?: number;
  // 实际数量
  actualAmount?: number;
  // 错误信息 (如果失败)
  error?: string;
}

// =====================================================
// 性能统计类型
// =====================================================

/**
 * 协调器性能统计
 */
export interface CoordinatorStats {
  // 总决策次数
  totalDecisions: number;
  // AI 决策次数
  aiDecisions: number;
  // 规则决策次数
  ruleDecisions: number;
  // 协调决策次数
  coordinatedDecisions: number;
  // 买入决策次数
  buyDecisions: number;
  // 卖出决策次数
  sellDecisions: number;
  // 持有决策次数
  holdDecisions: number;
  // 总盈亏
  totalPnL: number;
  // AI 决策胜率
  aiWinRate: number;
  // 规则决策胜率
  ruleWinRate: number;
  // 总胜率
  overallWinRate: number;
  // 盈亏比
  profitFactor: number;
  // 最大回撤
  maxDrawdown: number;
}

// =====================================================
// 市场数据类型
// =====================================================

// 重新导出市场模块的 MarketContext
export type { MarketContext } from '../market/types.js';

/**
 * 持仓信息
 */
export interface PositionInfo {
  // 币种
  coin: string;
  // 数量
  amount: number;
  // 平均成本
  avgCost: number;
  // 当前价值
  currentValue: number;
  // 未实现盈亏
  unrealizedPnL: number;
  // 盈亏比例
  pnlPercent: number;
}

// =====================================================
// 异步任务类型
// =====================================================

/**
 * 异步任务状态
 */
export enum TaskStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

/**
 * 异步任务
 */
export interface AsyncTask {
  // 任务ID
  id: string;
  // 任务类型
  type: 'market_scan' | 'trading_decision' | 'performance_report' | 'deep_analysis';
  // 状态
  status: TaskStatus;
  // 开始时间
  startTime: number;
  // 结束时间
  endTime?: number;
  // 结果
  result?: unknown;
  // 错误信息
  error?: string;
}

// =====================================================
// 回调函数类型
// =====================================================

/**
 * 决策回调
 */
export type DecisionCallback = (decision: CoordinatedDecision) => void | Promise<void>;

/**
 * 执行回调
 */
export type ExecutionCallback = (result: ExecutionResult) => void | Promise<void>;

/**
 * 异常回调
 */
export type AnomalyCallback = (anomaly: {
  type: string;
  severity: string;
  description: string;
  data?: Record<string, unknown>;
}) => void | Promise<void>;
