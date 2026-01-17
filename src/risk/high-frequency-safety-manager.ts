/**
 * 高频交易动态安全管理器
 *
 * 针对短时高频交易的特殊风险设计：
 * - 严格的持仓时间限制
 * - 动态止盈止损
 * - 滑点保护
 * - 实时风险监控
 * - 流动性检查
 */

import { logger } from '../utils';
import type { KLineInterval, TechnicalSignal } from '../market';
import type { RealTimeRiskMetrics } from '../indicators/microstructure-indicators';
import { getGlobalAccountManager } from '../core/account-manager';
import type { AccountBalance, PositionInfo } from '../core/account-manager';

// =====================================================
// 持仓信息
// =====================================================

export interface Position {
  /** 持仓ID */
  positionId: string;

  /** 币种 */
  coin: string;

  /** 方向 */
  side: 'long' | 'short';

  /** 入场价格 */
  entryPrice: number;

  /** 当前价格 */
  currentPrice: number;

  /** 数量 */
  size: number;

  /** 入场时间 */
  entryTime: number;

  /** K线周期 */
  timeframe: KLineInterval;

  /** 止损价格 */
  stopLoss: number;

  /** 止盈价格 */
  takeProfit: number;

  /** 触发信号 */
  signalId: string;

  /** 是否已平仓 */
  closed: boolean;

  /** 平仓时间 */
  closeTime?: number;

  /** 平仓价格 */
  closePrice?: number;

  /** 盈亏 */
  pnl?: number;

  /** 平仓原因 */
  closeReason?: string;
}

// =====================================================
// 风险限制配置
// =====================================================

export interface RiskLimits {
  /** 最大持仓时间（毫秒） */
  maxHoldingTime: {
    [key in KLineInterval]: number;
  };

  /** 最大同时持仓数量 */
  maxPositions: number;

  /** 最大风险敞口（占总资金的百分比） */
  maxExposure: number;

  /** 连续亏损限制 */
  consecutiveLossLimit: number;

  /** 每日最大亏损限制（占总资金的百分比） */
  dailyLossLimit: number;

  /** 最小盈利要求（扣除手续费后） */
  minProfitRate: number;

  /** 最大允许滑点（百分比） */
  maxSlippage: number;

  /** 最小流动性要求 */
  minLiquidity: number;
}

// =====================================================
// 风险警报
// =====================================================

export interface RiskAlert {
  /** 警报类型 */
  type: 'liquidity' | 'volatility' | 'exposure' | 'system' | 'holding_time' | 'consecutive_loss';

  /** 严重程度 */
  severity: 'info' | 'warning' | 'high' | 'critical';

  /** 警报消息 */
  message: string;

  /** 建议操作 */
  action: 'pause_new_trades' | 'reduce_position_size' | 'close_all_positions' | 'pause_trading' | 'none';

  /** 元数据 */
  metadata?: Record<string, unknown>;
}

// =====================================================
// 安全决策
// =====================================================

export interface SafetyDecision {
  /** 是否允许交易 */
  allowed: boolean;

  /** 原因 */
  reason?: string;

  /** 建议的调整 */
  adjustments?: {
    /** 建议的仓位大小（原始大小的百分比） */
    positionSize?: number;

    /** 建议的止损 */
    stopLoss?: number;

    /** 建议的止盈 */
    takeProfit?: number;
  };

  /** 风险警报 */
  alerts?: RiskAlert[];
}

// =====================================================
// 高频交易安全管理器
// =====================================================

export class HighFrequencySafetyManager {
  // 当前持仓
  private positions = new Map<string, Position>();

  // 风险限制
  private limits: RiskLimits;

  // 连续亏损计数
  private consecutiveLosses = 0;

  // 今日累计亏损
  private dailyLoss = 0;

  // 今日开始时间
  private dailyStart = Date.now();

  // API延迟历史
  private apiLatencyHistory: number[] = [];

  // 订单队列
  private orderQueue: string[] = [];

