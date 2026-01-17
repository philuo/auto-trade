/**
 * 动态学习引擎
 *
 * 基于交易日志实时学习并动态调整决策：
 * - 滚动窗口统计（最近N笔交易）
 * - 实时性能追踪
 * - 自适应参数调整
 * - 在线学习循环
 */

import { logger } from '../utils';
import type { KLineInterval } from '../market';

// =====================================================
// 交易结果
// =====================================================

export interface TradeResult {
  /** 交易ID */
  tradeId: string;

  /** 币种 */
  coin: string;

  /** 信号类型 */
  signalType: string;

  /** K线周期 */
  timeframe: KLineInterval;

  /** 方向 */
  direction: 'bullish' | 'bearish';

  /** 入场价格 */
  entryPrice: number;

  /** 出场价格 */
  exitPrice: number;

  /** 入场时间 */
  entryTime: number;

  /** 出场时间 */
  exitTime: number;

  /** 持仓时间（毫秒） */
  holdingTime: number;

  /** 盈亏（绝对值） */
  pnl: number;

  /** 盈亏率（%） */
  pnlPercent: number;

  /** 手续费 */
  fee: number;

  /** 净盈亏 */
  netPnl: number;

  /** 市场条件 */
  marketConditions: {
    trend: 'uptrend' | 'downtrend' | 'sideways';
    volatility: 'low' | 'normal' | 'high' | 'extreme';
    momentum: 'strong' | 'weak' | 'neutral';
  };

  /** 信号强度 */
  signalStrength: number;

  /** 信号置信度 */
  signalConfidence: number;

  /** 执行时间戳 */
  timestamp: number;
}

// =====================================================
// 滚动窗口统计
// =====================================================

export interface RollingStats {
  /** 窗口大小 */
  windowSize: number;

  /** 总交易数 */
  totalTrades: number;

  /** 盈利交易数 */
  winningTrades: number;

  /** 亏损交易数 */
  losingTrades: number;

  /** 胜率 */
  winRate: number;

  /** 平均盈利 */
  avgWin: number;

  /** 平均亏损 */
  avgLoss: number;

  /** 盈亏比 */
  profitFactor: number;

  /** 夏普比率 */
  sharpeRatio: number;

  /** 最大回撤 */
  maxDrawdown: number;

  /** 总盈亏 */
  totalPnl: number;

  /** 净盈亏（扣除手续费） */
  netPnl: number;

  /** 当前连胜/连败 */
  currentStreak: {
    type: 'win' | 'loss';
    count: number;
  };

  /** 平均持仓时间 */
  avgHoldingTime: number;

  /** 按信号类型统计 */
  bySignalType: Record<string, {
    count: number;
    winRate: number;
    avgPnl: number;
    sharpe: number;
  }>;

  /** 按市场条件统计 */
  byMarketCondition: Record<string, {
    count: number;
    winRate: number;
    avgPnl: number;
  }>;

  /** 按时间段统计 */
  byTimeOfDay: Record<string, {
    count: number;
    winRate: number;
    avgPnl: number;
  }>;
}

// =====================================================
// 参数调整建议
// =====================================================

export interface ParameterAdjustments {
  /** 信号阈值调整 */
  signalThreshold?: {
    byType: Record<string, {
      strength: number;      // 强度乘数
      confidence: number;    // 置信度阈值
    }>;
  };

  /** 仓位大小调整 */
  positionSize?: {
    base: number;            // 基础仓位比例
    max: number;             // 最大仓位比例
  };

  /** 止损止盈调整 */
  stopLossMultiplier?: number;
  takeProfitMultiplier?: number;

  /** 交易频率调整 */
  tradingInterval?: KLineInterval;

  /** 暂停交易 */
  pauseTrading?: {
    enabled: boolean;
    reason: string;
    duration: number;        // 毫秒
  };
}

// =====================================================
// 学习决策
// =====================================================

export interface LearningDecision {
  /** 是否需要调整 */
  shouldAdjust: boolean;

  /** 调整类型 */
  adjustmentType: 'pause' | 'reduce' | 'optimize' | 'none';

  /** 原因 */
  reason: string;

  /** 参数调整 */
  adjustments?: ParameterAdjustments;

  /** 置信度 */
  confidence: number;
}

// =====================================================
// 动态学习引擎
// =====================================================

export class DynamicLearningEngine {
  // 交易历史
  private tradeHistory: TradeResult[] = [];

  // 滚动窗口大小
  private readonly ROLLING_WINDOW = 100;

