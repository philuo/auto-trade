/**
 * 综合交易系统
 *
 * 核心模块：
 * 1. 市场状态分析器 - 多维度市场分析
 * 2. 统计验证器 - 历史胜率与置信度
 * 3. 交易记录管理器 - 完整交易历史
 * 4. 盈亏计算器 - 实时盈亏跟踪
 * 5. 动态止盈止损 - 智能止盈止损
 * 6. 仓位管理器 - 动态仓位与资金管理
 */

import { logger } from '../utils/logger;
import { AdvancedSignalGenerator } from '../signals/advanced-generator;
import type {
  TechnicalSignal,
  CandleData,
  KLineInterval,
} from '../market/types;

// =====================================================
// 市场状态多维度分析
// =====================================================

export interface MarketStateAnalysis {
  // 趋势维度
  trend: {
    direction: 'bullish' | 'bearish' | 'sideways';
    strength: number;        // 0-100
    duration: number;        // 持续时间（毫秒）
  };
  // 波动率维度
  volatility: {
    level: 'low' | 'normal' | 'high' | 'extreme';
    value: number;           // ATR或标准差
    percentile: number;      // 历史分位数
  };
  // 动量维度
  momentum: {
    rsi: number;
    macd: {
      value: number;
      signal: number;
      histogram: number;
    };
    direction: 'increasing' | 'decreasing' | 'neutral';
  };
  // 成交量维度
  volume: {
    current: number;
    average: number;
    ratio: number;           // 当前/平均
    trend: 'increasing' | 'decreasing' | 'neutral';
  };
  // 支撑/阻力维度
  levels: {
    support: number[];
    resistance: number[];
    distanceToSupport: number;
    distanceToResistance: number;
  };
  // 情绪维度（基于持仓量和资金费率）
  sentiment: {
    fundingRate: number;
    openInterest: number;
    longShortRatio: number;
  };
  // 综合评分
  overallScore: number;      // 0-100
  tradeability: 'excellent' | 'good' | 'fair' | 'poor' | 'avoid';
}

// =====================================================
// 历史统计
// =====================================================

export interface SignalStatistics {
  // 信号类型统计
  signalType: string;
  coin: string;
  timeframe: string;

  // 执行统计
  totalOccurrences: number;
  totalExecuted: number;
  executionRate: number;

  // 盈亏统计
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;

  // 金额统计
  totalProfit: number;
  totalLoss: number;
  netProfit: number;
  averageProfit: number;
  averageLoss: number;
  profitFactor: number;      // 总盈利/总亏损

  // 时间统计
  averageHoldingTime: number;
  averageTimeToProfit: number;
  averageTimeToLoss: number;

  // 风险统计
  maxDrawdown: number;
  maxRunup: number;
  sharpeRatio: number;
  sortinoRatio: number;

  // 当前状态
  lastExecutedAt: number;
  consecutiveWins: number;
  consecutiveLosses: number;
  currentStreak: 'winning' | 'losing' | 'neutral';
}

// =====================================================
// 交易记录
// =====================================================

export interface TradeRecord {
  // 基本信息
  id: string;
  coin: string;
  signalType: string;
  direction: 'buy' | 'sell';

  // 执行信息
  entryTime: number;
  entryPrice: number;
  exitTime?: number;
  exitPrice?: number;
  size: number;              // 数量
  value: number;             // 价值（USDT）

  // 止盈止损
  stopLoss?: number;
  takeProfit?: number;
  trailingStop?: number;

  // 结果
  status: 'open' | 'closed' | 'cancelled';
  profitLoss?: number;
  profitLossPercent?: number;
  holdingTime?: number;

  // 分析数据
  marketStateAtEntry: MarketStateAnalysis;
  confidenceAtEntry: number;
  reasons: string[];

  // 滑点与手续费
  slippage?: number;
  fee?: number;

  // 元数据
  metadata?: Record<string, unknown>;
}

// =====================================================
// 动态止盈止损配置
// =====================================================

export interface DynamicStopLossConfig {
  // 基础止损
  baseStopLoss: number;       // 基础止损百分比（如 0.15%）