  // 账户管理器（用于获取实际账户数据）
  private accountManager: ReturnType<typeof getGlobalAccountManager> | null = null;

  constructor(limits?: Partial<RiskLimits>) {
    // 默认风险限制
    this.limits = {
      maxHoldingTime: {
        '1m': 60 * 1000,       // 1分钟
        '3m': 3 * 60 * 1000,   // 3分钟
        '5m': 5 * 60 * 1000,   // 5分钟
        '15m': 15 * 60 * 1000, // 15分钟
        '30m': 30 * 60 * 1000, // 30分钟
        '1H': 60 * 60 * 1000,  // 1小时
        '2H': 2 * 60 * 60 * 1000,
        '4H': 4 * 60 * 60 * 1000,
        '6H': 6 * 60 * 60 * 1000,
        '12H': 12 * 60 * 60 * 1000,
        '1D': 24 * 60 * 60 * 1000,
        '1W': 7 * 24 * 60 * 60 * 1000,
        '1M': 30 * 24 * 60 * 60 * 1000, // 1个月
      },
      maxPositions: 3,
      maxExposure: 50, // 50%
      consecutiveLossLimit: 3,
      dailyLossLimit: 10, // 10%
      minProfitRate: 0.15, // 0.15% (考虑手续费)
      maxSlippage: 0.05, // 0.05%
      minLiquidity: 50000, // 最小流动性
      ...limits
    };

    // 启动持仓监控
    this.startPositionMonitoring();

    logger.info('高频安全管理器初始化', { limits: this.limits });
  }

  /**
   * 设置账户管理器（用于获取实际账户数据）
   */
  setAccountManager(accountManager: ReturnType<typeof getGlobalAccountManager>): void {
    this.accountManager = accountManager;
    logger.info('安全管理器已设置账户管理器');
  }

  // =====================================================
  // 交易前检查
  // =====================================================

