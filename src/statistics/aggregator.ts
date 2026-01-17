/**
 * 信号聚合器
 *
 * 整合多个信号，处理冲突，按币种分组
 */

import { logger } from '../utils';
import type { ValidatedSignal, SignalDirection } from '../market/types';

/**
 * 聚合后的信号
 */
export interface AggregatedSignal {
  /** 币种 */
  coin: string;
  /** 方向 */
  direction: SignalDirection;
  /** 综合置信度 */
  confidence: number;
  /** 建议仓位比例 */
  positionSize: number;
  /** 风险等级 */
  riskLevel: 'low' | 'medium' | 'high';
  /** 止损距离（百分比） */
  stopLossDistance: number;
  /** 止盈距离（百分比） */
  takeProfitDistance: number;
  /** 组成此聚合信号的原始信号 */
  signals: ValidatedSignal[];
  /** 聚合时间 */
  timestamp: number;
}

/**
 * 聚合器配置
 */
export interface AggregatorConfig {
  /** 最小置信度阈值 */
  minConfidence?: number;
  /** 是否允许冲突信号共存 */
  allowConflictingSignals?: boolean;
  /** 最大信号数量（按置信度排序） */
  maxSignals?: number;
}

/**
 * 信号聚合器类
 */
export class SignalAggregator {
  private config: Required<AggregatorConfig>;

  constructor(config: AggregatorConfig = {}) {
    this.config = {
      minConfidence: config.minConfidence ?? 0.45,
      allowConflictingSignals: config.allowConflictingSignals ?? false,
      maxSignals: config.maxSignals ?? 10,
    };

    logger.info('信号聚合器初始化', this.config);
  }

  /**
   * 聚合信号
   */
  aggregate(signals: ValidatedSignal[]): AggregatedSignal[] {
    // 1. 过滤有效且置信度达标的信号
    const validSignals = signals.filter(s =>
      s.isValid && s.confidence.value >= this.config.minConfidence
    );

    logger.debug('信号过滤', {
      total: signals.length,
      valid: validSignals.length,
      filtered: signals.length - validSignals.length,
    });

    if (validSignals.length === 0) {
      return [];
    }

    // 2. 按币种分组
    const byCoin = this.groupByCoin(validSignals);

    // 3. 处理每个币种的信号
    const aggregated: AggregatedSignal[] = [];

    byCoin.forEach((coinSignals, coin) => {
      const result = this.aggregateCoinSignals(coin, coinSignals);
      if (result) {
        aggregated.push(result);
      }
    });

    // 4. 按置信度排序
    aggregated.sort((a, b) => b.confidence - a.confidence);

    // 5. 限制数量
    const limited = aggregated.slice(0, this.config.maxSignals);

    logger.debug('信号聚合完成', {
      input: signals.length,
      output: limited.length,
    });

    return limited;
  }

  /**
   * 按币种分组
   */
  private groupByCoin(signals: ValidatedSignal[]): Map<string, ValidatedSignal[]> {
    const grouped = new Map<string, ValidatedSignal[]>();

    for (const signal of signals) {
      if (!grouped.has(signal.coin)) {
        grouped.set(signal.coin, []);
      }
      grouped.get(signal.coin)!.push(signal);
    }

    return grouped;
  }

  /**
   * 聚合单个币种的信号
   */
  private aggregateCoinSignals(
    coin: string,
    signals: ValidatedSignal[]
  ): AggregatedSignal | null {
    // 分离看涨和看跌信号
    const bullish = signals.filter(s => s.direction === 'bullish');
    const bearish = signals.filter(s => s.direction === 'bearish');

    // 检查冲突
    if (bullish.length > 0 && bearish.length > 0) {
      return this.resolveConflict(coin, bullish, bearish);
    }

    // 选择活跃信号
    const activeSignals = bullish.length > 0 ? bullish : bearish;

    if (activeSignals.length === 0) {
      return null;
    }

    // 计算加权平均
    return this.calculateWeightedAverage(coin, activeSignals);
  }

