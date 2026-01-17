/**
 * 统计验证器
 *
 * 验证信号并基于历史统计数据计算置信度
 */

import { logger } from '../utils/logger;
import { SignalStatisticsDB, type FullSignalStatistics } from './signal-statistics;
import type {
  TechnicalSignal,
  ValidatedSignal,
  MarketCondition,
  SignalType,
} from '../market/types;

/**
 * 验证器配置
 */
export interface ValidatorConfig {
  /** 最小样本量 */
  minSampleSize?: number;
  /** 最小胜率 */
  minWinRate?: number;
  /** 最小盈亏比 */
  minProfitFactor?: number;
  /** 是否要求统计显著 */
  requireSignificance?: boolean;
  /** 默认保守置信度（没有足够数据时使用） */
  defaultConfidence?: number;
}

/**
 * 验证器类
 */
export class StatisticsValidator {
  private statsDB: SignalStatisticsDB;
  private config: Required<ValidatorConfig>;

  constructor(
    statsDB: SignalStatisticsDB,
    config: ValidatorConfig = {}
  ) {
    this.statsDB = statsDB;
    this.config = {
      minSampleSize: config.minSampleSize ?? 30,
      minWinRate: config.minWinRate ?? 0.45,  // 允许略低于50%，因为盈亏比也很重要
      minProfitFactor: config.minProfitFactor ?? 1.2,
      requireSignificance: config.requireSignificance ?? true,
      defaultConfidence: config.defaultConfidence ?? 0.4,  // 保守默认值
    };

    logger.info('统计验证器初始化', this.config);
  }

  /**
   * 验证信号
   */
  validateSignal(
    signal: TechnicalSignal,
    marketCondition?: MarketCondition
  ): ValidatedSignal {
    const validationErrors: string[] = [];
    let isValid = true;

    // 获取统计信息
    const statistics = this.statsDB.getStatistics(signal.type, signal.coin, signal.timeframe);

    // 如果没有统计数据
    if (!statistics) {
      logger.warn(`信号无统计数据: ${signal.type}_${signal.coin}_${signal.timeframe}`);
      return this.createValidatedSignal(signal, this.getDefaultStats(), validationErrors, false, marketCondition);
    }

    // 验证样本量
    if (statistics.totalTrades < this.config.minSampleSize) {
      validationErrors.push(`样本量不足: ${statistics.totalTrades} < ${this.config.minSampleSize}`);
      if (this.config.requireSignificance) {
        isValid = false;
      }
    }

    // 验证胜率
    if (statistics.winRate < this.config.minWinRate) {
      validationErrors.push(`胜率过低: ${(statistics.winRate * 100).toFixed(1)}% < ${(this.config.minWinRate * 100).toFixed(1)}%`);
      // 胜率低不一定拒绝，需要结合盈亏比
    }

    // 验证盈亏比
    if (statistics.profitFactor < this.config.minProfitFactor && statistics.profitFactor > 0) {
      validationErrors.push(`盈亏比过低: ${statistics.profitFactor.toFixed(2)} < ${this.config.minProfitFactor.toFixed(2)}`);
    }

    // 综合判断：胜率低但盈亏比高也可以接受
    if (statistics.winRate < 0.5 && statistics.profitFactor < 1.5) {
      isValid = false;
      validationErrors.push('胜率和盈亏比都不满足要求');
    }

    // 计算置信度
    const confidence = this.calculateConfidence(statistics, signal.strength, marketCondition);

    return this.createValidatedSignal(
      signal,
      statistics,
      validationErrors,
      isValid,
      marketCondition,
      confidence
    );
  }

  /**
   * 批量验证信号
   */
  validateSignals(
    signals: TechnicalSignal[],
    marketCondition?: MarketCondition
  ): ValidatedSignal[] {
    const validated: ValidatedSignal[] = [];

    for (const signal of signals) {
      const v = this.validateSignal(signal, marketCondition);
      validated.push(v);
    }

    logger.debug('批量验证完成', {
      total: signals.length,
      valid: validated.filter(v => v.isValid).length,
      invalid: validated.filter(v => !v.isValid).length,
    });

    return validated;
  }

