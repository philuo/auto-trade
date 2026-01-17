/**
 * 高级信号生成器
 *
 * 实现事件驱动、趋势过滤、多重确认的先进算法
 * 特点：
 * 1. 事件检测而非状态检测（只在真正的穿越/突破时产生信号）
 * 2. ADX趋势强度过滤（只在有趋势时产生趋势信号）
 * 3. 价格确认机制（过滤假突破）
 * 4. 多重确认（趋势+动量+成交量）
 * 5. 市场状态自适应（不同市场状态使用不同策略）
 *
 * 安全性：
 * - 输入数据验证
 * - 边界条件检查
 * - 防止除零错误
 * - 异常情况处理
 */

import { logger } from '../utils/logger;
import { AdvancedIndicatorCalculator } from '../indicators/advanced-indicators;
import { SignalType, SignalDirection } from '../market/types;
import type { KLineInterval, TechnicalSignal, CandleData } from '../market/types;
import type { AdvancedIndicators } from '../indicators/advanced-indicators;

/**
 * 信号生成器配置
 */
export interface AdvancedSignalGeneratorConfig {
  /** 最小信号强度 (0-1) */
  minStrength?: number;
  /** 是否启用ADX趋势过滤 */
  enableADXFilter?: boolean;
  /** 最小ADX值（趋势强度阈值，0-100） */
  minADX?: number;
  /** 是否启用价格确认 */
  enablePriceConfirmation?: number;  // 确认K线数量 (1-5)
  /** 是否启用成交量确认 */
  enableVolumeConfirmation?: boolean;
  /** 是否启用多时间框架确认 */
  enableMultiTimeframeConfirmation?: boolean;
  /** 最大信号数量（防止信号爆炸） */
  maxSignals?: number;
  /** 是否启用安全模式（更严格的验证） */
  enableSafeMode?: boolean;
}

/**
 * 历史状态（用于事件检测）
 */
export interface HistoryState {
  /** 上一次的MA值 */
  ma7?: number;
  ma25?: number;
  ma99?: number;
  /** 上一次的MACD值 */
  macd?: number;
  macdSignal?: number;
  /** 上一次的RSI值 */
  rsi?: number;
  /** 上一次的价格 */
  price?: number;
  /** 上一次的布林带值 */
  bbUpper?: number;
  bbLower?: number;
}

/**
 * 高级信号生成器
 */
export class AdvancedSignalGenerator {
  private config: Required<AdvancedSignalGeneratorConfig>;
  private calculator: AdvancedIndicatorCalculator;
  // 存储每个币种的历史状态
  private historyStates = new Map<string, HistoryState>();
  // 信号统计（用于监控信号质量）
  private signalStats = new Map<string, { generated: number; filtered: number }>();
  // 信号计数器（用于生成唯一ID）
  private signalCounter = 0;

  constructor(config: AdvancedSignalGeneratorConfig = {}) {
    // 验证配置参数
    const validatedConfig = this.validateConfig(config);
    this.config = {
      minStrength: validatedConfig.minStrength ?? 0.5,
      enableADXFilter: validatedConfig.enableADXFilter ?? true,
      minADX: validatedConfig.minADX ?? 25,
      enablePriceConfirmation: validatedConfig.enablePriceConfirmation ?? 2,
      enableVolumeConfirmation: validatedConfig.enableVolumeConfirmation ?? true,
      enableMultiTimeframeConfirmation: validatedConfig.enableMultiTimeframeConfirmation ?? true,
      maxSignals: validatedConfig.maxSignals ?? 10,
      enableSafeMode: validatedConfig.enableSafeMode ?? true,
    };
    this.calculator = new AdvancedIndicatorCalculator();
    logger.info('高级信号生成器初始化', this.config);
  }

