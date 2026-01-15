/**
 * 安全验证器
 *
 * 对交易信号进行安全检查，确保交易符合风险控制要求
 */

import { logger } from '../utils/logger.js';
import type {
  SafetyValidatorConfig,
  SafetyValidationResult,
  SafetyCheck,
  SafetyCheckType,
  SafetyCheckFunction,
  TradeRequest,
  MarketStatus,
  AccountStatus,
  TradeActionType,
  TradeAdjustment,
} from './types.js';
import {
  SafetyCheckType as CheckType,
  TradeActionType as ActionType,
  SafetyCheckResult,
} from './types.js';

/**
 * 安全验证器类
 */
export class SafetyValidator {
  private config: SafetyValidatorConfig;
  private tradeHistory: Map<string, number[]> = new Map(); // coin -> timestamps

  constructor(config: Partial<SafetyValidatorConfig> = {}) {
    this.config = {
      enabled: true,
      minReserveBalance: 100, // 保留100 USDT
      maxSingleTradeAmount: 5000, // 单笔最大5000 USDT
      minSingleTradeAmount: 10, // 单笔最小10 USDT
      priceDeviationTolerance: 5, // 价格偏差容忍5%
      tradeFrequencyLimit: 10, // 10秒内不能重复交易
      maxDailyTrades: 50, // 单日最大50次交易
      maxDailyCoinTradeAmount: 10000, // 单币种单日最大10000 USDT
      enableMarketStatusCheck: true,
      abnormalVolatilityThreshold: 20, // 20%以上波动率为异常
      ...config,
    };

    logger.info('安全验证器初始化', this.config as unknown as Record<string, unknown>);
  }

  // =====================================================
  // 公共方法
  // =====================================================

  /**
   * 验证交易请求
   */
  async validateTrade(
    request: TradeRequest,
    marketStatus: MarketStatus,
    accountStatus: AccountStatus
  ): Promise<SafetyValidationResult> {
    if (!this.config.enabled) {
      return {
        passed: true,
        hasWarning: false,
        checks: [],
      };
    }

    logger.debug(`安全验证开始 [${request.coin}]`, {
      action: request.actionType,
      value: request.value,
    });

    const checks: SafetyCheck[] = [];
    const adjustments: TradeAdjustment[] = [];

    // 执行所有安全检查
    const checkFunctions = this.getCheckFunctions();

    for (const checkFn of checkFunctions) {
      try {
        const check = checkFn(request, marketStatus, accountStatus, this.config);
        checks.push(check);

        // 如果检查失败或警告，生成调整建议
        if (check.result !== SafetyCheckResult.PASSED) {
          const adjustment = this.generateAdjustment(check, request);
          if (adjustment) {
            adjustments.push(adjustment);
          }
        }
      } catch (error) {
        logger.error(`安全检查执行失败 [${checkFn.name}]`, {
          error: error instanceof Error ? error.message : String(error),
        });
        checks.push({
          type: CheckType.SUFFICIENT_BALANCE, // 默认类型
          result: SafetyCheckResult.BLOCKED,
          reason: '安全检查执行失败',
        });
      }
    }

    // 统计结果
    const hasBlocked = checks.some(c => c.result === SafetyCheckResult.BLOCKED);
    const hasWarning = checks.some(c => c.result === SafetyCheckResult.WARNING);

    const result: SafetyValidationResult = {
      passed: !hasBlocked,
      hasWarning: !hasBlocked && hasWarning,
      checks,
    };

    if (adjustments.length > 0) {
      result.suggestedAdjustments = adjustments;
    }

    logger.debug(`安全验证完成 [${request.coin}]`, {
      passed: result.passed,
      hasWarning: result.hasWarning,
      blockedChecks: checks.filter(c => c.result === SafetyCheckResult.BLOCKED).length,
      warningChecks: checks.filter(c => c.result === SafetyCheckResult.WARNING).length,
    });

    return result;
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<SafetyValidatorConfig>): void {
    this.config = { ...this.config, ...config };
    logger.info('安全验证器配置已更新', this.config as unknown as Record<string, unknown>);
  }