  /**
   * 检查是否允许执行交易（异步版本，支持获取实时账户数据）
   */
  async checkTradeAllowed(
    signal: TechnicalSignal,
    riskMetrics: RealTimeRiskMetrics,
    orderSize: number,
    currentPrice: number
  ): Promise<SafetyDecision> {
    const alerts: RiskAlert[] = [];

    // 1. 检查市场风险
    if (riskMetrics.marketRisk.liquidity === 'dry') {
      alerts.push({
        type: 'liquidity',
        severity: 'critical',
        message: '市场流动性不足，拒绝交易',
        action: 'pause_new_trades',
        metadata: { liquidity: riskMetrics.marketRisk.liquidity }
      });
    }

    if (riskMetrics.marketRisk.volatility === 'extreme') {
      alerts.push({
        type: 'volatility',
        severity: 'high',
        message: '市场波动率极端，建议暂停',
        action: 'pause_trading',
        metadata: { volatility: riskMetrics.marketRisk.volatility }
      });
    }

    // 2. 检查风险敞口（现在支持异步获取账户数据）
    let exposureData;
    try {
      exposureData = await this.calculateCurrentExposure();
    } catch (error) {
      logger.warn('获取风险敞口数据失败，使用默认值', { error });
      exposureData = {
        totalExposure: 0,
        exposurePercent: 0,
        internalExposure: 0,
        apiExposure: 0,
        totalCapital: 10000,
      };
    }

    if (exposureData.exposurePercent > this.limits.maxExposure) {
      alerts.push({
        type: 'exposure',
        severity: 'critical',
        message: `风险敞口过大 ${exposureData.exposurePercent.toFixed(1)}%（${exposureData.totalExposure.toFixed(2)} USDT），拒绝新开仓`,
        action: 'pause_new_trades',
        metadata: {
          exposurePercent: exposureData.exposurePercent,
          totalExposure: exposureData.totalExposure,
          maxExposure: this.limits.maxExposure,
          totalCapital: exposureData.totalCapital,
        }
      });
    }

    // 3. 检查系统风险
    if (riskMetrics.systemRisk.apiLatency > 500) {
      alerts.push({
        type: 'system',
        severity: 'high',
        message: `API延迟过高 ${riskMetrics.systemRisk.apiLatency}ms，暂停交易`,
        action: 'pause_trading',
        metadata: { apiLatency: riskMetrics.systemRisk.apiLatency }
      });
    }

    if (!riskMetrics.systemRisk.websocketConnected) {
      alerts.push({
        type: 'system',
        severity: 'critical',
        message: 'WebSocket断开，拒绝交易',
        action: 'pause_trading',
        metadata: { websocketConnected: false }
      });
    }

    // 4. 检查连续亏损
    if (this.consecutiveLosses >= this.limits.consecutiveLossLimit) {
      alerts.push({
        type: 'consecutive_loss',
        severity: 'high',
        message: `连续${this.consecutiveLosses}次亏损，暂停交易`,
        action: 'pause_new_trades',
        metadata: { consecutiveLosses: this.consecutiveLosses }
      });
    }

    // 5. 检查今日亏损
    if (this.dailyLoss >= this.limits.dailyLossLimit) {
      alerts.push({
        type: 'consecutive_loss',
        severity: 'critical',
        message: `今日亏损已达${this.dailyLoss.toFixed(1)}%限制，停止交易`,
        action: 'pause_trading',
        metadata: { dailyLoss: this.dailyLoss, limit: this.limits.dailyLossLimit }
      });
    }

    // 6. 检查持仓数量（包括内部持仓和API持仓）
    let openPositionsCount = Array.from(this.positions.values()).filter(p => !p.closed).length;
    if (this.accountManager) {
      try {
        const apiPositions = await this.accountManager.getPositions();
        openPositionsCount += apiPositions.length;
      } catch (error) {
        logger.warn('获取API持仓失败，仅使用内部持仓计数', { error });
      }
    }

    if (openPositionsCount >= this.limits.maxPositions) {
      alerts.push({
        type: 'exposure',
        severity: 'critical',
        message: `持仓数量已达上限${this.limits.maxPositions}（内部${this.positions.size} + API持仓），拒绝新开仓`,
        action: 'pause_new_trades',
        metadata: { openPositionsCount, maxPositions: this.limits.maxPositions }
      });
    }

    // 7. 检查滑点
    const expectedSlippage = riskMetrics.tradeRisk.expectedSlippage;
    if (expectedSlippage > this.limits.maxSlippage) {
      alerts.push({
        type: 'liquidity',
        severity: 'warning',
        message: `预期滑点${(expectedSlippage * 100).toFixed(3)}%超过限制`,
        action: 'none',
        metadata: { expectedSlippage, maxSlippage: this.limits.maxSlippage }
      });
    }

    // 判断是否允许交易 - critical和high级别的警报都会拒绝交易
    const blockingAlerts = alerts.filter(a => a.severity === 'critical' || a.severity === 'high');
    const allowed = blockingAlerts.length === 0;

    // 如果有blocking警报，拒绝交易
    if (!allowed) {
      return {
        allowed: false,
        reason: blockingAlerts[0]?.message || '风险检查未通过',
        alerts
      };
    }

    // 计算建议的调整
    const adjustments = this.calculateAdjustments(signal, riskMetrics, currentPrice);

    return {
      allowed: true,
      alerts,
      adjustments
    };
  }

  /**
   * 计算建议的调整
   */
  private calculateAdjustments(
    signal: TechnicalSignal,
    riskMetrics: RealTimeRiskMetrics,
    currentPrice: number
  ): SafetyDecision['adjustments'] {
    const adjustments: SafetyDecision['adjustments'] = {};

    // 1. 基于市场波动率调整仓位大小
    if (riskMetrics.marketRisk.volatility === 'high') {
      adjustments.positionSize = 0.5; // 降低至50%
    } else if (riskMetrics.marketRisk.volatility === 'extreme') {
      adjustments.positionSize = 0.2; // 降低至20%
    }

    // 2. 计算动态止盈止损
    const { stopLoss, takeProfit } = this.calculateDynamicStopLoss(signal, currentPrice);
    adjustments.stopLoss = stopLoss;
    adjustments.takeProfit = takeProfit;

    return adjustments;
  }

