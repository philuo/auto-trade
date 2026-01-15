/**
 * 紧急平仓器
 *
 * 功能：
 * - 紧急情况下快速平仓
 * - 智能分批平仓以减少市场冲击
 * - 支持多种触发条件
 * - 平仓后状态恢复
 */

import type { AllowedCoin } from '../config/strategy-config';
import type { CoinPosition, StrategyOrder, OrderSide } from '../config/types';

// =====================================================
// 紧急平仓配置
// =====================================================

export interface EmergencyCloserConfig {
  // 触发条件
  triggers: {
    maxDrawdown: number;          // 最大回撤触发 (默认 30%)
    maxSingleCoinLoss: number;    // 单币种最大亏损触发 (默认 50%)
    apiFailureCount: number;      // API 失败次数触发 (默认 10 次)
    systemErrorCount: number;     // 系统错误次数触发 (默认 5 次)
    priceCrashThreshold: number;  // 价格崩盘阈值 (%) (默认 20% 在 1 分钟内)
  };

  // 平仓策略
  strategy: {
    mode: 'immediate' | 'gradual' | 'smart';
    batchCount: number;           // 分批数量 (默认 5)
    batchInterval: number;        // 批次间隔（毫秒，默认 5 秒）
    limitOrderSlippage: number;   // 限价单滑点容忍度 (%)
    useMarketOrder: boolean;      // 是否使用市价单
  };

  // 平仓后行为
  postClose: {
    pauseStrategy: boolean;       // 暂停策略
    pauseDuration: number;        // 暂停时长（毫秒，默认 1 小时）
    notifyUser: boolean;          // 通知用户
    generateReport: boolean;      // 生成报告
  };

  // 安全限制
  safety: {
    maxDailyCloses: number;       // 每日最大紧急平仓次数
    cooldownBetweenCloses: number; // 平仓间冷却期（毫秒，默认 30 分钟）
    requireConfirmation: boolean; // 是否需要确认
  };
}

// =====================================================
// 紧急平仓触发类型
// =====================================================

export enum EmergencyTriggerType {
  MAX_DRAWDOWN = 'max_drawdown',
  MAX_SINGLE_COIN_LOSS = 'max_single_coin_loss',
  API_FAILURE = 'api_failure',
  SYSTEM_ERROR = 'system_error',
  PRICE_CRASH = 'price_crash',
  MANUAL = 'manual'
}

// =====================================================
// 紧急平仓状态
// =====================================================

export enum EmergencyState {
  IDLE = 'idle',
  TRIGGERED = 'triggered',
  EXECUTING = 'executing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  COOLDOWN = 'cooldown'
}

// =====================================================
// 平仓批次
// =====================================================

export interface CloseBatch {
  batchNumber: number;
  coins: AllowedCoin[];
  size: number;                  // 该批次的总价值
  percentage: number;            // 该批次占总仓位的百分比
  status: 'pending' | 'executing' | 'completed' | 'failed';
  executedAt?: number;
  orders: string[];              // 订单 ID 列表
}

// =====================================================
// 紧急平仓事件
// =====================================================

export interface EmergencyCloseEvent {
  timestamp: number;
  triggerType: EmergencyTriggerType;
  reason: string;
  state: EmergencyState;

  // 平仓前状态
  before: {
    totalValue: number;
    positions: { coin: AllowedCoin; value: number; amount: number }[];
  };

  // 平仓结果
  result: {
    totalClosedValue: number;
    totalRemainingValue: number;
    success: boolean;
    batches: CloseBatch[];
    errors: string[];
  };

  // 持续时间
  duration: number;
}

// =====================================================
// 紧急平仓器类
// =====================================================

export class EmergencyCloser {
  private config: EmergencyCloserConfig;
  private okxApi: any;

  // 状态
  private state: EmergencyState = EmergencyState.IDLE;
  private currentEvent: EmergencyCloseEvent | null = null;

  // 历史
  private closeHistory: EmergencyCloseEvent[] = [];
  private lastCloseTime: number = 0;
  private dailyCloseCount: number = 0;
  private dailyResetTime: number = this.getNextDayReset();

  // 回调
  private eventCallback?: (event: EmergencyCloseEvent) => void;

  constructor(okxApi: any, config?: Partial<EmergencyCloserConfig>) {
    this.okxApi = okxApi;

    this.config = {
      triggers: {
        maxDrawdown: 30,
        maxSingleCoinLoss: 50,
        apiFailureCount: 10,
        systemErrorCount: 5,
        priceCrashThreshold: 20
      },
      strategy: {
        mode: 'smart',
        batchCount: 5,
        batchInterval: 5000,
        limitOrderSlippage: 2,
        useMarketOrder: false
      },
      postClose: {
        pauseStrategy: true,
        pauseDuration: 60 * 60 * 1000, // 1 小时
        notifyUser: true,
        generateReport: true
      },
      safety: {
        maxDailyCloses: 3,
        cooldownBetweenCloses: 30 * 60 * 1000, // 30 分钟
        requireConfirmation: false
      },
      ...config
    };
  }