  // 动态调整
  enableTrailingStop: boolean;
  trailingStopDistance: number;  // 追踪止损距离
  trailingStopActivation: number; // 激活价格（盈利%）

  // 分批止盈
  enablePartialTakeProfit: boolean;
  partialTakeProfitLevels: Array<{
    percent: number;          // 止盈百分比
    closePercent: number;     // 平仓比例（0-1）
  }>;

  // 基于波动率调整
  enableVolatilityAdjustment: boolean;
  volatilityMultiplier: number;   // 波动率调整系数

  // 基于胜率调整
  enableWinRateAdjustment: boolean;
  minWinRate: number;            // 最低胜率要求
}

// =====================================================
// 仓位管理
// =====================================================

export interface PositionManagementConfig {
  // 基础仓位
  basePositionSize: number;   // 基础仓位比例（如 0.05 = 5%）

  // 凯利公式
  enableKelly: boolean;
  kellyFraction: number;      // 凯利系数（0-1，通常0.25）

  // 基于信号强度调整
  enableStrengthAdjustment: boolean;
  strengthMultiplier: {       // 信号强度对应的仓位乘数
    weak: number;             // 0.3-0.5
    medium: number;           // 0.5-0.8
    strong: number;           // 0.8-1.5
  };

  // 基于胜率调整
  enableWinRateAdjustment: boolean;
  winRateMultiplier: {        // 胜率对应的仓位乘数
    low: number;              // 胜率 < 45%
    medium: number;           // 胜率 45-55%
    high: number;             // 胜率 > 55%
  };

  // 基于连续结果调整
  enableStreakAdjustment: boolean;
  streakMultiplier: {         // 连续结果的仓位调整
    winning: number;          // 连续盈利后
    losing: number;           // 连续亏损后
  };
  maxConsecutiveAdjustment: number;

  // 最大仓位限制
  maxPositionSize: number;    // 单笔最大仓位
  maxTotalPosition: number;   // 总仓位最大比例

  // 风险限制
  maxRiskPerTrade: number;    // 单笔最大风险比例
  maxDailyLoss: number;       // 每日最大亏损
}

// =====================================================
// 综合交易系统
// =====================================================

export class ComprehensiveTradingSystem {
  private signalGenerator: AdvancedSignalGenerator;

  // 统计数据库
  private signalStats = new Map<string, SignalStatistics>();
  private tradeHistory: TradeRecord[] = [];

  // 当前持仓
  private openPositions = new Map<string, TradeRecord>();

  // 每日统计
  private dailyStats = {
    date: new Date().toDateString(),
    totalTrades: 0,
    totalProfit: 0,
    totalLoss: 0,
    maxDrawdown: 0,
  };

  constructor(signalGenerator: AdvancedSignalGenerator) {
    this.signalGenerator = signalGenerator;
    logger.info('综合交易系统初始化');
  }

