/**
 * 价格区间计算器
 *
 * 功能：
 * - 计算动态价格区间（基于波动率、支撑位、阻力位）
 * - 识别支撑位和阻力位
 * - 验证价格区间合理性
 * - 提供区间调整建议
 */

import type { AllowedCoin } from '../config/strategy-config';
import type { Candle, PriceRange, MarketData } from '../config/types';
import { VolatilityCalculator, type VolatilityResult } from '../multi-coin/volatility-calculator';

// =====================================================
// 区间计算配置
// =====================================================

export interface RangeCalculatorConfig {
  // 基于波动率的区间宽度
  volatilityMultiplier: {
    low: number;      // 低波动率时的倍数 (1x)
    medium: number;   // 中波动率时的倍数 (2.0x)
    high: number;     // 高波动率时的倍数 (3.0x)
  };

  // 支撑/阻力位检测
  supportResistance: {
    enabled: boolean;
    lookbackPeriod: number;       // 回看周期（蜡烛数）
    minTouches: number;           // 最少触碰次数
    tolerance: number;            // 容忍度（%）
  };

  // 区间验证
  validation: {
    minWidth: number;             // 最小区间宽度（%）
    maxWidth: number;             // 最大区间宽度（%）
    minUpperDistance: number;     // 上限距离当前价格最小距离（%）
    minLowerDistance: number;     // 下限距离当前价格最小距离（%）
  };

  // 安全边界
  safetyMargin: {
    enabled: boolean;
    upperMargin: number;          // 上限安全边界（%）
    lowerMargin: number;          // 下限安全边界（%）
  };
}

// =====================================================
// 支撑/阻力位
// =====================================================

export interface SupportResistanceLevel {
  price: number;
  type: 'support' | 'resistance';
  strength: number;               // 强度 (0-1)
  touches: number;                // 触碰次数
  lastTouchTimestamp: number;
  age: number;                    // 距今时间（毫秒）
}

// =====================================================
// 区间计算结果
// =====================================================

export interface RangeCalculationResult {
  // 推荐区间
  recommendedRange: PriceRange;

  // 备选区间
  alternativeRanges: PriceRange[];

  // 支撑/阻力位
  supportLevels: SupportResistanceLevel[];
  resistanceLevels: SupportResistanceLevel[];

  // 波动率分析
  volatilityAnalysis: VolatilityResult;

  // 区间合理性
  validity: {
    isValid: boolean;
    reasons: string[];
  };

  // 元数据
  metadata: {
    calculatedAt: number;
    currentPrice: number;
    method: string;
    confidence: number;
  };
}

// =====================================================
// 区间建议
// =====================================================

export interface RangeAdjustmentSuggestion {
  action: 'expand_up' | 'expand_down' | 'expand_both' | 'shrink' | 'shift_up' | 'shift_down' | 'no_change';
  reason: string;
  newRange?: PriceRange;
  urgency: 'low' | 'medium' | 'high';
}

// =====================================================
// 价格区间计算器类
// =====================================================

export class RangeCalculator {
  private config: RangeCalculatorConfig;
  private volatilityCalculator: VolatilityCalculator;
  private cache: Map<string, { result: RangeCalculationResult; timestamp: number }> = new Map();
  private cacheTTL: number = 10 * 60 * 1000; // 缓存 10 分钟

  constructor(config?: Partial<RangeCalculatorConfig>, volatilityCalculator?: VolatilityCalculator) {
    this.config = {
      volatilityMultiplier: {
        low: 1.0,
        medium: 2.0,
        high: 3.0
      },
      supportResistance: {
        enabled: true,
        lookbackPeriod: 100,
        minTouches: 2,
        tolerance: 1.0
      },
      validation: {
        minWidth: 5,
        maxWidth: 50,
        minUpperDistance: 3,
        minLowerDistance: 3
      },
      safetyMargin: {
        enabled: true,
        upperMargin: 2,
        lowerMargin: 2
      },
      ...config
    };

    this.volatilityCalculator = volatilityCalculator || new VolatilityCalculator();
  }

