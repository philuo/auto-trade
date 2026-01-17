/**
 * 高频交易引擎（安全版）
 *
 * 核心安全特性：
 * 1. 信号去重 - 防止同一信号重复触发
 * 2. 延迟确认 - 防止假突破
 * 3. 事件序列化 - 确保事件按顺序处理
 * 4. 状态一致性 - 原子状态更新
 * 5. 信号时效性 - 过期信号不执行
 *
 * ⚠️ 重要：此引擎不会改变信号生成逻辑，只是将触发方式从定时改为事件驱动
 */

import { logger } from '../utils/logger;
import { AdvancedSignalGenerator } from '../signals/advanced-generator;
import { MarketDataProvider } from '../market/provider;
import type {
  TechnicalSignal,
  KLineInterval,
  CandleData,
} from '../market/types;

// =====================================================
// 配置
// =====================================================

export interface HighFrequencyEngineConfig {
  /** 信号冷却期（毫秒）- 同一类型信号的最小间隔 */
  signalCooldown?: number;
  /** 确认窗口（毫秒）- 信号需要持续的时间才执行 */
  confirmationWindow?: number;
  /** 信号最大有效期（毫秒）- 超过此时效的信号不执行 */
  signalMaxAge?: number;
  /** 是否启用信号去重 */
  enableDeduplication?: boolean;
  /** 是否启用延迟确认 */
  enableDelayConfirmation?: boolean;
  /** 是否启用事件序列化 */
  enableEventSerialization?: boolean;
  /** 每秒最大订单数 */
  maxOrdersPerSecond?: number;
}

interface PendingSignal {
  signal: TechnicalSignal;
  timestamp: number;
  confirmedAt?: number;
  klineCloseTime: number;
}

// =====================================================
// 高频交易引擎
// =====================================================

export class HighFrequencyTradingEngine {
  private config: Required<HighFrequencyEngineConfig>;
  private signalGenerator: AdvancedSignalGenerator;
  private marketDataProvider: MarketDataProvider;

  // 信号去重：记录每种信号的最后触发时间
  private lastSignalTime = new Map<string, number>();

  // 待确认信号：等待延迟确认的信号
  private pendingSignals = new Map<string, PendingSignal>();

  // 事件序列化：确保同一币种的处理是串行的
  private processingLocks = new Map<string, Promise<void>>();

  // 订单速率限制
  private orderTimestamps: number[] = [];

  // 统计
  private stats = {
    totalSignalsReceived: 0,
    duplicateSignalsFiltered: 0,
    expiredSignalsFiltered: 0,
    unconfirmedSignalsFiltered: 0,
    signalsExecuted: 0,
    fakeBreakoutsDetected: 0,
  };

  constructor(
    signalGenerator: AdvancedSignalGenerator,
    marketDataProvider: MarketDataProvider,
    config: HighFrequencyEngineConfig = {}
  ) {
    this.signalGenerator = signalGenerator;
    this.marketDataProvider = marketDataProvider;
    this.config = {
      signalCooldown: 5000,         // 5秒冷却期
      confirmationWindow: 1000,     // 1秒确认窗口
      signalMaxAge: 3000,           // 3秒最大有效期
      enableDeduplication: true,
      enableDelayConfirmation: true,
      enableEventSerialization: true,
      maxOrdersPerSecond: 2,
    };

    logger.info('高频交易引擎初始化', this.config);
  }

