/**
 * DCA (Dollar Cost Averaging) 策略引擎
 *
 * 功能：
 * - 定期定额买入
 * - 逆向 DCA（价格下跌时加倍买入）
 * - 自动计算平均成本
 * - DCA 订单决策
 */

import type {
  AllowedCoin,
  DCAConfig
} from '../config/strategy-config';
import type {
  DCAOrder,
  CoinPosition,
  MarketData
} from '../config/types';
import { logger } from '../../../utils/logger';

// =====================================================
// DCA 引擎状态
// =====================================================

/**
 * 币种 DCA 状态
 */
interface DCACoinState {
  coin: AllowedCoin;
  enabled: boolean;

  // DCA 配置
  baseOrderSize: number;
  frequency: number;
  maxOrders: number;

  // 当前状态
  totalOrders: number;
  totalInvested: number;
  totalAmount: number;
  avgEntryPrice: number;

  // 逆向 DCA
  reverseDCAEnabled: boolean;
  reverseDCALevel: number;       // 当前逆向 DCA 层级
  lastPrice: number;
  highestPrice: number;          // 入场后的最高价（用于逆向 DCA 触发）

  // 时间记录
  lastRegularDCA: number;        // 上次常规 DCA 时间
  lastReverseDCA: number;        // 上次逆向 DCA 时间
  createdAt: number;
}

// =====================================================
// DCA 引擎类
// =====================================================

export class DCAEngine {
  private config: DCAConfig;
  private states: Map<AllowedCoin, DCACoinState> = new Map();

  constructor(config: DCAConfig) {
    this.config = config;
  }

  /**
   * 初始化币种的 DCA 状态
   */
  initializeCoin(coin: AllowedCoin, position?: CoinPosition): void {
    if (!this.config.enabled) {
      return;
    }

    const state: DCACoinState = {
      coin,
      enabled: true,
      baseOrderSize: this.config.baseOrderSize,
      frequency: this.config.frequency,
      maxOrders: this.config.maxOrders,
      totalOrders: position ? Math.floor(position.cost / this.config.baseOrderSize) : 0,
      totalInvested: position?.cost || 0,
      totalAmount: position?.amount || 0,
      avgEntryPrice: position?.avgPrice || 0,
      reverseDCAEnabled: this.config.reverseDCA.enabled,
      reverseDCALevel: 0,
      lastPrice: position?.currentPrice || 0,
      highestPrice: position?.currentPrice || 0,
      lastRegularDCA: 0,
      lastReverseDCA: 0,
      createdAt: Date.now()
    };

    this.states.set(coin, state);
  }

  /**
   * 更新币种状态
   */
  updateCoinState(coin: AllowedCoin, position: CoinPosition): void {
    const state = this.states.get(coin);
    if (!state) {
      this.initializeCoin(coin, position);
      return;
    }

    state.totalAmount = position.amount;
    state.totalInvested = position.cost;
    state.avgEntryPrice = position.avgPrice;
    state.lastPrice = position.currentPrice;

    // 更新最高价
    if (position.currentPrice > state.highestPrice) {
      state.highestPrice = position.currentPrice;
    }
  }

  /**
   * 检查是否需要执行 DCA
   */
  async checkDCA(coin: AllowedCoin, marketData: MarketData): Promise<DCAOrder | null> {
    const state = this.states.get(coin);
    if (!state || !state.enabled || !this.config.enabled) {
      return null;
    }

    // 检查是否达到最大订单数
    if (state.totalOrders >= this.config.maxOrders) {
      return null;
    }

    const currentPrice = marketData.price;
    const now = Date.now();

    // 1. 检查逆向 DCA（优先级更高）
    if (this.config.reverseDCA.enabled) {
      const reverseOrder = this.checkReverseDCA(coin, state, currentPrice, now);
      if (reverseOrder) {
        // 🔍 记录逆向 DCA 决策日志
        logger.decision({
          coin,
          strategy: 'dca',
          action: 'buy',
          reason: reverseOrder.reason,
          marketData: {
            price: currentPrice,
            change24h: 0,
            volume24h: 0
          },
          decisionFactors: {
            dcaType: 'reverse',
            level: reverseOrder.level,
            multiplier: reverseOrder.multiplier,
            orderSize: reverseOrder.size,
            avgEntryPrice: state.avgEntryPrice,
            priceDrop: ((state.avgEntryPrice - currentPrice) / state.avgEntryPrice * 100).toFixed(2) + '%',
            totalOrders: state.totalOrders,
            totalInvested: state.totalInvested
          }
        });
        return reverseOrder;
      }
    }

    // 2. 检查常规 DCA
    const regularOrder = this.checkRegularDCA(coin, state, currentPrice, now);
    if (regularOrder) {
      // 🔍 记录常规 DCA 决策日志
      logger.decision({
        coin,
        strategy: 'dca',
        action: 'buy',
        reason: regularOrder.reason,
        marketData: {
          price: currentPrice,
          change24h: 0,
          volume24h: 0
        },
        decisionFactors: {
          dcaType: 'regular',
          orderSize: regularOrder.size,
          frequency: this.config.frequency,
          totalOrders: state.totalOrders,
          totalInvested: state.totalInvested,
          lastRegularDCA: state.lastRegularDCA ? new Date(state.lastRegularDCA).toISOString() : 'never'
        }
      });
      return regularOrder;
    }

    return null;
  }