  /**
   * 获取配置
   */
  getConfig(): Readonly<SafetyValidatorConfig> {
    return { ...this.config };
  }

  /**
   * 记录交易
   */
  recordTrade(trade: TradeRequest): void {
    const timestamps = this.tradeHistory.get(trade.coin) || [];
    timestamps.push(trade.timestamp);
    this.tradeHistory.set(trade.coin, timestamps);
  }

  /**
   * 清理过期的交易记录（24小时前）
   */
  cleanupOldTrades(): void {
    const now = Date.now();
    const dayInMs = 24 * 60 * 60 * 1000;

    for (const [coin, timestamps] of this.tradeHistory) {
      const validTimestamps = timestamps.filter(t => now - t < dayInMs);
      this.tradeHistory.set(coin, validTimestamps);
    }
  }

  /**
   * 获取今日交易次数
   */
  getTodayTradeCount(coin?: string): number {
    this.cleanupOldTrades();

    if (coin) {
      const timestamps = this.tradeHistory.get(coin) || [];
      return timestamps.length;
    }

    let total = 0;
    for (const timestamps of this.tradeHistory.values()) {
      total += timestamps.length;
    }
    return total;
  }

  // =====================================================
  // 安全检查函数
  // =====================================================

  /**
   * 获取所有检查函数
   */
  private getCheckFunctions() {
    return [
      this.checkSufficientBalance,
      this.checkSufficientPosition,
      this.checkPriceReasonable,
      this.checkAmountReasonable,
      this.checkMarketNormal,
      this.checkFrequencyLimit,
      this.checkDailyTradeLimit,
      this.checkCoinTradeLimit,
    ] as const;
  }

  /**
   * 检查余额是否充足
   */
  private checkSufficientBalance: SafetyCheckFunction = (
    request,
    market,
    account,
    config
  ) => {
    if (request.actionType !== ActionType.BUY) {
      return {
        type: CheckType.SUFFICIENT_BALANCE,
        result: SafetyCheckResult.PASSED,
        reason: '卖出操作不需要检查余额',
      };
    }

    const requiredBalance = request.value + config.minReserveBalance;
    const available = account.availableBalance;

    if (available >= requiredBalance) {
      return {
        type: CheckType.SUFFICIENT_BALANCE,
        result: SafetyCheckResult.PASSED,
        reason: `余额充足: ${available.toFixed(2)} USDT`,
        details: { available, required: requiredBalance },
      };
    }

    return {
      type: CheckType.SUFFICIENT_BALANCE,
      result: SafetyCheckResult.BLOCKED,
      reason: `余额不足: 需要 ${requiredBalance.toFixed(2)} USDT，可用 ${available.toFixed(2)} USDT`,
      details: { available, required: requiredBalance },
    };
  };

  /**
   * 检查持仓是否充足
   */
  private checkSufficientPosition: SafetyCheckFunction = (
    request,
    market,
    account,
    config
  ) => {
    if (request.actionType !== ActionType.SELL) {
      return {
        type: CheckType.SUFFICIENT_POSITION,
        result: SafetyCheckResult.PASSED,
        reason: '买入操作不需要检查持仓',
      };
    }

    const position = account.positions.find(p => p.coin === request.coin);
    const availableAmount = position ? position.amount : 0;

    if (availableAmount >= request.amount) {
      return {
        type: CheckType.SUFFICIENT_POSITION,
        result: SafetyCheckResult.PASSED,
        reason: `持仓充足: ${availableAmount.toFixed(6)} ${request.coin}`,
        details: { available: availableAmount, required: request.amount },
      };
    }

    return {
      type: CheckType.SUFFICIENT_POSITION,
      result: SafetyCheckResult.BLOCKED,
      reason: `持仓不足: 需要 ${request.amount.toFixed(6)} ${request.coin}，可用 ${availableAmount.toFixed(6)} ${request.coin}`,
      details: { available: availableAmount, required: request.amount },
    };
  };

