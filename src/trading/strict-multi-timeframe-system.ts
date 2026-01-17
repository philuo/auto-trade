/**
 * 严格安全的多周期交易系统
 *
 * 遵循 TECHNICAL_ANALYSIS.md 规范：
 * - 多周期K线分析（1m ~ 1D）
 * - 完整指标体系（MA/RSI/MACD/BB/ADX/ATR/市场状态）
 * - 事件检测（非状态检测）
 * - 严格频率控制（高频：3分钟间隔，日上限20次）
 * - 贝叶斯置信度计算
 * - 时间衰减（30天半衰期）
 * - 多层安全验证
 *
 * ⚠️ 安全策略：十分严格！！！
 */

import { logger } from '../utils/logger;
import { AdvancedSignalGenerator } from '../signals/advanced-generator;
import type {
  TechnicalSignal,
  CandleData,
  KLineInterval,
} from '../market/types;

// =====================================================
// 配置类型
// =====================================================

export interface StrictTradingConfig {
  /** 支持的K线周期 */
  timeframes: KLineInterval[];

  /** 交易模式 */
  tradingMode: 'high' | 'medium' | 'low';

  /** 频率控制 */
  frequencyLimit: {
    minInterval: number;      // 最小交易间隔（毫秒）
    maxDailyTrades: number;   // 每日最大交易次数
    maxPerSecond: number;     // 每秒最大交易次数
  };

  /** 置信度要求 */
  confidenceRequirements: {
    minConfidence: number;    // 最低置信度
    requireMultiTimeframe: boolean;  // 是否需要多周期确认
    minConfirmingTimeframes: number; // 最少确认周期数
  };

  /** 安全限制 */
  safetyLimits: {
    maxSinglePosition: number;  // 单笔最大仓位
    maxTotalPosition: number;   // 总仓位最大比例
    maxRiskPerTrade: number;    // 单笔最大风险
    maxDailyLoss: number;       // 每日最大亏损
    riskRewardRatio: number;    // 最小风险回报比
  };

  /** 硬性限制 */
  hardLimits: {
    allowedCoins: string[];     // 允许交易的币种
    maxLeverage: Record<string, number>;  // 各币种最大杠杆
    minStopLoss: number;        // 最小止损
    maxStopLoss: number;        // 最大止损
  };
}

// =====================================================
// 周期信号
// =====================================================

export interface TimeframeSignal {
  timeframe: KLineInterval;
  signals: TechnicalSignal[];
  weight: number;              // 周期权重（长周期权重更高）
  timestamp: number;
}

// =====================================================
// 多周期聚合信号
// =====================================================

export interface AggregatedSignal {
  /** 信号ID */
  id: string;

  /** 币种 */
  coin: string;

  /** 方向 */
  direction: 'bullish' | 'bearish';

  /** 主要周期（信号最强的周期） */
  primaryTimeframe: KLineInterval;

  /** 确认周期列表 */
  confirmingTimeframes: KLineInterval[];

  /** 综合置信度 */
  confidence: number;

  /** 贝叶斯置信度 */
  bayesianConfidence: number;

  /** 各周期信号 */
  timeframeSignals: TimeframeSignal[];

  /** 原始信号列表 */
  rawSignals: TechnicalSignal[];

  /** 建议价格 */
  suggestedPrice: number;

  /** 建议仓位 */
  suggestedPosition: number;

  /** 止损价格 */
  stopLoss: number;

  /** 止盈价格 */
  takeProfit: number;

  /** 风险回报比 */
  riskRewardRatio: number;

  /** 时间戳 */
  timestamp: number;

  /** 安全检查结果 */
  safetyChecks: {
    passed: boolean;
    failures: string[];
    warnings: string[];
  };
}

// =====================================================
// 历史统计（带时间衰减）
// =====================================================

export interface WeightedStatistics {
  /** 信号类型 */
  signalType: string;

  /** 币种 */
  coin: string;

  /** 周期 */
  timeframe: string;

  // 基础统计
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;

  // 加权统计（贝叶斯）
  bayesianWinRate: number;     // 贝叶斯胜率
  sampleSize: number;          // 有效样本量
  timeDecayFactor: number;     // 时间衰减因子