  /**
   * 检查逆向 DCA
   */
  private checkReverseDCA(
    coin: AllowedCoin,
    state: DCACoinState,
    currentPrice: number,
    now: number
  ): DCAOrder | null {
    // 计算价格变化（相对于平均成本）
    if (state.avgEntryPrice === 0) {
      return null;
    }

    const priceChange = ((currentPrice - state.avgEntryPrice) / state.avgEntryPrice) * 100;

    // 价格必须下跌才触发逆向 DCA
    if (priceChange >= 0) {
      state.reverseDCALevel = 0;
      return null;
    }

    const priceDrop = Math.abs(priceChange);

    // 检查是否达到触发阈值
    if (priceDrop < this.config.reverseDCA.triggerThreshold) {
      return null;
    }

    // 检查冷却时间（避免过于频繁）
    const timeSinceLastReverse = now - state.lastReverseDCA;
    const cooldownTime = 60 * 60 * 1000; // 1 小时冷却
    if (timeSinceLastReverse < cooldownTime) {
      return null;
    }

    // 找到对应的层级
    const level = this.getDCALevel(priceDrop);
    if (!level) {
      return null;
    }

    // 计算订单大小
    const orderSize = this.config.baseOrderSize * level.multiplier;
    const totalValue = state.totalInvested + orderSize;
    const totalAmount = state.totalAmount + (orderSize / currentPrice);
    const newAvgPrice = totalValue / totalAmount;

    return {
      coin,
      type: 'reverse_dca',
      size: orderSize,
      price: currentPrice,
      reason: `price_drop_${priceDrop.toFixed(1)}%`,
      level: this.config.reverseDCA.levels.indexOf(level) + 1,
      multiplier: level.multiplier,
      timestamp: now
    };
  }

  /**
   * 检查常规 DCA
   */
  private checkRegularDCA(
    coin: AllowedCoin,
    state: DCACoinState,
    currentPrice: number,
    now: number
  ): DCAOrder | null {
    // 检查是否到了执行时间
    const timeSinceLastDCA = state.lastRegularDCA === 0
      ? Infinity
      : now - state.lastRegularDCA;

    const intervalMs = this.config.frequency * 60 * 60 * 1000;

    if (timeSinceLastDCA < intervalMs) {
      return null;
    }

    // 执行常规 DCA
    return {
      coin,
      type: 'regular_dca',
      size: this.config.baseOrderSize,
      price: currentPrice,
      reason: 'scheduled_dca',
      timestamp: now
    };
  }

  /**
   * 获取 DCA 层级
   */
  private getDCALevel(priceDrop: number): { priceDrop: number; multiplier: number } | null {
    // 从高到低查找
    for (let i = this.config.reverseDCA.levels.length - 1; i >= 0; i--) {
      const level = this.config.reverseDCA.levels[i];
      if (level && priceDrop >= level.priceDrop) {
        return level;
      }
    }
    return null;
  }