  /**
   * 验证配置参数
   */
  private validateConfig(config: AdvancedSignalGeneratorConfig): AdvancedSignalGeneratorConfig {
    const validated: AdvancedSignalGeneratorConfig = { ...config };

    // 验证 minStrength (0-1)
    if (validated.minStrength !== undefined) {
      if (validated.minStrength < 0 || validated.minStrength > 1) {
        logger.warn('minStrength 超出范围 [0,1]，已调整为有效值', { minStrength: validated.minStrength });
        validated.minStrength = Math.max(0, Math.min(1, validated.minStrength));
      }
    }

    // 验证 minADX (0-100)
    if (validated.minADX !== undefined) {
      if (validated.minADX < 0 || validated.minADX > 100) {
        logger.warn('minADX 超出范围 [0,100]，已调整为有效值', { minADX: validated.minADX });
        validated.minADX = Math.max(0, Math.min(100, validated.minADX));
      }
    }

    // 验证 enablePriceConfirmation (1-5)
    if (validated.enablePriceConfirmation !== undefined) {
      if (validated.enablePriceConfirmation < 1 || validated.enablePriceConfirmation > 5) {
        logger.warn('enablePriceConfirmation 超出范围 [1,5]，已调整为有效值', { enablePriceConfirmation: validated.enablePriceConfirmation });
        validated.enablePriceConfirmation = Math.max(1, Math.min(5, validated.enablePriceConfirmation));
      }
    }

    // 验证 maxSignals
    if (validated.maxSignals !== undefined) {
      if (validated.maxSignals < 1 || validated.maxSignals > 50) {
        logger.warn('maxSignals 超出范围 [1,50]，已调整为有效值', { maxSignals: validated.maxSignals });
        validated.maxSignals = Math.max(1, Math.min(50, validated.maxSignals));
      }
    }

    return validated;
  }