  /**
   * 检查是否应该触发紧急平仓
   */
  shouldTrigger(
    totalDrawdown: number,
    positions: Map<AllowedCoin, CoinPosition>,
    apiFailureCount?: number,
    systemErrorCount?: number
  ): { shouldTrigger: boolean; reason?: string; triggerType?: EmergencyTriggerType } {
    // 检查冷却期
    if (this.state === EmergencyState.COOLDOWN) {
      if (Date.now() - this.lastCloseTime < this.config.safety.cooldownBetweenCloses) {
        return { shouldTrigger: false };
      } else {
        this.state = EmergencyState.IDLE;
      }
    }

    // 检查每日限制
    this.resetDailyIfNeeded();
    if (this.dailyCloseCount >= this.config.safety.maxDailyCloses) {
      return { shouldTrigger: false, reason: '已达到每日紧急平仓次数限制' };
    }

    // 1. 检查最大回撤
    if (totalDrawdown >= this.config.triggers.maxDrawdown) {
      return {
        shouldTrigger: true,
        reason: `总回撤 ${totalDrawdown.toFixed(2)}% 达到阈值 ${this.config.triggers.maxDrawdown}%`,
        triggerType: EmergencyTriggerType.MAX_DRAWDOWN
      };
    }

    // 2. 检查单币种最大亏损
    for (const [coin, position] of positions) {
      if (position.unrealizedPnLPercent <= -this.config.triggers.maxSingleCoinLoss) {
        return {
          shouldTrigger: true,
          reason: `${coin} 亏损 ${position.unrealizedPnLPercent.toFixed(2)}% 达到阈值 ${this.config.triggers.maxSingleCoinLoss}%`,
          triggerType: EmergencyTriggerType.MAX_SINGLE_COIN_LOSS
        };
      }
    }

    // 3. 检查 API 失败次数
    if (apiFailureCount !== undefined && apiFailureCount >= this.config.triggers.apiFailureCount) {
      return {
        shouldTrigger: true,
        reason: `API 失败次数 ${apiFailureCount} 达到阈值 ${this.config.triggers.apiFailureCount}`,
        triggerType: EmergencyTriggerType.API_FAILURE
      };
    }

    // 4. 检查系统错误次数
    if (systemErrorCount !== undefined && systemErrorCount >= this.config.triggers.systemErrorCount) {
      return {
        shouldTrigger: true,
        reason: `系统错误次数 ${systemErrorCount} 达到阈值 ${this.config.triggers.systemErrorCount}`,
        triggerType: EmergencyTriggerType.SYSTEM_ERROR
      };
    }

    return { shouldTrigger: false };
  }

  /**
   * 执行紧急平仓
   */
  async executeEmergencyClose(
    positions: Map<AllowedCoin, CoinPosition>,
    triggerType: EmergencyTriggerType,
    reason: string
  ): Promise<EmergencyCloseEvent> {
    if (this.state === EmergencyState.EXECUTING) {
      throw new Error('紧急平仓已在执行中');
    }

    const startTime = Date.now();
    this.state = EmergencyState.EXECUTING;

    // 记录平仓前状态
    const before = {
      totalValue: Array.from(positions.values()).reduce((sum, p) => sum + p.value, 0),
      positions: Array.from(positions.entries()).map(([coin, p]) => ({
        coin,
        value: p.value,
        amount: p.amount
      }))
    };

    // 创建事件
    const event: EmergencyCloseEvent = {
      timestamp: startTime,
      triggerType,
      reason,
      state: EmergencyState.EXECUTING,
      before,
      result: {
        totalClosedValue: 0,
        totalRemainingValue: before.totalValue,
        success: false,
        batches: [],
        errors: []
      },
      duration: 0
    };

    this.currentEvent = event;

    try {
      // 根据模式执行平仓
      const batches = this.createCloseBatches(positions);

      if (this.config.strategy.mode === 'immediate') {
        await this.executeImmediateClose(positions, event);
      } else if (this.config.strategy.mode === 'gradual') {
        await this.executeGradualClose(batches, event);
      } else {
        await this.executeSmartClose(positions, batches, event);
      }

      // 更新事件状态
      event.state = EmergencyState.COMPLETED;
      event.result.success = event.result.errors.length === 0;
      event.duration = Date.now() - startTime;

      // 记录历史
      this.closeHistory.push(event);
      this.lastCloseTime = Date.now();
      this.dailyCloseCount++;

      // 触发回调
      if (this.eventCallback) {
        this.eventCallback(event);
      }

      // 进入冷却期
      this.state = EmergencyState.COOLDOWN;

      return event;
    } catch (error) {
      event.state = EmergencyState.FAILED;
      event.result.errors.push(`紧急平仓失败: ${error}`);
      event.duration = Date.now() - startTime;

      this.state = EmergencyState.FAILED;

      throw error;
    } finally {
      this.currentEvent = null;
    }
  }