  /**
   * 解决冲突信号
   */
  private resolveConflict(
    coin: string,
    bullish: ValidatedSignal[],
    bearish: ValidatedSignal[]
  ): AggregatedSignal | null {
    // 计算看涨和看跌的加权置信度
    const bullishWeighted = this.calculateDirectionWeight(bullish);
    const bearishWeighted = this.calculateDirectionWeight(bearish);

    logger.debug('检测到冲突信号', {
      coin,
      bullish: bullishWeighted.toFixed(3),
      bearish: bearishWeighted.toFixed(3),
    });

    // 选择置信度更高的方向
    if (bullishWeighted > bearishWeighted) {
      return this.calculateWeightedAverage(coin, bullish);
    } else if (bearishWeighted > bullishWeighted) {
      return this.calculateWeightedAverage(coin, bearish);
    } else {
      // 置信度相近，返回null（放弃交易）
      logger.debug('冲突信号置信度相近，放弃交易', { coin });
      return null;
    }
  }

  /**
   * 计算方向的加权置信度
   */
  private calculateDirectionWeight(signals: ValidatedSignal[]): number {
    // 按置信度加权
    const totalWeight = signals.reduce((sum, s) => sum + s.confidence.value, 0);
    if (totalWeight === 0) return 0;

    // 考虑信号数量（越多信号越可靠）
    const countBonus = Math.min(1.2, 1 + signals.length * 0.05);

    // 考虑样本量（历史数据越多越可靠）
    const avgSampleSize = signals.reduce((sum, s) => sum + s.statistics.totalTrades, 0) / signals.length;
    const sampleBonus = Math.min(1.1, 1 + avgSampleSize / 1000);

    return (totalWeight / signals.length) * countBonus * sampleBonus;
  }

  /**
   * 计算加权平均
   */
  private calculateWeightedAverage(
    coin: string,
    signals: ValidatedSignal[]
  ): AggregatedSignal {
    // 按置信度加权
    const totalWeight = signals.reduce((sum, s) => sum + s.confidence.value, 0);

    // 加权置信度
    const weightedConfidence = signals.reduce((sum, s) => sum + s.confidence.value * s.confidence.value, 0) / totalWeight;

    // 最小仓位（取保守值）
    const minPositionSize = Math.min(...signals.map(s => s.confidence.positionSize));

    // 平均止损止盈距离（百分比）
    const avgStopLoss = signals.reduce((sum, s) => sum + s.confidence.stopLossDistance, 0) / signals.length;
    const avgTakeProfit = signals.reduce((sum, s) => sum + s.confidence.takeProfitDistance, 0) / signals.length;

    // 风险等级（取最保守的）
    const riskLevels = signals.map(s => s.confidence.riskLevel);
    const riskLevel: 'low' | 'medium' | 'high' = riskLevels.includes('high')
      ? 'high'
      : riskLevels.includes('medium')
      ? 'medium'
      : 'low';

    return {
      coin,
      direction: signals[0].direction,
      confidence: Math.max(0, Math.min(1, weightedConfidence)),
      positionSize: minPositionSize,
      riskLevel,
      stopLossDistance: avgStopLoss,
      takeProfitDistance: avgTakeProfit,
      signals,
      timestamp: Date.now(),
    };
  }

  /**
   * 获取信号摘要
   */
  getSummary(aggregated: AggregatedSignal[]): string {
    if (aggregated.length === 0) {
      return '无有效信号';
    }

    const lines: string[] = [];
    lines.push(`聚合信号数量: ${aggregated.length}`);
    lines.push('');

    for (const signal of aggregated) {
      const signalTypes = signal.signals.map(s => s.type).join(', ');
      lines.push(`${signal.coin}:`);
      lines.push(`  方向: ${signal.direction}`);
      lines.push(`  置信度: ${(signal.confidence * 100).toFixed(1)}%`);
      lines.push(`  仓位: ${(signal.positionSize * 100).toFixed(1)}%`);
      lines.push(`  风险: ${signal.riskLevel}`);
      lines.push(`  信号类型: ${signalTypes}`);
      lines.push(`  信号数量: ${signal.signals.length}`);
      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<AggregatorConfig>): void {
    this.config = { ...this.config, ...config };
    logger.info('聚合器配置已更新', this.config);
  }

  /**
   * 获取配置
   */
  getConfig(): Readonly<Required<AggregatorConfig>> {
    return { ...this.config };
  }
}