  /**
   * 生成所有信号（事件驱动，带输入验证）
   */
  generateSignals(
    coin: string,
    klines: CandleData[],
    volume: number,
    volumeMA: number,
    timeframe: KLineInterval
  ): TechnicalSignal[] {
    // ========== 输入验证 ==========
    if (this.config.enableSafeMode) {
      // 验证币种
      if (!coin || typeof coin !== 'string' || coin.trim().length === 0) {
        logger.error('信号生成失败: 币种无效', { coin });
        return [];
      }

      // 验证 K线数据
      if (!Array.isArray(klines) || klines.length < 99) {
        logger.warn('信号生成失败: K线数据不足', { coin, klinesLength: klines?.length });
        return [];
      }

      // 验证每个 K线数据
      for (let i = 0; i < klines.length; i++) {
        const k = klines[i];
        if (
          !k ||
          typeof k.close !== 'number' || k.close <= 0 ||
          typeof k.volume !== 'number' || k.volume < 0 ||
          typeof k.timestamp !== 'number' || k.timestamp <= 0
        ) {
          logger.error('K线数据无效', { coin, index: i, data: k });
          return [];
        }
      }

      // 验证成交量
      if (typeof volume !== 'number' || volume < 0 || !Number.isFinite(volume)) {
        logger.warn('成交量数据无效', { coin, volume });
        volume = 0;
      }

      // 验证成交量均值
      if (typeof volumeMA !== 'number' || volumeMA <= 0 || !Number.isFinite(volumeMA)) {
        logger.warn('成交量均值无效', { coin, volumeMA });
        volumeMA = volume || 1; // 防止除零
      }

      // 验证时间周期
      const validTimeframes: KLineInterval[] = ['1m', '3m', '5m', '15m', '30m', '1H', '2H', '4H', '6H', '12H', '1D', '1W', '1M'];
      if (!validTimeframes.includes(timeframe)) {
        logger.warn('时间周期无效', { coin, timeframe });
        return [];
      }
    }

    const signals: TechnicalSignal[] = [];
    const timestamp = Date.now();

    try {
      // 计算所有指标
      const indicators = this.calculator.calculateAllExtended(klines);

      // 验证指标计算结果
      if (!indicators || !indicators.ma || !indicators.rsi || !indicators.macd || !indicators.bollinger) {
        logger.error('指标计算失败', { coin, timeframe });
        return [];
      }

      const currentPrice = klines[klines.length - 1].close;

      // 获取历史状态
      const prevState = this.historyStates.get(`${coin}_${timeframe}`) || {};
      const currState: HistoryState = {
        ma7: indicators.ma.ma7,
        ma25: indicators.ma.ma25,
        ma99: indicators.ma.ma99,
        macd: indicators.macd.macd,
        macdSignal: indicators.macd.signal,
        rsi: indicators.rsi,
        price: currentPrice,
        bbUpper: indicators.bollinger.upper,
        bbLower: indicators.bollinger.lower,
      };

      // 1. 判断市场状态
      const marketState = this.calculator.classifyMarket(klines);

      // 2. 如果没有趋势，不生成趋势信号（除了反转信号）
      const shouldGenerateTrendSignals =
        !this.config.enableADXFilter ||
        !indicators.adx ||
        indicators.adx >= this.config.minADX;

      // 3. MA交叉信号（事件检测）
      if (shouldGenerateTrendSignals) {
        signals.push(...this.detectMACrossover(coin, indicators, prevState, currState, timeframe, timestamp));
      }

      // 4. RSI信号（反转信号，不依赖ADX）
      signals.push(...this.generateRSISignals(coin, indicators, prevState, currState, marketState, timeframe, timestamp));

      // 5. MACD信号（事件检测）
      if (shouldGenerateTrendSignals) {
        signals.push(...this.detectMACDCross(coin, indicators, prevState, currState, timeframe, timestamp));
      }

      // 6. 布林带信号（带价格确认）
      signals.push(...this.generateBollingerSignals(coin, indicators, klines, prevState, currState, marketState, timeframe, timestamp, volume, volumeMA));

      // 7. 成交量信号
      signals.push(...this.generateVolumeSignals(coin, volume, volumeMA, timeframe, timestamp));

      // 8. 更新历史状态
      this.historyStates.set(`${coin}_${timeframe}`, currState);

      // 9. 过滤低强度信号并限制数量
      let filtered = signals.filter(s => s.strength >= this.config.minStrength);

      // 防止信号爆炸：按强度排序并限制数量
      if (filtered.length > this.config.maxSignals) {
        filtered = filtered
          .sort((a, b) => b.strength - a.strength)
          .slice(0, this.config.maxSignals);
        logger.warn('信号数量超过限制，已按强度截取', {
          coin,
          timeframe,
          originalCount: signals.length,
          filteredCount: filtered.length,
          maxSignals: this.config.maxSignals,
        });
      }

      // 更新统计
      const key = `${coin}_${timeframe}`;
      const stats = this.signalStats.get(key) || { generated: 0, filtered: 0 };
      stats.generated += signals.length;
      stats.filtered += filtered.length;
      this.signalStats.set(key, stats);

      logger.debug('生成高级信号', {
        coin,
        timeframe,
        marketState,
        generated: signals.length,
        filtered: filtered.length,
        stats,
      });

      return filtered;

    } catch (error) {
      logger.error('信号生成异常', {
        coin,
        timeframe,
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }

  /**
   * 检测MA交叉事件（真正的金叉/死叉）
   */
  private detectMACrossover(
    coin: string,
    indicators: AdvancedIndicators,
    prev: HistoryState,
    curr: HistoryState,
    timeframe: KLineInterval,
    timestamp: number
  ): TechnicalSignal[] {
    const signals: TechnicalSignal[] = [];

    // MA7/MA25 金叉：从下方穿越到上方
    if (
      prev.ma7 !== undefined && prev.ma25 !== undefined &&
      prev.ma7 <= prev.ma25 &&
      curr.ma7 > curr.ma25
    ) {
      const diff = (curr.ma7 - curr.ma25) / curr.ma25;
      const strength = Math.min(1, Math.abs(diff) * 100);

      signals.push({
        id: this.generateSignalId(SignalType.MA_7_25_CROSSOVER, coin, timeframe),
        type: SignalType.MA_7_25_CROSSOVER,
        direction: SignalDirection.BULLISH,
        coin,
        timeframe,
        strength: strength * 1.2, // 事件信号加权
        timestamp,
        price: curr.price,
        indicators: { ma7: curr.ma7, ma25: curr.ma25, ma99: curr.ma99 },
      });
    }

    // MA7/MA25 死叉：从上方穿越到下方
    if (
      prev.ma7 !== undefined && prev.ma25 !== undefined &&
      prev.ma7 >= prev.ma25 &&
      curr.ma7 < curr.ma25
    ) {
      const diff = (curr.ma25 - curr.ma7) / curr.ma25;
      const strength = Math.min(1, Math.abs(diff) * 100);

      signals.push({
        id: this.generateSignalId(SignalType.MA_7_25_CROSSUNDER, coin, timeframe),
        type: SignalType.MA_7_25_CROSSUNDER,
        direction: SignalDirection.BEARISH,
        coin,
        timeframe,
        strength: strength * 1.2,
        timestamp,
        price: curr.price,
        indicators: { ma7: curr.ma7, ma25: curr.ma25, ma99: curr.ma99 },
      });
    }

    // MA25/MA99 金叉（长期趋势反转）
    if (
      prev.ma25 !== undefined && prev.ma99 !== undefined &&
      prev.ma25 <= prev.ma99 &&
      curr.ma25 > curr.ma99
    ) {
      const diff = (curr.ma25 - curr.ma99) / curr.ma99;
      const strength = Math.min(1, Math.abs(diff) * 80);

      signals.push({
        id: this.generateSignalId(SignalType.MA_25_99_CROSSOVER, coin, timeframe),
        type: SignalType.MA_25_99_CROSSOVER,
        direction: SignalDirection.BULLISH,
        coin,
        timeframe,
        strength: strength * 1.3, // 长期信号加权更高
        timestamp,
        price: curr.price,
        indicators: { ma7: curr.ma7, ma25: curr.ma25, ma99: curr.ma99 },
      });
    }

    // MA25/MA99 死叉
    if (
      prev.ma25 !== undefined && prev.ma99 !== undefined &&
      prev.ma25 >= prev.ma99 &&
      curr.ma25 < curr.ma99
    ) {
      const diff = (curr.ma99 - curr.ma25) / curr.ma99;
      const strength = Math.min(1, Math.abs(diff) * 80);

      signals.push({
        id: this.generateSignalId(SignalType.MA_25_99_CROSSUNDER, coin, timeframe),
        type: SignalType.MA_25_99_CROSSUNDER,
        direction: SignalDirection.BEARISH,
        coin,
        timeframe,
        strength: strength * 1.3,
        timestamp,
        price: curr.price,
        indicators: { ma7: curr.ma7, ma25: curr.ma25, ma99: curr.ma99 },
      });
    }

    return signals;
  }

  /**
   * 检测MACD交叉事件
   */
  private detectMACDCross(
    coin: string,
    indicators: AdvancedIndicators,
    prev: HistoryState,
    curr: HistoryState,
    timeframe: KLineInterval,
    timestamp: number
  ): TechnicalSignal[] {
    const signals: TechnicalSignal[] = [];

    // MACD金叉
    if (
      prev.macd !== undefined && prev.macdSignal !== undefined &&
      prev.macd <= prev.macdSignal &&
      curr.macd > curr.macdSignal
    ) {
      const diff = (curr.macd - curr.macdSignal) / (Math.abs(curr.macdSignal) || 1);
      const strength = Math.min(1, Math.abs(diff) * 50 + indicators.macd.histogram * 10);

      signals.push({
        id: this.generateSignalId(SignalType.MACD_BULLISH_CROSS, coin, timeframe),
        type: SignalType.MACD_BULLISH_CROSS,
        direction: SignalDirection.BULLISH,
        coin,
        timeframe,
        strength: strength * 1.1,
        timestamp,
        price: curr.price,
        indicators: {
          macd: curr.macd,
          macdSignal: curr.macdSignal,
          macdHistogram: indicators.macd.histogram,
        },
      });
    }

    // MACD死叉
    if (
      prev.macd !== undefined && prev.macdSignal !== undefined &&
      prev.macd >= prev.macdSignal &&
      curr.macd < curr.macdSignal
    ) {
      const diff = (curr.macdSignal - curr.macd) / (Math.abs(curr.macdSignal) || 1);
      const strength = Math.min(1, Math.abs(diff) * 50 + Math.abs(indicators.macd.histogram) * 10);

      signals.push({
        id: this.generateSignalId(SignalType.MACD_BEARISH_CROSS, coin, timeframe),
        type: SignalType.MACD_BEARISH_CROSS,
        direction: SignalDirection.BEARISH,
        coin,
        timeframe,
        strength: strength * 1.1,
        timestamp,
        price: curr.price,
        indicators: {
          macd: curr.macd,
          macdSignal: curr.macdSignal,
          macdHistogram: indicators.macd.histogram,
        },
      });
    }

    return signals;
  }

  /**
   * 生成RSI信号（带市场状态自适应）
   */
  private generateRSISignals(
    coin: string,
    indicators: AdvancedIndicators,
    prev: HistoryState,
    curr: HistoryState,
    marketState: ReturnType<AdvancedIndicatorCalculator['classifyMarket']>,
    timeframe: KLineInterval,
    timestamp: number
  ): TechnicalSignal[] {
    const signals: TechnicalSignal[] = [];
    const { rsi } = indicators;

    // 根据市场状态调整RSI阈值
    let oversoldThreshold = 30;
    let overboughtThreshold = 70;

    if (marketState.trend === 'strong_uptrend' || marketState.trend === 'uptrend') {
      // 上升趋势中，RSI超买阈值可以更高
      overboughtThreshold = 75;
    } else if (marketState.trend === 'strong_downtrend' || marketState.trend === 'downtrend') {
      // 下降趋势中，RSI超卖阈值可以更低
      oversoldThreshold = 25;
    }

    // RSI超卖（在支撑位附近买入）
    if (rsi < oversoldThreshold) {
      // 只在RSI从更低位回升时产生信号（确认底部）
      if (prev.rsi === undefined || prev.rsi >= rsi || rsi < 20) {
        const strength = Math.min(1, (oversoldThreshold - rsi) / 20);

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
    }

    // RSI超买
    if (rsi > overboughtThreshold) {
      if (prev.rsi === undefined || prev.rsi <= rsi || rsi > 80) {
        const strength = Math.min(1, (rsi - overboughtThreshold) / 20);

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
    }

    // RSI中性穿越（50轴）
    if (prev.rsi !== undefined) {
      if (prev.rsi <= 50 && curr.rsi > 50) {
        const strength = Math.min(1, (curr.rsi - 50) / 10);

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
      } else if (prev.rsi >= 50 && curr.rsi < 50) {
        const strength = Math.min(1, (50 - curr.rsi) / 10);

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
    }

    return signals;
  }

  /**
   * 生成布林带信号（带价格确认）
   */
  private generateBollingerSignals(
    coin: string,
    indicators: AdvancedIndicators,
    klines: CandleData[],
    prev: HistoryState,
    curr: HistoryState,
    marketState: ReturnType<AdvancedIndicatorCalculator['classifyMarket']>,
    timeframe: KLineInterval,
    timestamp: number,
    volume: number,
    volumeMA: number
  ): TechnicalSignal[] {
    const signals: TechnicalSignal[] = [];
    const { bollinger } = indicators;
    const price = curr.price!;

    // 触及下轨（需要价格确认）
    if (price <= bollinger.lower * 1.005) {
      // 检查最近几根K线是否持续在下轨附近（假突破过滤）
      const recentKlines = klines.slice(-this.config.enablePriceConfirmation);
      const touches = recentKlines.filter(k => k.close <= bollinger.lower * 1.01).length;

      // 至少需要多根K线确认
      if (touches >= Math.min(2, this.config.enablePriceConfirmation)) {
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
    }

    // 触及上轨
    if (price >= bollinger.upper * 0.995) {
      const recentKlines = klines.slice(-this.config.enablePriceConfirmation);
      const touches = recentKlines.filter(k => k.close >= bollinger.upper * 0.99).length;

      if (touches >= Math.min(2, this.config.enablePriceConfirmation)) {
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
    }

    // 突破信号（需要更强的确认）
    if (price > bollinger.upper) {
      // 检查是否有成交量配合：成交量应该高于平均值
      const volumeOK = !this.config.enableVolumeConfirmation || (volume > volumeMA * 1.2);

      if (volumeOK) {
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
    }

    if (price < bollinger.lower) {
      // 检查是否有成交量配合：成交量应该高于平均值
      const volumeOK = !this.config.enableVolumeConfirmation || (volume > volumeMA * 1.2);

      if (volumeOK) {
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

  private generateSignalId(type: SignalType, coin: string, timeframe: KLineInterval): string {
    // 使用计数器确保唯一性，防止同一毫秒内生成多个信号导致ID冲突
    this.signalCounter++;
    return `${type}_${coin}_${timeframe}_${Date.now()}_${this.signalCounter}`;
  }

  /**
   * 获取配置
   */
  getConfig(): Readonly<AdvancedSignalGeneratorConfig> {
    return { ...this.config };
  }
}
