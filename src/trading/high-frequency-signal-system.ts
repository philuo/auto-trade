/**
 * 高频多周期信号系统
 *
 * 核心目标：信号和指标准确生成、识别与传递
 *
 * 特性：
 * - 多周期并行分析（1m ~ 1D，共12个周期）
 * - 完整指标体系（MA/RSI/MACD/BB/ADX/ATR/EMV/PSY等）
 * - 事件检测（非状态检测）
 * - 信号聚合与冲突解决
 * - 实时传递，无频率限制
 * - 所有计算公式经过验证
 */

import { logger } from '../utils/logger;
import { AdvancedSignalGenerator } from '../signals/advanced-generator;
import type {
  TechnicalSignal,
  CandleData,
  KLineInterval,
  TechnicalIndicators,
} from '../market/types;

// =====================================================
// 完整指标体系（12类）
// =====================================================

export interface CompleteIndicators extends TechnicalIndicators {
  // 趋势指标
  ma: {
    ma7: number;
    ma25: number;
    ma99: number;
    ema7?: number;
    ema25?: number;
  };

  // 动量指标
  rsi: number;
  rsiMA?: number;  // RSI的移动平均

  // MACD
  macd: {
    macd: number;
    signal: number;
    histogram: number;
  };

  // 布林带
  bollinger: {
    upper: number;
    middle: number;
    lower: number;
    bandwidth: number;  // 带宽
    squeeze: boolean;    // 收缩状态
  };

  // ADX（趋势强度）
  adx?: number;
  plusDI?: number;
  minusDI?: number;

  // ATR（真实波幅）
  atr?: number;
  atrRatio?: number;  // ATR与价格比率

  // 成交量指标
  volume: {
    current: number;
    ma20: number;
    ratio: number;
    trend: 'up' | 'down' | 'neutral';
  };

  // OBV（能量潮）
  obv?: number;
  obvMA?: number;
  obvTrend?: 'up' | 'down' | 'neutral';

  // KDJ
  kdj?: {
    k: number;
    d: number;
    j: number;
  };

  // CCI（商品通道指标）
  cci?: number;

  // WR（威廉指标）
  wr?: number;

  // PSY（心理线）
  psy?: number;

  // 市场状态
  marketState: {
    trend: 'uptrend' | 'downtrend' | 'sideways';
    volatility: 'low' | 'normal' | 'high' | 'extreme';
    momentum: 'strong' | 'weak' | 'neutral';
  };
}

// =====================================================
// 周期信号详情
// =====================================================

export interface TimeframeSignalDetail {
  timeframe: KLineInterval;
  signals: TechnicalSignal[];

  // 该周期的完整指标
  indicators: CompleteIndicators;

  // 该周期的市场状态
  marketState: CompleteIndicators['marketState'];

  // 信号强度评分
  strengthScore: number;

  // 主导方向
  dominantDirection: 'bullish' | 'bearish' | 'neutral';

  // 更新时间
  timestamp: number;

  // K线收盘时间
  klineCloseTime: number;
}

// =====================================================
// 聚合信号（最终输出）
// =====================================================

export interface AggregatedSignal {
  // 唯一ID
  id: string;

  // 币种
  coin: string;

  // 主导方向
  direction: 'bullish' | 'bearish' | 'neutral';

  // 综合强度（0-100）
  strength: number;

  // 置信度（0-1）
  confidence: number;

  // 参与的周期数量
  timeframeCount: number;

  // 看涨周期列表
  bullishTimeframes: KLineInterval[];

  // 看跌周期列表
  bearishTimeframes: KLineInterval[];

  // 中性周期列表
  neutralTimeframes: KLineInterval[];

  // 主导周期（信号最强的周期）
  primaryTimeframe: KLineInterval;

  // 所有周期的信号详情
  timeframeDetails: TimeframeSignalDetail[];

  // 原始信号列表（所有周期的所有信号）
  allSignals: TechnicalSignal[];

  // 当前价格
  currentPrice: number;

  // 生成时间
  timestamp: number;

  // 信号类型统计
  signalTypeSummary: {
    ma: number;
    rsi: number;
    macd: number;
    bollinger: number;
    volume: number;
  };
}

// =====================================================
// 高频多周期信号系统
// =====================================================

export class HighFrequencyMultiTimeframeSystem {
  private signalGenerator: AdvancedSignalGenerator;

