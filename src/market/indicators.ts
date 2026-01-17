/**
 * 技术指标计算器
 *
 * 计算常用技术指标：MA、RSI、MACD、布林带
 *
 * 参考公式：
 * - SMA: Simple Moving Average
 * - EMA: Exponential Moving Average
 * - RSI: Relative Strength Index
 * - MACD: Moving Average Convergence Divergence
 * - Bollinger Bands: 基于标准差的价格通道
 */

import { logger } from '../utils/logger;
import type {
  CandleData,
  TechnicalIndicators,
} from './types;

/**
 * 技术指标计算器类
 */
export class IndicatorCalculator {
  /**
   * 计算所有技术指标
   */
  calculateAll(klines: CandleData[]): TechnicalIndicators {
    if (klines.length < 99) {
      throw new Error(`K线数据不足，需要至少99根，当前${klines.length}根`);
    }

    return {
      ma: this.calculateMA(klines),
      rsi: this.calculateRSI(klines),
      macd: this.calculateMACD(klines),
      bollinger: this.calculateBollinger(klines),
    };
  }

  // =====================================================
  // 移动平均线 (MA)
  // =====================================================

  /**
   * 计算移动平均线
   * @param klines K线数据
   * @param periods 计算周期数组，默认 [7, 25, 99]
   */
  calculateMA(
    klines: CandleData[],
    periods: number[] = [7, 25, 99]
  ): { ma7: number; ma25: number; ma99: number } {
    const closes = klines.map(k => k.close);

    const result: Record<string, number> = {};

    for (const period of periods) {
      if (closes.length < period) {
        result[`ma${period}`] = closes[closes.length - 1];
      } else {
        result[`ma${period}`] = this.calculateSMA(closes, period);
      }
    }

    return {
      ma7: result.ma7,
      ma25: result.ma25,
      ma99: result.ma99,
    };
  }

  /**
   * 计算简单移动平均线 (SMA)
   * SMA(n) = (P1 + P2 + ... + Pn) / n
   */
  private calculateSMA(prices: number[], period: number): number {
    if (prices.length < period) {
      throw new Error(`价格数据不足，需要至少${period}个`);
    }

    const slice = prices.slice(-period);
    const sum = slice.reduce((a, b) => a + b, 0);
    return sum / period;
  }

  /**
   * 计算指数移动平均线 (EMA)
   * EMA(n) = (当前价格 - 前一日EMA) × (2 / (n + 1)) + 前一日EMA
   */
  private calculateEMA(prices: number[], period: number): number {
    if (prices.length < period) {
      throw new Error(`价格数据不足，需要至少${period}个`);
    }

    const multiplier = 2 / (period + 1);
    let ema = this.calculateSMA(prices.slice(0, period), period);

    for (let i = period; i < prices.length; i++) {
      ema = (prices[i] - ema) * multiplier + ema;
    }

    return ema;
  }

  // =====================================================
  // 相对强弱指标 (RSI)
  // =====================================================

  /**
   * 计算相对强弱指标 (RSI)
   * @param klines K线数据
   * @param period 计算周期，默认 14
   *
   * 公式：
   * RSI = 100 - (100 / (1 + RS))
   * RS = 平均涨幅 / 平均跌幅
   */
  calculateRSI(klines: CandleData[], period: number = 14): number {
    if (klines.length < period + 1) {
      throw new Error(`K线数据不足，计算RSI需要至少${period + 1}根`);
    }

    const closes = klines.map(k => k.close);

    // 计算价格变化
    const changes: number[] = [];
    for (let i = 1; i < closes.length; i++) {
      changes.push(closes[i] - closes[i - 1]);
    }

    // 分离涨幅和跌幅
    const gains: number[] = [];
    const losses: number[] = [];

    for (const change of changes) {
      if (change > 0) {
        gains.push(change);
        losses.push(0);
      } else {
        gains.push(0);
        losses.push(Math.abs(change));
      }
    }

    // 计算平均涨幅和平均跌幅（使用 Wilder's smoothing）
    let avgGain = this.calculateSMA(gains.slice(0, period), period);
    let avgLoss = this.calculateSMA(losses.slice(0, period), period);

    for (let i = period; i < gains.length; i++) {
      avgGain = (avgGain * (period - 1) + gains[i]) / period;
      avgLoss = (avgLoss * (period - 1) + losses[i]) / period;
    }

    // 计算 RS 和 RSI
    if (avgLoss === 0) {
      return 100; // 所有变化都是涨幅
    }

    const rs = avgGain / avgLoss;
    const rsi = 100 - (100 / (1 + rs));

    return rsi;
  }

  // =====================================================
  // MACD (指数平滑异同移动平均线)
  // =====================================================

  /**
   * 计算MACD指标
   * @param klines K线数据
   * @param fastPeriod 快线周期，默认 12
   * @param slowPeriod 慢线周期，默认 26
   * @param signalPeriod 信号线周期，默认 9
   *
   * 公式：
   * MACD = EMA(12) - EMA(26)
   * Signal = EMA(MACD, 9)
   * Histogram = MACD - Signal
   */
  calculateMACD(
    klines: CandleData[],
    fastPeriod: number = 12,
    slowPeriod: number = 26,
    signalPeriod: number = 9
  ): { macd: number; signal: number; histogram: number } {
    const minPeriod = Math.max(fastPeriod, slowPeriod) + signalPeriod;
    if (klines.length < minPeriod) {
      throw new Error(`K线数据不足，计算MACD需要至少${minPeriod}根`);
    }

    const closes = klines.map(k => k.close);

    // 计算快线和慢线 EMA
    const fastEMA = this.calculateEMA(closes, fastPeriod);
    const slowEMA = this.calculateEMA(closes, slowPeriod);

    // MACD 线（当前值）
    const macd = fastEMA - slowEMA;

    // 计算信号线
    // 信号线是MACD的EMA，需要历史MACD值
    const macdHistory: number[] = [];
    for (let i = slowPeriod; i < closes.length; i++) {
      const slice = closes.slice(0, i + 1);
      const fast = this.calculateEMA(slice, fastPeriod);
      const slow = this.calculateEMA(slice, slowPeriod);
      macdHistory.push(fast - slow);
    }

    // 对MACD历史序列计算EMA作为信号线
    // 需要至少 signalPeriod 个MACD值
    if (macdHistory.length < signalPeriod) {
      throw new Error(`MACD历史数据不足，计算信号线需要至少${signalPeriod}个MACD值`);
    }
    const signal = this.calculateEMA(macdHistory, signalPeriod);

    // 柱状图
    const histogram = macd - signal;

    return { macd, signal, histogram };
  }

