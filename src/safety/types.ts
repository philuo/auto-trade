/**
 * 安全验证器类型定义
 *
 * 定义交易安全验证的类型和配置
 */

import type { RuleSignal } from '../rules/types.js';

// =====================================================
// 安全验证类型
// =====================================================

/**
 * 交易操作类型
 */
export enum TradeActionType {
  BUY = 'buy',
  SELL = 'sell',
}

/**
 * 安全检查结果
 */
export enum SafetyCheckResult {
  PASSED = 'passed',         // 通过
  WARNING = 'warning',       // 警告，可执行
  BLOCKED = 'blocked',       // 阻止，不能执行
}

/**
 * 安全检查项
 */
export enum SafetyCheckType {
  // 资金检查
  SUFFICIENT_BALANCE = 'sufficient_balance',
  // 持仓检查
  SUFFICIENT_POSITION = 'sufficient_position',
  // 价格合理性检查
  PRICE_REASONABLE = 'price_reasonable',
  // 交易量检查
  AMOUNT_REASONABLE = 'amount_reasonable',
  // 市场状态检查
  MARKET_NORMAL = 'market_normal',
  // 交易频率检查
  FREQUENCY_LIMIT = 'frequency_limit',
  // 单日最大交易次数
  DAILY_TRADE_LIMIT = 'daily_trade_limit',
  // 单币种最大交易金额
  COIN_TRADE_LIMIT = 'coin_trade_limit',
}

// =====================================================
// 安全检查结果类型
// =====================================================

/**
 * 单项安全检查结果
 */
export interface SafetyCheck {
  // 检查类型
  type: SafetyCheckType;
  // 检查结果
  result: SafetyCheckResult;
  // 检查通过/失败原因
  reason: string;
  // 额外信息
  details?: Record<string, unknown>;
}

/**
 * 安全验证结果
 */
export interface SafetyValidationResult {
  // 是否通过所有检查
  passed: boolean;
  // 是否有警告
  hasWarning: boolean;
  // 各项检查结果
  checks: SafetyCheck[];
  // 建议调整的交易参数
  suggestedAdjustments?: TradeAdjustment[];
}

/**
 * 交易调整建议
 */
export interface TradeAdjustment {
  // 调整类型
  type: 'reduce_amount' | 'split_order' | 'delay_trade' | 'cancel_trade';
  // 原因
  reason: string;
  // 建议值
  suggestedValue?: number;
  // 建议时间戳
  suggestedTimestamp?: number;
}

// =====================================================
// 安全验证配置
// =====================================================

/**
 * 安全验证配置
 */
export interface SafetyValidatorConfig {
  // 是否启用安全验证
  enabled: boolean;
  // 最小余额保留 (USDT)
  minReserveBalance: number;
  // 最大单笔交易金额 (USDT)
  maxSingleTradeAmount: number;
  // 最小单笔交易金额 (USDT)
  minSingleTradeAmount: number;
  // 价格偏差容忍度 (百分比)
  priceDeviationTolerance: number;
  // 交易频率限制 (秒)
  tradeFrequencyLimit: number;
  // 单日最大交易次数
  maxDailyTrades: number;
  // 单币种单日最大交易金额 (USDT)
  maxDailyCoinTradeAmount: number;
  // 是否启用市场状态检查
  enableMarketStatusCheck: boolean;
  // 异常波动率阈值 (百分比)
  abnormalVolatilityThreshold: number;
}

// =====================================================
// 交易请求类型
// =====================================================

/**
 * 交易请求
 */
export interface TradeRequest {
  // 交易类型
  actionType: TradeActionType;
  // 币种
  coin: string;
  // 价格
  price: number;
  // 数量
  amount: number;
  // 价值 (USDT)
  value: number;
  // 信号来源
  signalSource: 'ai' | 'rule' | 'manual';
  // 信号强度
  signalStrength?: 'weak' | 'moderate' | 'strong';
  // 置信度
  confidence?: number;
  // 时间戳
  timestamp: number;
}

/**
 * 市场状态
 */
export interface MarketStatus {
  // 是否正常
  isNormal: boolean;
  // 波动率
  volatility: number;
  // 交易量
  volume24h: number;
  // 24h价格变化
  change24h: number;
  // 异常原因
  abnormalReason?: string;
}

/**
 * 账户状态
 */
export interface AccountStatus {
  // 可用余额
  availableBalance: number;
  // 当前持仓
  positions: Array<{
    coin: string;
    amount: number;
    avgCost: number;
    unrealizedPnL: number;
  }>;
  // 今日交易次数
  todayTradeCount: number;
  // 今日交易金额 (按币种)
  todayTradeAmountByCoin: Map<string, number>;
  // 上次交易时间
  lastTradeTime: number;
}

/**
 * 交易历史记录
 */
export interface TradeHistory {
  // 交易记录
  trades: Array<{
    id: string;
    actionType: TradeActionType;
    coin: string;
    price: number;
    amount: number;
    value: number;
    timestamp: number;
  }>;
  // 今日交易次数
  todayCount: number;
  // 今日交易金额
  todayAmount: number;
}

// =====================================================
// 验证函数类型
// =====================================================

/**
 * 安全检查函数类型
 */
export type SafetyCheckFunction = (
  request: TradeRequest,
  marketStatus: MarketStatus,
  accountStatus: AccountStatus,
  config: SafetyValidatorConfig
) => SafetyCheck;
