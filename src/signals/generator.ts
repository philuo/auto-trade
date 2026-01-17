/**
 * 技术信号生成器
 *
 * 基于纯技术指标生成交易信号，完全可验证、可回测
 * 无需AI，使用确定性规则
 *
 * ⚠️ 重要提示：
 * 本生成器使用状态检测而非事件检测。
 * - 状态检测：只要条件满足就持续生成信号（如 MA7 > MA25）
 * - 事件检测：只在条件变化的时刻生成信号（如 MA 从下方穿越 MA25）
 *
 * 状态检测的缺点：
 * - 可能产生重复信号（同一条件多次触发）
 * - 可能在趋势确立后才产生信号（错过最佳入场点）
 *
 * 推荐使用 AdvancedSignalGenerator 进行生产交易，它使用事件检测。
 */

import { logger } from '../utils/logger;
import { SignalType, SignalDirection } from '../market/types;
import type {
  TechnicalSignal,
  KLineInterval,
  TechnicalIndicators,
} from '../market/types;

/**
 * 信号生成器配置
 */
export interface SignalGeneratorConfig {
  /** 启用的信号类型 */
  enabledSignals?: SignalType[];
  /** 信号强度阈值（低于此值的信号会被过滤） */
  minStrength?: number;
  /** 是否需要多个时间周期确认 */
  requireMultiTimeframeConfirmation?: boolean;
  /** 确认周期列表 */
  confirmationTimeframes?: KLineInterval[];
}

/**
 * 技术信号生成器类
 */
export class TechnicalSignalGenerator {
  private config: Required<SignalGeneratorConfig>;
  // 信号计数器（用于生成唯一ID）
  private signalCounter = 0;

  constructor(config: SignalGeneratorConfig = {}) {
    this.config = {
      enabledSignals: config.enabledSignals ?? this.getAllSignalTypes(),
      minStrength: config.minStrength ?? 0.3,
      requireMultiTimeframeConfirmation: config.requireMultiTimeframeConfirmation ?? true,
      confirmationTimeframes: config.confirmationTimeframes ?? ['15m', '1H', '4H'],
    };

    logger.info('技术信号生成器初始化', {
      enabledCount: this.config.enabledSignals.length,
      minStrength: this.config.minStrength,
    });
  }

  /**
   * 生成所有信号
   */
  generateSignals(
    coin: string,
    indicators: TechnicalIndicators,
    price: number,
    volume: number,
    volumeMA: number,
    timeframe: KLineInterval
  ): TechnicalSignal[] {
    const signals: TechnicalSignal[] = [];
    const timestamp = Date.now();

    // 1. 移动平均线信号
    signals.push(...this.generateMASignals(coin, indicators, price, timeframe, timestamp));

    // 2. RSI信号
    signals.push(...this.generateRSISignals(coin, indicators, timeframe, timestamp));

    // 3. MACD信号
    signals.push(...this.generateMACDSignals(coin, indicators, timeframe, timestamp));

    // 4. 布林带信号
    signals.push(...this.generateBollingerSignals(coin, indicators, price, timeframe, timestamp));

    // 5. 成交量信号
    signals.push(...this.generateVolumeSignals(coin, volume, volumeMA, timeframe, timestamp));

    // 过滤低强度信号
    const filtered = signals.filter(s => s.strength >= this.config.minStrength);

    logger.debug('生成技术信号', {
      coin,
      timeframe,
      generated: signals.length,
      filtered: filtered.length,
    });

    return filtered;
  }