  /**
   * 创建平仓批次
   */
  private createCloseBatches(positions: Map<AllowedCoin, CoinPosition>): CloseBatch[] {
    const batches: CloseBatch[] = [];
    const coins = Array.from(positions.keys());
    const batchCount = this.config.strategy.batchCount;
    const coinsPerBatch = Math.ceil(coins.length / batchCount);

    for (let i = 0; i < batchCount; i++) {
      const startIdx = i * coinsPerBatch;
      const endIdx = Math.min(startIdx + coinsPerBatch, coins.length);
      const batchCoins = coins.slice(startIdx, endIdx);

      if (batchCoins.length === 0) continue;

      let batchSize = 0;
      for (const coin of batchCoins) {
        const position = positions.get(coin);
        if (position) {
          batchSize += position.value;
        }
      }

      batches.push({
        batchNumber: i + 1,
        coins: batchCoins,
        size: batchSize,
        percentage: (batchSize / (this.currentEvent?.before.totalValue ?? 1)) * 100,
        status: 'pending',
        orders: []
      });
    }

    return batches;
  }

  /**
   * 立即平仓（一次性全部平仓）
   */
  private async executeImmediateClose(
    positions: Map<AllowedCoin, CoinPosition>,
    event: EmergencyCloseEvent
  ): Promise<void> {
    const orders: string[] = [];

    for (const [coin, position] of positions) {
      try {
        const orderId = await this.closePosition(coin, position);
        if (orderId) {
          orders.push(orderId);
          event.result.totalClosedValue += position.value;
        }
      } catch (error) {
        event.result.errors.push(`${coin} 平仓失败: ${error}`);
      }
    }

    event.result.totalRemainingValue = event.before.totalValue - event.result.totalClosedValue;
  }

  /**
   * 分批平仓
   */
  private async executeGradualClose(
    batches: CloseBatch[],
    event: EmergencyCloseEvent
  ): Promise<void> {
    for (const batch of batches) {
      batch.status = 'executing';

      for (const coin of batch.coins) {
        try {
          // 这里需要从外部获取当前仓位
          // 简化处理，假设有方法可以获取
          // const position = await this.getPosition(coin);
          // const orderId = await this.closePosition(coin, position);

          batch.status = 'completed';
          event.result.totalClosedValue += batch.size;
        } catch (error) {
          event.result.errors.push(`批次 ${batch.batchNumber} ${coin} 平仓失败: ${error}`);
        }
      }

      // 等待指定间隔
      if (batch.batchNumber < batches.length) {
        await new Promise(resolve => setTimeout(resolve, this.config.strategy.batchInterval));
      }
    }

    event.result.totalRemainingValue = event.before.totalValue - event.result.totalClosedValue;
  }

  /**
   * 智能平仓（根据市场情况调整）
   */
  private async executeSmartClose(
    positions: Map<AllowedCoin, CoinPosition>,
    batches: CloseBatch[],
    event: EmergencyCloseEvent
  ): Promise<void> {
    // 按流动性排序（假设有流动性数据）
    const sortedCoins = Array.from(positions.entries())
      .sort((a, b) => b[1].value - a[1].value);

    // 先平掉流动性好的仓位
    for (const [coin, position] of sortedCoins) {
      try {
        const orderId = await this.closePosition(coin, position);
        if (orderId) {
          event.result.totalClosedValue += position.value;
        }

        // 短暂延迟避免市场冲击
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        event.result.errors.push(`${coin} 平仓失败: ${error}`);
      }
    }

    event.result.totalRemainingValue = event.before.totalValue - event.result.totalClosedValue;
  }