  /**
   * 处理信号（完整流程）
   */
  async processSignal(
    signal: TechnicalSignal,
    marketState: MarketStateAnalysis,
    availableBalance: number
  ): Promise<{
    shouldTrade: boolean;
    confidence: number;
    positionSize: number;
    stopLoss: number;
    takeProfit: number;
    reasons: string[];
  } | null> {
    const reasons: string[] = [];
    let shouldTrade = true;
    let confidence = signal.strength;

    // 1. 市场状态检查
    if (marketState.tradeability === 'avoid') {
      shouldTrade = false;
      reasons.push(`市场状态不佳: ${marketState.tradeability}`);
    }

    if (marketState.volatility.level === 'extreme') {
      shouldTrade = false;
      reasons.push('波动率过高，暂停交易');
    }

    // 2. 历史统计验证
    const stats = this.getSignalStatistics(signal.type, signal.coin, signal.timeframe);
    if (stats.totalTrades >= 10) {
      // 需要至少10笔交易才有统计意义
      if (stats.winRate < 0.45) {
        confidence *= 0.5; // 降低置信度
        reasons.push(`历史胜率低: ${(stats.winRate * 100).toFixed(1)}%`);
      }

      if (stats.profitFactor < 1.0) {
        shouldTrade = false;
        reasons.push(`盈亏比不佳: ${stats.profitFactor.toFixed(2)}`);
      }

      // 连续亏损检查
      if (stats.consecutiveLosses >= 3) {
        shouldTrade = false;
        reasons.push(`连续亏损: ${stats.consecutiveLosses}次`);
      }
    }

    // 3. 市场状态调整置信度
    confidence *= this.getMarketStateMultiplier(marketState);

    // 4. 检查当前持仓
    const existingPosition = this.openPositions.get(signal.coin);
    if (existingPosition) {
      // 已有持仓，检查是否可以加仓
      const canAdd = this.canAddToPosition(existingPosition, signal);
      if (!canAdd) {
        shouldTrade = false;
        reasons.push('已有持仓，不适合加仓');
      }
    }

    // 5. 计算仓位大小
    const positionSize = this.calculatePositionSize(
      signal,
      marketState,
      stats,
      availableBalance
    );

    // 6. 计算动态止盈止损
    const { stopLoss, takeProfit } = this.calculateDynamicStops(
      signal,
      marketState,
      stats
    );

    // 7. 最终置信度检查
    if (confidence < 0.5) {
      shouldTrade = false;
      reasons.push(`最终置信度过低: ${confidence.toFixed(2)}`);
    }

    return {
      shouldTrade,
      confidence,
      positionSize,
      stopLoss,
      takeProfit,
      reasons,
    };
  }

  /**
   * 多维度市场分析
   */
  analyzeMarketState(
    coin: string,
    klines: CandleData[],
    indicators: any
  ): MarketStateAnalysis {
    // 1. 趋势分析
    const trend = this.analyzeTrend(klines, indicators);

    // 2. 波动率分析
    const volatility = this.analyzeVolatility(klines);

    // 3. 动量分析
    const momentum = this.analyzeMomentum(indicators);

    // 4. 成交量分析
    const volume = this.analyzeVolume(klines);

    // 5. 支撑/阻力分析
    const levels = this.analyzeLevels(klines);

    // 6. 综合评分
    const overallScore = this.calculateOverallScore({
      trend,
      volatility,
      momentum,
      volume,
    });

    const tradeability = this.getTradeability(overallScore, volatility.level);

    return {
      trend,
      volatility,
      momentum,
      volume,
      levels,
      sentiment: {
        fundingRate: 0,
        openInterest: 0,
        longShortRatio: 1,
      },
      overallScore,
      tradeability,
    };
  }

  /**
   * 趋势分析
   */
  private analyzeTrend(klines: CandleData[], indicators: any): MarketStateAnalysis['trend'] {
    const ma7 = indicators.ma?.ma7 || 0;
    const ma25 = indicators.ma?.ma25 || 0;
    const ma99 = indicators.ma?.ma99 || 0;
    const currentPrice = klines[klines.length - 1].close;

    let direction: 'bullish' | 'bearish' | 'sideways' = 'sideways';
    let strength = 0;

    if (currentPrice > ma7 && ma7 > ma25 && ma25 > ma99) {
      direction = 'bullish';
      strength = Math.min(100, ((currentPrice - ma99) / ma99) * 1000);
    } else if (currentPrice < ma7 && ma7 < ma25 && ma25 < ma99) {
      direction = 'bearish';
      strength = Math.min(100, ((ma99 - currentPrice) / ma99) * 1000);
    }

    return { direction, strength, duration: 0 };
  }

  /**
   * 波动率分析
   */
  private analyzeVolatility(klines: CandleData[]): MarketStateAnalysis['volatility'] {
    // 计算最近20根K线的真实波幅
    const recent = klines.slice(-20);
    const atr = this.calculateATR(recent);

    // 计算历史分位数
    const allATR = this.calculateRollingATR(klines, 20);
    const percentile = (allATR.filter(v => v <= atr).length / allATR.length) * 100;

    let level: 'low' | 'normal' | 'high' | 'extreme' = 'normal';
    if (percentile < 25) level = 'low';
    else if (percentile < 50) level = 'normal';
    else if (percentile < 75) level = 'high';
    else level = 'extreme';

    return { level, value: atr, percentile };
  }