  /**
   * 计算动态止盈止损
   */
  calculateDynamicStopLoss(signal: TechnicalSignal, currentPrice: number): {
    stopLoss: number;
    takeProfit: number;
  } {
    // 获取最近的ATR（这里简化，实际应该从指标中获取）
    const atr = currentPrice * 0.01; // 假设ATR为1%

    const isLong = signal.direction === 'bullish';

    // 止损：1.5倍ATR
    const stopLoss = isLong
      ? currentPrice - (atr * 1.5)
      : currentPrice + (atr * 1.5);

    // 止盈：3倍ATR（风险回报比1:2）
    const takeProfit = isLong
      ? currentPrice + (atr * 3)
      : currentPrice - (atr * 3);

    return { stopLoss, takeProfit };
  }

  // =====================================================
  // 持仓管理
  // =====================================================

  /**
   * 添加持仓
   */
  addPosition(position: Omit<Position, 'positionId' | 'entryTime' | 'closed'>): Position {
    const newPosition: Position = {
      ...position,
      positionId: `${position.coin}_${position.side}_${Date.now()}`,
      entryTime: Date.now(),
      closed: false
    };

    this.positions.set(newPosition.positionId, newPosition);

    logger.info('添加持仓', {
      positionId: newPosition.positionId,
      coin: newPosition.coin,
      side: newPosition.side,
      entryPrice: newPosition.entryPrice,
      size: newPosition.size,
      stopLoss: newPosition.stopLoss,
      takeProfit: newPosition.takeProfit
    });

    return newPosition;
  }

  /**
   * 更新持仓价格
   */
  updatePositionPrice(positionId: string, currentPrice: number): void {
    const position = this.positions.get(positionId);
    if (!position || position.closed) return;

    position.currentPrice = currentPrice;

    // 检查止盈止损
    const shouldClose = this.checkStopLossTakeProfit(position);
    if (shouldClose.shouldClose) {
      this.closePosition(positionId, shouldClose.reason!, currentPrice);
    }
  }

  /**
   * 检查止盈止损
   */
  private checkStopLossTakeProfit(position: Position): {
    shouldClose: boolean;
    reason?: string;
  } {
    const isLong = position.side === 'long';

    // 检查止损
    if (isLong && position.currentPrice <= position.stopLoss) {
      return {
        shouldClose: true,
        reason: '触发止损'
      };
    }
    if (!isLong && position.currentPrice >= position.stopLoss) {
      return {
        shouldClose: true,
        reason: '触发止损'
      };
    }

    // 检查止盈
    if (isLong && position.currentPrice >= position.takeProfit) {
      return {
        shouldClose: true,
        reason: '触发止盈'
      };
    }
    if (!isLong && position.currentPrice <= position.takeProfit) {
      return {
        shouldClose: true,
        reason: '触发止盈'
      };
    }

    return { shouldClose: false };
  }

  /**
   * 检查强制平仓条件
   */
  checkForcedClose(position: Position): {
    shouldClose: boolean;
    reason?: string;
  } {
    // 1. 超过最大持仓时间
    const holdingTime = Date.now() - position.entryTime;
    const maxTime = this.limits.maxHoldingTime[position.timeframe] || 5 * 60 * 1000;

    if (holdingTime > maxTime) {
      return {
        shouldClose: true,
        reason: `超过最大持仓时间 ${(maxTime / 1000).toFixed(0)}秒`
      };
    }

    return { shouldClose: false };
  }