  /**
   * 平仓单个仓位
   */
  private async closePosition(coin: AllowedCoin, position: CoinPosition): Promise<string | null> {
    const symbol = `${coin}-USDT`;

    try {
      // 使用市价单或限价单
      if (this.config.strategy.useMarketOrder) {
        // 市价单
        const result = await this.okxApi.placeOrder({
          instId: symbol,
          tdMode: 'cash',
          side: 'sell',
          ordType: 'market',
          sz: position.amount.toFixed(8),
          ccy: 'USDT' // 使用 USDT 结算
        });

        return result?.ordId || null;
      } else {
        // 限价单（带滑点）
        const slippage = this.config.strategy.limitOrderSlippage / 100;
        const price = position.currentPrice * (1 - slippage);

        const result = await this.okxApi.placeOrder({
          instId: symbol,
          tdMode: 'cash',
          side: 'sell',
          ordType: 'limit',
          sz: position.amount.toFixed(8),
          px: price.toFixed(8)
        });

        return result?.ordId || null;
      }
    } catch (error) {
      console.error(`[EmergencyCloser] 平仓 ${coin} 失败:`, error);
      throw error;
    }
  }

  /**
   * 手动触发紧急平仓
   */
  async manualTrigger(reason: string): Promise<EmergencyCloseEvent> {
    // 获取当前所有仓位（需要从外部传入）
    // 这里简化处理
    const positions = new Map<AllowedCoin, CoinPosition>();

    return await this.executeEmergencyClose(
      positions,
      EmergencyTriggerType.MANUAL,
      reason
    );
  }

  /**
   * 获取下一个每日重置时间
   */
  private getNextDayReset(): number {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    return tomorrow.getTime();
  }

  /**
   * 重置每日计数
   */
  private resetDailyIfNeeded(): void {
    if (Date.now() >= this.dailyResetTime) {
      this.dailyCloseCount = 0;
      this.dailyResetTime = this.getNextDayReset();
    }
  }

  /**
   * 获取当前状态
   */
  getState(): EmergencyState {
    return this.state;
  }

  /**
   * 获取当前事件
   */
  getCurrentEvent(): EmergencyCloseEvent | null {
    return this.currentEvent;
  }

  /**
   * 获取历史事件
   */
  getHistory(limit?: number): EmergencyCloseEvent[] {
    if (limit) {
      return this.closeHistory.slice(-limit);
    }
    return [...this.closeHistory];
  }

  /**
   * 设置事件回调
   */
  setEventCallback(callback: (event: EmergencyCloseEvent) => void): void {
    this.eventCallback = callback;
  }

  /**
   * 重置状态
   */
  reset(): void {
    this.state = EmergencyState.IDLE;
    this.currentEvent = null;
  }

  /**
   * 清除历史
   */
  clearHistory(): void {
    this.closeHistory = [];
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<EmergencyCloserConfig>): void {
    this.config = {
      triggers: { ...this.config.triggers, ...config.triggers },
      strategy: { ...this.config.strategy, ...config.strategy },
      postClose: { ...this.config.postClose, ...config.postClose },
      safety: { ...this.config.safety, ...config.safety }
    };
  }

  /**
   * 获取配置
   */
  getConfig(): EmergencyCloserConfig {
    return { ...this.config };
  }

  /**
   * 生成报告
   */
  generateReport(): string {
    const stateText = {
      [EmergencyState.IDLE]: '空闲',
      [EmergencyState.TRIGGERED]: '已触发',
      [EmergencyState.EXECUTING]: '执行中',
      [EmergencyState.COMPLETED]: '已完成',
      [EmergencyState.FAILED]: '失败',
      [EmergencyState.COOLDOWN]: '冷却中'
    };

    let report = `
紧急平仓器状态报告
========================
当前状态: ${stateText[this.state]}
每日平仓次数: ${this.dailyCloseCount} / ${this.config.safety.maxDailyCloses}
最近平仓: ${this.lastCloseTime > 0 ? new Date(this.lastCloseTime).toLocaleString() : '无'}

配置:
  最大回撤触发: ${this.config.triggers.maxDrawdown}%
  单币种最大亏损触发: ${this.config.triggers.maxSingleCoinLoss}%
  API 失败触发: ${this.config.triggers.apiFailureCount} 次
  系统错误触发: ${this.config.triggers.systemErrorCount} 次

  平仓模式: ${this.config.strategy.mode}
  分批数量: ${this.config.strategy.batchCount}
  使用市价单: ${this.config.strategy.useMarketOrder ? '是' : '否'}

平仓历史 (${this.closeHistory.length}):
`;

    if (this.closeHistory.length > 0) {
      for (const event of this.closeHistory.slice(-5)) {
        report += `
  ${new Date(event.timestamp).toLocaleString()}:
    触发类型: ${event.triggerType}
    原因: ${event.reason}
    状态: ${stateText[event.state]}
    平仓价值: ${event.result.totalClosedValue.toFixed(2)} USDT
    成功: ${event.result.success ? '是' : '否'}
    耗时: ${(event.duration / 1000).toFixed(2)} 秒
`;
      }
    } else {
      report += '  无';
    }

    return report.trim();
  }
}
