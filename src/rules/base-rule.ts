/**
 * 规则引擎基类
 *
 * 定义所有规则的通用接口和基础功能
 */

import { logger } from '../utils/logger;
import type {
  BaseRuleConfig,
  RuleEngineInput,
  RuleEngineOutput,
  RuleSignal,
  RuleType,
  PriceData,
} from './types;
import { SignalType, SignalStrength } from './types;

/**
 * 抽象规则基类
 * 所有具体规则类都应继承此类
 */
export abstract class BaseRule<TConfig extends BaseRuleConfig = BaseRuleConfig> {
  // 规则配置
  protected config: TConfig;
  // 规则类型
  protected readonly ruleType: RuleType;

  constructor(config: TConfig, ruleType: RuleType) {
    this.config = config;
    this.ruleType = ruleType;
  }

  // =====================================================
  // 抽象方法 - 子类必须实现
  // =====================================================

  /**
   * 生成信号
   * 子类必须实现此方法
   */
  abstract generateSignal(input: RuleEngineInput): RuleSignal | RuleSignal[] | null;

  // =====================================================
  // 公共方法
  // =====================================================

  /**
   * 检查规则是否启用
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * 获取规则优先级
   */
  getPriority(): number {
    return this.config.priority;
  }

  /**
   * 获取规则类型
   */
  getRuleType(): RuleType {
    return this.ruleType;
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<TConfig>): void {
    this.config = { ...this.config, ...config };
    logger.info(`规则配置已更新 [${this.ruleType}]`, {
      enabled: this.config.enabled,
      priority: this.config.priority,
    });
  }

  /**
   * 获取配置
   */
  getConfig(): Readonly<TConfig> {
    return { ...this.config };
  }

  // =====================================================
  // 保护方法 - 供子类使用
  // =====================================================

  /**
   * 获取币种价格数据
   */
  protected getPriceData(coin: string, prices: PriceData[]): PriceData | undefined {
    return prices.find(p => p.coin === coin);
  }

  /**
   * 检查交易金额是否在限制范围内
   */
  protected isValidTradeAmount(amount: number): boolean {
    const { maxTradeAmount, minTradeAmount } = this.config;

    if (minTradeAmount !== undefined && amount < minTradeAmount) {
      return false;
    }

    if (maxTradeAmount !== undefined && amount > maxTradeAmount) {
      return false;
    }

    return true;
  }

  /**
   * 创建买入信号
   */
  protected createBuySignal(params: {
    coin: string;
    reason: string;
    confidence: number;
    ruleScore: number;
    strength: SignalStrength;
    suggestedPrice?: number;
    suggestedAmount?: number;
  }): RuleSignal {
    return {
      ruleType: this.ruleType,
      signalType: SignalType.BUY,
      strength: params.strength,
      coin: params.coin,
      reason: params.reason,
      suggestedPrice: params.suggestedPrice,
      suggestedAmount: params.suggestedAmount,
      timestamp: Date.now(),
      ruleScore: params.ruleScore,
      confidence: Math.max(0, Math.min(1, params.confidence)),
    };
  }

  /**
   * 创建卖出信号
   */
  protected createSellSignal(params: {
    coin: string;
    reason: string;
    confidence: number;
    ruleScore: number;
    strength: SignalStrength;
    suggestedPrice?: number;
    suggestedAmount?: number;
  }): RuleSignal {
    return {
      ruleType: this.ruleType,
      signalType: SignalType.SELL,
      strength: params.strength,
      coin: params.coin,
      reason: params.reason,
      suggestedPrice: params.suggestedPrice,
      suggestedAmount: params.suggestedAmount,
      timestamp: Date.now(),
      ruleScore: params.ruleScore,
      confidence: Math.max(0, Math.min(1, params.confidence)),
    };
  }

  /**
   * 创建持有信号
   */
  protected createHoldSignal(params: {
    coin: string;
    reason: string;
    confidence: number;
    ruleScore: number;
  }): RuleSignal {
    return {
      ruleType: this.ruleType,
      signalType: SignalType.HOLD,
      strength: SignalStrength.WEAK,
      coin: params.coin,
      reason: params.reason,
      timestamp: Date.now(),
      ruleScore: params.ruleScore,
      confidence: Math.max(0, Math.min(1, params.confidence)),
    };
  }

  /**
   * 计算信号强度
   */
  protected calculateStrength(
    confidence: number,
    additionalFactors?: { strength?: number; volatility?: number }
  ): SignalStrength {
    let strength = confidence;

    // 考虑额外因素
    if (additionalFactors) {
      if (additionalFactors.strength !== undefined) {
        strength = (strength + additionalFactors.strength) / 2;
      }
      // 高波动率降低信号强度
      if (additionalFactors.volatility !== undefined && additionalFactors.volatility > 0.1) {
        strength *= 0.8;
      }
    }

    if (strength < 0.4) return SignalStrength.WEAK;
    if (strength < 0.7) return SignalStrength.MODERATE;
    return SignalStrength.STRONG;
  }

  /**
   * 验证信号参数
   */
  protected validateSignal(signal: RuleSignal): boolean {
    // 检查币种
    if (!signal.coin || typeof signal.coin !== 'string') {
      logger.warn(`无效的信号：缺少币种信息 [${this.ruleType}]`);
      return false;
    }

    // 检查置信度范围
    if (signal.confidence < 0 || signal.confidence > 1) {
      logger.warn(`无效的信号：置信度超出范围 [${this.ruleType}][${signal.coin}]`);
      return false;
    }

    // 检查规则分数范围
    if (signal.ruleScore < -1 || signal.ruleScore > 1) {
      logger.warn(`无效的信号：规则分数超出范围 [${this.ruleType}][${signal.coin}]`);
      return false;
    }

    // 检查建议金额
    if (signal.suggestedAmount !== undefined) {
      if (!this.isValidTradeAmount(signal.suggestedAmount)) {
        logger.warn(`无效的信号：建议金额超出限制 [${this.ruleType}][${signal.coin}]`);
        return false;
      }
    }

    return true;
  }

  /**
   * 记录信号生成
   */
  protected logSignal(signal: RuleSignal): void {
    logger.debug(`规则信号生成 [${this.ruleType}][${signal.coin}]`, {
      signalType: signal.signalType,
      strength: signal.strength,
      confidence: signal.confidence,
      ruleScore: signal.ruleScore,
      reason: signal.reason,
    });
  }
}