  // 最小样本数
  private readonly MIN_SAMPLES = 20;

  // 学习阈值
  private readonly LEARNING_THRESHOLDS = {
    LOW_WIN_RATE: 0.4,          // 低胜率阈值
    HIGH_WIN_RATE: 0.6,          // 高胜率阈值
    LOW_SHARPE: 0.5,             // 低夏普阈值
    HIGH_SHARPE: 1.5,            // 高夏普阈值
    MAX_CONSECUTIVE_LOSSES: 3,   // 最大连续亏损
    HIGH_DRAWDOWN: 10,           // 高回撤阈值（%）
  };

  // 当前参数
  private currentParameters: ParameterAdjustments = {
    signalThreshold: {
      byType: {} as Record<string, { strength: number; confidence: number }>
    },
    positionSize: {
      base: 1.0,
      max: 1.0
    },
    stopLossMultiplier: 1.5,
    takeProfitMultiplier: 3.0
  };

  // 暂停交易状态
  private pauseUntil: number = 0;

  constructor() {
    // 启动定期学习任务
    this.startPeriodicLearning();

    logger.info('动态学习引擎初始化', {
      rollingWindow: this.ROLLING_WINDOW,
      thresholds: this.LEARNING_THRESHOLDS
    });
  }

  // =====================================================
  // 交易记录
  // =====================================================

  /**
   * 记录交易结果
   */
  recordTrade(trade: Omit<TradeResult, 'timestamp' | 'pnlPercent' | 'netPnl'>): void {
    const pnlPercent = ((trade.exitPrice - trade.entryPrice) / trade.entryPrice) * 100;
    const netPnl = trade.pnl - trade.fee;

    const fullTrade: TradeResult = {
      ...trade,
      pnlPercent,
      netPnl,
      timestamp: Date.now()
    };

    this.tradeHistory.push(fullTrade);

    logger.debug('记录交易结果', {
      tradeId: fullTrade.tradeId,
      signalType: fullTrade.signalType,
      pnl: fullTrade.pnl,
      netPnl: fullTrade.netPnl,
      pnlPercent: fullTrade.pnlPercent.toFixed(2)
    });

    // 立即评估是否需要调整
    const decision = this.evaluateAndAdjust();
    if (decision.shouldAdjust) {
      this.applyAdjustment(decision);
    }
  }

  // =====================================================
  // 统计计算
  // =====================================================

  /**
   * 获取滚动窗口统计
   */
  getRollingStats(windowSize: number = this.ROLLING_WINDOW): RollingStats {
    const recent = this.tradeHistory.slice(-windowSize);

    if (recent.length === 0) {
      return this.getEmptyStats(windowSize);
    }

    // 基础统计
    const totalTrades = recent.length;
    const winningTrades = recent.filter(t => t.pnl > 0);
    const losingTrades = recent.filter(t => t.pnl < 0);
    const winRate = winningTrades.length / totalTrades;

    const avgWin = winningTrades.length > 0
      ? winningTrades.reduce((sum, t) => sum + t.pnl, 0) / winningTrades.length
      : 0;

    const avgLoss = losingTrades.length > 0
      ? losingTrades.reduce((sum, t) => sum + Math.abs(t.pnl), 0) / losingTrades.length
      : 0;

    const totalWin = winningTrades.reduce((sum, t) => sum + t.pnl, 0);
    const totalLoss = Math.abs(losingTrades.reduce((sum, t) => sum + t.pnl, 0));
    const profitFactor = totalLoss > 0 ? totalWin / totalLoss : totalWin > 0 ? 999 : 0;

    const totalPnl = recent.reduce((sum, t) => sum + t.pnl, 0);
    const netPnl = recent.reduce((sum, t) => sum + t.netPnl, 0);

    // 夏普比率
    const sharpeRatio = this.calculateSharpe(recent);

    // 最大回撤
    const maxDrawdown = this.calculateMaxDrawdown(recent);

    // 当前连胜/连败
    const currentStreak = this.getCurrentStreak(recent);

    // 平均持仓时间
    const avgHoldingTime = recent.reduce((sum, t) => sum + t.holdingTime, 0) / recent.length;

    // 按信号类型统计
    const bySignalType = this.groupBySignalType(recent);

    // 按市场条件统计
    const byMarketCondition = this.groupByMarketCondition(recent);

    // 按时间段统计
    const byTimeOfDay = this.groupByTimeOfDay(recent);

    return {
      windowSize,
      totalTrades,
      winningTrades: winningTrades.length,
      losingTrades: losingTrades.length,
      winRate,
      avgWin,
      avgLoss,
      profitFactor,
      sharpeRatio,
      maxDrawdown,
      totalPnl,
      netPnl,
      currentStreak,
      avgHoldingTime,
      bySignalType,
      byMarketCondition,
      byTimeOfDay
    };
  }