  /**
   * 生成移动平均线信号
   */
  private generateMASignals(
    coin: string,
    indicators: TechnicalIndicators,
    price: number,
    timeframe: KLineInterval,
    timestamp: number
  ): TechnicalSignal[] {
    const signals: TechnicalSignal[] = [];
    const { ma } = indicators;

    // MA7/MA25 金叉
    if (ma.ma7 > ma.ma25) {
      // 计算强度：差距越大信号越强
      const diff = (ma.ma7 - ma.ma25) / ma.ma25;
      const strength = Math.min(1, Math.abs(diff) * 100);

      signals.push({
        id: this.generateSignalId(SignalType.MA_7_25_CROSSOVER, coin, timeframe),
        type: SignalType.MA_7_25_CROSSOVER,
        direction: SignalDirection.BULLISH,
        coin,
        timeframe,
        strength,
        timestamp,
        price,
        indicators: { ma7: ma.ma7, ma25: ma.ma25, ma99: ma.ma99 },
      });
    }
    // MA7/MA25 死叉
    else if (ma.ma7 < ma.ma25) {
      const diff = (ma.ma25 - ma.ma7) / ma.ma25;
      const strength = Math.min(1, Math.abs(diff) * 100);

      signals.push({
        id: this.generateSignalId(SignalType.MA_7_25_CROSSUNDER, coin, timeframe),
        type: SignalType.MA_7_25_CROSSUNDER,
        direction: SignalDirection.BEARISH,
        coin,
        timeframe,
        strength,
        timestamp,
        price,
        indicators: { ma7: ma.ma7, ma25: ma.ma25, ma99: ma.ma99 },
      });
    }

    // MA25/MA99 金叉（更强信号）
    if (ma.ma25 > ma.ma99) {
      const diff = (ma.ma25 - ma.ma99) / ma.ma99;
      const strength = Math.min(1, Math.abs(diff) * 80); // 稍微保守

      signals.push({
        id: this.generateSignalId(SignalType.MA_25_99_CROSSOVER, coin, timeframe),
        type: SignalType.MA_25_99_CROSSOVER,
        direction: SignalDirection.BULLISH,
        coin,
        timeframe,
        strength,
        timestamp,
        price,
        indicators: { ma7: ma.ma7, ma25: ma.ma25, ma99: ma.ma99 },
      });
    }
    // MA25/MA99 死叉
    else if (ma.ma25 < ma.ma99) {
      const diff = (ma.ma99 - ma.ma25) / ma.ma99;
      const strength = Math.min(1, Math.abs(diff) * 80);

      signals.push({
        id: this.generateSignalId(SignalType.MA_25_99_CROSSUNDER, coin, timeframe),
        type: SignalType.MA_25_99_CROSSUNDER,
        direction: SignalDirection.BEARISH,
        coin,
        timeframe,
        strength,
        timestamp,
        price,
        indicators: { ma7: ma.ma7, ma25: ma.ma25, ma99: ma.ma99 },
      });
    }

    return signals;
  }

  /**
   * 生成RSI信号
   */
  private generateRSISignals(
    coin: string,
    indicators: TechnicalIndicators,
    timeframe: KLineInterval,
    timestamp: number
  ): TechnicalSignal[] {
    const signals: TechnicalSignal[] = [];
    const { rsi } = indicators;

    // RSI超卖
    if (rsi < 30) {
      // RSI越低信号越强
      const strength = Math.min(1, (30 - rsi) / 20);

      signals.push({
        id: this.generateSignalId(SignalType.RSI_OVERSOLD, coin, timeframe),
        type: SignalType.RSI_OVERSOLD,
        direction: SignalDirection.BULLISH,
        coin,
        timeframe,
        strength,
        timestamp,
        indicators: { rsi },
      });
    }
    // RSI超买
    else if (rsi > 70) {
      const strength = Math.min(1, (rsi - 70) / 20);

      signals.push({
        id: this.generateSignalId(SignalType.RSI_OVERBOUGHT, coin, timeframe),
        type: SignalType.RSI_OVERBOUGHT,
        direction: SignalDirection.BEARISH,
        coin,
        timeframe,
        strength,
        timestamp,
        indicators: { rsi },
      });
    }

    // RSI中性穿越
    if (rsi > 50) {
      // 从下往上穿越50
      const strength = Math.min(1, (rsi - 50) / 10);

      signals.push({
        id: this.generateSignalId(SignalType.RSI_NEUTRAL_CROSS_UP, coin, timeframe),
        type: SignalType.RSI_NEUTRAL_CROSS_UP,
        direction: SignalDirection.BULLISH,
        coin,
        timeframe,
        strength,
        timestamp,
        indicators: { rsi },
      });
    }
    // RSI从上往下穿越50
    else if (rsi < 50) {
      const strength = Math.min(1, (50 - rsi) / 10);

      signals.push({
        id: this.generateSignalId(SignalType.RSI_NEUTRAL_CROSS_DOWN, coin, timeframe),
        type: SignalType.RSI_NEUTRAL_CROSS_DOWN,
        direction: SignalDirection.BEARISH,
        coin,
        timeframe,
        strength,
        timestamp,
        indicators: { rsi },
      });
    }

    return signals;
  }

