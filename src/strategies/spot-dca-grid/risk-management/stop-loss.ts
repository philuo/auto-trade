/**
 * 止损管理器
 *
 * 功能：
 * - 百分比止损（固定百分比止损）
 * - 移动止损（Trailing Stop）
 * - 时间止损（持仓时间过长且亏损时）
 * - 波动率止损（波动率骤降且亏损时）
 */

import type { AllowedCoin } from '../config/strategy-config';
import type { CoinPosition, MarketData, StrategyOrder } from '../config/types';

// =====================================================
// 止损配置
// =====================================================

export interface StopLossConfig {
  // 百分比止损
  percentage: {
    enabled: boolean;
    maxLossPercentage: number;         // 最大亏损百分比 (默认 15%)
    warningPercentage: number;         // 警告百分比 (默认 10%)
  };

  // 移动止损
  trailing: {
    enabled: boolean;
    activationProfit: number;          // 激活盈利百分比 (默认 10%)
    distance: number;                  // 距离最高点的百分比 (默认 5%)
    updateFrequency: number;           // 更新频率（毫秒，默认 1 分钟）
  };

  // 时间止损
  time: {
    enabled: boolean;
    maxHoldingTime: number;            // 最大持仓时间（毫秒，默认 30 天）
    checkInterval: number;             // 检查间隔（毫秒，默认 1 天）
    lossThreshold: number;             // 亏损阈值百分比 (默认 5%)
    closePercentage: number;           // 平仓比例 (默认 50%)
  };

  // 波动率止损
  volatility: {
    enabled: boolean;
    volatilityDropThreshold: number;   // 波动率下降阈值 (默认 50%)
    lossThreshold: number;             // 亏损阈值百分比 (默认 3%)
    closePercentage: number;           // 平仓比例 (默认 30%)
  };

  // 全局设置
  global: {
    cooldownPeriod: number;            // 止损后冷却期（毫秒，默认 1 小时）
    minProfitToDisable: number;        // 盈利超过此百分比后禁用止损 (默认 20%)
  };
}

// =====================================================
// 止损检查结果
// =====================================================

export interface StopLossCheckResult {
  shouldTrigger: boolean;
  reason: string;
  action: 'close_all' | 'close_partial' | 'adjust_stop' | 'warning_only';
  closePercentage?: number;
  newStopPrice?: number;
  urgency: 'low' | 'medium' | 'high';
  metadata: {
    stopType: string;
    currentValue: number;
    threshold: number;
    position: {
      unrealizedPnL: number;
      unrealizedPnLPercent: number;
      avgPrice: number;
      currentPrice: number;
    };
  };
}

// =====================================================
// 止损状态
// =====================================================

interface CoinStopLossState {
  coin: AllowedCoin;
  enabled: boolean;

  // 百分比止损状态
  percentageStopLoss: number;
  percentageWarning: number;

  // 移动止损状态
  trailingActive: boolean;
  trailingStopPrice: number;
  highestPrice: number;
  trailingUpdatedAt: number;

  // 时间止损状态
  entryTime: number;
  lastTimeCheck: number;

  // 波动率止损状态
  initialVolatility: number;
  currentVolatility: number;

  // 状态标志
  lastStopTriggerTime: number;
  isInCooldown: boolean;
}

// =====================================================
// 止损事件
// =====================================================

export interface StopLossEvent {
  timestamp: number;
  coin: AllowedCoin;
  type: 'percentage' | 'trailing' | 'time' | 'volatility';
  action: 'close_all' | 'close_partial' | 'adjust_stop';
  reason: string;
  price: number;
  closePercentage?: number;
  metadata: Record<string, unknown>;
}

// =====================================================
// 止损管理器类
// =====================================================

export class StopLossManager {
  private config: StopLossConfig;
  private states: Map<AllowedCoin, CoinStopLossState> = new Map();
  private eventHistory: StopLossEvent[] = [];
  private eventCallback?: (event: StopLossEvent) => void;

  constructor(config?: Partial<StopLossConfig>) {
    this.config = {
      percentage: {
        enabled: true,
        maxLossPercentage: 15,
        warningPercentage: 10
      },
      trailing: {
        enabled: true,
        activationProfit: 10,
        distance: 5,
        updateFrequency: 60 * 1000
      },
      time: {
        enabled: true,
        maxHoldingTime: 30 * 24 * 60 * 60 * 1000, // 30 天
        checkInterval: 24 * 60 * 60 * 1000,     // 1 天
        lossThreshold: 5,
        closePercentage: 50
      },
      volatility: {
        enabled: true,
        volatilityDropThreshold: 50,
        lossThreshold: 3,
        closePercentage: 30
      },
      global: {
        cooldownPeriod: 60 * 60 * 1000,         // 1 小时
        minProfitToDisable: 20
      },
      ...config
    };
  }