  /**
   * 动量分析
   */
  private analyzeMomentum(indicators: any): MarketStateAnalysis['momentum'] {
    const rsi = indicators.rsi || 50;
    const macd = indicators.macd || { macd: 0, signal: 0, histogram: 0 };

    let direction: 'increasing' | 'decreasing' | 'neutral' = 'neutral';
    if (macd.histogram > 0 && macd.macd > macd.signal) {
      direction = 'increasing';
    } else if (macd.histogram < 0 && macd.macd < macd.signal) {
      direction = 'decreasing';
    }

    return { rsi, macd, direction };
  }

  /**
   * 成交量分析
   */
  private analyzeVolume(klines: CandleData[]): MarketStateAnalysis['volume'] {
    const recent = klines.slice(-20);
    const currentVolume = recent[recent.length - 1].volume;
    const averageVolume = recent.reduce((sum, k) => sum + k.volume, 0) / recent.length;
    const ratio = currentVolume / averageVolume;

    let trend: 'increasing' | 'decreasing' | 'neutral' = 'neutral';
    const last5 = recent.slice(-5);
    const prev5 = recent.slice(-10, -5);
    const avgLast5 = last5.reduce((sum, k) => sum + k.volume, 0) / 5;
    const avgPrev5 = prev5.reduce((sum, k) => sum + k.volume, 0) / 5;

    if (avgLast5 > avgPrev5 * 1.1) trend = 'increasing';
    else if (avgLast5 < avgPrev5 * 0.9) trend = 'decreasing';

    return {
      current: currentVolume,
      average: averageVolume,
      ratio,
      trend,
    };
  }

  /**
   * 支撑/阻力分析
   */
  private analyzeLevels(klines: CandleData[]): MarketStateAnalysis['levels'] {
    const recent = klines.slice(-100);
    const currentPrice = recent[recent.length - 1].close;

    // 简单的支撑/阻力计算（基于近期高低点）
    const highs = recent.map(k => k.high).sort((a, b) => b - a);
    const lows = recent.map(k => k.low).sort((a, b) => a - b);

    const resistance = [...new Set(highs.slice(0, 5).map(h => Math.round(h * 100) / 100))];
    const support = [...new Set(lows.slice(0, 5).map(l => Math.round(l * 100) / 100))];

    const nearestResistance = resistance.find(r => r > currentPrice) || currentPrice * 1.01;
    const nearestSupport = support.reverse().find(s => s < currentPrice) || currentPrice * 0.99;

    return {
      support,
      resistance,
      distanceToSupport: ((currentPrice - nearestSupport) / currentPrice) * 100,
      distanceToResistance: ((nearestResistance - currentPrice) / currentPrice) * 100,
    };
  }

  /**
   * 计算综合评分
   */
  private calculateOverallScore(analysis: {
    trend: MarketStateAnalysis['trend'];
    volatility: MarketStateAnalysis['volatility'];
    momentum: MarketStateAnalysis['momentum'];
    volume: MarketStateAnalysis['volume'];
  }): number {
    let score = 50; // 基础分

    // 趋势加分（最高20分）
    if (analysis.trend.direction !== 'sideways') {
      score += Math.min(20, analysis.trend.strength / 5);
    }

    // 波动率扣分（最高扣30分）
    if (analysis.volatility.level === 'extreme') score -= 30;
    else if (analysis.volatility.level === 'high') score -= 15;

    // 动量加分（最高15分）
    if (analysis.momentum.direction !== 'neutral') {
      score += 15;
    }

    // 成交量加分（最高15分）
    if (analysis.volume.trend === 'increasing' && analysis.volume.ratio > 1.2) {
      score += Math.min(15, (analysis.volume.ratio - 1) * 50);
    }

    return Math.max(0, Math.min(100, score));
  }