  /**
   * 平仓
   */
  closePosition(positionId: string, reason: string, closePrice?: number): void {
    const position = this.positions.get(positionId);
    if (!position || position.closed) return;

    position.closed = true;
    position.closeTime = Date.now();
    position.closePrice = closePrice || position.currentPrice;
    position.closeReason = reason;

    // 计算盈亏
    const isLong = position.side === 'long';
    const priceChange = isLong
      ? position.closePrice - position.entryPrice
      : position.entryPrice - position.closePrice;

    position.pnl = priceChange * position.size;

    // 更新连续亏损计数
    if (position.pnl < 0) {
      this.consecutiveLosses++;
      // 计算亏损百分比（相对账户初始资金）
      // 假设初始资金为 10000 USDT
      const initialCapital = 10000;
      const lossPercent = Math.abs(position.pnl / initialCapital) * 100;
      this.dailyLoss += lossPercent;
    } else {
      this.consecutiveLosses = 0;
    }

    logger.info('平仓', {
      positionId,
      reason,
      pnl: position.pnl,
      holdingTime: position.closeTime - position.entryTime
    });

    // 从活动持仓中移除
    setTimeout(() => {
      this.positions.delete(positionId);
    }, 60000); // 1分钟后删除
  }

  /**
   * 计算当前风险敞口（占总资金的百分比）
   *
   * 从 AccountManager 获取实际的账户数据，包括：
   * - 内部持仓（由 addPosition 添加的）
   * - API持仓（从 AccountManager 获取的）
   */
  private async calculateCurrentExposure(): Promise<{
    totalExposure: number;
    exposurePercent: number;
    internalExposure: number;
    apiExposure: number;
    totalCapital: number;
  }> {
    let internalExposure = 0;  // 内部持仓敞口
    let apiExposure = 0;     // API持仓敞口
    let totalCapital = 0;

    // 1. 计算内部持仓敞口
    for (const position of this.positions.values()) {
      if (!position.closed) {
        internalExposure += position.size;
      }
    }

    // 2. 如果有账户管理器，获取实际数据
    if (this.accountManager) {
      try {
        // 获取总资金
        const balance = await this.accountManager.getBalance();
        totalCapital = balance.total;

        // 获取API持仓
        const apiPositions = await this.accountManager.getPositions();
        for (const pos of apiPositions) {
          // API持仓的 size 是币的数量，需要乘以当前价格得到敞口
          apiExposure += pos.size * pos.lastPrice;
        }

      } catch (error) {
        logger.warn('获取账户数据失败，使用缓存或默认值', { error });
        // 如果API失败，使用默认值
        if (totalCapital === 0) {
          totalCapital = 10000;
        }
      }
    } else {
      // 没有账户管理器时使用默认值
      totalCapital = 10000;
    }

    // 3. 计算总敞口
    const totalExposure = internalExposure + apiExposure;

    // 4. 计算敞口百分比
    const exposurePercent = totalCapital > 0 ? (totalExposure / totalCapital) * 100 : 0;

    logger.debug('计算风险敞口', {
      internalExposure,
      apiExposure,
      totalExposure,
      exposurePercent: exposurePercent.toFixed(2),
      totalCapital,
    });

    return {
      totalExposure,
      exposurePercent,
      internalExposure,
      apiExposure,
      totalCapital,
    };
  }

  // =====================================================
  // 持仓监控
  // =====================================================

  /**
   * 启动持仓监控
   */
  private startPositionMonitoring(): void {
    // 每秒检查一次持仓
    setInterval(() => {
      this.monitorPositions();
    }, 1000);

    // 每分钟重置今日统计
    setInterval(() => {
      const now = Date.now();
      const daysSinceReset = (now - this.dailyStart) / (24 * 60 * 60 * 1000);

      if (daysSinceReset >= 1) {
        this.dailyStart = now;
        this.dailyLoss = 0;
        logger.info('重置每日统计');
      }
    }, 60000);
  }