  /**
   * 初始化币种的止损状态
   */
  initializeCoin(coin: AllowedCoin, position: CoinPosition, initialVolatility?: number): void {
    const state: CoinStopLossState = {
      coin,
      enabled: true,
      percentageStopLoss: position.avgPrice * (1 - this.config.percentage.maxLossPercentage / 100),
      percentageWarning: position.avgPrice * (1 - this.config.percentage.warningPercentage / 100),
      trailingActive: false,
      trailingStopPrice: 0,
      highestPrice: position.currentPrice,
      trailingUpdatedAt: Date.now(),
      entryTime: Date.now(),
      lastTimeCheck: Date.now(),
      initialVolatility: initialVolatility || 0,
      currentVolatility: initialVolatility || 0,
      lastStopTriggerTime: 0,
      isInCooldown: false
    };

    this.states.set(coin, state);
  }

  /**
   * 检查是否需要止损
   */
  async checkStopLoss(
    coin: AllowedCoin,
    position: CoinPosition,
    marketData: MarketData
  ): Promise<StopLossCheckResult> {
    const state = this.states.get(coin);
    if (!state || !state.enabled) {
      return this.createNoActionResult('not_initialized');
    }

    // 检查冷却期
    if (state.isInCooldown) {
      const now = Date.now();
      if (now - state.lastStopTriggerTime > this.config.global.cooldownPeriod) {
        state.isInCooldown = false;
      } else {
        return this.createNoActionResult('cooldown');
      }
    }

    // 检查是否盈利超过阈值（禁用止损）
    if (position.unrealizedPnLPercent > this.config.global.minProfitToDisable) {
      return this.createNoActionResult('profit_threshold_exceeded');
    }

    // 1. 检查百分比止损（优先级最高）
    const percentageResult = this.checkPercentageStopLoss(coin, position, state);
    if (percentageResult.shouldTrigger) {
      return percentageResult;
    }

    // 2. 检查移动止损
    const trailingResult = this.checkTrailingStopLoss(coin, position, state);
    if (trailingResult.shouldTrigger) {
      return trailingResult;
    }

    // 3. 检查时间止损
    const timeResult = this.checkTimeStopLoss(coin, position, state);
    if (timeResult.shouldTrigger) {
      return timeResult;
    }

    // 4. 检查波动率止损
    const volatilityResult = this.checkVolatilityStopLoss(coin, position, state, marketData);
    if (volatilityResult.shouldTrigger) {
      return volatilityResult;
    }

    return this.createNoActionResult('no_trigger');
  }

  /**
   * 检查百分比止损
   */
  private checkPercentageStopLoss(
    coin: AllowedCoin,
    position: CoinPosition,
    state: CoinStopLossState
  ): StopLossCheckResult {
    if (!this.config.percentage.enabled) {
      return this.createNoActionResult('disabled');
    }

    const currentPrice = position.currentPrice;
    const stopPrice = state.percentageStopLoss;
    const warningPrice = state.percentageWarning;

    // 触发止损
    if (currentPrice <= stopPrice) {
      const result: StopLossCheckResult = {
        shouldTrigger: true,
        reason: `价格 ${currentPrice.toFixed(2)} 跌破止损位 ${stopPrice.toFixed(2)} (亏损 ${position.unrealizedPnLPercent.toFixed(2)}%)`,
        action: 'close_all',
        urgency: 'high',
        metadata: {
          stopType: 'percentage',
          currentValue: currentPrice,
          threshold: stopPrice,
          position: {
            unrealizedPnL: position.unrealizedPnL,
            unrealizedPnLPercent: position.unrealizedPnLPercent,
            avgPrice: position.avgPrice,
            currentPrice: position.currentPrice
          }
        }
      };

      this.recordEvent(coin, 'percentage', 'close_all', result.reason, currentPrice);
      return result;
    }

    // 发出警告
    if (currentPrice <= warningPrice) {
      return {
        shouldTrigger: true,
        reason: `价格 ${currentPrice.toFixed(2)} 接近止损位 ${stopPrice.toFixed(2)} (亏损 ${position.unrealizedPnLPercent.toFixed(2)}%)`,
        action: 'warning_only',
        urgency: 'medium',
        metadata: {
          stopType: 'percentage_warning',
          currentValue: currentPrice,
          threshold: warningPrice,
          position: {
            unrealizedPnL: position.unrealizedPnL,
            unrealizedPnLPercent: position.unrealizedPnLPercent,
            avgPrice: position.avgPrice,
            currentPrice: position.currentPrice
          }
        }
      };
    }

    return this.createNoActionResult('percentage');
  }