  /**
   * 计算置信度
   */
  private calculateConfidence(
    statistics: FullSignalStatistics,
    signalStrength: number,
    marketCondition?: MarketCondition
  ): ValidatedSignal['confidence'] {
    // 1. 基础置信度 = 历史胜率
    let baseConfidence = statistics.winRate;

    // 2. 样本量调整（样本越少，置信度越低）
    const sampleSizeRatio = Math.min(1, statistics.totalTrades / 100);
    const sampleAdjustment = 0.7 + sampleSizeRatio * 0.3;  // 0.7-1.0

    // 3. 盈亏比调整
    const profitFactor = statistics.profitFactor;
    let profitAdjustment = 1.0;
    if (profitFactor > 0) {
      profitAdjustment = Math.min(1.2, Math.max(0.8, profitFactor / 1.5));
    }

    // 4. 信号强度调整
    const strengthAdjustment = 0.8 + signalStrength * 0.2;  // 0.8-1.0

    // 5. 市场环境调整
    let marketAdjustment = 1.0;
    if (marketCondition) {
      switch (marketCondition.volatility) {
        case 'low':
          marketAdjustment = 1.1;  // 低波动有利于信号
          break;
        case 'high':
          marketAdjustment = 0.9;  // 高波动降低可靠性
          break;
        case 'extreme':
          marketAdjustment = 0.7;  // 极端波动显著降低可靠性
          break;
      }

      // 趋势市场对趋势信号更有利
      if (marketCondition.trend === 'strong_uptrend' || marketCondition.trend === 'strong_downtrend') {
        marketAdjustment *= 1.05;
      } else if (marketCondition.trend === 'sideways') {
        marketAdjustment *= 0.95;
      }
    }

    // 6. 综合置信度
    const confidenceValue = baseConfidence * sampleAdjustment * profitAdjustment * strengthAdjustment * marketAdjustment;
    const finalConfidence = Math.max(0.1, Math.min(0.95, confidenceValue));

    // 7. 使用凯利公式计算仓位
    const positionSize = this.calculatePositionSize(statistics, finalConfidence);

    // 8. 计算止损止盈距离（百分比）
    const { stopLossDistance, takeProfitDistance } = this.calculateStopLossTakeProfit(statistics, signalStrength);

    // 9. 确定风险等级
    const riskLevel = this.calculateRiskLevel(finalConfidence, statistics.winRate, marketCondition);

    return {
      value: finalConfidence,
      positionSize,
      riskLevel,
      stopLossDistance,
      takeProfitDistance,
    };
  }

  /**
   * 使用凯利公式计算仓位
   */
  private calculatePositionSize(
    statistics: FullSignalStatistics,
    confidence: number
  ): number {
    const winRate = statistics.winRate;
    const profitFactor = statistics.profitFactor;

    // 如果没有足够数据，使用保守仓位
    if (statistics.totalTrades < this.config.minSampleSize || profitFactor <= 0) {
      return confidence * 0.03;  // 最多3%仓位
    }

    // 凯利公式：f = (bp - q) / b
    // b = 盈亏比 (profitFactor), p = 胜率 (winRate), q = 败率 (1 - winRate)
    // 注意：profitFactor = totalWin / totalLoss 是标准化的盈亏比
    const kelly = (profitFactor * winRate - (1 - winRate)) / profitFactor;

    // 使用半凯利（更保守），并结合置信度
    const halfKelly = Math.max(0, kelly) * 0.5;

    // 限制最大仓位为25%
    return Math.max(0.01, Math.min(0.25, halfKelly * confidence * 2));
  }