  /**
   * 计算价格区间
   */
  async calculateRange(
    coin: AllowedCoin,
    candles: Candle[],
    currentPrice: number
  ): Promise<RangeCalculationResult> {
    // 检查缓存
    const cacheKey = `${coin}_${currentPrice}_${candles.length}`;
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      return cached.result;
    }

    // 计算波动率
    const volatilityAnalysis = await this.volatilityCalculator.calculateVolatility(coin, candles);

    // 计算基础区间（基于波动率）
    const baseRange = this.calculateVolatilityBasedRange(currentPrice, volatilityAnalysis);

    // 查找支撑/阻力位
    const { supportLevels, resistanceLevels } = this.findSupportResistanceLevels(candles, currentPrice);

    // 调整区间以匹配支撑/阻力位
    const adjustedRange = this.adjustRangeToLevels(baseRange, supportLevels, resistanceLevels, currentPrice);

    // 应用安全边界
    const finalRange = this.applySafetyMargin(adjustedRange);

    // 验证区间
    const validity = this.validateRange(finalRange, currentPrice);

    // 生成备选区间
    const alternativeRanges = this.generateAlternativeRanges(currentPrice, volatilityAnalysis, supportLevels, resistanceLevels);

    const result: RangeCalculationResult = {
      recommendedRange: finalRange,
      alternativeRanges,
      supportLevels,
      resistanceLevels,
      volatilityAnalysis,
      validity,
      metadata: {
        calculatedAt: Date.now(),
        currentPrice,
        method: 'volatility_based_with_support_resistance',
        confidence: this.calculateConfidence(volatilityAnalysis, supportLevels, resistanceLevels)
      }
    };

    // 缓存结果
    this.cache.set(cacheKey, { result, timestamp: Date.now() });