  /**
   * 检查移动止损
   */
  private checkTrailingStopLoss(
    coin: AllowedCoin,
    position: CoinPosition,
    state: CoinStopLossState
  ): StopLossCheckResult {
    if (!this.config.trailing.enabled) {
      return this.createNoActionResult('disabled');
    }

    const currentPrice = position.currentPrice;
    const profitPercent = position.unrealizedPnLPercent;

    // 更新最高价
    if (currentPrice > state.highestPrice) {
      state.highestPrice = currentPrice;
    }

    // 检查是否应该激活移动止损
    if (!state.trailingActive && profitPercent >= this.config.trailing.activationProfit) {
      state.trailingActive = true;
      state.trailingStopPrice = state.highestPrice * (1 - this.config.trailing.distance / 100);
      state.trailingUpdatedAt = Date.now();

      return {
        shouldTrigger: true,
        reason: `移动止损已激活，止损价设为 ${state.trailingStopPrice.toFixed(2)}`,
        action: 'adjust_stop',
        newStopPrice: state.trailingStopPrice,
        urgency: 'low',
        metadata: {
          stopType: 'trailing_activation',
          currentValue: currentPrice,
          threshold: state.trailingStopPrice,
          position: {
            unrealizedPnL: position.unrealizedPnL,
            unrealizedPnLPercent: position.unrealizedPnLPercent,
            avgPrice: position.avgPrice,
            currentPrice: position.currentPrice
          }
        }
      };
    }

    // 移动止损已激活，检查是否触发
    if (state.trailingActive) {
      // 定期更新止损价
      const now = Date.now();
      if (now - state.trailingUpdatedAt > this.config.trailing.updateFrequency) {
        const newStopPrice = state.highestPrice * (1 - this.config.trailing.distance / 100);
        if (newStopPrice > state.trailingStopPrice) {
          state.trailingStopPrice = newStopPrice;
          state.trailingUpdatedAt = now;

          return {
            shouldTrigger: true,
            reason: `移动止损价上调至 ${state.trailingStopPrice.toFixed(2)}`,
            action: 'adjust_stop',
            newStopPrice: state.trailingStopPrice,
            urgency: 'low',
            metadata: {
              stopType: 'trailing_adjustment',
              currentValue: currentPrice,
              threshold: state.trailingStopPrice,
              position: {
                unrealizedPnL: position.unrealizedPnL,
                unrealizedPnLPercent: position.unrealizedPnLPercent,
                avgPrice: position.avgPrice,
                currentPrice: position.currentPrice
              }
            }
          };
        }
      }

      // 检查是否触及移动止损
      if (currentPrice <= state.trailingStopPrice) {
        const result: StopLossCheckResult = {
          shouldTrigger: true,
          reason: `价格 ${currentPrice.toFixed(2)} 跌破移动止损位 ${state.trailingStopPrice.toFixed(2)}`,
          action: 'close_all',
          urgency: 'high',
          metadata: {
            stopType: 'trailing',
            currentValue: currentPrice,
            threshold: state.trailingStopPrice,
            position: {
              unrealizedPnL: position.unrealizedPnL,
              unrealizedPnLPercent: position.unrealizedPnLPercent,
              avgPrice: position.avgPrice,
              currentPrice: position.currentPrice
            }
          }
        };

        this.recordEvent(coin, 'trailing', 'close_all', result.reason, currentPrice);
        return result;
      }
    }

    return this.createNoActionResult('trailing');
  }