  /**
   * 获取空统计
   */
  private getEmptyStats(windowSize: number): RollingStats {
    return {
      windowSize,
      totalTrades: 0,
      winningTrades: 0,
      losingTrades: 0,
      winRate: 0,
      avgWin: 0,
      avgLoss: 0,
      profitFactor: 0,
      sharpeRatio: 0,
      maxDrawdown: 0,
      totalPnl: 0,
      netPnl: 0,
      currentStreak: { type: 'loss', count: 0 },
      avgHoldingTime: 0,
      bySignalType: {},
      byMarketCondition: {},
      byTimeOfDay: {}
    };
  }

  /**
   * 计算夏普比率
   */
  private calculateSharpe(trades: TradeResult[]): number {
    if (trades.length < 10) return 0;

    const returns = trades.map(t => t.pnlPercent);
    const avgReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;

    // 计算标准差
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length;
    const stdDev = Math.sqrt(variance);

    if (stdDev === 0) return 0;

    // 假设无风险利率为0，年化系数忽略（短时交易）
    return avgReturn / stdDev;
  }

  /**
   * 计算最大回撤
   */
  private calculateMaxDrawdown(trades: TradeResult[]): number {
    let maxPnl = 0;
    let maxDrawdown = 0;
    let cumulativePnl = 0;

    for (const trade of trades) {
      cumulativePnl += trade.netPnl;
      maxPnl = Math.max(maxPnl, cumulativePnl);
      const drawdown = maxPnl - cumulativePnl;
      maxDrawdown = Math.max(maxDrawdown, drawdown);
    }

    // 转换为百分比（假设初始资金10000）
    const initialCapital = 10000;
    return (maxDrawdown / initialCapital) * 100;
  }

  /**
   * 获取当前连胜/连败
   */
  private getCurrentStreak(trades: TradeResult[]): RollingStats['currentStreak'] {
    if (trades.length === 0) {
      return { type: 'loss', count: 0 };
    }

    // Start from the most recent trade
    const lastTrade = trades[trades.length - 1];
    const isWin = lastTrade.pnl > 0;
    const streakType: 'win' | 'loss' = isWin ? 'win' : 'loss';

    // Count consecutive trades of the same type
    let streak = 0;
    for (let i = trades.length - 1; i >= 0; i--) {
      const currentIsWin = trades[i].pnl > 0;
      if (currentIsWin === isWin) {
        streak++;
      } else {
        // Break on first trade of different type
        break;
      }
    }

    return { type: streakType, count: streak };
  }

  /**
   * 按信号类型分组统计
   */
  private groupBySignalType(trades: TradeResult[]): Record<string, {
    count: number;
    winRate: number;
    avgPnl: number;
    sharpe: number;
  }> {
    const groups: Record<string, TradeResult[]> = {};

    for (const trade of trades) {
      if (!groups[trade.signalType]) {
        groups[trade.signalType] = [];
      }
      groups[trade.signalType].push(trade);
    }

    const result: Record<string, {
      count: number;
      winRate: number;
      avgPnl: number;
      sharpe: number;
    }> = {};

    for (const [signalType, groupTrades] of Object.entries(groups)) {
      const winners = groupTrades.filter(t => t.pnl > 0);
      result[signalType] = {
        count: groupTrades.length,
        winRate: winners.length / groupTrades.length,
        avgPnl: groupTrades.reduce((sum, t) => sum + t.pnl, 0) / groupTrades.length,
        sharpe: this.calculateSharpe(groupTrades)
      };
    }

    return result;
  }

  /**
   * 按市场条件分组统计
   */
  private groupByMarketCondition(trades: TradeResult[]): Record<string, {
    count: number;
    winRate: number;
    avgPnl: number;
  }> {
    const groups: Record<string, TradeResult[]> = {};

    for (const trade of trades) {
      const key = `${trade.marketConditions.trend}_${trade.marketConditions.volatility}`;
      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(trade);
    }

    const result: Record<string, {
      count: number;
      winRate: number;
      avgPnl: number;
    }> = {};

    for (const [condition, groupTrades] of Object.entries(groups)) {
      const winners = groupTrades.filter(t => t.pnl > 0);
      result[condition] = {
        count: groupTrades.length,
        winRate: winners.length / groupTrades.length,
        avgPnl: groupTrades.reduce((sum, t) => sum + t.pnl, 0) / groupTrades.length
      };
    }

    return result;
  }