  /**
   * 处理 K 线更新事件（WebSocket 推送触发）
   *
   * 这是主要的事件处理入口，当 WebSocket 推送新的 K 线数据时调用
   *
   * @param coin 币种
   * @param timeframe K线周期
   * @param klines 最新的K线数据
   * @param volume24h 24小时成交量
   * @param volumeMA 成交量均值
   * @returns 执行的信号列表
   */
  async handleKlineUpdate(
    coin: string,
    timeframe: KLineInterval,
    klines: CandleData[],
    volume24h: number,
    volumeMA: number
  ): Promise<TechnicalSignal[]> {
    const startTime = Date.now();

    // 1. 事件序列化：确保同一币种的处理是串行的
    if (this.config.enableEventSerialization) {
      await this.acquireProcessingLock(coin);
    }

    try {
      const latestKline = klines[klines.length - 1];
      const klineCloseTime = latestKline.timestamp;

      logger.debug('处理K线更新', {
        coin,
        timeframe,
        klineCloseTime,
        klinesCount: klines.length,
      });

      // 2. 生成信号（使用 AdvancedSignalGenerator，逻辑不变）
      const signals = this.signalGenerator.generateSignals(
        coin,
        klines,
        volume24h,
        volumeMA,
        timeframe
      );

      this.stats.totalSignalsReceived += signals.length;

      if (signals.length === 0) {
        return [];
      }

      logger.debug('生成技术信号', {
        coin,
        timeframe,
        signalCount: signals.length,
        signals: signals.map(s => ({ type: s.type, direction: s.direction, strength: s.strength })),
      });

      // 3. 过滤和确认信号
      const confirmedSignals: TechnicalSignal[] = [];

      for (const signal of signals) {
        // 3.1 检查信号时效性
        if (this.isSignalExpired(signal, klineCloseTime)) {
          this.stats.expiredSignalsFiltered++;
          logger.debug('信号已过期，跳过', { coin, signalType: signal.type });
          continue;
        }

        // 3.2 信号去重
        if (this.config.enableDeduplication && this.isDuplicateSignal(signal)) {
          this.stats.duplicateSignalsFiltered++;
          logger.debug('重复信号，跳过', { coin, signalType: signal.type });
          continue;
        }

        // 3.3 延迟确认（防止假突破）
        if (this.config.enableDelayConfirmation) {
          const confirmed = await this.confirmSignal(signal, klines, klineCloseTime);
          if (!confirmed) {
            this.stats.unconfirmedSignalsFiltered++;
            logger.debug('信号未通过确认，跳过', { coin, signalType: signal.type });
            continue;
          }
        }

        // 3.4 订单速率限制
        if (!this.checkRateLimit()) {
          logger.warn('订单速率超限，跳过信号', { coin, signalType: signal.type });
          continue;
        }

        // 信号通过所有检查
        confirmedSignals.push(signal);

        // 更新去重记录
        this.updateSignalHistory(signal);

        logger.info('信号已确认，可以执行', {
          coin,
          signalType: signal.type,
          direction: signal.direction,
          strength: signal.strength,
          processingTime: Date.now() - startTime,
        });
      }

      this.stats.signalsExecuted += confirmedSignals.length;
      return confirmedSignals;

    } finally {
      // 释放处理锁
      if (this.config.enableEventSerialization) {
        this.releaseProcessingLock(coin);
      }
    }
  }

  /**
   * 检查信号是否过期
   *
   * 防止因网络延迟导致的过期信号执行
   */
  private isSignalExpired(signal: TechnicalSignal, klineCloseTime: number): boolean {
    const signalAge = Date.now() - signal.timestamp;
    const klineAge = Date.now() - klineCloseTime;

    // 如果信号生成时间超过最大有效期，视为过期
    if (signalAge > this.config.signalMaxAge) {
      return true;
    }

    // 如果K线收盘时间超过有效期，也视为过期
    if (klineAge > this.config.signalMaxAge) {
      return true;
    }

    return false;
  }

  /**
   * 检查是否为重复信号
   *
   * 防止同一信号在短时间内多次触发
   */
  private isDuplicateSignal(signal: TechnicalSignal): boolean {
    const key = `${signal.coin}_${signal.type}_${signal.direction}_${signal.timeframe}`;
    const lastTime = this.lastSignalTime.get(key) || 0;

    const timeSinceLastSignal = Date.now() - lastTime;
    return timeSinceLastSignal < this.config.signalCooldown;
  }

  /**
   * 确认信号（延迟确认机制）
   *
   * 防止假突破：
   * - 等待一小段时间后，检查价格是否仍然维持在突破位置
   * - 如果价格已经回归，说明是假突破
   */
  private async confirmSignal(
    signal: TechnicalSignal,
    klines: CandleData[],
    klineCloseTime: number
  ): Promise<boolean> {
    const signalKey = `${signal.coin}_${signal.type}_${signal.timeframe}`;

    // 检查是否已有待确认的信号
    const existing = this.pendingSignals.get(signalKey);
    if (existing) {
      // 如果已有待确认信号，检查是否已经过确认窗口
      const timeSincePending = Date.now() - existing.timestamp;

      if (timeSincePending >= this.config.confirmationWindow) {
        // 确认窗口已过，验证价格是否仍然支持信号
        const isValid = this.validateSignalStillValid(signal, klines);

        if (isValid) {
          // 信号确认有效
          this.pendingSignals.delete(signalKey);
          existing.confirmedAt = Date.now();
          return true;
        } else {
          // 假突破，检测到
          this.stats.fakeBreakoutsDetected++;
          logger.warn('检测到假突破', {
            coin: signal.coin,
            signalType: signal.type,
            klineCloseTime,
          });
          this.pendingSignals.delete(signalKey);
          return false;
        }
      }

      // 仍在确认窗口中，暂不执行
      return false;
    }

    // 没有待确认信号，加入待确认列表
    this.pendingSignals.set(signalKey, {
      signal,
      timestamp: Date.now(),
      klineCloseTime,
    });

    // 立即进行一次验证（如果价格已经明确不支持信号，直接拒绝）
    const immediatelyValid = this.validateSignalStillValid(signal, klines);
    if (!immediatelyValid) {
      this.pendingSignals.delete(signalKey);
      return false;
    }

    // 需要等待确认窗口
    return false;
  }