  /**
   * 检查时间止损
   */
  private checkTimeStopLoss(
    coin: AllowedCoin,
    position: CoinPosition,
    state: CoinStopLossState
  ): StopLossCheckResult {
    if (!this.config.time.enabled) {
      return this.createNoActionResult('disabled');
    }

    const now = Date.now();

    // 检查是否到了检查时间
    if (now - state.lastTimeCheck < this.config.time.checkInterval) {
      return this.createNoActionResult('time');
    }

    state.lastTimeCheck = now;

    // 检查持仓时间
    const holdingTime = now - state.entryTime;
    if (holdingTime < this.config.time.maxHoldingTime) {
      return this.createNoActionResult('time');
    }

    // 检查是否亏损
    if (position.unrealizedPnLPercent > -this.config.time.lossThreshold) {
      return this.createNoActionResult('time');
    }

    // 触发时间止损，平仓一部分
    const result: StopLossCheckResult = {
      shouldTrigger: true,
      reason: `持仓时间过长 (${(holdingTime / (24 * 60 * 60 * 1000)).toFixed(0)} 天) 且亏损 ${position.unrealizedPnLPercent.toFixed(2)}%`,
      action: 'close_partial',
      closePercentage: this.config.time.closePercentage,
      urgency: 'medium',
      metadata: {
        stopType: 'time',
        currentValue: holdingTime,
        threshold: this.config.time.maxHoldingTime,
        position: {
          unrealizedPnL: position.unrealizedPnL,
          unrealizedPnLPercent: position.unrealizedPnLPercent,
          avgPrice: position.avgPrice,
          currentPrice: position.currentPrice
        }
      }
    };

    this.recordEvent(
      coin,
      'time',
      'close_partial',
      result.reason,
      position.currentPrice,
      this.config.time.closePercentage
    );

    return result;
  }

  /**
   * 检查波动率止损
   */
  private checkVolatilityStopLoss(
    coin: AllowedCoin,
    position: CoinPosition,
    state: CoinStopLossState,
    marketData: MarketData
  ): StopLossCheckResult {
    if (!this.config.volatility.enabled) {
      return this.createNoActionResult('disabled');
    }

    // 这里需要从 marketData 获取当前波动率
    // 简化处理，假设有 currentVolatility 字段
    const currentVolatility = (marketData as any).volatility || state.currentVolatility;

    // 更新波动率
    state.currentVolatility = currentVolatility;

    // 检查波动率是否骤降
    if (state.initialVolatility === 0) {
      return this.createNoActionResult('volatility');
    }

    const volatilityDrop = ((state.initialVolatility - currentVolatility) / state.initialVolatility) * 100;

    if (volatilityDrop < this.config.volatility.volatilityDropThreshold) {
      return this.createNoActionResult('volatility');
    }

    // 检查是否亏损
    if (position.unrealizedPnLPercent > -this.config.volatility.lossThreshold) {
      return this.createNoActionResult('volatility');
    }

    // 触发波动率止损，平仓一部分
    const result: StopLossCheckResult = {
      shouldTrigger: true,
      reason: `波动率下降 ${volatilityDrop.toFixed(1)}% 且亏损 ${position.unrealizedPnLPercent.toFixed(2)}%`,
      action: 'close_partial',
      closePercentage: this.config.volatility.closePercentage,
      urgency: 'medium',
      metadata: {
        stopType: 'volatility',
        currentValue: currentVolatility,
        threshold: state.initialVolatility,
        position: {
          unrealizedPnL: position.unrealizedPnL,
          unrealizedPnLPercent: position.unrealizedPnLPercent,
          avgPrice: position.avgPrice,
          currentPrice: position.currentPrice
        }
      }
    };

    this.recordEvent(
      coin,
      'volatility',
      'close_partial',
      result.reason,
      position.currentPrice,
      this.config.volatility.closePercentage
    );

    return result;
  }

  /**
   * 更新波动率
   */
  updateVolatility(coin: AllowedCoin, volatility: number): void {
    const state = this.states.get(coin);
    if (state) {
      state.currentVolatility = volatility;
      if (state.initialVolatility === 0) {
        state.initialVolatility = volatility;
      }
    }
  }

  /**
   * 手动设置止损价格
   */
  setStopPrice(coin: AllowedCoin, price: number): void {
    const state = this.states.get(coin);
    if (state) {
      state.percentageStopLoss = price;
    }
  }

  /**
   * 禁用币种的止损
   */
  disableStopLoss(coin: AllowedCoin): void {
    const state = this.states.get(coin);
    if (state) {
      state.enabled = false;
    }
  }

  /**
   * 启用币种的止损
   */
  enableStopLoss(coin: AllowedCoin): void {
    const state = this.states.get(coin);
    if (state) {
      state.enabled = true;
    }
  }