  /**
   * 按时间段分组统计
   */
  private groupByTimeOfDay(trades: TradeResult[]): Record<string, {
    count: number;
    winRate: number;
    avgPnl: number;
  }> {
    const groups: Record<string, TradeResult[]> = {};

    for (const trade of trades) {
      const hour = new Date(trade.entryTime).getHours();
      const key = `${hour}:00-${hour}:59`;

      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(trade);
    }

    const result: Record<string, {
      count: number;
      winRate: number;
      avgPnl: number;
    }> = {};

    for (const [timeSlot, groupTrades] of Object.entries(groups)) {
      const winners = groupTrades.filter(t => t.pnl > 0);
      result[timeSlot] = {
        count: groupTrades.length,
        winRate: winners.length / groupTrades.length,
        avgPnl: groupTrades.reduce((sum, t) => sum + t.pnl, 0) / groupTrades.length
      };
    }

    return result;
  }

  // =====================================================
  // 学习和调整
  // =====================================================

  /**
   * 评估并决定是否需要调整
   */
  evaluateAndAdjust(): LearningDecision {
    const stats = this.getRollingStats();

    // 检查是否有足够样本
    if (stats.totalTrades < this.MIN_SAMPLES) {
      return {
        shouldAdjust: false,
        adjustmentType: 'none',
        reason: `样本不足 (${stats.totalTrades}/${this.MIN_SAMPLES})`,
        confidence: 0
      };
    }

    // 检查是否在暂停期 - 如果当前是连胜，则清除暂停
    if (Date.now() < this.pauseUntil) {
      if (stats.currentStreak.type === 'win') {
        // 连胜时清除暂停
        this.pauseUntil = 0;
      } else {
        return {
          shouldAdjust: true,
          adjustmentType: 'pause',
          reason: '暂停交易期',
          confidence: 1,
          adjustments: {
            pauseTrading: {
              enabled: true,
              reason: '暂停交易期',
              duration: this.pauseUntil - Date.now()
            }
          }
        };
      }
    }

    // 1. 检查连续亏损
    if (stats.currentStreak.type === 'loss' && stats.currentStreak.count >= this.LEARNING_THRESHOLDS.MAX_CONSECUTIVE_LOSSES) {
      return {
        shouldAdjust: true,
        adjustmentType: 'pause',
        reason: `连续${stats.currentStreak.count}次亏损`,
        confidence: 0.9,
        adjustments: {
          pauseTrading: {
            enabled: true,
            reason: `连续${stats.currentStreak.count}次亏损，暂停交易`,
            duration: 30 * 60 * 1000 // 30分钟
          }
        }
      };
    }

    // 2. 检查胜率过低
    if (stats.winRate < this.LEARNING_THRESHOLDS.LOW_WIN_RATE) {
      return {
        shouldAdjust: true,
        adjustmentType: 'reduce',
        reason: `胜率过低 (${(stats.winRate * 100).toFixed(1)}%)`,
        confidence: 0.8,
        adjustments: this.generateReductionAdjustments(stats)
      };
    }

    // 3. 检查夏普比率过低
    if (stats.sharpeRatio < this.LEARNING_THRESHOLDS.LOW_SHARPE) {
      return {
        shouldAdjust: true,
        adjustmentType: 'reduce',
        reason: `夏普比率过低 (${stats.sharpeRatio.toFixed(2)})`,
        confidence: 0.7,
        adjustments: this.generateReductionAdjustments(stats)
      };
    }

    // 4. 检查回撤过大
    if (stats.maxDrawdown > this.LEARNING_THRESHOLDS.HIGH_DRAWDOWN) {
      return {
        shouldAdjust: true,
        adjustmentType: 'pause',
        reason: `回撤过大 (${stats.maxDrawdown.toFixed(1)}%)`,
        confidence: 0.85,
        adjustments: {
          pauseTrading: {
            enabled: true,
            reason: `回撤过大，暂停交易`,
            duration: 60 * 60 * 1000 // 1小时
          }
        }
      };
    }

    // 5. 优化建议（当表现良好时）
    if (stats.winRate > this.LEARNING_THRESHOLDS.HIGH_WIN_RATE && stats.sharpeRatio > this.LEARNING_THRESHOLDS.HIGH_SHARPE) {
      return {
        shouldAdjust: true,
        adjustmentType: 'optimize',
        reason: '表现良好，可以优化参数',
        confidence: 0.6,
        adjustments: this.generateOptimizationAdjustments(stats)
      };
    }

    return {
      shouldAdjust: false,
      adjustmentType: 'none',
      reason: '表现正常，无需调整',
      confidence: 0
    };
  }

