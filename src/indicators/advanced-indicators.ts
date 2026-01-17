/**
 * 先进技术指标计算器
 *
 * 添加ADX等高级指标，用于趋势强度过滤
 */

import { logger } from '../utils/logger;
import type { CandleData, TechnicalIndicators } from '../market/types;

/**
 * 扩展的技术指标（包含ADX）
 */
export interface AdvancedIndicators extends TechnicalIndicators {
  /** ADX（平均趋向指数）- 趋势强度 */
  adx?: number;
  /** +DI（正向指标） */
  plusDI?: number;
  /** -DI（负向指标） */
  minusDI?: number;
  /** ATR（平均真实波幅） */
  atr?: number;
}

/**
 * 先进指标计算器
 */
export class AdvancedIndicatorCalculator {
  /**
   * 计算ADX（平均趋向指数）
   * ADX用于衡量趋势强度，不受方向影响
   *
   * ADX > 25：强趋势
   * ADX < 20：弱趋势或震荡
   */
  calculateADX(
    klines: CandleData[],
    period: number = 14
  ): { adx: number; plusDI: number; minusDI: number } {
    if (klines.length < period * 2) {
      throw new Error(`K线数据不足，计算ADX需要至少${period * 2}根`);
    }

    const highs = klines.map(k => k.high);
    const lows = klines.map(k => k.low);
    const closes = klines.map(k => k.close);

    // 计算+DM和-DM
    const plusDM: number[] = [];
    const minusDM: number[] = [];

    for (let i = 1; i < klines.length; i++) {
      const upMove = highs[i] - highs[i - 1];
      const downMove = lows[i - 1] - lows[i];

      if (upMove > downMove && upMove > 0) {
        plusDM.push(upMove);
      } else {
        plusDM.push(0);
      }

      if (downMove > upMove && downMove > 0) {
        minusDM.push(downMove);
      } else {
        minusDM.push(0);
      }
    }

    // 计算真实波幅TR
    const tr: number[] = [];
    for (let i = 1; i < klines.length; i++) {
      const high = highs[i];
      const low = lows[i];
      const prevClose = closes[i - 1];

      const trValue = Math.max(
        high - low,
        Math.abs(high - prevClose),
        Math.abs(low - prevClose)
      );
      tr.push(trValue);
    }

    // 平滑+DM、-DM和TR（使用Wilder's smoothing）
    let smoothedPlusDM = this.calculateSMA(plusDM.slice(0, period), period);
    let smoothedMinusDM = this.calculateSMA(minusDM.slice(0, period), period);
    let smoothedTR = this.calculateSMA(tr.slice(0, period), period);

    for (let i = period; i < plusDM.length; i++) {
      smoothedPlusDM = (smoothedPlusDM * (period - 1) + plusDM[i]) / period;
      smoothedMinusDM = (smoothedMinusDM * (period - 1) + minusDM[i]) / period;
      smoothedTR = (smoothedTR * (period - 1) + tr[i]) / period;
    }

    // 计算+DI和-DI
    const plusDI = (smoothedPlusDM / smoothedTR) * 100;
    const minusDI = (smoothedMinusDM / smoothedTR) * 100;

    // 计算DX和ADX
    const diDiff = Math.abs(plusDI - minusDI);
    const diSum = plusDI + minusDI;
    const dx = (diDiff / diSum) * 100;

    // 计算ADX的平滑值（简化版，只返回当前DX）
    // 完整版需要计算DX的历史序列然后平滑
    const adx = dx;

    return { adx, plusDI, minusDI };
  }