  /**
   * 获取止损状态
   */
  getStopLossState(coin: AllowedCoin): CoinStopLossState | undefined {
    return this.states.get(coin);
  }

  /**
   * 获取所有止损状态
   */
  getAllStates(): Map<AllowedCoin, CoinStopLossState> {
    return new Map(this.states);
  }

  /**
   * 获取事件历史
   */
  getEventHistory(limit?: number): StopLossEvent[] {
    if (limit) {
      return this.eventHistory.slice(-limit);
    }
    return [...this.eventHistory];
  }

  /**
   * 设置事件回调
   */
  setEventCallback(callback: (event: StopLossEvent) => void): void {
    this.eventCallback = callback;
  }

  /**
   * 记录止损事件
   */
  private recordEvent(
    coin: AllowedCoin,
    type: StopLossEvent['type'],
    action: StopLossEvent['action'],
    reason: string,
    price: number,
    closePercentage?: number
  ): void {
    const event: StopLossEvent = {
      timestamp: Date.now(),
      coin,
      type,
      action,
      reason,
      price,
      closePercentage,
      metadata: {}
    };

    this.eventHistory.push(event);

    // 更新状态
    const state = this.states.get(coin);
    if (state) {
      state.lastStopTriggerTime = Date.now();
      state.isInCooldown = true;
    }

    // 触发回调
    if (this.eventCallback) {
      this.eventCallback(event);
    }
  }

  /**
   * 创建无操作结果
   */
  private createNoActionResult(reason: string): StopLossCheckResult {
    return {
      shouldTrigger: false,
      reason,
      action: 'warning_only',
      urgency: 'low',
      metadata: {
        stopType: reason,
        currentValue: 0,
        threshold: 0,
        position: {
          unrealizedPnL: 0,
          unrealizedPnLPercent: 0,
          avgPrice: 0,
          currentPrice: 0
        }
      }
    };
  }

  /**
   * 重置币种状态
   */
  resetCoin(coin: AllowedCoin): void {
    this.states.delete(coin);
  }

  /**
   * 重置所有状态
   */
  resetAll(): void {
    this.states.clear();
    this.eventHistory = [];
  }

  /**
   * 清除事件历史
   */
  clearEventHistory(): void {
    this.eventHistory = [];
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<StopLossConfig>): void {
    this.config = {
      percentage: { ...this.config.percentage, ...config.percentage },
      trailing: { ...this.config.trailing, ...config.trailing },
      time: { ...this.config.time, ...config.time },
      volatility: { ...this.config.volatility, ...config.volatility },
      global: { ...this.config.global, ...config.global }
    };
  }

  /**
   * 获取配置
   */
  getConfig(): StopLossConfig {
    return { ...this.config };
  }

  /**
   * 生成报告
   */
  generateReport(coin: AllowedCoin): string {
    const state = this.states.get(coin);
    if (!state) {
      return `止损: ${coin} 未初始化`;
    }

    const recentEvents = this.eventHistory
      .filter(e => e.coin === coin)
      .slice(-5);

    return `
止损状态报告: ${coin}
====================
启用状态: ${state.enabled ? '启用' : '禁用'}

百分比止损:
  止损价: ${state.percentageStopLoss.toFixed(2)}
  警告价: ${state.percentageWarning.toFixed(2)}

移动止损:
  状态: ${state.trailingActive ? '已激活' : '未激活'}
  止损价: ${state.trailingStopPrice > 0 ? state.trailingStopPrice.toFixed(2) : 'N/A'}
  最高价: ${state.highestPrice.toFixed(2)}

时间止损:
  入场时间: ${new Date(state.entryTime).toLocaleString()}
  持仓时长: ${((Date.now() - state.entryTime) / (24 * 60 * 60 * 1000)).toFixed(1)} 天

波动率止损:
  初始波动率: ${state.initialVolatility.toFixed(2)}%
  当前波动率: ${state.currentVolatility.toFixed(2)}%

冷却状态: ${state.isInCooldown ? '冷却中' : '正常'}
最近止损: ${state.lastStopTriggerTime > 0 ? new Date(state.lastStopTriggerTime).toLocaleString() : '无'}

最近事件 (${recentEvents.length}):
${recentEvents.map(e => `  ${new Date(e.timestamp).toLocaleString()}: ${e.type} - ${e.action}`).join('\n') || '  无'}
    `.trim();
  }
}