  /**
   * 检查价格是否合理
   */
  private checkPriceReasonable: SafetyCheckFunction = (
    request,
    market,
    account,
    config
  ) => {
    // 检查价格是否为正数
    if (request.price <= 0) {
      return {
        type: CheckType.PRICE_REASONABLE,
        result: SafetyCheckResult.BLOCKED,
        reason: '价格必须大于0',
      };
    }

    // 检查价格是否偏离市场价过大
    const deviation = Math.abs(request.price - market.volume24h) / market.volume24h * 100; // 简化处理

    if (deviation > config.priceDeviationTolerance * 10) {
      return {
        type: CheckType.PRICE_REASONABLE,
        result: SafetyCheckResult.WARNING,
        reason: `价格偏离市场价较大: ${deviation.toFixed(2)}%`,
        details: { deviation },
      };
    }

    return {
      type: CheckType.PRICE_REASONABLE,
      result: SafetyCheckResult.PASSED,
      reason: '价格合理',
      details: { price: request.price },
    };
  };

  /**
   * 检查交易金额是否合理
   */
  private checkAmountReasonable: SafetyCheckFunction = (
    request,
    market,
    account,
    config
  ) => {
    // 检查最小交易金额
    if (request.value < config.minSingleTradeAmount) {
      return {
        type: CheckType.AMOUNT_REASONABLE,
        result: SafetyCheckResult.BLOCKED,
        reason: `交易金额过小: ${request.value.toFixed(2)} USDT，最小 ${config.minSingleTradeAmount} USDT`,
        details: { value: request.value, min: config.minSingleTradeAmount },
      };
    }

    // 检查最大交易金额
    if (request.value > config.maxSingleTradeAmount) {
      return {
        type: CheckType.AMOUNT_REASONABLE,
        result: SafetyCheckResult.BLOCKED,
        reason: `交易金额过大: ${request.value.toFixed(2)} USDT，最大 ${config.maxSingleTradeAmount} USDT`,
        details: { value: request.value, max: config.maxSingleTradeAmount },
      };
    }

    return {
      type: CheckType.AMOUNT_REASONABLE,
      result: SafetyCheckResult.PASSED,
      reason: '交易金额合理',
      details: { value: request.value },
    };
  };

  /**
   * 检查市场状态是否正常
   */
  private checkMarketNormal: SafetyCheckFunction = (
    request,
    market,
    account,
    config
  ) => {
    if (!config.enableMarketStatusCheck) {
      return {
        type: CheckType.MARKET_NORMAL,
        result: SafetyCheckResult.PASSED,
        reason: '市场状态检查已禁用',
      };
    }

    if (!market.isNormal) {
      return {
        type: CheckType.MARKET_NORMAL,
        result: SafetyCheckResult.BLOCKED,
        reason: `市场异常: ${market.abnormalReason || '未知原因'}`,
        details: { volatility: market.volatility },
      };
    }

    // 检查波动率是否异常
    if (Math.abs(market.change24h) > config.abnormalVolatilityThreshold) {
      return {
        type: CheckType.MARKET_NORMAL,
        result: SafetyCheckResult.WARNING,
        reason: `24h波动率异常: ${market.change24h.toFixed(2)}%`,
        details: { change24h: market.change24h },
      };
    }

    return {
      type: CheckType.MARKET_NORMAL,
      result: SafetyCheckResult.PASSED,
      reason: '市场状态正常',
      details: { volatility: market.volatility },
    };
  };

  /**
   * 检查交易频率限制
   */
  private checkFrequencyLimit: SafetyCheckFunction = (
    request,
    market,
    account,
    config
  ) => {
    const lastTradeTime = account.lastTradeTime;
    const timeSinceLastTrade = request.timestamp - lastTradeTime;

    if (timeSinceLastTrade < config.tradeFrequencyLimit * 1000) {
      return {
        type: CheckType.FREQUENCY_LIMIT,
        result: SafetyCheckResult.BLOCKED,
        reason: `交易频率过快: 距离上次交易仅 ${(timeSinceLastTrade / 1000).toFixed(1)} 秒，需要 ${config.tradeFrequencyLimit} 秒`,
        details: { timeSinceLastTrade, required: config.tradeFrequencyLimit * 1000 },
      };
    }

    return {
      type: CheckType.FREQUENCY_LIMIT,
      result: SafetyCheckResult.PASSED,
      reason: '交易频率正常',
      details: { timeSinceLastTrade },
    };
  };