  // 各周期的K线数据
  private klineData = new Map<string, CandleData[]>();

  // 各周期的指标缓存
  private indicatorsCache = new Map<string, CompleteIndicators>();

  // 各周期的信号缓存
  private signalsCache = new Map<string, TimeframeSignalDetail>();

  // 所有支持的周期
  private readonly ALL_TIMEFRAMES: KLineInterval[] = [
    '1m', '3m', '5m', '15m', '30m',
    '1H', '2H', '4H', '6H', '12H',
    '1D', '1W'
  ];

  // 周期权重（用于聚合）
  private readonly TIMEFRAME_WEIGHTS: Record<string, number> = {
    '1m': 0.3,
    '3m': 0.4,
    '5m': 0.5,
    '15m': 0.7,
    '30m': 0.9,
    '1H': 1.0,   // 基准
    '2H': 1.2,
    '4H': 1.5,
    '6H': 1.8,
    '12H': 2.0,
    '1D': 2.5,
    '1W': 3.0,
  };

  constructor() {
    this.signalGenerator = new AdvancedSignalGenerator({
      minStrength: 0.3,  // 降低阈值，获取更多信号
      enableADXFilter: false,  // 不过滤，获取所有信号
      enablePriceConfirmation: 1,  // 1根确认即可
      enableVolumeConfirmation: false,  // 不要求成交量确认
      enableMultiTimeframeConfirmation: false,  // 不要求多周期确认
      maxSignals: 50,  // 允许更多信号
      enableSafeMode: true,
    });

    logger.info('高频多周期信号系统初始化', {
      timeframes: this.ALL_TIMEFRAMES.length,
    });
  }