  /**
   * 监控所有持仓
   */
  private monitorPositions(): void {
    const now = Date.now();

    for (const [positionId, position] of this.positions.entries()) {
      if (position.closed) continue;

      // 1. 检查强制平仓
      const forcedClose = this.checkForcedClose(position);
      if (forcedClose.shouldClose) {
        this.closePosition(positionId, forcedClose.reason!);
        continue;
      }

      // 2. 检查止盈止损（已经在updatePositionPrice中处理）
    }
  }

  // =====================================================
  // 实时风险监控
  // =====================================================

  /**
   * 监控实时风险
   */
  async monitorRealTimeRisks(riskMetrics: RealTimeRiskMetrics): Promise<RiskAlert[]> {
    const alerts: RiskAlert[] = [];

    // 1. 流动性风险
    if (riskMetrics.marketRisk.liquidity === 'dry') {
      alerts.push({
        type: 'liquidity',
        severity: 'critical',
        message: '市场流动性不足，暂停新开仓',
        action: 'pause_new_trades'
      });
    }

    // 2. 波动率风险
    if (riskMetrics.marketRisk.volatility === 'extreme') {
      alerts.push({
        type: 'volatility',
        severity: 'high',
        message: '市场波动率极端，降低仓位',
        action: 'reduce_position_size'
      });
    }

    // 3. 敞口风险
    const exposureData = await this.calculateCurrentExposure();
    if (exposureData.exposurePercent > this.limits.maxExposure * 0.8) {
      alerts.push({
        type: 'exposure',
        severity: 'warning',
        message: `风险敞口接近上限 ${exposureData.exposurePercent.toFixed(1)}%`,
        action: 'none'
      });
    }

    // 4. 系统风险
    if (riskMetrics.systemRisk.apiLatency > 200) {
      alerts.push({
        type: 'system',
        severity: 'warning',
        message: `API延迟 ${riskMetrics.systemRisk.apiLatency}ms`,
        action: 'none'
      });
    }

    if (!riskMetrics.systemRisk.websocketConnected) {
      alerts.push({
        type: 'system',
        severity: 'critical',
        message: 'WebSocket断开',
        action: 'pause_trading'
      });
    }

    return alerts;
  }

  // =====================================================
  // 统计和查询
  // =====================================================

  /**
   * 获取所有持仓（包括已平仓的）
   */
  getPositions(includeClosed: boolean = false): Position[] {
    if (includeClosed) {
      return Array.from(this.positions.values());
    }
    return Array.from(this.positions.values()).filter(p => !p.closed);
  }

  /**
   * 获取统计信息
   */
  async getStats(): Promise<{
    activePositions: number;
    consecutiveLosses: number;
    dailyLoss: number;
    currentExposure: number;
  }> {
    const exposureData = await this.calculateCurrentExposure();
    return {
      activePositions: this.getPositions().length,
      consecutiveLosses: this.consecutiveLosses,
      dailyLoss: this.dailyLoss,
      currentExposure: exposureData.exposurePercent
    };
  }

  /**
   * 重置连续亏损计数
   */
  resetConsecutiveLosses(): void {
    this.consecutiveLosses = 0;
    logger.info('重置连续亏损计数');
  }

  /**
   * 更新API延迟
   */
  updateApiLatency(latency: number): void {
    this.apiLatencyHistory.push(latency);
    if (this.apiLatencyHistory.length > 100) {
      this.apiLatencyHistory.shift();
    }
  }

  /**
   * 获取平均API延迟
   */
  getAverageApiLatency(): number {
    if (this.apiLatencyHistory.length === 0) return 0;
    const sum = this.apiLatencyHistory.reduce((a, b) => a + b, 0);
    return sum / this.apiLatencyHistory.length;
  }
}

// =====================================================
// 导出单例
// =====================================================

let globalSafetyManager: HighFrequencySafetyManager | null = null;

export function getGlobalSafetyManager(limits?: Partial<RiskLimits>): HighFrequencySafetyManager {
  if (!globalSafetyManager) {
    globalSafetyManager = new HighFrequencySafetyManager(limits);
  }
  return globalSafetyManager;
}