  /**
   * 生成MACD信号
   */
  private generateMACDSignals(
    coin: string,
    indicators: TechnicalIndicators,
    timeframe: KLineInterval,
    timestamp: number
  ): TechnicalSignal[] {
    const signals: TechnicalSignal[] = [];
    const { macd } = indicators;

    // MACD金叉
    if (macd.macd > macd.signal) {
      const diff = (macd.macd - macd.signal) / (Math.abs(macd.signal) || 1);
      const strength = Math.min(1, Math.abs(diff) * 50 + macd.histogram * 10);

      signals.push({
        id: this.generateSignalId(SignalType.MACD_BULLISH_CROSS, coin, timeframe),
        type: SignalType.MACD_BULLISH_CROSS,
        direction: SignalDirection.BULLISH,
        coin,
        timeframe,
        strength,
        timestamp,
        indicators: { macd: macd.macd, macdSignal: macd.signal, macdHistogram: macd.histogram },
      });
    }
    // MACD死叉
    else if (macd.macd < macd.signal) {
      const diff = (macd.signal - macd.macd) / (Math.abs(macd.signal) || 1);
      const strength = Math.min(1, Math.abs(diff) * 50 + Math.abs(macd.histogram) * 10);

      signals.push({
        id: this.generateSignalId(SignalType.MACD_BEARISH_CROSS, coin, timeframe),
        type: SignalType.MACD_BEARISH_CROSS,
        direction: SignalDirection.BEARISH,
        coin,
        timeframe,
        strength,
        timestamp,
        indicators: { macd: macd.macd, macdSignal: macd.signal, macdHistogram: macd.histogram },
      });
    }

    return signals;
  }

  /**
   * 生成布林带信号
   */
  private generateBollingerSignals(
    coin: string,
    indicators: TechnicalIndicators,
    price: number,
    timeframe: KLineInterval,
    timestamp: number
  ): TechnicalSignal[] {
    const signals: TechnicalSignal[] = [];
    const { bollinger } = indicators;

    // 触及下轨
    if (price <= bollinger.lower * 1.005) { // 允许0.5%误差
      const distance = (bollinger.lower - price) / bollinger.lower;
      const strength = Math.min(1, Math.abs(distance) * 100 + 0.5);

      signals.push({
        id: this.generateSignalId(SignalType.BB_LOWER_TOUCH, coin, timeframe),
        type: SignalType.BB_LOWER_TOUCH,
        direction: SignalDirection.BULLISH,
        coin,
        timeframe,
        strength,
        timestamp,
        price,
        indicators: {
          bbUpper: bollinger.upper,
          bbMiddle: bollinger.middle,
          bbLower: bollinger.lower,
        },
      });
    }
    // 触及上轨
    else if (price >= bollinger.upper * 0.995) {
      const distance = (price - bollinger.upper) / bollinger.upper;
      const strength = Math.min(1, Math.abs(distance) * 100 + 0.5);

      signals.push({
        id: this.generateSignalId(SignalType.BB_UPPER_TOUCH, coin, timeframe),
        type: SignalType.BB_UPPER_TOUCH,
        direction: SignalDirection.BEARISH,
        coin,
        timeframe,
        strength,
        timestamp,
        price,
        indicators: {
          bbUpper: bollinger.upper,
          bbMiddle: bollinger.middle,
          bbLower: bollinger.lower,
        },
      });
    }

    // 突破上轨
    if (price > bollinger.upper) {
      const breakout = (price - bollinger.upper) / bollinger.upper;
      const strength = Math.min(1, breakout * 50 + 0.6);

      signals.push({
        id: this.generateSignalId(SignalType.BB_BREAKOUT_UP, coin, timeframe),
        type: SignalType.BB_BREAKOUT_UP,
        direction: SignalDirection.BULLISH,
        coin,
        timeframe,
        strength,
        timestamp,
        price,
        indicators: {
          bbUpper: bollinger.upper,
          bbMiddle: bollinger.middle,
          bbLower: bollinger.lower,
        },
      });
    }
    // 跌破下轨
    else if (price < bollinger.lower) {
      const breakdown = (bollinger.lower - price) / bollinger.lower;
      const strength = Math.min(1, breakdown * 50 + 0.6);

      signals.push({
        id: this.generateSignalId(SignalType.BB_BREAKOUT_DOWN, coin, timeframe),
        type: SignalType.BB_BREAKOUT_DOWN,
        direction: SignalDirection.BEARISH,
        coin,
        timeframe,
        strength,
        timestamp,
        price,
        indicators: {
          bbUpper: bollinger.upper,
          bbMiddle: bollinger.middle,
          bbLower: bollinger.lower,
        },
      });
    }

    return signals;
  }