  /**
   * 计算ATR（平均真实波幅）
   *
   * ATR用于衡量市场波动率
   * 可用于动态调整止损距离和信号强度
   */
  calculateATR(klines: CandleData[], period: number = 14): number {
    if (klines.length < period + 1) {
      throw new Error(`K线数据不足，计算ATR需要至少${period + 1}根`);
    }

    const tr: number[] = [];
    for (let i = 1; i < klines.length; i++) {
      const high = klines[i].high;
      const low = klines[i].low;
      const prevClose = klines[i - 1].close;

      const trValue = Math.max(
        high - low,
        Math.abs(high - prevClose),
        Math.abs(low - prevClose)
      );
      tr.push(trValue);
    }

    // 使用Wilder's smoothing计算ATR
    let atr = this.calculateSMA(tr.slice(0, period), period);
    for (let i = period; i < tr.length; i++) {
      atr = (atr * (period - 1) + tr[i]) / period;
    }

    return atr;
  }

  /**
   * 计算所有扩展指标
   */
  calculateAllExtended(klines: CandleData[]): AdvancedIndicators {
    // 先计算基础指标
    const ma = this.calculateMA(klines);
    const rsi = this.calculateRSI(klines);
    const macd = this.calculateMACD(klines);
    const bollinger = this.calculateBollinger(klines);

    // 计算ADX
    let adx: number | undefined;
    let plusDI: number | undefined;
    let minusDI: number | undefined;

    try {
      const adxResult = this.calculateADX(klines);
      adx = adxResult.adx;
      plusDI = adxResult.plusDI;
      minusDI = adxResult.minusDI;
    } catch (error) {
      // K线不足，跳过ADX
    }

    // 计算ATR
    let atr: number | undefined;
    try {
      atr = this.calculateATR(klines);
    } catch (error) {
      // K线不足，跳过ATR
    }

    return {
      ma,
      rsi,
      macd,
      bollinger,
      adx,
      plusDI,
      minusDI,
      atr,
    };
  }

  /**
   * 判断市场状态
   */
  classifyMarket(klines: CandleData[]): {
    trend: 'strong_uptrend' | 'uptrend' | 'sideways' | 'downtrend' | 'strong_downtrend';
    volatility: 'low' | 'normal' | 'high' | 'extreme';
    strength: 'strong' | 'weak' | 'none';
  } {
    const indicators = this.calculateAllExtended(klines);
    const currentPrice = klines[klines.length - 1].close;

    // 使用ADX判断趋势强度
    const hasStrongTrend = indicators.adx !== undefined && indicators.adx > 25;
    const hasWeakTrend = indicators.adx !== undefined && indicators.adx > 20;
    const noTrend = indicators.adx === undefined || indicators.adx < 20;

    // 使用MA判断趋势方向
    const isStrongUp = indicators.ma.ma25 > indicators.ma.ma99 && indicators.ma.ma7 > indicators.ma.ma25;
    const isUp = indicators.ma.ma25 > indicators.ma.ma99;
    const isStrongDown = indicators.ma.ma25 < indicators.ma.ma99 && indicators.ma.ma7 < indicators.ma.ma25;
    const isDown = indicators.ma.ma25 < indicators.ma.ma99;

    // 使用ATR判断波动率
    const volatility = indicators.atr !== undefined
      ? (indicators.atr / currentPrice)
      : 0.02; // 默认2%

    // 趋势判断
    let trend: 'strong_uptrend' | 'uptrend' | 'sideways' | 'downtrend' | 'strong_downtrend';
    if (hasStrongTrend && isStrongUp) {
      trend = 'strong_uptrend';
    } else if (hasStrongTrend && isStrongDown) {
      trend = 'strong_downtrend';
    } else if ((hasStrongTrend || hasWeakTrend) && isUp) {
      trend = 'uptrend';
    } else if ((hasStrongTrend || hasWeakTrend) && isDown) {
      trend = 'downtrend';
    } else {
      trend = 'sideways';
    }

    // 波动率判断
    let volLevel: 'low' | 'normal' | 'high' | 'extreme';
    if (volatility < 0.015) {
      volLevel = 'low';
    } else if (volatility < 0.03) {
      volLevel = 'normal';
    } else if (volatility < 0.05) {
      volLevel = 'high';
    } else {
      volLevel = 'extreme';
    }

    // 趋势强度判断
    let strength: 'strong' | 'weak' | 'none';
    if (hasStrongTrend) {
      strength = 'strong';
    } else if (hasWeakTrend) {
      strength = 'weak';
    } else {
      strength = 'none';
    }

    return {
      trend,
      volatility: volLevel,
      strength,
    };
  }