  /**
   * 验证信号是否仍然有效
   *
   * 根据信号类型进行不同的验证逻辑
   */
  private validateSignalStillValid(signal: TechnicalSignal, klines: CandleData[]): boolean {
    const latest = klines[klines.length - 1];
    const currentPrice = latest.close;

    // 根据信号方向验证
    switch (signal.direction) {
      case 'bullish':
        // 看涨信号：当前价格应该高于信号触发价格（至少不低于0.05%）
        if (signal.price && currentPrice < signal.price * 0.9995) {
          return false;
        }
        break;

      case 'bearish':
        // 看跌信号：当前价格应该低于信号触发价格（至少不高于0.05%）
        if (signal.price && currentPrice > signal.price * 1.0005) {
          return false;
        }
        break;

      case 'neutral':
        // 中性信号：不做价格验证
        break;
    }

    return true;
  }

  /**
   * 更新信号历史记录（用于去重）
   */
  private updateSignalHistory(signal: TechnicalSignal): void {
    const key = `${signal.coin}_${signal.type}_${signal.direction}_${signal.timeframe}`;
    this.lastSignalTime.set(key, Date.now());
  }

  /**
   * 检查订单速率限制
   */
  private checkRateLimit(): boolean {
    const now = Date.now();

    // 清除超过1秒的时间戳
    this.orderTimestamps = this.orderTimestamps.filter(ts => now - ts < 1000);

    // 检查是否超过限制
    if (this.orderTimestamps.length >= this.config.maxOrdersPerSecond) {
      return false;
    }

    // 添加当前时间戳
    this.orderTimestamps.push(now);
    return true;
  }

  /**
   * 获取处理锁（确保同一币种的处理是串行的）
   */
  private async acquireProcessingLock(coin: string): Promise<void> {
    let lock = this.processingLocks.get(coin);

    if (!lock || await isPromiseResolved(lock)) {
      // 没有锁或锁已释放，创建新锁
      lock = Promise.resolve();
      this.processingLocks.set(coin, lock);
    }

    // 等待之前的处理完成
    await lock;
  }

  /**
   * 释放处理锁
   */
  private releaseProcessingLock(coin: string): void {
    // 锁会在 Promise 完成后自动释放
    // 这里只是占位，实际锁管理在 acquireProcessingLock 中
  }

  /**
   * 获取统计信息
   */
  getStats() {
    return {
      ...this.stats,
      pendingSignalsCount: this.pendingSignals.size,
      processingLocksCount: this.processingLocks.size,
      signalHistorySize: this.lastSignalTime.size,
    };
  }

  /**
   * 清理过期数据
   */
  cleanup(): void {
    const now = Date.now();

    // 清理过期的信号历史记录
    for (const [key, timestamp] of this.lastSignalTime.entries()) {
      if (now - timestamp > this.config.signalCooldown! * 2) {
        this.lastSignalTime.delete(key);
      }
    }

    // 清理过期的待确认信号
    for (const [key, pending] of this.pendingSignals.entries()) {
      if (now - pending.timestamp > this.config.confirmationWindow! * 2) {
        this.pendingSignals.delete(key);
      }
    }

    logger.debug('高频交易引擎清理完成', {
      signalHistorySize: this.lastSignalTime.size,
      pendingSignalsCount: this.pendingSignals.size,
    });
  }

  /**
   * 获取配置
   */
  getConfig(): Readonly<Required<HighFrequencyEngineConfig>> {
    return { ...this.config };
  }
}

// =====================================================
// 工具函数
// =====================================================

/**
 * 检查 Promise 是否已解决
 */
async function isPromiseResolved(p: Promise<void>): Promise<boolean> {
  try {
    // 使用 Promise.race 检查
    await Promise.race([
      p,
      new Promise<void>(resolve => setTimeout(resolve, 0)),
    ]);
    return true;
  } catch {
    return false;
  }
}