  /**
   * 生成成交量信号
   */
  private generateVolumeSignals(
    coin: string,
    volume: number,
    volumeMA: number,
    timeframe: KLineInterval,
    timestamp: number
  ): TechnicalSignal[] {
    const signals: TechnicalSignal[] = [];

    // 成交量激增（超过均值2倍）
    if (volume > volumeMA * 2) {
      const ratio = volume / volumeMA;
      const strength = Math.min(1, (ratio - 2) / 3);

      signals.push({
        id: this.generateSignalId(SignalType.VOLUME_SPIKE, coin, timeframe),
        type: SignalType.VOLUME_SPIKE,
        direction: SignalDirection.NEUTRAL,
        coin,
        timeframe,
        strength,
        timestamp,
        indicators: { volume, volumeMA },
      });
    }

    return signals;
  }

  /**
   * 生成信号ID
   */
  private generateSignalId(type: SignalType, coin: string, timeframe: KLineInterval): string {
    // 使用计数器确保唯一性，防止同一毫秒内生成多个信号导致ID冲突
    this.signalCounter++;
    return `${type}_${coin}_${timeframe}_${Date.now()}_${this.signalCounter}`;
  }

  /**
   * 获取所有信号类型
   */
  private getAllSignalTypes(): SignalType[] {
    return [
      SignalType.MA_7_25_CROSSOVER,
      SignalType.MA_7_25_CROSSUNDER,
      SignalType.MA_25_99_CROSSOVER,
      SignalType.MA_25_99_CROSSUNDER,
      SignalType.RSI_OVERSOLD,
      SignalType.RSI_OVERBOUGHT,
      SignalType.RSI_NEUTRAL_CROSS_UP,
      SignalType.RSI_NEUTRAL_CROSS_DOWN,
      SignalType.MACD_BULLISH_CROSS,
      SignalType.MACD_BEARISH_CROSS,
      SignalType.BB_LOWER_TOUCH,
      SignalType.BB_UPPER_TOUCH,
      SignalType.BB_BREAKOUT_UP,
      SignalType.BB_BREAKOUT_DOWN,
      SignalType.VOLUME_SPIKE,
    ];
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<SignalGeneratorConfig>): void {
    this.config = { ...this.config, ...config };
    logger.info('信号生成器配置已更新', this.config);
  }

  /**
   * 获取配置
   */
  getConfig(): Readonly<Required<SignalGeneratorConfig>> {
    return { ...this.config };
  }
}