    return result;
  }

  /**
   * 基于波动率计算区间
   */
  private calculateVolatilityBasedRange(
    currentPrice: number,
    volatilityAnalysis: VolatilityResult
  ): PriceRange {
    const avgVol = volatilityAnalysis.current.average;

    // 根据波动率分类选择倍数
    let multiplier: number;
    switch (volatilityAnalysis.classification) {
      case 'low':
        multiplier = this.config.volatilityMultiplier.low;
        break;
      case 'medium':
        multiplier = this.config.volatilityMultiplier.medium;
        break;
      case 'high':
        multiplier = this.config.volatilityMultiplier.high;
        break;
    }

    // 计算区间宽度（百分比）
    const rangeWidth = avgVol * multiplier;

    // 计算上下限
    const upper = currentPrice * (1 + rangeWidth / 100 / 2);
    const lower = currentPrice * (1 - rangeWidth / 100 / 2);

    return {
      upper,
      lower,
      current: currentPrice,
      width: rangeWidth,
      volatility: avgVol,
      confidence: volatilityAnalysis.confidence,
      lastUpdated: Date.now()
    };
  }

  /**
   * 查找支撑/阻力位
   */
  private findSupportResistanceLevels(
    candles: Candle[],
    currentPrice: number
  ): { supportLevels: SupportResistanceLevel[]; resistanceLevels: SupportResistanceLevel[] } {
    if (!this.config.supportResistance.enabled || candles.length < this.config.supportResistance.lookbackPeriod) {
      return { supportLevels: [], resistanceLevels: [] };
    }

    const lookback = candles.slice(-this.config.supportResistance.lookbackPeriod);
    const tolerance = this.config.supportResistance.tolerance / 100;

    // 统计价格水平
    const priceLevels = new Map<number, { count: number; type: 'high' | 'low'; timestamps: number[] }>();

    for (const candle of lookback) {
      if (!candle) continue;

      // 记录高点作为潜在阻力位
      const roundedHigh = this.roundToSignificant(candle.high, tolerance);
      if (!priceLevels.has(roundedHigh)) {
        priceLevels.set(roundedHigh, { count: 0, type: 'high', timestamps: [] });
      }
      const level = priceLevels.get(roundedHigh);
      if (level) {
        level.count++;
        level.timestamps.push(candle.timestamp);
      }

      // 记录低点作为潜在支撑位
      const roundedLow = this.roundToSignificant(candle.low, tolerance);
      if (!priceLevels.has(roundedLow)) {
        priceLevels.set(roundedLow, { count: 0, type: 'low', timestamps: [] });
      }
      const levelLow = priceLevels.get(roundedLow);
      if (levelLow) {
        levelLow.count++;
        levelLow.timestamps.push(candle.timestamp);
      }
    }

    // 筛选有效的支撑/阻力位
    const supportLevels: SupportResistanceLevel[] = [];
    const resistanceLevels: SupportResistanceLevel[] = [];

    const now = Date.now();

    for (const [price, data] of priceLevels) {
      if (data.count < this.config.supportResistance.minTouches || data.timestamps.length === 0) {
        continue;
      }

      const level: SupportResistanceLevel = {
        price,
        type: data.type === 'low' ? 'support' : 'resistance',
        strength: Math.min(data.count / 10, 1), // 最大强度为 1
        touches: data.count,
        lastTouchTimestamp: data.timestamps[data.timestamps.length - 1] ?? now,
        age: now - (data.timestamps[0] ?? now)
      };

      // 根据当前价格分类
      if (price < currentPrice) {
        supportLevels.push(level);
      } else if (price > currentPrice) {
        resistanceLevels.push(level);
      }
    }

    // 按强度和距离排序
    supportLevels.sort((a, b) => {
      const strengthScore = b.strength - a.strength;
      if (strengthScore !== 0) return strengthScore;
      return a.price - b.price; // 距离当前价格近的优先
    });

    resistanceLevels.sort((a, b) => {
      const strengthScore = b.strength - a.strength;
      if (strengthScore !== 0) return strengthScore;
      return b.price - a.price; // 距离当前价格近的优先
    });

    return {
      supportLevels: supportLevels.slice(0, 5), // 保留前 5 个
      resistanceLevels: resistanceLevels.slice(0, 5)
    };
  }

  /**
   * 调整区间以匹配支撑/阻力位
   */
  private adjustRangeToLevels(
    baseRange: PriceRange,
    supportLevels: SupportResistanceLevel[],
    resistanceLevels: SupportResistanceLevel[],
    currentPrice: number
  ): PriceRange {
    let upper = baseRange.upper;
    let lower = baseRange.lower;

    // 找到最接近的阻力位作为上限
    const nearbyResistance = resistanceLevels.find(
      r => r.price > currentPrice && r.price <= baseRange.upper * 1.1
    );
    if (nearbyResistance && nearbyResistance.strength > 0.3) {
      upper = nearbyResistance.price;
    }

    // 找到最接近的支撑位作为下限
    const nearbySupport = supportLevels.find(
      s => s.price < currentPrice && s.price >= baseRange.lower * 0.9
    );
    if (nearbySupport && nearbySupport.strength > 0.3) {
      lower = nearbySupport.price;
    }

    // 确保上下限不在当前价格的同一侧
    if (upper <= currentPrice) {
      upper = currentPrice * 1.05;
    }
    if (lower >= currentPrice) {
      lower = currentPrice * 0.95;
    }

    return {
      upper,
      lower,
      current: currentPrice,
      width: ((upper - lower) / currentPrice) * 100,
      volatility: baseRange.volatility,
      confidence: baseRange.confidence,
      lastUpdated: Date.now()
    };
  }

  /**
   * 应用安全边界
   */
  private applySafetyMargin(range: PriceRange): PriceRange {
    if (!this.config.safetyMargin.enabled) {
      return range;
    }

    const upperMargin = 1 + this.config.safetyMargin.upperMargin / 100;
    const lowerMargin = 1 - this.config.safetyMargin.lowerMargin / 100;

    return {
      ...range,
      upper: range.upper * upperMargin,
      lower: range.lower * lowerMargin
    };
  }

  /**
   * 验证区间
   */
  private validateRange(range: PriceRange, currentPrice: number): {
    isValid: boolean;
    reasons: string[];
  } {
    const reasons: string[] = [];
    let isValid = true;

    // 检查区间宽度
    if (range.width < this.config.validation.minWidth) {
      isValid = false;
      reasons.push(`区间宽度 ${range.width.toFixed(2)}% 小于最小值 ${this.config.validation.minWidth}%`);
    }

    if (range.width > this.config.validation.maxWidth) {
      isValid = false;
      reasons.push(`区间宽度 ${range.width.toFixed(2)}% 超过最大值 ${this.config.validation.maxWidth}%`);
    }

    // 检查上下限距离
    const upperDistance = ((range.upper - currentPrice) / currentPrice) * 100;
    const lowerDistance = ((currentPrice - range.lower) / currentPrice) * 100;

    if (upperDistance < this.config.validation.minUpperDistance) {
      isValid = false;
      reasons.push(`上限距离当前价格 ${upperDistance.toFixed(2)}% 小于最小值 ${this.config.validation.minUpperDistance}%`);
    }

    if (lowerDistance < this.config.validation.minLowerDistance) {
      isValid = false;
      reasons.push(`下限距离当前价格 ${lowerDistance.toFixed(2)}% 小于最小值 ${this.config.validation.minLowerDistance}%`);
    }

    return { isValid, reasons };
  }

  /**
   * 生成备选区间
   */
  private generateAlternativeRanges(
    currentPrice: number,
    volatilityAnalysis: VolatilityResult,
    supportLevels: SupportResistanceLevel[],
    resistanceLevels: SupportResistanceLevel[]
  ): PriceRange[] {
    const alternatives: PriceRange[] = [];

    // 1. 紧凑区间（基于短期波动率）
    const tightWidth = volatilityAnalysis.current.short * 1.2;
    alternatives.push({
      upper: currentPrice * (1 + tightWidth / 200),
      lower: currentPrice * (1 - tightWidth / 200),
      current: currentPrice,
      width: tightWidth,
      volatility: volatilityAnalysis.current.short,
      confidence: volatilityAnalysis.confidence * 0.8,
      lastUpdated: Date.now()
    });

    // 2. 宽松区间（基于长期波动率）
    const looseWidth = volatilityAnalysis.current.long * 1.5;
    alternatives.push({
      upper: currentPrice * (1 + looseWidth / 200),
      lower: currentPrice * (1 - looseWidth / 200),
      current: currentPrice,
      width: looseWidth,
      volatility: volatilityAnalysis.current.long,
      confidence: volatilityAnalysis.confidence * 0.7,
      lastUpdated: Date.now()
    });

    // 3. 基于强支撑/阻力的区间
    if (supportLevels.length > 0 && resistanceLevels.length > 0) {
      const strongSupport = supportLevels[0];
      const strongResistance = resistanceLevels[0];

      if (strongSupport && strongResistance &&
          strongSupport.strength > 0.5 && strongResistance.strength > 0.5) {
        const width = ((strongResistance.price - strongSupport.price) / currentPrice) * 100;
        alternatives.push({
          upper: strongResistance.price,
          lower: strongSupport.price,
          current: currentPrice,
          width,
          volatility: volatilityAnalysis.current.average,
          confidence: Math.max(strongSupport.strength, strongResistance.strength) * volatilityAnalysis.confidence,
          lastUpdated: Date.now()
        });
      }
    }

    return alternatives;
  }

  /**
   * 检查是否需要调整区间
   */
  async shouldAdjustRange(
    currentRange: PriceRange,
    currentPrice: number,
    candles: Candle[]
  ): Promise<RangeAdjustmentSuggestion> {
    const result = await this.calculateRange(
      'BTC' as AllowedCoin, // 这里应该是实际的币种
      candles,
      currentPrice
    );

    const recommended = result.recommendedRange;
    const reasons: string[] = [];

    // 检查价格是否接近边界
    const upperDistance = (currentRange.upper - currentPrice) / currentPrice * 100;
    const lowerDistance = (currentPrice - currentRange.lower) / currentPrice * 100;

    if (upperDistance < 2) {
      reasons.push(`价格接近上限（距离 ${upperDistance.toFixed(2)}%）`);
    }

    if (lowerDistance < 2) {
      reasons.push(`价格接近下限（距离 ${lowerDistance.toFixed(2)}%）`);
    }

    // 检查区间是否过时
    const rangeAge = Date.now() - currentRange.lastUpdated;
    if (rangeAge > 48 * 60 * 60 * 1000) { // 48 小时
      reasons.push(`区间已超过 48 小时未更新`);
    }

    // 检查波动率是否显著变化
    const volChange = Math.abs(result.volatilityAnalysis.current.average - currentRange.volatility);
    if (volChange > currentRange.volatility * 0.3) {
      reasons.push(`波动率变化超过 30%`);
    }

    if (reasons.length === 0) {
      return {
        action: 'no_change',
        reason: '当前区间仍然有效',
        urgency: 'low'
      };
    }

    // 确定调整动作
    let action: RangeAdjustmentSuggestion['action'] = 'no_change';
    let urgency: RangeAdjustmentSuggestion['urgency'] = 'low';

    if (upperDistance < 1 || lowerDistance < 1) {
      urgency = 'high';
      action = 'expand_both';
    } else if (upperDistance < 2) {
      urgency = 'medium';
      action = 'expand_up';
    } else if (lowerDistance < 2) {
      urgency = 'medium';
      action = 'expand_down';
    } else if (volChange > currentRange.volatility * 0.5) {
      urgency = 'high';
      action = 'expand_both';
    }

    return {
      action,
      reason: reasons.join('; '),
      newRange: recommended,
      urgency
    };
  }

  /**
   * 四舍五入到有效位数
   */
  private roundToSignificant(value: number, tolerance: number): number {
    const factor = 1 / tolerance;
    return Math.round(value * factor) / factor;
  }

  /**
   * 计算置信度
   */
  private calculateConfidence(
    volatilityAnalysis: VolatilityResult,
    supportLevels: SupportResistanceLevel[],
    resistanceLevels: SupportResistanceLevel[]
  ): number {
    let confidence = volatilityAnalysis.confidence;

    // 如果有强支撑/阻力位，提高置信度
    const hasStrongSupport = supportLevels.some(l => l.strength > 0.5);
    const hasStrongResistance = resistanceLevels.some(l => l.strength > 0.5);

    if (hasStrongSupport && hasStrongResistance) {
      confidence *= 1.2;
    } else if (hasStrongSupport || hasStrongResistance) {
      confidence *= 1.1;
    }

    return Math.min(confidence, 1);
  }

  /**
   * 清除缓存
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<RangeCalculatorConfig>): void {
    this.config = { ...this.config, ...config };
    this.clearCache();
  }

  /**
   * 获取配置
   */
  getConfig(): RangeCalculatorConfig {
    return { ...this.config };
  }

  /**
   * 生成报告
   */
  generateReport(result: RangeCalculationResult, coin: AllowedCoin): string {
    const validityText = result.validity.isValid
      ? '✓ 有效'
      : `✗ 无效: ${result.validity.reasons.join(', ')}`;

    return `
价格区间分析报告: ${coin}
========================
推荐区间:
  上限: ${result.recommendedRange.upper.toFixed(2)}
  下限: ${result.recommendedRange.lower.toFixed(2)}
  当前: ${result.recommendedRange.current.toFixed(2)}
  宽度: ${result.recommendedRange.width.toFixed(2)}%

波动率: ${result.volatilityAnalysis.current.average.toFixed(2)}%
分类: ${result.volatilityAnalysis.classification}
趋势: ${result.volatilityAnalysis.trend === 'rising' ? '上升 ↗' : result.volatilityAnalysis.trend === 'falling' ? '下降 ↘' : '稳定 →'}

区间有效性: ${validityText}
置信度: ${(result.metadata.confidence * 100).toFixed(1)}%

支撑位 (${result.supportLevels.length}):
${result.supportLevels.map(s => `  - ${s.price.toFixed(2)} (强度: ${(s.strength * 100).toFixed(0)}%, 触碰: ${s.touches})`).join('\n') || '  无'}

阻力位 (${result.resistanceLevels.length}):
${result.resistanceLevels.map(r => `  - ${r.price.toFixed(2)} (强度: ${(r.strength * 100).toFixed(0)}%, 触碰: ${r.touches})`).join('\n') || '  无'}

计算方法: ${result.metadata.method}
计算时间: ${new Date(result.metadata.calculatedAt).toLocaleString()}
    `.trim();
  }
}