  /**
   * 计算止损止盈距离（百分比）
   */
  private calculateStopLossTakeProfit(
    statistics: FullSignalStatistics,
    signalStrength: number
  ): { stopLossDistance: number; takeProfitDistance: number } {
    // 基于历史表现计算合理的止损止盈距离
    const profitFactor = statistics.profitFactor;  // 盈亏比（标准化）

    // 如果没有足够数据，使用默认值
    if (statistics.totalTrades < 10 || profitFactor <= 0) {
      return {
        stopLossDistance: 0.02,  // 2% 止损
        takeProfitDistance: 0.04, // 4% 止盈 (2:1 风险回报比)
      };
    }

    // 基于历史盈亏比计算合理的风险回报比

    // 止损距离：基于信号强度
    // 信号越强，可以容忍稍大的止损（给予更多空间）
    let stopLossDistance = 0.015 + (1 - signalStrength) * 0.015;  // 1.5% - 3%

    // 根据历史盈亏比调整止损
    // 盈亏比高说明盈利能力强，可以适当放宽止损
    const volatilityFactor = Math.min(2, Math.max(0.5, 1 / profitFactor));
    stopLossDistance = stopLossDistance * volatilityFactor;

    // 限制止损距离在 1% - 5% 之间
    stopLossDistance = Math.max(0.01, Math.min(0.05, stopLossDistance));

    // 止盈距离：基于止损距离和历史盈亏比
    // 使用 1.5 倍的历史盈亏比作为目标（保守）
    const takeProfitDistance = stopLossDistance * Math.max(1.5, profitFactor * 1.5);

    // 限制止盈距离不超过 15%
    const finalTakeProfit = Math.min(0.15, takeProfitDistance);

    return {
      stopLossDistance,
      takeProfitDistance: finalTakeProfit,
    };
  }

  /**
   * 计算风险等级
   */
  private calculateRiskLevel(
    confidence: number,
    winRate: number,
    marketCondition?: MarketCondition
  ): 'low' | 'medium' | 'high' {
    // 市场环境调整
    if (marketCondition?.volatility === 'extreme') {
      return 'high';
    }

    // 基于置信度和胜率
    if (confidence >= 0.7 && winRate >= 0.55) {
      return 'low';
    } else if (confidence >= 0.5 && winRate >= 0.48) {
      return 'medium';
    } else {
      return 'high';
    }
  }

  /**
   * 获取默认统计信息（用于没有数据的情况）
   */
  private getDefaultStats(): FullSignalStatistics {
    return {
      signalId: 'default',
      signalType: 'ma_7_25_crossover' as SignalType,
      coin: '',
      timeframe: '1H',
      totalTrades: 0,
      winningTrades: 0,
      totalWin: 0,
      totalLoss: 0,
      maxWin: 0,
      maxLoss: 0,
      avgHoldingTime: 0,
      lastUpdated: Date.now(),
      winRate: this.config.defaultConfidence,
      avgWin: 100,
      avgLoss: 80,
      profitFactor: 1.25,
      maxDrawdown: 200,
      sharpeRatio: 0.5,
      isSignificant: false,
    };
  }

  /**
   * 创建验证后的信号
   */
  private createValidatedSignal(
    signal: TechnicalSignal,
    statistics: FullSignalStatistics,
    validationErrors: string[],
    isValid: boolean,
    marketCondition?: MarketCondition,
    confidence?: ValidatedSignal['confidence']
  ): ValidatedSignal {
    const finalConfidence = confidence || this.calculateConfidence(statistics, signal.strength, marketCondition);

    return {
      ...signal,
      statistics: {
        totalTrades: statistics.totalTrades,
        winningTrades: statistics.winningTrades,
        winRate: statistics.winRate,
        avgWin: statistics.avgWin,
        avgLoss: statistics.avgLoss,
        profitFactor: statistics.profitFactor,
        maxDrawdown: statistics.maxDrawdown,
        sharpeRatio: statistics.sharpeRatio,
        isSignificant: statistics.isSignificant,
        lastUpdated: statistics.lastUpdated,
      },
      confidence: finalConfidence,
      isValid,
      validationErrors: validationErrors.length > 0 ? validationErrors : undefined,
    };
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<ValidatorConfig>): void {
    this.config = { ...this.config, ...config };
    logger.info('验证器配置已更新', this.config);
  }

  /**
   * 获取配置
   */
  getConfig(): Readonly<Required<ValidatorConfig>> {
    return { ...this.config };
  }
}