  /**
   * 获取可交易性
   */
  private getTradeability(
    score: number,
    volatility: MarketStateAnalysis['volatility']['level']
  ): MarketStateAnalysis['tradeability'] {
    if (volatility === 'extreme') return 'avoid';
    if (score >= 80) return 'excellent';
    if (score >= 65) return 'good';
    if (score >= 50) return 'fair';
    return 'poor';
  }

  /**
   * 获取市场状态乘数
   */
  private getMarketStateMultiplier(marketState: MarketStateAnalysis): number {
    let multiplier = 1.0;

    // 趋势强度调整
    if (marketState.trend.direction !== 'sideways') {
      multiplier *= (0.8 + marketState.trend.strength / 500);
    }

    // 波动率调整
    switch (marketState.volatility.level) {
      case 'low': multiplier *= 0.9; break;
      case 'normal': multiplier *= 1.0; break;
      case 'high': multiplier *= 1.1; break;
      case 'extreme': multiplier *= 0.5; break;
    }

    // 综合评分调整
    multiplier *= (0.5 + marketState.overallScore / 100);

    return multiplier;
  }

  /**
   * 计算仓位大小
   */
  private calculatePositionSize(
    signal: TechnicalSignal,
    marketState: MarketStateAnalysis,
    stats: SignalStatistics,
    availableBalance: number
  ): number {
    let positionSize = availableBalance * 0.05; // 基础5%

    // 基于信号强度调整
    if (signal.strength < 0.4) positionSize *= 0.5;
    else if (signal.strength > 0.7) positionSize *= 1.5;

    // 基于胜率调整
    if (stats.totalTrades >= 10) {
      if (stats.winRate > 0.55) positionSize *= 1.2;
      else if (stats.winRate < 0.45) positionSize *= 0.5;
    }

    // 基于连续结果调整
    if (stats.consecutiveWins >= 2) positionSize *= 1.1;
    if (stats.consecutiveLosses >= 2) positionSize *= 0.5;

    // 市场状态调整
    positionSize *= this.getMarketStateMultiplier(marketState);

    return Math.min(positionSize, availableBalance * 0.1); // 最大10%
  }

  /**
   * 计算动态止盈止损
   */
  private calculateDynamicStops(
    signal: TechnicalSignal,
    marketState: MarketStateAnalysis,
    stats: SignalStatistics
  ): { stopLoss: number; takeProfit: number } {
    const currentPrice = signal.price || 0;
    const isBuy = signal.direction === 'bullish';

    // 基础止盈止损
    let stopLossPercent = 0.002; // 0.2%
    let takeProfitPercent = 0.003; // 0.3%

    // 基于波动率调整
    if (marketState.volatility.level === 'high') {
      stopLossPercent *= 1.5;
      takeProfitPercent *= 1.5;
    }

    // 基于历史胜率调整
    if (stats.totalTrades >= 10) {
      if (stats.winRate > 0.55) {
        // 高胜率，可以放宽止损
        stopLossPercent *= 1.2;
      } else {
        // 低胜率，收紧止损
        stopLossPercent *= 0.8;
      }
    }

    return {
      stopLoss: isBuy
        ? currentPrice * (1 - stopLossPercent)
        : currentPrice * (1 + stopLossPercent),
      takeProfit: isBuy
        ? currentPrice * (1 + takeProfitPercent)
        : currentPrice * (1 - takeProfitPercent),
    };
  }

  /**
   * 检查是否可以加仓
   */
  private canAddToPosition(position: TradeRecord, signal: TechnicalSignal): boolean {
    // 方向一致才能加仓
    if ((position.direction === 'buy' && signal.direction !== 'bullish') ||
        (position.direction === 'sell' && signal.direction !== 'bearish')) {
      return false;
    }

    // 检查加仓次数限制
    // TODO: 实现更复杂的加仓逻辑

    return true;
  }

  /**
   * 获取信号统计
   */
  getSignalStatistics(signalType: string, coin: string, timeframe: string): SignalStatistics {
    const key = `${signalType}_${coin}_${timeframe}`;
    return this.signalStats.get(key) || this.createEmptyStats(key);
  }