  /**
   * 生成降级调整
   */
  private generateReductionAdjustments(stats: RollingStats): ParameterAdjustments {
    const adjustments: ParameterAdjustments = {};

    // 降低仓位
    adjustments.positionSize = {
      base: 0.5,  // 降低至50%
      max: 0.3
    };

    // 提高信号阈值
    adjustments.signalThreshold = { byType: {} };
    for (const [signalType, typeStats] of Object.entries(stats.bySignalType)) {
      if (typeStats.winRate < 0.4) {
        adjustments.signalThreshold.byType[signalType] = {
          strength: 1.2,     // 提高20%阈值
          confidence: 0.85   // 提高置信度要求
        };
      }
    }

    // 收紧止损
    adjustments.stopLossMultiplier = 1.2;  // 从1.5降低到1.2

    return adjustments;
  }

  /**
   * 生成优化调整
   */
  private generateOptimizationAdjustments(stats: RollingStats): ParameterAdjustments {
    const adjustments: ParameterAdjustments = {};

    // 提高仓位
    adjustments.positionSize = {
      base: 1.2,  // 提高20%
      max: 1.5
    };

    // 降低表现好的信号阈值
    adjustments.signalThreshold = { byType: {} };
    for (const [signalType, typeStats] of Object.entries(stats.bySignalType)) {
      if (typeStats.winRate > 0.6 && typeStats.sharpe > 1.0) {
        adjustments.signalThreshold.byType[signalType] = {
          strength: 0.8,     // 降低20%阈值
          confidence: 0.7    // 降低置信度要求
        };
      }
    }

    return adjustments;
  }

  /**
   * 应用调整
   */
  private applyAdjustment(decision: LearningDecision): void {
    if (!decision.adjustments) return;

    if (decision.adjustments.pauseTrading?.enabled) {
      this.pauseUntil = Date.now() + decision.adjustments.pauseTrading.duration;
      logger.warn('暂停交易', {
        reason: decision.adjustments.pauseTrading.reason,
        duration: decision.adjustments.pauseTrading.duration / 1000 / 60 + '分钟'
      });
    }

    if (decision.adjustments.signalThreshold) {
      this.currentParameters.signalThreshold = decision.adjustments.signalThreshold;
    }

    if (decision.adjustments.positionSize) {
      this.currentParameters.positionSize = decision.adjustments.positionSize;
    }

    if (decision.adjustments.stopLossMultiplier) {
      this.currentParameters.stopLossMultiplier = decision.adjustments.stopLossMultiplier;
    }

    if (decision.adjustments.takeProfitMultiplier) {
      this.currentParameters.takeProfitMultiplier = decision.adjustments.takeProfitMultiplier;
    }

    logger.info('应用参数调整', {
      type: decision.adjustmentType,
      reason: decision.reason,
      adjustments: decision.adjustments
    });
  }

  // =====================================================
  // 在线学习循环
  // =====================================================

  /**
   * 启动定期学习任务
   */
  private startPeriodicLearning(): void {
    // 每10笔交易重新学习
    setInterval(() => {
      if (this.tradeHistory.length % 10 === 0 && this.tradeHistory.length >= 20) {
        this.retrainModel();
      }
    }, 60000); // 每分钟检查一次

    // 每小时深度分析
    setInterval(() => {
      this.deepAnalysis();
    }, 60 * 60 * 1000);
  }

  /**
   * 重新训练模型
   */
  private retrainModel(): void {
    logger.info('开始重新训练模型');

    const stats = this.getRollingStats();

    // 计算新的信号权重
    const newWeights = this.calculateNewWeights(stats.bySignalType);

    logger.info('模型重新训练完成', { newWeights });
  }