  /**
   * 执行 DCA 后更新状态
   */
  async executeDCA(coin: AllowedCoin, order: DCAOrder): Promise<void> {
    const state = this.states.get(coin);
    if (!state) {
      return;
    }

    // 更新状态
    state.totalOrders++;
    state.totalInvested += order.size;
    state.totalAmount += order.size / order.price;

    // 重新计算平均成本
    state.avgEntryPrice = state.totalInvested / state.totalAmount;

    // 更新时间
    if (order.type === 'regular_dca') {
      state.lastRegularDCA = order.timestamp || Date.now();
    } else if (order.type === 'reverse_dca') {
      state.lastReverseDCA = order.timestamp || Date.now();
      state.reverseDCALevel = order.level || 0;
    }

    // 重置逆向 DCA 层级（如果价格回升）
    const priceChange = ((order.price - state.avgEntryPrice) / state.avgEntryPrice) * 100;
    if (priceChange > -this.config.reverseDCA.triggerThreshold / 2) {
      state.reverseDCALevel = 0;
    }
  }

  /**
   * 获取币种 DCA 状态
   */
  getCoinState(coin: AllowedCoin): DCACoinState | undefined {
    return this.states.get(coin);
  }

  /**
   * 获取所有币种状态
   */
  getAllStates(): Map<AllowedCoin, DCACoinState> {
    return new Map(this.states);
  }

  /**
   * 计算下次 DCA 时间
   */
  getNextDCATime(coin: AllowedCoin): number | null {
    const state = this.states.get(coin);
    if (!state || state.lastRegularDCA === 0) {
      return null;
    }

    const intervalMs = this.config.frequency * 60 * 60 * 1000;
    return state.lastRegularDCA + intervalMs;
  }

  /**
   * 检查是否应该优先执行 DCA
   * 当浮亏较大或价格低于平均价时，优先执行 DCA
   */
  shouldPrioritizeDCA(coin: AllowedCoin, position: CoinPosition): boolean {
    const state = this.states.get(coin);
    if (!state || state.avgEntryPrice === 0) {
      return false;
    }

    // 条件1：浮亏超过 5%
    if (position.unrealizedPnLPercent < -5) {
      return true;
    }

    // 条件2：价格低于平均价超过 3%
    const priceBelowAvg = ((state.avgEntryPrice - position.currentPrice) / state.avgEntryPrice) * 100;
    if (priceBelowAvg > 3) {
      return true;
    }

    return false;
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
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<DCAConfig>): void {
    this.config = { ...this.config, ...config };

    // 更新 reverseDCA 配置
    if (config.reverseDCA) {
      this.config.reverseDCA = { ...this.config.reverseDCA, ...config.reverseDCA };
    }
  }

  /**
   * 获取配置
   */
  getConfig(): DCAConfig {
    return { ...this.config };
  }

  /**
   * 生成状态报告
   */
  generateReport(coin: AllowedCoin): string {
    const state = this.states.get(coin);
    if (!state) {
      return `DCA: ${coin} 未初始化`;
    }

    const nextDCA = this.getNextDCATime(coin);
    const nextDCADate = nextDCA ? new Date(nextDCA).toLocaleString() : '未设置';

    return `
DCA 状态报告: ${coin}
==========================
启用状态: ${state.enabled ? '启用' : '禁用'}
基础订单大小: ${state.baseOrderSize} USDT
执行频率: 每 ${state.frequency} 小时
最大订单数: ${state.maxOrders}

当前状态:
  总订单数: ${state.totalOrders} / ${state.maxOrders}
  总投入: ${state.totalInvested.toFixed(2)} USDT
  总数量: ${state.totalAmount.toFixed(6)}
  平均成本: ${state.avgEntryPrice.toFixed(2)}
  当前价格: ${state.lastPrice.toFixed(2)}
  盈亏: ${((state.lastPrice - state.avgEntryPrice) / state.avgEntryPrice * 100).toFixed(2)}%

逆向 DCA:
  状态: ${state.reverseDCAEnabled ? '启用' : '禁用'}
  当前层级: ${state.reverseDCALevel}

时间信息:
  上次常规 DCA: ${state.lastRegularDCA === 0 ? '从未执行' : new Date(state.lastRegularDCA).toLocaleString()}
  上次逆向 DCA: ${state.lastReverseDCA === 0 ? '从未执行' : new Date(state.lastReverseDCA).toLocaleString()}
  下次 DCA: ${nextDCADate}
    `.trim();
  }
}