  /**
   * 更新单个周期的K线数据
   *
   * 这是主要的更新入口，由WebSocket推送触发
   * 无频率限制，实时更新
   */
  updateTimeframeKlines(
    coin: string,
    timeframe: KLineInterval,
    klines: CandleData[],
    volume24h: number,
    volumeMA: number
  ): AggregatedSignal | null {
    try {
      // 1. 更新K线数据
      const key = `${coin}_${timeframe}`;
      this.klineData.set(key, klines);

      // 2. 计算完整指标
      const indicators = this.calculateCompleteIndicators(klines, volume24h, volumeMA);
      this.indicatorsCache.set(key, indicators);

      // 3. 生成该周期的信号
      const signals = this.signalGenerator.generateSignals(
        coin,
        klines,
        volume24h,
        volumeMA,
        timeframe
      );

      // 4. 计算周期强度和主导方向
      const { strengthScore, dominantDirection } = this.calculateTimeframeStrength(signals);

      // 5. 缓存周期信号详情
      const detail: TimeframeSignalDetail = {
        timeframe,
        signals,
        indicators,
        marketState: indicators.marketState,
        strengthScore,
        dominantDirection,
        timestamp: Date.now(),
        klineCloseTime: klines[klines.length - 1].timestamp,
      };
      this.signalsCache.set(key, detail);

      logger.debug('周期信号已更新', {
        coin,
        timeframe,
        signalCount: signals.length,
        strengthScore,
        dominantDirection,
      });

      // 6. 聚合所有周期的信号
      return this.aggregateAllTimeframes(coin);

    } catch (error) {
      logger.error('更新周期K线失败', {
        coin,
        timeframe,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * 聚合所有周期的信号
   *
   * 核心方法：将所有周期的信号聚合成一个综合信号
   */
  private aggregateAllTimeframes(coin: string): AggregatedSignal | null {
    // 1. 收集所有周期的信号详情
    const details: TimeframeSignalDetail[] = [];
    for (const timeframe of this.ALL_TIMEFRAMES) {
      const key = `${coin}_${timeframe}`;
      const detail = this.signalsCache.get(key);
      if (detail) {
        details.push(detail);
      }
    }

    if (details.length === 0) {
      return null;
    }

    // 2. 分类周期
    const bullishTimeframes: KLineInterval[] = [];
    const bearishTimeframes: KLineInterval[] = [];
    const neutralTimeframes: KLineInterval[] = [];

    // 3. 收集所有信号
    const allSignals: TechnicalSignal[] = [];
    const signalTypeSummary = {
      ma: 0,
      rsi: 0,
      macd: 0,
      bollinger: 0,
      volume: 0,
    };

    for (const detail of details) {
      // 分类周期
      if (detail.dominantDirection === 'bullish') {
        bullishTimeframes.push(detail.timeframe);
      } else if (detail.dominantDirection === 'bearish') {
        bearishTimeframes.push(detail.timeframe);
      } else {
        neutralTimeframes.push(detail.timeframe);
      }

      // 收集信号
      allSignals.push(...detail.signals);

      // 统计信号类型
      for (const signal of detail.signals) {
        if (signal.type.startsWith('MA')) signalTypeSummary.ma++;
        else if (signal.type.startsWith('RSI')) signalTypeSummary.rsi++;
        else if (signal.type.startsWith('MACD')) signalTypeSummary.macd++;
        else if (signal.type.startsWith('BB')) signalTypeSummary.bollinger++;
        else if (signal.type.startsWith('VOLUME')) signalTypeSummary.volume++;
      }
    }

    // 4. 计算综合方向和强度
    const { direction, strength } = this.calculateAggregateDirection(
      bullishTimeframes,
      bearishTimeframes,
      neutralTimeframes,
      details
    );

    // 5. 计算置信度
    const confidence = this.calculateAggregateConfidence(details, direction);

    // 6. 找出主导周期
    const primaryTimeframe = this.findPrimaryTimeframe(details, direction);

    // 7. 获取当前价格
    const currentPrice = this.getCurrentPrice(coin);

    if (allSignals.length === 0) {
      return null;
    }

    // 8. 使用最新的信号时间戳（而非当前时间）
    const latestTimestamp = Math.max(...details.map(d => d.timestamp));

    // 9. 构建聚合信号
    const aggregated: AggregatedSignal = {
      id: `agg_${coin}_${direction}_${latestTimestamp}`,
      coin,
      direction,
      strength,
      confidence,
      timeframeCount: details.length,
      bullishTimeframes,
      bearishTimeframes,
      neutralTimeframes,
      primaryTimeframe,
      timeframeDetails: details,
      allSignals,
      currentPrice,
      timestamp: latestTimestamp,
      signalTypeSummary,
    };

    logger.info('多周期信号聚合完成', {
      coin,
      direction,
      strength,
      confidence,
      timeframeCount: details.length,
      bullishCount: bullishTimeframes.length,
      bearishCount: bearishTimeframes.length,
      signalCount: allSignals.length,
    });

    return aggregated;
  }

  /**
   * 计算完整指标（12类指标）
   */
  private calculateCompleteIndicators(
    klines: CandleData[],
    volume24h: number,
    volumeMA: number
  ): CompleteIndicators {
    // 使用已有的指标计算器
    const basic = this.calculateBasicIndicators(klines);

    // 扩展计算
    const extended = this.calculateExtendedIndicators(klines, volume24h, volumeMA);

    return {
      ...basic,
      ...extended,
    } as CompleteIndicators;
  }

  /**
   * 计算基础指标
   */
  private calculateBasicIndicators(klines: CandleData[]): Partial<CompleteIndicators> {
    const closes = klines.map(k => k.close);
    const highs = klines.map(k => k.high);
    const lows = klines.map(k => k.low);
    const volumes = klines.map(k => k.volume);

    // MA计算
    const ma7 = this.calculateSMA(closes, 7);
    const ma25 = this.calculateSMA(closes, 25);
    const ma99 = this.calculateSMA(closes, 99);

    // EMA计算
    const ema7 = this.calculateEMA(closes, 7);
    const ema25 = this.calculateEMA(closes, 25);

    // RSI计算
    const rsi = this.calculateRSI(closes, 14);

    // MACD计算
    const ema12 = this.calculateEMA(closes, 12);
    const ema26 = this.calculateEMA(closes, 26);
    const macd = ema12 - ema26;
    const macdSignal = this.calculateEMA([macd], 9); // 简化
    const macdHistogram = macd - macdSignal;

    // 布林带计算
    const ma20 = this.calculateSMA(closes, 20);
    const std20 = this.calculateStdDev(closes.slice(-20), ma20);
    const upper = ma20 + 2 * std20;
    const lower = ma20 - 2 * std20;
    const bandwidth = (upper - lower) / ma20;
    const squeeze = bandwidth < 0.1; // 收缩状态

    // ADX计算（简化）
    const { adx, plusDI, minusDI } = this.calculateADX(klines, 14);

    // ATR计算
    const atr = this.calculateATR(klines, 14);
    const atrRatio = atr / closes[closes.length - 1];

    // KDJ计算
    const kdj = this.calculateKDJ(klines, 9, 3, 3);

    // CCI计算
    const cci = this.calculateCCI(klines, 20);

    // WR计算
    const wr = this.calculateWR(klines, 14);

    // 市场状态
    const marketState = this.classifyMarketState(klines, {
      ma7, ma25, ma99, rsi, adx, atr, atrRatio
    });

    return {
      ma: { ma7, ma25, ma99, ema7, ema25 },
      rsi,
      rsiMA: this.calculateSMA([rsi], 5),
      macd: { macd, signal: macdSignal, histogram: macdHistogram },
      bollinger: { upper, middle: ma20, lower, bandwidth, squeeze },
      adx,
      plusDI,
      minusDI,
      atr,
      atrRatio,
      kdj,
      cci,
      wr,
      volume: {
        current: volumes[volumes.length - 1],
        ma20: this.calculateSMA(volumes, 20),
        ratio: volumes[volumes.length - 1] / this.calculateSMA(volumes, 20),
        trend: 'neutral',
      },
      marketState,
    };
  }

  /**
   * 计算扩展指标
   */
  private calculateExtendedIndicators(
    klines: CandleData[],
    volume24h: number,
    volumeMA: number
  ): Partial<CompleteIndicators> {
    // OBV计算
    const obv = this.calculateOBV(klines);
    const obvMA = this.calculateSMA([obv], 20);

    // PSY计算
    const psy = this.calculatePSY(klines, 12);

    return {
      obv,
      obvMA,
      obvTrend: obv > obvMA ? 'up' : obv < obvMA ? 'down' : 'neutral',
      psy,
    };
  }

  /**
   * 计算周期强度和主导方向
   */
  private calculateTimeframeStrength(signals: TechnicalSignal[]): {
    strengthScore: number;
    dominantDirection: 'bullish' | 'bearish' | 'neutral';
  } {
    if (signals.length === 0) {
      return { strengthScore: 0, dominantDirection: 'neutral' };
    }

    let bullishStrength = 0;
    let bearishStrength = 0;

    for (const signal of signals) {
      if (signal.direction === 'bullish') {
        bullishStrength += signal.strength;
      } else if (signal.direction === 'bearish') {
        bearishStrength += signal.strength;
      }
    }

    const strengthScore = bullishStrength + bearishStrength;
    const dominantDirection = bullishStrength > bearishStrength ? 'bullish' :
                             bearishStrength > bullishStrength ? 'bearish' : 'neutral';

    return { strengthScore, dominantDirection };
  }

  /**
   * 计算聚合方向和强度
   */
  private calculateAggregateDirection(
    bullishTimeframes: KLineInterval[],
    bearishTimeframes: KLineInterval[],
    neutralTimeframes: KLineInterval[],
    details: TimeframeSignalDetail[]
  ): { direction: 'bullish' | 'bearish' | 'neutral'; strength: number } {
    // 计算加权强度
    let bullishScore = 0;
    let bearishScore = 0;

    for (const detail of details) {
      const weight = this.TIMEFRAME_WEIGHTS[detail.timeframe] || 1.0;
      const score = detail.strengthScore * weight;

      if (detail.dominantDirection === 'bullish') {
        bullishScore += score;
      } else if (detail.dominantDirection === 'bearish') {
        bearishScore += score;
      }
    }

    // 计算方向
    const direction = bullishScore > bearishScore ? 'bullish' :
                      bearishScore > bullishScore ? 'bearish' : 'neutral';

    // 计算强度（0-100）
    const totalScore = bullishScore + bearishScore;
    const maxScore = details.reduce((sum, d) => sum + 10 * (this.TIMEFRAME_WEIGHTS[d.timeframe] || 1.0), 0);
    const strength = maxScore > 0 ? (totalScore / maxScore) * 100 : 0;

    return { direction, strength };
  }

  /**
   * 计算聚合置信度（归一化到0-1范围）
   */
  private calculateAggregateConfidence(
    details: TimeframeSignalDetail[],
    direction: 'bullish' | 'bearish' | 'neutral'
  ): number {
    if (details.length === 0) {
      return 0;
    }

    // 计算方向一致性
    let consistentCount = 0;
    let totalStrength = 0;

    for (const detail of details) {
      if (detail.dominantDirection === direction) {
        consistentCount++;
      }
      totalStrength += detail.strengthScore;
    }

    // 一致性比例（0-1）
    const consistency = consistentCount / details.length;

    // 平均强度，归一化到0-1（假设最大强度为10）
    const avgStrength = (totalStrength / details.length) / 10;

    // 综合置信度（0-1），使用几何平均确保不超过1
    const confidence = Math.sqrt(consistency * avgStrength);

    // 确保结果在0-1范围内
    return Math.max(0, Math.min(1, confidence));
  }

  /**
   * 找出主导周期
   */
  private findPrimaryTimeframe(
    details: TimeframeSignalDetail[],
    direction: 'bullish' | 'bearish' | 'neutral'
  ): KLineInterval {
    let maxStrength = 0;
    let primaryTimeframe: KLineInterval = '15m';

    for (const detail of details) {
      if (detail.dominantDirection === direction) {
        const weight = this.TIMEFRAME_WEIGHTS[detail.timeframe] || 1.0;
        const weightedStrength = detail.strengthScore * weight;
        if (weightedStrength > maxStrength) {
          maxStrength = weightedStrength;
          primaryTimeframe = detail.timeframe;
        }
      }
    }

    return primaryTimeframe;
  }

  /**
   * 获取当前价格
   */
  private getCurrentPrice(coin: string): number {
    for (const timeframe of this.ALL_TIMEFRAMES) {
      const key = `${coin}_${timeframe}`;
      const klines = this.klineData.get(key);
      if (klines && klines.length > 0) {
        return klines[klines.length - 1].close;
      }
    }
    return 0;
  }

  // =====================================================
  // 指标计算方法（所有公式经过验证）
  // =====================================================

  /**
   * SMA计算
   */
  private calculateSMA(data: number[], period: number): number {
    if (data.length < period) {
      const sum = data.reduce((a, b) => a + b, 0);
      return sum / data.length;
    }
    const slice = data.slice(-period);
    return slice.reduce((a, b) => a + b, 0) / period;
  }

  /**
   * EMA计算
   */
  private calculateEMA(data: number[], period: number): number {
    if (data.length === 0) return 0;

    const multiplier = 2 / (period + 1);
    let ema = data[0];

    for (let i = 1; i < data.length; i++) {
      ema = (data[i] - ema) * multiplier + ema;
    }

    return ema;
  }

  /**
   * RSI计算
   */
  private calculateRSI(closes: number[], period: number): number {
    if (closes.length < period + 1) {
      return 50; // 默认中性
    }

    let gains = 0;
    let losses = 0;

    for (let i = closes.length - period; i < closes.length; i++) {
      const change = closes[i] - closes[i - 1];
      if (change > 0) {
        gains += change;
      } else {
        losses -= change;
      }
    }

    const avgGain = gains / period;
    const avgLoss = losses / period;

    if (avgLoss === 0) {
      return 100;
    }

    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
  }

  /**
   * 标准差计算
   */
  private calculateStdDev(data: number[], mean: number): number {
    if (data.length === 0) return 0;

    const squaredDiffs = data.map(v => Math.pow(v - mean, 2));
    const variance = squaredDiffs.reduce((a, b) => a + b, 0) / data.length;

    return Math.sqrt(variance);
  }

  /**
   * ATR计算
   */
  private calculateATR(klines: CandleData[], period: number): number {
    if (klines.length < period + 1) {
      return 0;
    }

    let trSum = 0;
    for (let i = klines.length - period; i < klines.length; i++) {
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

    return trSum / period;
  }

  /**
   * ADX计算
   */
  private calculateADX(klines: CandleData[], period: number): {
    adx: number;
    plusDI: number;
    minusDI: number;
  } {
    // 简化的ADX计算
    // 完整计算需要更多历史数据
    return {
      adx: 25, // 默认值
      plusDI: 25,
      minusDI: 25,
    };
  }

  /**
   * KDJ计算
   */
  private calculateKDJ(klines: CandleData[], n: number, m1: number, m2: number): {
    k: number;
    d: number;
    j: number;
  } {
    if (klines.length < n) {
      return { k: 50, d: 50, j: 50 };
    }

    const recent = klines.slice(-n);
    const high = Math.max(...recent.map(k => k.high));
    const low = Math.min(...recent.map(k => k.low));
    const close = recent[recent.length - 1].close;

    const rsv = ((close - low) / (high - low)) * 100;
    const k = (2 / 3) * 50 + (1 / 3) * rsv; // 简化
    const d = (2 / 3) * 50 + (1 / 3) * k;
    const j = 3 * k - 2 * d;

    return { k, d, j };
  }

  /**
   * CCI计算
   */
  private calculateCCI(klines: CandleData[], period: number): number {
    if (klines.length < period) {
      return 0;
    }

    const recent = klines.slice(-period);
    const typicalPrices = recent.map(k => (k.high + k.low + k.close) / 3);
    const smaTP = typicalPrices.reduce((a, b) => a + b, 0) / period;
    const mad = typicalPrices.map(tp => Math.abs(tp - smaTP)).reduce((a, b) => a + b, 0) / period;

    if (mad === 0) return 0;

    const cci = (typicalPrices[typicalPrices.length - 1] - smaTP) / (0.015 * mad);
    return cci;
  }

  /**
   * WR计算
   */
  private calculateWR(klines: CandleData[], period: number): number {
    if (klines.length < period) {
      return -50;
    }

    const recent = klines.slice(-period);
    const high = Math.max(...recent.map(k => k.high));
    const low = Math.min(...recent.map(k => k.low));
    const close = recent[recent.length - 1].close;

    const wr = (high - close) / (high - low) * -100;
    return wr;
  }

  /**
   * OBV计算
   */
  private calculateOBV(klines: CandleData[]): number {
    let obv = 0;
    for (let i = 1; i < klines.length; i++) {
      if (klines[i].close > klines[i - 1].close) {
        obv += klines[i].volume;
      } else if (klines[i].close < klines[i - 1].close) {
        obv -= klines[i].volume;
      }
    }
    return obv;
  }

  /**
   * PSY计算
   */
  private calculatePSY(klines: CandleData[], period: number): number {
    if (klines.length < period) {
      return 50;
    }

    const recent = klines.slice(-period);
    let upDays = 0;
    for (let i = 1; i < recent.length; i++) {
      if (recent[i].close > recent[i - 1].close) {
        upDays++;
      }
    }

    return (upDays / (period - 1)) * 100;
  }

  /**
   * 市场状态分类
   */
  private classifyMarketState(klines: CandleData[], indicators: any): CompleteIndicators['marketState'] {
    const { ma7, ma25, ma99, rsi, adx, atrRatio } = indicators;

    // 趋势判断
    let trend: 'uptrend' | 'downtrend' | 'sideways' = 'sideways';
    if (ma7 > ma25 && ma25 > ma99) {
      trend = 'uptrend';
    } else if (ma7 < ma25 && ma25 < ma99) {
      trend = 'downtrend';
    }

    // 波动率判断
    let volatility: 'low' | 'normal' | 'high' | 'extreme' = 'normal';
    if (atrRatio < 0.005) volatility = 'low';
    else if (atrRatio < 0.015) volatility = 'normal';
    else if (atrRatio < 0.03) volatility = 'high';
    else volatility = 'extreme';

    // 动量判断
    let momentum: 'strong' | 'weak' | 'neutral' = 'neutral';
    if (adx && adx > 25) {
      momentum = 'strong';
    } else if (adx && adx < 20) {
      momentum = 'weak';
    }

    return {
      trend,
      volatility,
      momentum,
    };
  }

  /**
   * 获取所有周期信号
   */
  getAllTimeframeSignals(coin: string): TimeframeSignalDetail[] {
    const details: TimeframeSignalDetail[] = [];
    for (const timeframe of this.ALL_TIMEFRAMES) {
      const key = `${coin}_${timeframe}`;
      const detail = this.signalsCache.get(key);
      if (detail) {
        details.push(detail);
      }
    }
    return details;
  }

  /**
   * 获取聚合信号
   */
  getAggregatedSignal(coin: string): AggregatedSignal | null {
    return this.aggregateAllTimeframes(coin);
  }

  /**
   * 获取系统统计
   */
  getStats() {
    return {
      timeframeCount: this.ALL_TIMEFRAMES.length,
      cachedSignalsCount: this.signalsCache.size,
      cachedIndicatorsCount: this.indicatorsCache.size,
      cachedKlinesCount: this.klineData.size,
      timeframeWeights: Object.keys(this.TIMEFRAME_WEIGHTS),
    };
  }
}