  /**
   * 检查单日交易次数限制
   */
  private checkDailyTradeLimit: SafetyCheckFunction = (
    request,
    market,
    account,
    config
  ) => {
    const todayCount = this.getTodayTradeCount();

    if (todayCount >= config.maxDailyTrades) {
      return {
        type: CheckType.DAILY_TRADE_LIMIT,
        result: SafetyCheckResult.BLOCKED,
        reason: `已达到单日最大交易次数: ${todayCount}/${config.maxDailyTrades}`,
        details: { todayCount, max: config.maxDailyTrades },
      };
    }

    // 接近限制时发出警告
    if (todayCount >= config.maxDailyTrades * 0.9) {
      return {
        type: CheckType.DAILY_TRADE_LIMIT,
        result: SafetyCheckResult.WARNING,
        reason: `接近单日最大交易次数: ${todayCount}/${config.maxDailyTrades}`,
        details: { todayCount, max: config.maxDailyTrades },
      };
    }

    return {
      type: CheckType.DAILY_TRADE_LIMIT,
      result: SafetyCheckResult.PASSED,
      reason: '单日交易次数正常',
      details: { todayCount, max: config.maxDailyTrades },
    };
  };

  /**
   * 检查单币种交易金额限制
   */
  private checkCoinTradeLimit: SafetyCheckFunction = (
    request,
    market,
    account,
    config
  ) => {
    const timestamps = this.tradeHistory.get(request.coin) || [];
    // 这里简化处理，实际应该记录每笔交易的金额
    const todayCoinTradeCount = timestamps.length;
    const estimatedTodayAmount = todayCoinTradeCount * request.value;

    if (estimatedTodayAmount >= config.maxDailyCoinTradeAmount) {
      return {
        type: CheckType.COIN_TRADE_LIMIT,
        result: SafetyCheckResult.BLOCKED,
        reason: `已达到单币种单日最大交易金额: ${estimatedTodayAmount.toFixed(2)}/${config.maxDailyCoinTradeAmount} USDT`,
        details: { todayAmount: estimatedTodayAmount, max: config.maxDailyCoinTradeAmount },
      };
    }

    return {
      type: CheckType.COIN_TRADE_LIMIT,
      result: SafetyCheckResult.PASSED,
      reason: '单币种交易金额正常',
      details: { todayAmount: estimatedTodayAmount, max: config.maxDailyCoinTradeAmount },
    };
  };

  // =====================================================
  // 辅助方法
  // =====================================================

  /**
   * 生成调整建议
   */
  private generateAdjustment(check: SafetyCheck, request: TradeRequest): TradeAdjustment | null {
    switch (check.type) {
      case CheckType.AMOUNT_REASONABLE:
        if (check.details && typeof check.details === 'object') {
          const details = check.details as Record<string, unknown>;
          if (request.value > (details.max as number)) {
            return {
              type: 'reduce_amount',
              reason: check.reason,
              suggestedValue: details.max as number,
            };
          }
        }
        break;

      case CheckType.FREQUENCY_LIMIT:
        if (check.details && typeof check.details === 'object') {
          const details = check.details as Record<string, unknown>;
          const required = (details.required as number) || 0;
          return {
            type: 'delay_trade',
            reason: check.reason,
            suggestedTimestamp: Date.now() + required,
          };
        }
        break;

      case CheckType.DAILY_TRADE_LIMIT:
        return {
          type: 'cancel_trade',
          reason: check.reason,
        };

      default:
        break;
    }

    return null;
  }

  /**
   * 重置今日交易统计
   */
  resetTodayStats(): void {
    this.tradeHistory.clear();
    logger.info('安全验证器今日交易统计已重置');
  }
}

// 导出枚举
export { SafetyCheckResult, SafetyCheckType, TradeActionType } from './types.js';