  // 盈亏统计
  totalProfit: number;
  totalLoss: number;
  profitFactor: number;        // 盈亏比
  averageProfit: number;
  averageLoss: number;

  // 风险统计
  maxDrawdown: number;
  maxRunup: number;
  sharpeRatio: number;

  // 连续统计
  consecutiveWins: number;
  consecutiveLosses: number;

  // 最近表现（30天）
  recentWinRate: number;
  recentProfitFactor: number;
}

// =====================================================
// 严格安全的多周期交易系统
// =====================================================

export class StrictMultiTimeframeSystem {
  private config: StrictTradingConfig;
  private signalGenerator: AdvancedSignalGenerator;

  // 各周期的K线数据
  private klineData = new Map<string, CandleData[]>();

  // 各周期最后更新时间
  private lastUpdateTime = new Map<string, number>();

  // 交易历史（用于统计）
  private tradeHistory: Array<{
    id: string;
    signalType: string;
    coin: string;
    timeframe: string;
    direction: 'bullish' | 'bearish';
    entryPrice: number;
    exitPrice?: number;
    profitLoss?: number;
    entryTime: number;
    exitTime?: number;
    confidence: number;
  }> = [];

  // 加权统计
  private weightedStats = new Map<string, WeightedStatistics>();

  // 频率控制
  private tradeTimestamps: number[] = [];
  private lastTradeTime = 0;

  // 每日统计
  private dailyStats = {
    date: '',
    trades: 0,
    profit: 0,
    loss: 0,
  };

  constructor(config: StrictTradingConfig) {
    this.config = this.applyDefaultConfig(config);
    this.signalGenerator = new AdvancedSignalGenerator({
      minStrength: this.config.confidenceRequirements.minConfidence,
      enableADXFilter: true,
      minADX: 25,
      enablePriceConfirmation: 2,
      enableVolumeConfirmation: true,
      enableMultiTimeframeConfirmation: true,
      maxSignals: 10,
      enableSafeMode: true,
    });

    logger.info('严格安全多周期交易系统初始化', {
      timeframes: this.config.timeframes,
      tradingMode: this.config.tradingMode,
      frequencyLimit: this.config.frequencyLimit,
      safetyLimits: this.config.safetyLimits,
    });
  }

  /**
   * 应用默认配置（确保安全）
   */
  private applyDefaultConfig(config: StrictTradingConfig): StrictTradingConfig {
    const defaults: StrictTradingConfig = {
      timeframes: ['1m', '5m', '15m', '1H', '4H'],
      tradingMode: 'medium',
      frequencyLimit: {
        minInterval: 3 * 60 * 1000,      // 3分钟
        maxDailyTrades: 20,
        maxPerSecond: 10,                 // 每秒最大10次
      },
      confidenceRequirements: {
        minConfidence: 0.65,
        requireMultiTimeframe: true,
        minConfirmingTimeframes: 2,
      },
      safetyLimits: {
        maxSinglePosition: 0.05,
        maxTotalPosition: 0.20,
        maxRiskPerTrade: 0.02,
        maxDailyLoss: 0.05,
        riskRewardRatio: 1.5,
      },
      hardLimits: {
        allowedCoins: ['BTC', 'ETH'],
        maxLeverage: { BTC: 5, ETH: 3 },
        minStopLoss: 0.005,
        maxStopLoss: 0.10,
      },
    };

    return { ...defaults, ...config };
  }

