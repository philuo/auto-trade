/**
 * 波动率计算器
 *
 * 功能：
 * - 计算实时波动率（Yang-Zhang 估计）
 * - 计算历史波动率
 * - 波动率分类（低/中/高）
 * - 支持币种选择决策
 */

import type { Candle, VolatilityAnalysis } from '../config/types';
import type { AllowedCoin } from '../config/strategy-config';

// =====================================================
// 波动率配置
// =====================================================

export interface VolatilityCalculatorConfig {
  // 计算窗口
  shortWindow: number;           // 短期窗口（默认 20 个蜡烛）
  mediumWindow: number;          // 中期窗口（默认 50 个蜡烛）
  longWindow: number;            // 长期窗口（默认 100 个蜡烛）

  // 分类阈值（%）
  lowVolatilityThreshold: number;   // 低波动率阈值（日波动 < 2%）
  highVolatilityThreshold: number;  // 高波动率阈值（日波动 > 5%）

  // 计算方法
  useYangZhang: boolean;        // 使用 Yang-Zhang 估计（更准确）
  useParkinson: boolean;        // 使用 Parkinson 估计（基于高低价）
  useGKYZ: boolean;             // 使用 Garman-Klass-Yang-Zhang 估计
}

// =====================================================
// 波动率数据点
// =====================================================

export interface VolatilityDataPoint {
  timestamp: number;
  price: number;
  open: number;
  high: number;
  low: number;
  close: number;
  returns: number;               // 对数收益率
  logHighLow: number;           // 对数高低价比
  overnightJump: number;        // 隔夜跳空
}

// =====================================================
// 波动率分析结果
// =====================================================

export interface VolatilityResult {
  // 实时波动率
  current: {
    short: number;       // 短期波动率（日化）
    medium: number;      // 中期波动率（日化）
    long: number;        // 长期波动率（日化）
    average: number;     // 加权平均波动率
  };

  // 历史波动率
  historical: {
    min: number;         // 历史最低
    max: number;         // 历史最高
    percentile25: number;  // 25 分位数
    percentile50: number;  // 50 分位数（中位数）
    percentile75: number;  // 75 分位数
  };

  // 波动率分类
  classification: 'low' | 'medium' | 'high';
  confidence: number;    // 置信度（0-1）

  // 趋势
  trend: 'rising' | 'falling' | 'stable';

  // 数据点
  dataPoints: VolatilityDataPoint[];
  dataPointsCount: number;

  // 原始数据
  rawCandles: Candle[];
}

// =====================================================
// 波动率计算器类
// =====================================================

export class VolatilityCalculator {
  private config: VolatilityCalculatorConfig;
  private cache: Map<string, { result: VolatilityResult; timestamp: number }> = new Map();
  private cacheTTL: number = 5 * 60 * 1000; // 缓存 5 分钟

  constructor(config?: Partial<VolatilityCalculatorConfig>) {
    this.config = {
      shortWindow: 20,
      mediumWindow: 50,
      longWindow: 100,
      lowVolatilityThreshold: 2,
      highVolatilityThreshold: 5,
      useYangZhang: true,
      useParkinson: false,
      useGKYZ: false,
      ...config
    };
  }

  /**
   * 计算波动率
   */
  async calculateVolatility(
    coin: string,
    candles: Candle[]
  ): Promise<VolatilityResult> {
    if (candles.length < this.config.shortWindow) {
      throw new Error(`蜡烛数据不足，需要至少 ${this.config.shortWindow} 个`);
    }

    // 检查缓存
    const lastCandle = candles[candles.length - 1];
    if (!lastCandle) {
      throw new Error('无效的蜡烛数据');
    }
    const cacheKey = `${coin}_${candles.length}_${lastCandle.timestamp}`;
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      return cached.result;
    }

    // 准备数据点
    const dataPoints = this.prepareDataPoints(candles);

    // 计算各期波动率
    const shortVol = this.calculateWindowedVolatility(dataPoints, this.config.shortWindow);
    const mediumVol = this.calculateWindowedVolatility(dataPoints, this.config.mediumWindow);
    const longVol = this.calculateWindowedVolatility(dataPoints, this.config.longWindow);

    // 加权平均
    const average = this.calculateWeightedAverage(shortVol, mediumVol, longVol);

    // 计算历史统计
    const historical = this.calculateHistoricalStats(dataPoints);

    // 分类
    const classification = this.classifyVolatility(average);
    const confidence = this.calculateConfidence(dataPoints);