  // =====================================================
  // 布林带 (Bollinger Bands)
  // =====================================================

  /**
   * 计算布林带
   * @param klines K线数据
   * @param period 周期，默认 20
   * @param stdDev 标准差倍数，默认 2
   *
   * 公式：
   * 中轨 = SMA(20)
   * 上轨 = 中轨 + 2 × 标准差
   * 下轨 = 中轨 - 2 × 标准差
   */
  calculateBollinger(
    klines: CandleData[],
    period: number = 20,
    stdDev: number = 2
  ): { upper: number; middle: number; lower: number } {
    if (klines.length < period) {
      throw new Error(`K线数据不足，计算布林带需要至少${period}根`);
    }

    const closes = klines.map(k => k.close);

    // 中轨：SMA
    const middle = this.calculateSMA(closes, period);

    // 计算标准差
    const slice = closes.slice(-period);
    const variance =
      slice.reduce((sum, val) => sum + Math.pow(val - middle, 2), 0) / period;
    const standardDeviation = Math.sqrt(variance);

    // 上轨和下轨
    const upper = middle + stdDev * standardDeviation;
    const lower = middle - stdDev * standardDeviation;

    return { upper, middle, lower };
  }

  // =====================================================
  // 辅助方法
  // =====================================================

  /**
   * 批量计算多个币种的指标
   */
  calculateBatch(
    klinesMap: Map<string, CandleData[]>
  ): Map<string, TechnicalIndicators> {
    const result = new Map<string, TechnicalIndicators>();

    for (const [coin, klines] of klinesMap) {
      try {
        const indicators = this.calculateAll(klines);
        result.set(coin, indicators);
      } catch (error) {
        logger.warn(`计算 ${coin} 技术指标失败`, {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return result;
  }

  /**
   * 计算单个指标（用于部分更新）
   */
  calculateOne(
    klines: CandleData[],
    indicator: 'ma' | 'rsi' | 'macd' | 'bollinger'
  ): number | Record<string, number> {
    switch (indicator) {
      case 'ma':
        return this.calculateMA(klines);
      case 'rsi':
        return this.calculateRSI(klines);
      case 'macd':
        return this.calculateMACD(klines);
      case 'bollinger':
        return this.calculateBollinger(klines);
      default:
        throw new Error(`未知的指标类型: ${indicator}`);
    }
  }

  /**
   * 验证K线数据完整性
   */
  validateKlines(klines: CandleData[]): boolean {
    if (klines.length === 0) {
      return false;
    }

    // 检查必需字段
    for (const kline of klines) {
      if (
        typeof kline.timestamp !== 'number' ||
        typeof kline.open !== 'number' ||
        typeof kline.high !== 'number' ||
        typeof kline.low !== 'number' ||
        typeof kline.close !== 'number' ||
        typeof kline.volume !== 'number'
      ) {
        return false;
      }

      // 检查数据合理性
      if (
        kline.open <= 0 ||
        kline.high <= 0 ||
        kline.low <= 0 ||
        kline.close <= 0 ||
        kline.volume < 0
      ) {
        return false;
      }

      // high >= low
      if (kline.high < kline.low) {
        return false;
      }

      // close 在 high 和 low 之间
      if (kline.close > kline.high || kline.close < kline.low) {
        return false;
      }

      // open 在 high 和 low 之间
      if (kline.open > kline.high || kline.open < kline.low) {
        return false;
      }
    }

    return true;
  }

  /**
   * 填充缺失的K线数据（线性插值）
   */
  fillMissingKlines(
    klines: CandleData[],
    intervalMinutes: number
  ): CandleData[] {
    if (klines.length < 2) {
      return klines;
    }

    const result: CandleData[] = [];
    const intervalMs = intervalMinutes * 60 * 1000;

    for (let i = 0; i < klines.length - 1; i++) {
      const current = klines[i];
      const next = klines[i + 1];

      result.push(current);

      // 检查是否有缺失的K线
      const expectedNextTimestamp = current.timestamp + intervalMs;
      if (next.timestamp > expectedNextTimestamp) {
        // 填充缺失的K线
        let fillTimestamp = expectedNextTimestamp;
        while (fillTimestamp < next.timestamp) {
          // 线性插值
          const ratio = (fillTimestamp - current.timestamp) / (next.timestamp - current.timestamp);

          result.push({
            timestamp: fillTimestamp,
            open: current.close, // 简化处理：使用前一根收盘价
            high: current.close, // 简化处理
            low: current.close,  // 简化处理
            close: current.close + (next.close - current.close) * ratio,
            volume: 0, // 缺失K线没有成交量
            volumeCcy: 0,
          });

          fillTimestamp += intervalMs;
        }
      }
    }

    result.push(klines[klines.length - 1]);
    return result;
  }
}