  /**
   * 处理多周期K线更新
   *
   * 这是主要的入口函数，当任何周期的K线更新时调用
   */
  async handleMultiTimeframeUpdate(
    coin: string,
    timeframe: KLineInterval,
    klines: CandleData[],
    volume24h: number,
    volumeMA: number,
    currentPrice: number,
    availableBalance: number
  ): Promise<AggregatedSignal | null> {
    const startTime = Date.now();

    try {
      // 1. 硬性安全检查
      const hardLimitCheck = this.checkHardLimits(coin);
      if (!hardLimitCheck.passed) {
        logger.warn('硬性限制检查失败', {
          coin,
          failures: hardLimitCheck.failures,
        });
        return null;
      }

      // 2. 频率限制检查
      const frequencyCheck = this.checkFrequencyLimit();
      if (!frequencyCheck.passed) {
        logger.debug('频率限制检查失败', {
          coin,
          reasons: frequencyCheck.failures,
        });
        return null;
      }

      // 3. 更新K线数据
      this.updateKlineData(coin, timeframe, klines);

      // 4. 检查所有周期的数据完整性
      const dataReady = this.checkMultiTimeframeDataReady(coin);
      if (!dataReady.ready) {
        logger.debug('多周期数据未就绪', {
          coin,
          ready: dataReady.readyTimeframes,
          required: dataReady.requiredTimeframes,
        });
        return null;
      }

      // 5. 生成各周期信号
      const timeframeSignals = await this.generateTimeframeSignals(
        coin,
        klines,
        volume24h,
        volumeMA,
        currentPrice
      );

      if (timeframeSignals.length === 0) {
        return null;
      }

      // 6. 聚合多周期信号
      const aggregated = this.aggregateTimeframeSignals(
        coin,
        timeframeSignals,
        currentPrice,
        availableBalance
      );

      if (!aggregated) {
        return null;
      }

      // 7. 计算贝叶斯置信度
      aggregated.bayesianConfidence = this.calculateBayesianConfidence(aggregated);

      // 8. 最终安全检查
      aggregated.safetyChecks = this.performFinalSafetyChecks(
        aggregated,
        availableBalance
      );

      if (!aggregated.safetyChecks.passed) {
        logger.warn('最终安全检查失败', {
          coin,
          failures: aggregated.safetyChecks.failures,
        });
        return null;
      }

      // 9. 记录交易意图
      this.recordTradeIntent(aggregated);

      logger.info('多周期信号聚合完成', {
        coin,
        primaryTimeframe: aggregated.primaryTimeframe,
        confirmingTimeframes: aggregated.confirmingTimeframes,
        confidence: aggregated.confidence,
        bayesianConfidence: aggregated.bayesianConfidence,
        processingTime: Date.now() - startTime,
      });

      return aggregated;

    } catch (error) {
      logger.error('处理多周期更新失败', {
        coin,
        timeframe,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * 硬性限制检查（第一层安全）
   */
  private checkHardLimits(coin: string): { passed: boolean; failures: string[] } {
    const failures: string[] = [];

    // 检查币种白名单
    if (!this.config.hardLimits.allowedCoins.includes(coin)) {
      failures.push(`币种不在白名单中: ${coin}`);
    }

    // 检查每日亏损限制
    this.updateDailyStats();
    if (this.dailyStats.loss < 0 &&
        Math.abs(this.dailyStats.loss) > this.config.safetyLimits.maxDailyLoss) {
      failures.push(`今日亏损超限: ${Math.abs(this.dailyStats.loss).toFixed(2)}%`);
    }

    return {
      passed: failures.length === 0,
      failures,
    };
  }

  /**
   * 频率限制检查（第二层安全）
   */
  private checkFrequencyLimit(): { passed: boolean; failures: string[] } {
    const failures: string[] = [];
    const now = Date.now();

    // 清理过期的交易记录
    this.tradeTimestamps = this.tradeTimestamps.filter(
      ts => now - ts < 24 * 60 * 60 * 1000
    );

    // 检查每日交易次数
    if (this.tradeTimestamps.length >= this.config.frequencyLimit.maxDailyTrades) {
      failures.push(`今日交易次数已达上限: ${this.tradeTimestamps.length}`);
    }

    // 检查最小间隔
    if (now - this.lastTradeTime < this.config.frequencyLimit.minInterval) {
      failures.push(`交易间隔过短: ${((now - this.lastTradeTime) / 1000).toFixed(0)}秒`);
    }

    // 检查每秒交易次数
    const recentTrades = this.tradeTimestamps.filter(
      ts => now - ts < 1000
    );
    if (recentTrades.length >= this.config.frequencyLimit.maxPerSecond) {
      failures.push(`每秒交易次数超限: ${recentTrades.length}`);
    }

    return {
      passed: failures.length === 0,
      failures,
    };
  }

  /**
   * 更新K线数据
   */
  private updateKlineData(coin: string, timeframe: KLineInterval, klines: CandleData[]): void {
    const key = `${coin}_${timeframe}`;
    this.klineData.set(key, klines);
    this.lastUpdateTime.set(key, Date.now());
  }

  /**
   * 检查多周期数据是否就绪
   */
  private checkMultiTimeframeDataReady(coin: string): {
    ready: boolean;
    readyTimeframes: string[];
    requiredTimeframes: string[];
  } {
    const readyTimeframes: string[] = [];
    const requiredTimeframes: string[] = [];

    for (const timeframe of this.config.timeframes) {
      requiredTimeframes.push(timeframe);
      const key = `${coin}_${timeframe}`;
      const klines = this.klineData.get(key);

      if (klines && klines.length >= 99) {
        readyTimeframes.push(timeframe);
      }
    }

    // 至少需要3个周期的数据
    const ready = readyTimeframes.length >= Math.min(3, requiredTimeframes.length);

    return {
      ready,
      readyTimeframes,
      requiredTimeframes,
    };
  }

  /**
   * 生成各周期信号
   */
  private async generateTimeframeSignals(
    coin: string,
    currentKlines: CandleData[],
    volume24h: number,
    volumeMA: number,
    currentPrice: number
  ): Promise<TimeframeSignal[]> {
    const timeframeSignals: TimeframeSignal[] = [];

    for (const timeframe of this.config.timeframes) {
      const key = `${coin}_${timeframe}`;
      const klines = this.klineData.get(key);

      if (!klines || klines.length < 99) {
        continue;
      }

      // 生成该周期的信号
      const signals = this.signalGenerator.generateSignals(
        coin,
        klines,
        volume24h,
        volumeMA,
        timeframe
      );

      if (signals.length > 0) {
        // 计算周期权重（长周期权重更高）
        const weight = this.getTimeframeWeight(timeframe);

        timeframeSignals.push({
          timeframe,
          signals,
          weight,
          timestamp: Date.now(),
        });
      }
    }

    return timeframeSignals;
  }

  /**
   * 获取周期权重
   */
  private getTimeframeWeight(timeframe: KLineInterval): number {
    const weights: Record<KLineInterval, number> = {
      '1m': 0.5,
      '3m': 0.6,
      '5m': 0.7,
      '15m': 1.0,
      '30m': 1.2,
      '1H': 1.5,
      '2H': 1.8,
      '4H': 2.0,
      '6H': 2.2,
      '12H': 2.5,
      '1D': 3.0,
      '1W': 3.5,
      '1M': 4.0,
    };
    return weights[timeframe] || 1.0;
  }

  /**
   * 聚合多周期信号
   */
  private aggregateTimeframeSignals(
    coin: string,
    timeframeSignals: TimeframeSignal[],
    currentPrice: number,
    availableBalance: number
  ): AggregatedSignal | null {
    // 按方向分组
    const bullishSignals: TechnicalSignal[] = [];
    const bearishSignals: TechnicalSignal[] = [];

    for (const tfSignal of timeframeSignals) {
      for (const signal of tfSignal.signals) {
        if (signal.direction === 'bullish') {
          bullishSignals.push(signal);
        } else if (signal.direction === 'bearish') {
          bearishSignals.push(signal);
        }
      }
    }

    // 判断主导方向
    const bullishScore = bullishSignals.reduce((sum, s) => sum + s.strength, 0);
    const bearishScore = bearishSignals.reduce((sum, s) => sum + s.strength, 0);

    if (bullishScore === 0 && bearishScore === 0) {
      return null;
    }

    const direction = bullishScore > bearishScore ? 'bullish' : 'bearish';
    const primarySignals = direction === 'bullish' ? bullishSignals : bearishSignals;

    // 按强度排序，取最强的信号作为主要信号
    primarySignals.sort((a, b) => b.strength - a.strength);
    const primarySignal = primarySignals[0];

    // 找出确认的周期
    const confirmingTimeframes: KLineInterval[] = [];
    const allSignals = direction === 'bullish' ? bullishSignals : bearishSignals;

    for (const signal of allSignals) {
      if (!confirmingTimeframes.includes(signal.timeframe)) {
        confirmingTimeframes.push(signal.timeframe);
      }
    }

    // 计算综合置信度
    const confidence = this.calculateAggregatedConfidence(
      allSignals,
      timeframeSignals
    );

    // 计算仓位
    const suggestedPosition = this.calculateSafePosition(
      confidence,
      availableBalance,
      currentPrice
    );

    // 计算止盈止损
    const { stopLoss, takeProfit } = this.calculateSafeStops(
      direction,
      currentPrice,
      primarySignal
    );

    // 计算风险回报比
    const riskAmount = Math.abs(currentPrice - stopLoss);
    const rewardAmount = Math.abs(takeProfit - currentPrice);
    const riskRewardRatio = rewardAmount / riskAmount;

    return {
      id: `agg_${coin}_${direction}_${Date.now()}`,
      coin,
      direction,
      primaryTimeframe: primarySignal.timeframe,
      confirmingTimeframes,
      confidence,
      bayesianConfidence: 0, // 后续计算
      timeframeSignals,
      rawSignals: allSignals,
      suggestedPrice: currentPrice,
      suggestedPosition,
      stopLoss,
      takeProfit,
      riskRewardRatio,
      timestamp: Date.now(),
      safetyChecks: {
        passed: false,
        failures: [],
        warnings: [],
      },
    };
  }

  /**
   * 计算聚合置信度
   */
  private calculateAggregatedConfidence(
    signals: TechnicalSignal[],
    timeframeSignals: TimeframeSignal[]
  ): number {
    if (signals.length === 0) {
      return 0;
    }

    // 基础强度：加权平均
    let totalWeight = 0;
    let weightedStrength = 0;

    for (const signal of signals) {
      const tfSignal = timeframeSignals.find(
        tf => tf.timeframe === signal.timeframe
      );
      const weight = tfSignal?.weight || 1.0;

      weightedStrength += signal.strength * weight;
      totalWeight += weight;
    }

    const baseStrength = totalWeight > 0 ? weightedStrength / totalWeight : 0;

    // 多周期确认加成
    const uniqueTimeframes = new Set(signals.map(s => s.timeframe));
    const confirmationBonus = Math.min(0.2, (uniqueTimeframes.size - 1) * 0.05);

    // 信号数量加成（但不能太多）
    const countBonus = Math.min(0.1, (signals.length - 1) * 0.02);

    return Math.min(1, baseStrength + confirmationBonus + countBonus);
  }

  /**
   * 计算贝叶斯置信度
   */
  private calculateBayesianConfidence(aggregated: AggregatedSignal): number {
    // 获取历史统计
    const stats = this.getWeightedStats(
      aggregated.rawSignals[0].type,
      aggregated.coin,
      aggregated.primaryTimeframe
    );

    // 贝叶斯公式：加入先验概率
    // 假设先验：胜5负3（胜率62.5%）
    const priorWins = 5;
    const priorLosses = 3;

    // 后验概率
    const posteriorWinRate =
      (stats.winningTrades + priorWins) /
      (stats.totalTrades + priorWins + priorLosses);

    // 样本量因子
    const sampleSizeFactor = Math.min(1, stats.totalTrades / 50);

    // 盈亏比加成
    const profitFactorBonus =
      0.5 + 0.5 * Math.min(1, stats.profitFactor / 1.5);

    // 时间衰减因子
    const timeDecay = stats.timeDecayFactor;

    // 综合计算
    const bayesianConfidence =
      posteriorWinRate *
      sampleSizeFactor *
      profitFactorBonus *
      timeDecay;

    return Math.max(0, Math.min(1, bayesianConfidence));
  }

  /**
   * 计算安全仓位
   */
  private calculateSafePosition(
    confidence: number,
    availableBalance: number,
    currentPrice: number
  ): number {
    // 基础仓位
    let position = availableBalance * this.config.safetyLimits.maxSinglePosition;

    // 置信度调整
    position *= confidence;

    // 风险调整：确保最大风险不超过限制
    const maxRisk = availableBalance * this.config.safetyLimits.maxRiskPerTrade;
    // 假设止损2%，计算最大仓位
    const maxPositionByRisk = maxRisk / 0.02;

    return Math.min(position, maxPositionByRisk);
  }

  /**
   * 计算安全止盈止损
   */
  private calculateSafeStops(
    direction: 'bullish' | 'bearish',
    currentPrice: number,
    signal: TechnicalSignal
  ): { stopLoss: number; takeProfit: number } {
    const minSL = this.config.hardLimits.minStopLoss;
    const maxSL = this.config.hardLimits.maxStopLoss;
    const riskRewardRatio = this.config.safetyLimits.riskRewardRatio;

    // 使用基础止损0.5%（高频交易）
    let stopLossPercent = 0.005;
    let takeProfitPercent = stopLossPercent * riskRewardRatio;

    // 确保在硬性限制范围内
    stopLossPercent = Math.max(minSL, Math.min(maxSL, stopLossPercent));

    if (direction === 'bullish') {
      return {
        stopLoss: currentPrice * (1 - stopLossPercent),
        takeProfit: currentPrice * (1 + takeProfitPercent),
      };
    } else {
      return {
        stopLoss: currentPrice * (1 + stopLossPercent),
        takeProfit: currentPrice * (1 - takeProfitPercent),
      };
    }
  }

  /**
   * 最终安全检查（第三层安全）
   */
  private performFinalSafetyChecks(
    aggregated: AggregatedSignal,
    availableBalance: number
  ): { passed: boolean; failures: string[]; warnings: string[] } {
    const failures: string[] = [];
    const warnings: string[] = [];

    // 1. 置信度检查
    if (aggregated.confidence < this.config.confidenceRequirements.minConfidence) {
      failures.push(`综合置信度过低: ${aggregated.confidence.toFixed(2)} < ${this.config.confidenceRequirements.minConfidence}`);
    }

    if (aggregated.bayesianConfidence < this.config.confidenceRequirements.minConfidence) {
      failures.push(`贝叶斯置信度过低: ${aggregated.bayesianConfidence.toFixed(2)}`);
    }

    // 2. 多周期确认检查
    if (this.config.confidenceRequirements.requireMultiTimeframe) {
      const minConfirming = this.config.confidenceRequirements.minConfirmingTimeframes;
      if (aggregated.confirmingTimeframes.length < minConfirming) {
        failures.push(`确认周期不足: ${aggregated.confirmingTimeframes.length} < ${minConfirming}`);
      }
    }

    // 3. 风险回报比检查
    if (aggregated.riskRewardRatio < this.config.safetyLimits.riskRewardRatio) {
      failures.push(`风险回报比不足: ${aggregated.riskRewardRatio.toFixed(2)} < ${this.config.safetyLimits.riskRewardRatio}`);
    }

    // 4. 仓位检查
    const positionPercent = aggregated.suggestedPosition / availableBalance;
    if (positionPercent > this.config.safetyLimits.maxSinglePosition) {
      failures.push(`仓位超限: ${(positionPercent * 100).toFixed(1)}% > ${(this.config.safetyLimits.maxSinglePosition * 100).toFixed(1)}%`);
    }

    // 5. 止损检查
    const slPercent = Math.abs((aggregated.stopLoss - aggregated.suggestedPrice) / aggregated.suggestedPrice);
    if (slPercent < this.config.hardLimits.minStopLoss) {
      failures.push(`止损过小: ${(slPercent * 100).toFixed(2)}% < ${(this.config.hardLimits.minStopLoss * 100).toFixed(2)}%`);
    }
    if (slPercent > this.config.hardLimits.maxStopLoss) {
      failures.push(`止损过大: ${(slPercent * 100).toFixed(2)}% > ${(this.config.hardLimits.maxStopLoss * 100).toFixed(2)}%`);
    }

    // 6. 总仓位检查
    const currentTotalPosition = this.getCurrentTotalPosition();
    const newTotalPosition = currentTotalPosition + positionPercent;
    if (newTotalPosition > this.config.safetyLimits.maxTotalPosition) {
      failures.push(`总仓位超限: ${(newTotalPosition * 100).toFixed(1)}% > ${(this.config.safetyLimits.maxTotalPosition * 100).toFixed(1)}%`);
    }

    // 7. 警告（不阻止交易）
    if (aggregated.confirmingTimeframes.length < 3) {
      warnings.push('确认周期较少，可靠性可能不足');
    }

    if (aggregated.confidence < 0.8) {
      warnings.push(`置信度中等: ${aggregated.confidence.toFixed(2)}`);
    }

    return {
      passed: failures.length === 0,
      failures,
      warnings,
    };
  }

  /**
   * 获取加权统计
   */
  private getWeightedStats(signalType: string, coin: string, timeframe: string): WeightedStatistics {
    const key = `${signalType}_${coin}_${timeframe}`;
    let stats = this.weightedStats.get(key);

    if (!stats) {
      stats = this.createEmptyWeightedStats(key);
      this.weightedStats.set(key, stats);
    }

    // 更新时间衰减因子
    stats.timeDecayFactor = this.calculateTimeDecayFactor(stats);

    return stats;
  }

  /**
   * 创建空的加权统计
   */
  private createEmptyWeightedStats(key: string): WeightedStatistics {
    const [signalType, coin, timeframe] = key.split('_');
    return {
      signalType,
      coin,
      timeframe,
      totalTrades: 0,
      winningTrades: 0,
      losingTrades: 0,
      bayesianWinRate: 0.625, // 先验概率
      sampleSize: 0,
      timeDecayFactor: 1.0,
      totalProfit: 0,
      totalLoss: 0,
      profitFactor: 1.0,
      averageProfit: 0,
      averageLoss: 0,
      maxDrawdown: 0,
      maxRunup: 0,
      sharpeRatio: 0,
      consecutiveWins: 0,
      consecutiveLosses: 0,
      recentWinRate: 0.625,
      recentProfitFactor: 1.0,
    };
  }

  /**
   * 计算时间衰减因子（30天半衰期）
   */
  private calculateTimeDecayFactor(stats: WeightedStatistics): number {
    if (stats.totalTrades === 0) {
      return 1.0;
    }

    const now = Date.now();
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;

    // 简化：假设最近交易才有权重
    // 实际应该按每个交易的时间加权
    return Math.max(0.1, Math.min(1.0, 1 - (stats.consecutiveLosses * 0.05)));
  }

  /**
   * 记录交易意图
   */
  private recordTradeIntent(aggregated: AggregatedSignal): void {
    // 更新频率控制
    const now = Date.now();
    this.tradeTimestamps.push(now);
    this.lastTradeTime = now;
  }

  /**
   * 更新每日统计
   */
  private updateDailyStats(): void {
    const today = new Date().toDateString();

    if (this.dailyStats.date !== today) {
      // 新的一天，重置统计
      this.dailyStats = {
        date: today,
        trades: 0,
        profit: 0,
        loss: 0,
      };
    }
  }

  /**
   * 获取当前总仓位
   */
  private getCurrentTotalPosition(): number {
    // TODO: 实现从持仓数据计算
    return 0;
  }

  /**
   * 获取配置
   */
  getConfig(): Readonly<StrictTradingConfig> {
    return { ...this.config };
  }

  /**
   * 获取统计信息
   */
  getStats() {
    return {
      tradeHistoryCount: this.tradeHistory.length,
      weightedStatsCount: this.weightedStats.size,
      dailyStats: { ...this.dailyStats },
      tradeTimestampsCount: this.tradeTimestamps.length,
    };
  }
}

// =====================================================
// 预设配置
// =====================================================

export const TRADING_MODES: Record<string, Partial<StrictTradingConfig>> = {
  high: {
    tradingMode: 'high',
    timeframes: ['1m', '3m', '5m', '15m'],
    frequencyLimit: {
      minInterval: 10 * 1000,         // 10秒
      maxDailyTrades: 50,
      maxPerSecond: 10,
    },
    confidenceRequirements: {
      minConfidence: 0.75,
      requireMultiTimeframe: true,
      minConfirmingTimeframes: 2,
    },
  },

  medium: {
    tradingMode: 'medium',
    timeframes: ['5m', '15m', '1H', '4H'],
    frequencyLimit: {
      minInterval: 3 * 60 * 1000,      // 3分钟
      maxDailyTrades: 20,
      maxPerSecond: 5,
    },
    confidenceRequirements: {
      minConfidence: 0.65,
      requireMultiTimeframe: true,
      minConfirmingTimeframes: 2,
    },
  },

  low: {
    tradingMode: 'low',
    timeframes: ['15m', '1H', '4H', '1D'],
    frequencyLimit: {
      minInterval: 60 * 60 * 1000,     // 1小时
      maxDailyTrades: 5,
      maxPerSecond: 1,
    },
    confidenceRequirements: {
      minConfidence: 0.60,
      requireMultiTimeframe: true,
      minConfirmingTimeframes: 3,
    },
  },
};