  /**
   * 计算新权重
   */
  private calculateNewWeights(bySignalType: Record<string, {
    count: number;
    winRate: number;
    avgPnl: number;
    sharpe: number;
  }>): Record<string, number> {
    const weights: Record<string, number> = {};

    for (const [signalType, stats] of Object.entries(bySignalType)) {
      if (stats.count < 10) {
        // 样本不足，使用默认权重
        weights[signalType] = 1.0;
        continue;
      }

      // 权重 = 胜率 * 夏普比率 * 平均盈利（标准化）
      const score = stats.winRate * stats.sharpe * (stats.avgPnl > 0 ? 1 : 0.5);

      // 标准化到0.5-1.5范围
      weights[signalType] = Math.max(0.5, Math.min(1.5, score * 2));
    }

    return weights;
  }

  /**
   * 深度分析
   */
  private deepAnalysis(): void {
    logger.info('开始深度分析');

    const stats = this.getRollingStats();

    // 分析各个维度
    const analysis = {
      bySignalType: this.analyzeBySignalType(stats.bySignalType),
      byMarketCondition: this.analyzeByMarketCondition(stats.byMarketCondition),
      byTimeOfDay: this.analyzeByTimeOfDay(stats.byTimeOfDay)
    };

    logger.info('深度分析完成', { analysis });
  }

  /**
   * 按信号类型分析
   */
  private analyzeBySignalType(bySignalType: Record<string, {
    count: number;
    winRate: number;
    avgPnl: number;
    sharpe: number;
  }>): any {
    const recommendations: Record<string, string> = {};

    for (const [signalType, stats] of Object.entries(bySignalType)) {
      if (stats.count < 10) continue;

      if (stats.winRate > 0.6 && stats.sharpe > 1.0) {
        recommendations[signalType] = '表现优秀，可以降低阈值';
      } else if (stats.winRate < 0.4 || stats.sharpe < 0.5) {
        recommendations[signalType] = '表现较差，建议提高阈值或禁用';
      } else {
        recommendations[signalType] = '表现正常';
      }
    }

    return recommendations;
  }

  /**
   * 按市场条件分析
   */
  private analyzeByMarketCondition(byMarketCondition: Record<string, {
    count: number;
    winRate: number;
    avgPnl: number;
  }>): any {
    const bestCondition = Object.entries(byMarketCondition)
      .sort((a, b) => b[1].avgPnl - a[1].avgPnl)[0];

    const worstCondition = Object.entries(byMarketCondition)
      .sort((a, b) => a[1].avgPnl - b[1].avgPnl)[0];

    return {
      best: bestCondition,
      worst: worstCondition,
      recommendation: `在${bestCondition[0]}条件下表现最佳，在${worstCondition[0]}条件下表现最差`
    };
  }

  /**
   * 按时间段分析
   */
  private analyzeByTimeOfDay(byTimeOfDay: Record<string, {
    count: number;
    winRate: number;
    avgPnl: number;
  }>): any {
    const sorted = Object.entries(byTimeOfDay)
      .sort((a, b) => b[1].avgPnl - a[1].avgPnl);

    return {
      bestTime: sorted[0]?.[0],
      worstTime: sorted[sorted.length - 1]?.[0],
      recommendation: `最佳交易时间：${sorted[0]?.[0]}`
    };
  }

  // =====================================================
  // 查询和获取
  // =====================================================

  /**
   * 获取当前参数
   */
  getCurrentParameters(): ParameterAdjustments {
    return { ...this.currentParameters };
  }

  /**
   * 检查是否在暂停期
   */
  isPaused(): boolean {
    return Date.now() < this.pauseUntil;
  }

  /**
   * 获取暂停剩余时间
   */
  getPauseRemainingTime(): number {
    return Math.max(0, this.pauseUntil - Date.now());
  }

  /**
   * 获取交易历史
   */
  getTradeHistory(limit?: number): TradeResult[] {
    if (limit) {
      return this.tradeHistory.slice(-limit);
    }
    return [...this.tradeHistory];
  }

  /**
   * 清理历史数据
   */
  cleanup(daysToKeep: number = 30): void {
    const cutoffTime = Date.now() - daysToKeep * 24 * 60 * 60 * 1000;
    this.tradeHistory = this.tradeHistory.filter(t => t.entryTime > cutoffTime);

    logger.info('清理交易历史', {
      before: this.tradeHistory.length,
      after: this.tradeHistory.length,
      daysToKeep
    });
  }
}

// =====================================================
// 导出单例
// =====================================================

let globalLearningEngine: DynamicLearningEngine | null = null;

export function getGlobalLearningEngine(): DynamicLearningEngine {
  if (!globalLearningEngine) {
    globalLearningEngine = new DynamicLearningEngine();
  }
  return globalLearningEngine;
}