    // 趋势
    const trend = this.determineTrend(dataPoints);

    const result: VolatilityResult = {
      current: {
        short: shortVol,
        medium: mediumVol,
        long: longVol,
        average
      },
      historical,
      classification,
      confidence,
      trend,
      dataPoints,
      dataPointsCount: dataPoints.length,
      rawCandles: candles
    };

    // 缓存结果
    this.cache.set(cacheKey, { result, timestamp: Date.now() });

    return result;
  }

  /**
   * 从市场数据快速计算波动率
   */
  calculateQuickVolatility(
    coin: AllowedCoin,
    recentPrices: number[],
    previousPrices: number[]
  ): VolatilityAnalysis {
    if (recentPrices.length < 2) {
      return {
        coin,
        realtimeVolatility: 0,
        historicalVolatility: 0,
        classification: 'low',
        timestamp: Date.now()
      };
    }

    // 计算收益率
    const returns: number[] = [];
    for (let i = 1; i < recentPrices.length; i++) {
      const current = recentPrices[i];
      const previous = recentPrices[i - 1];
      if (current && previous && previous !== 0) {
        const ret = Math.log(current / previous);
        returns.push(ret);
      }
    }

    // 计算标准差（日化）
    const stdDev = this.calculateStandardDeviation(returns);
    const dailyVolatility = stdDev * 100;

    // 计算历史波动率
    const historicalReturns: number[] = [];
    for (let i = 1; i < previousPrices.length; i++) {
      const current = previousPrices[i];
      const previous = previousPrices[i - 1];
      if (current && previous && previous !== 0) {
        const ret = Math.log(current / previous);
        historicalReturns.push(ret);
      }
    }

    const histStdDev = historicalReturns.length > 0
      ? this.calculateStandardDeviation(historicalReturns)
      : stdDev;

    // 分类
    const classification = this.classifyVolatility(dailyVolatility);

    return {
      coin,
      realtimeVolatility: dailyVolatility,
      historicalVolatility: histStdDev * 100,
      classification,
      timestamp: Date.now()
    };
  }

  /**
   * 准备数据点
   */
  private prepareDataPoints(candles: Candle[]): VolatilityDataPoint[] {
    const dataPoints: VolatilityDataPoint[] = [];

    for (let i = 0; i < candles.length; i++) {
      const candle = candles[i];
      if (!candle) continue;

      // 计算对数收益率
      let returns = 0;
      let overnightJump = 0;

      if (i > 0) {
        const prevCandle = candles[i - 1];
        if (prevCandle && prevCandle.close > 0) {
          returns = candle.close > 0 ? Math.log(candle.close / prevCandle.close) : 0;
          overnightJump = prevCandle.close > 0 && candle.open > 0 ? Math.log(candle.open / prevCandle.close) : 0;
        }
      }

      // 计算对数高低价比
      const logHighLow = candle.high > candle.low && candle.low > 0
        ? Math.log(candle.high / candle.low)
        : 0;

      dataPoints.push({
        timestamp: candle.timestamp,
        price: candle.close,
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
        returns,
        logHighLow,
        overnightJump
      });
    }

    return dataPoints;
  }

  /**
   * 计算窗口波动率
   */
  private calculateWindowedVolatility(
    dataPoints: VolatilityDataPoint[],
    window: number
  ): number {
    const n = Math.min(window, dataPoints.length);
    if (n < 2) {
      return 0;
    }

    const recentPoints = dataPoints.slice(-n);

    if (this.config.useYangZhang) {
      return this.calculateYangZhangVolatility(recentPoints);
    } else if (this.config.useGKYZ) {
      return this.calculateGKYZVolatility(recentPoints);
    } else if (this.config.useParkinson) {
      return this.calculateParkinsonVolatility(recentPoints);
    } else {
      // 默认使用标准差
      const returns = recentPoints.map(p => p.returns);
      const stdDev = this.calculateStandardDeviation(returns);
      return stdDev * 100; // 日化为百分比
    }
  }

  /**
   * Yang-Zhang 波动率估计
   * 考虑了开盘跳空和日内波动，是最准确的估计方法之一
   */
  private calculateYangZhangVolatility(dataPoints: VolatilityDataPoint[]): number {
    const n = dataPoints.length;
    if (n < 2) {
      return 0;
    }

    // 计算对数收益率
    const logReturns: number[] = [];
    for (let i = 1; i < n; i++) {
      const point = dataPoints[i];
      if (point) {
        logReturns.push(point.returns);
      }
    }

    // 计算日内波动率
    const logHighLowSums = dataPoints.reduce((sum, p) => sum + p.logHighLow * p.logHighLow, 0);
    const intradayVar = logHighLowSums / (2 * n);

    // 计算隔夜波动率
    const overnightJumps = dataPoints.slice(1).map(p => p.overnightJump);
    const overnightVar = this.calculateVariance(overnightJumps);

    // 计算开盘到收盘的波动率
    const openCloseSums = dataPoints.reduce((sum, p) => {
      const oc = Math.log(p.close / p.open);
      return sum + oc * oc;
    }, 0);
    const openCloseVar = openCloseSums / (2 * n);

    // Yang-Zhang 公式
    const k = 0.34 / (1.34 + (n - 1) / (n + 1));
    const yangZhangVar = intradayVar + k * overnightVar + (1 - k) * openCloseVar;

    // 日化为年化波动率
    const dailyVol = Math.sqrt(yangZhangVar);

    return dailyVol * 100; // 转换为百分比
  }

  /**
   * Garman-Klass-Yang-Zhang 波动率估计
   */
  private calculateGKYZVolatility(dataPoints: VolatilityDataPoint[]): number {
    const n = dataPoints.length;
    if (n < 2) {
      return 0;
    }

    let sum = 0;
    for (let i = 1; i < n; i++) {
      const prev = dataPoints[i - 1];
      const curr = dataPoints[i];

      if (!curr || !prev) continue;
      if (curr.close <= 0 || curr.high <= 0 || curr.low <= 0 || curr.open <= 0 || prev.close <= 0) continue;

      const logHC = Math.log(curr.high / curr.close);
      const logLC = Math.log(curr.low / curr.close);
      const logCO = Math.log(curr.close / curr.open);
      const logOC = Math.log(curr.open / prev.close);

      const term = 0.5 * (logHC * logLC) - (2 * Math.log(2) - 1) * logCO * logCO + logOC * logOC;
      sum += term;
    }

    const variance = sum / (n - 1);
    return Math.sqrt(variance) * 100;
  }

  /**
   * Parkinson 波动率估计
   * 基于日内高低价，更适合连续交易
   */
  private calculateParkinsonVolatility(dataPoints: VolatilityDataPoint[]): number {
    const n = dataPoints.length;
    if (n < 1) {
      return 0;
    }

    const logHL2Sums = dataPoints.reduce((sum, p) => sum + p.logHighLow * p.logHighLow, 0);

    const variance = logHL2Sums / (4 * n * Math.log(2));
    return Math.sqrt(variance) * 100;
  }

  /**
   * 计算加权平均波动率
   */
  private calculateWeightedAverage(short: number, medium: number, long: number): number {
    // 短期权重更高
    return short * 0.5 + medium * 0.3 + long * 0.2;
  }

  /**
   * 计算历史统计
   */
  private calculateHistoricalStats(dataPoints: VolatilityDataPoint[]): VolatilityResult['historical'] {
    if (dataPoints.length < 2) {
      return {
        min: 0,
        max: 0,
        percentile25: 0,
        percentile50: 0,
        percentile75: 0
      };
    }

    // 计算滚动波动率
    const rollingVols: number[] = [];
    const window = Math.min(20, dataPoints.length);

    for (let i = window; i < dataPoints.length; i++) {
      const slice = dataPoints.slice(i - window, i);
      const vol = this.calculateYangZhangVolatility(slice);
      rollingVols.push(vol);
    }

    if (rollingVols.length === 0) {
      return {
        min: 0,
        max: 0,
        percentile25: 0,
        percentile50: 0,
        percentile75: 0
      };
    }

    rollingVols.sort((a, b) => a - b);

    const idx25 = Math.floor(rollingVols.length * 0.25);
    const idx50 = Math.floor(rollingVols.length * 0.5);
    const idx75 = Math.floor(rollingVols.length * 0.75);

    return {
      min: rollingVols[0] ?? 0,
      max: rollingVols[rollingVols.length - 1] ?? 0,
      percentile25: rollingVols[idx25] ?? 0,
      percentile50: rollingVols[idx50] ?? 0,
      percentile75: rollingVols[idx75] ?? 0
    };
  }

  /**
   * 波动率分类
   */
  private classifyVolatility(volatility: number): 'low' | 'medium' | 'high' {
    if (volatility < this.config.lowVolatilityThreshold) {
      return 'low';
    } else if (volatility > this.config.highVolatilityThreshold) {
      return 'high';
    }
    return 'medium';
  }

  /**
   * 计算置信度
   */
  private calculateConfidence(dataPoints: VolatilityDataPoint[]): number {
    // 数据点越多，置信度越高
    const dataScore = Math.min(dataPoints.length / 100, 1);

    // 波动率稳定性（标准差越小越稳定）
    if (dataPoints.length < 10) {
      return dataScore * 0.5;
    }

    const returns = dataPoints.map(p => p.returns);
    const stdDev = this.calculateStandardDeviation(returns);
    const stabilityScore = Math.max(0, 1 - stdDev * 10);

    return (dataScore * 0.6 + stabilityScore * 0.4);
  }

  /**
   * 判断趋势
   */
  private determineTrend(dataPoints: VolatilityDataPoint[]): 'rising' | 'falling' | 'stable' {
    if (dataPoints.length < 10) {
      return 'stable';
    }

    // 取最近的波动率和之前的波动率比较
    const recentVol = this.calculateYangZhangVolatility(dataPoints.slice(-20));
    const previousVol = this.calculateYangZhangVolatility(dataPoints.slice(-40, -20));

    const change = (recentVol - previousVol) / previousVol;

    if (change > 0.1) {
      return 'rising';
    } else if (change < -0.1) {
      return 'falling';
    }
    return 'stable';
  }

  /**
   * 计算标准差
   */
  private calculateStandardDeviation(values: number[]): number {
    if (values.length < 2) {
      return 0;
    }

    const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
    const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / (values.length - 1);

    return Math.sqrt(variance);
  }

  /**
   * 计算方差
   */
  private calculateVariance(values: number[]): number {
    if (values.length < 1) {
      return 0;
    }

    const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
    return values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
  }

  /**
   * 比较两个币种的波动率
   */
  compareVolatility(vol1: VolatilityResult, vol2: VolatilityResult): {
    higher: string;
    ratio: number;
    difference: number;
  } {
    const avg1 = vol1.current.average;
    const avg2 = vol2.current.average;

    return {
      higher: avg1 > avg2 ? 'coin1' : 'coin2',
      ratio: avg1 / avg2,
      difference: Math.abs(avg1 - avg2)
    };
  }

  /**
   * 获取波动率评分（用于币种选择）
   */
  getVolatilityScore(result: VolatilityResult): number {
    // 高波动率得高分（适合网格交易）
    const volScore = result.current.average;

    // 趋势上升额外加分
    const trendBonus = result.trend === 'rising' ? volScore * 0.2 : 0;

    // 置信度调整
    const confidenceMultiplier = result.confidence;

    return (volScore + trendBonus) * confidenceMultiplier;
  }

  /**
   * 清除缓存
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * 清除特定币种的缓存
   */
  clearCoinCache(coin: string): void {
    for (const [key] of this.cache) {
      if (key.startsWith(coin)) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<VolatilityCalculatorConfig>): void {
    this.config = { ...this.config, ...config };
    this.clearCache(); // 配置变更时清除缓存
  }

  /**
   * 获取配置
   */
  getConfig(): VolatilityCalculatorConfig {
    return { ...this.config };
  }

  /**
   * 生成报告
   */
  generateReport(result: VolatilityResult, coin: string): string {
    return `
波动率分析报告: ${coin}
========================
当前波动率:
  短期 (${this.config.shortWindow}期): ${result.current.short.toFixed(2)}%
  中期 (${this.config.mediumWindow}期): ${result.current.medium.toFixed(2)}%
  长期 (${this.config.longWindow}期): ${result.current.long.toFixed(2)}%
  加权平均: ${result.current.average.toFixed(2)}%

波动率分类: ${result.classification.toUpperCase()}
置信度: ${(result.confidence * 100).toFixed(1)}%
趋势: ${result.trend === 'rising' ? '上升 ↗' : result.trend === 'falling' ? '下降 ↘' : '稳定 →'}

历史统计:
  最低: ${result.historical.min.toFixed(2)}%
  25分位: ${result.historical.percentile25.toFixed(2)}%
  中位数: ${result.historical.percentile50.toFixed(2)}%
  75分位: ${result.historical.percentile75.toFixed(2)}%
  最高: ${result.historical.max.toFixed(2)}%

数据点数: ${result.dataPointsCount}
    `.trim();
  }
}