  // ========== 基础指标计算（从IndicatorCalculator复制） ==========

  private calculateMA(klines: CandleData[], periods: number[] = [7, 25, 99]): {
    ma7: number;
    ma25: number;
    ma99: number;
  } {
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

  private calculateRSI(klines: CandleData[], period: number = 14): number {
    if (klines.length < period + 1) {
      throw new Error(`K线数据不足，计算RSI需要至少${period + 1}根`);
    }

    const closes = klines.map(k => k.close);
    const changes: number[] = [];
    for (let i = 1; i < closes.length; i++) {
      changes.push(closes[i] - closes[i - 1]);
    }

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

    let avgGain = this.calculateSMA(gains.slice(0, period), period);
    let avgLoss = this.calculateSMA(losses.slice(0, period), period);

    for (let i = period; i < gains.length; i++) {
      avgGain = (avgGain * (period - 1) + gains[i]) / period;
      avgLoss = (avgLoss * (period - 1) + losses[i]) / period;
    }

    if (avgLoss === 0) {
      return 100;
    }

    const rs = avgGain / avgLoss;
    const rsi = 100 - (100 / (1 + rs));
    return rsi;
  }

  private calculateMACD(
    klines: CandleData[],
    fastPeriod: number = 12,
    slowPeriod: number = 26,
    signalPeriod: number = 9
  ): { macd: number; signal: number; histogram: number } {
    const closes = klines.map(k => k.close);
    const fastEMA = this.calculateEMA(closes, fastPeriod);
    const slowEMA = this.calculateEMA(closes, slowPeriod);
    const macd = fastEMA - slowEMA;

    const macdHistory: number[] = [];
    for (let i = slowPeriod; i < closes.length; i++) {
      const slice = closes.slice(0, i + 1);
      const fast = this.calculateEMA(slice, fastPeriod);
      const slow = this.calculateEMA(slice, slowPeriod);
      macdHistory.push(fast - slow);
    }

    if (macdHistory.length < signalPeriod) {
      throw new Error(`MACD历史数据不足`);
    }
    const signal = this.calculateEMA(macdHistory, signalPeriod);
    const histogram = macd - signal;

    return { macd, signal, histogram };
  }

  private calculateBollinger(
    klines: CandleData[],
    period: number = 20,
    stdDev: number = 2
  ): { upper: number; middle: number; lower: number } {
    const closes = klines.map(k => k.close);
    const middle = this.calculateSMA(closes, period);

    const slice = closes.slice(-period);
    const variance = slice.reduce((sum, val) => sum + Math.pow(val - middle, 2), 0) / period;
    const standardDeviation = Math.sqrt(variance);

    const upper = middle + stdDev * standardDeviation;
    const lower = middle - stdDev * standardDeviation;

    return { upper, middle, lower };
  }

  private calculateSMA(prices: number[], period: number): number {
    if (prices.length < period) {
      throw new Error(`价格数据不足`);
    }
    const slice = prices.slice(-period);
    return slice.reduce((a, b) => a + b, 0) / period;
  }

  private calculateEMA(prices: number[], period: number): number {
    if (prices.length < period) {
      throw new Error(`价格数据不足`);
    }
    const multiplier = 2 / (period + 1);
    let ema = this.calculateSMA(prices.slice(0, period), period);
    for (let i = period; i < prices.length; i++) {
      ema = (prices[i] - ema) * multiplier + ema;
    }
    return ema;
  }
}