  /**
   * 创建空统计
   */
  private createEmptyStats(key: string): SignalStatistics {
    const [signalType, coin, timeframe] = key.split('_');
    return {
      signalType,
      coin,
      timeframe,
      totalOccurrences: 0,
      totalExecuted: 0,
      executionRate: 0,
      totalTrades: 0,
      winningTrades: 0,
      losingTrades: 0,
      winRate: 0,
      totalProfit: 0,
      totalLoss: 0,
      netProfit: 0,
      averageProfit: 0,
      averageLoss: 0,
      profitFactor: 0,
      averageHoldingTime: 0,
      averageTimeToProfit: 0,
      averageTimeToLoss: 0,
      maxDrawdown: 0,
      maxRunup: 0,
      sharpeRatio: 0,
      sortinoRatio: 0,
      lastExecutedAt: 0,
      consecutiveWins: 0,
      consecutiveLosses: 0,
      currentStreak: 'neutral',
    };
  }

  /**
   * 记录交易
   */
  recordTrade(trade: TradeRecord): void {
    this.tradeHistory.push(trade);
    if (trade.status === 'open') {
      this.openPositions.set(trade.coin, trade);
    } else {
      this.openPositions.delete(trade.coin);
      this.updateStatistics(trade);
    }

    logger.info('交易已记录', {
      id: trade.id,
      coin: trade.coin,
      direction: trade.direction,
      profitLoss: trade.profitLoss,
    });
  }

  /**
   * 更新统计
   */
  private updateStatistics(trade: TradeRecord): void {
    const key = `${trade.signalType}_${trade.coin}_${trade.entryTime}`; // 简化key
    let stats = this.signalStats.get(key);

    if (!stats) {
      stats = this.createEmptyStats(key);
      this.signalStats.set(key, stats);
    }

    stats.totalTrades++;
    if (trade.profitLoss && trade.profitLoss > 0) {
      stats.winningTrades++;
      stats.totalProfit += trade.profitLoss;
      stats.consecutiveWins++;
      stats.consecutiveLosses = 0;
      stats.currentStreak = 'winning';
    } else if (trade.profitLoss && trade.profitLoss < 0) {
      stats.losingTrades++;
      stats.totalLoss += Math.abs(trade.profitLoss);
      stats.consecutiveLosses++;
      stats.consecutiveWins = 0;
      stats.currentStreak = 'losing';
    }

    stats.winRate = stats.winningTrades / stats.totalTrades;
    stats.profitFactor = stats.totalLoss > 0 ? stats.totalProfit / stats.totalLoss : stats.totalProfit > 0 ? 999 : 0;
    stats.lastExecutedAt = Date.now();
  }

  /**
   * 计算ATR
   */
  private calculateATR(klines: CandleData[]): number {
    if (klines.length < 2) return 0;

    let trSum = 0;
    for (let i = 1; i < klines.length; i++) {
      const high = klines[i].high;
      const low = klines[i].low;
      const prevClose = klines[i - 1].close;

      const tr = Math.max(
        high - low,
        Math.abs(high - prevClose),
        Math.abs(low - prevClose)
      );
      trSum += tr;
    }

    return trSum / (klines.length - 1);
  }

  /**
   * 计算滚动ATR
   */
  private calculateRollingATR(klines: CandleData[], period: number): number[] {
    const atrs: number[] = [];
    for (let i = period; i < klines.length; i++) {
      const slice = klines.slice(i - period, i + 1);
      atrs.push(this.calculateATR(slice));
    }
    return atrs;
  }

  /**
   * 获取统计信息
   */
  getStats() {
    const closedTrades = this.tradeHistory.filter(t => t.status === 'closed');
    const totalProfit = closedTrades.reduce((sum, t) => sum + (t.profitLoss || 0), 0);
    const winningTrades = closedTrades.filter(t => (t.profitLoss || 0) > 0).length;
    const winRate = closedTrades.length > 0 ? winningTrades / closedTrades.length : 0;

    return {
      totalTrades: closedTrades.length,
      totalProfit,
      winRate,
      openPositions: this.openPositions.size,
      signalStatsCount: this.signalStats.size,
    };
  }
}
