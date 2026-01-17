/**
 * DCA (定投) 规则
 *
 * 定期定额投资策略，当价格低于平均成本时增加投资金额
 */

import { logger } from '../utils/logger;
import { BaseRule } from './base-rule;
import type {
  DCARuleConfig,
  DCAState,
  RuleEngineInput,
  RuleSignal,
  PriceData,
} from './types;

/**
 * DCA 规则类
 */
export class DCARule extends BaseRule<DCARuleConfig> {
  // DCA 状态存储
  private states: Map<string, DCAState> = new Map();

  constructor(config: DCARuleConfig) {
    super(config, 'dca' as any);
    this.initializeStates();
  }

  // =====================================================
  // 状态管理
  // =====================================================

  /**
   * 初始化 DCA 状态
   */
  private initializeStates(): void {
    for (const coin of this.config.coins) {
      if (!this.states.has(coin)) {
        this.states.set(coin, {
          coin,
          avgCost: 0,
          totalInvested: 0,
          totalAmount: 0,
          lastInvestTime: 0,
          investmentCount: 0,
        });
      }
    }
  }

  /**
   * 获取币种的 DCA 状态
   */
  getState(coin: string): DCAState | undefined {
    return this.states.get(coin);
  }

  /**
   * 更新 DCA 状态（执行投资后调用）
   */
  updateState(coin: string, investedAmount: number, price: number, receivedAmount: number): void {
    const state = this.states.get(coin);
    if (!state) {
      logger.warn(`DCA 状态不存在: ${coin}`);
      return;
    }

    const newTotalInvested = state.totalInvested + investedAmount;
    const newTotalAmount = state.totalAmount + receivedAmount;
    const newAvgCost = newTotalAmount > 0 ? newTotalInvested / newTotalAmount : 0;

    this.states.set(coin, {
      coin,
      avgCost: newAvgCost,
      totalInvested: newTotalInvested,
      totalAmount: newTotalAmount,
      lastInvestTime: Date.now(),
      investmentCount: state.investmentCount + 1,
    });

    logger.info(`DCA 状态已更新 [${coin}]`, {
      avgCost: newAvgCost,
      totalInvested: newTotalInvested,
      totalAmount: newTotalAmount,
      investmentCount: state.investmentCount + 1,
    });
  }

  /**
   * 重置 DCA 状态
   */
  resetState(coin: string): void {
    this.states.delete(coin);
    this.states.set(coin, {
      coin,
      avgCost: 0,
      totalInvested: 0,
      totalAmount: 0,
      lastInvestTime: 0,
      investmentCount: 0,
    });
  }

  // =====================================================
  // 信号生成
  // =====================================================

  /**
   * 生成 DCA 信号
   */
  generateSignal(input: RuleEngineInput): RuleSignal | RuleSignal[] | null {
    if (!this.isEnabled()) {
      return null;
    }

    const signals: RuleSignal[] = [];
    const now = input.timestamp;

    for (const coin of this.config.coins) {
      const priceData = this.getPriceData(coin, input.prices);
      if (!priceData) {
        logger.debug(`未找到价格数据: ${coin}`);
        continue;
      }

      const state = this.states.get(coin);
      if (!state) {
        continue;
      }

      // 检查是否到达定投时间
      const timeSinceLastInvest = now - state.lastInvestTime;
      const intervalMs = this.config.intervalHours * 60 * 60 * 1000;

      if (timeSinceLastInvest < intervalMs && state.lastInvestTime > 0) {
        // 未到定投时间
        continue;
      }

      // 计算投资金额
      const investAmount = this.calculateInvestAmount(priceData, state);

      if (investAmount <= 0) {
        continue;
      }

      // 计算置信度和规则分数
      const { confidence, ruleScore, reason } = this.calculateMetrics(priceData, state, investAmount);

      // 创建买入信号
      const signal = this.createBuySignal({
        coin,
        reason,
        confidence,
        ruleScore,
        strength: this.calculateStrength(confidence),
        suggestedPrice: priceData.price,
        suggestedAmount: investAmount,
      });

      if (this.validateSignal(signal)) {
        signals.push(signal);
        this.logSignal(signal);
      }
    }

    return signals.length > 0 ? signals : null;
  }

  /**
   * 计算投资金额
   */
  private calculateInvestAmount(priceData: PriceData, state: DCAState): number {
    let amount = this.config.investmentAmount;

    // 如果已有持仓，计算价格偏离
    if (state.totalAmount > 0 && state.avgCost > 0) {
      const priceDeviation = (state.avgCost - priceData.price) / state.avgCost;

      // 价格低于平均成本且超过阈值，增加投资
      if (priceDeviation > this.config.priceDeviationThreshold / 100) {
        // 计算倍数（最大不超过 maxMultiplier）
        const multiplier = Math.min(
          1 + (priceDeviation / (this.config.priceDeviationThreshold / 100)),
          this.config.maxMultiplier
        );
        amount = this.config.investmentAmount * multiplier;

        logger.debug(`DCA 价格偏离加仓 [${priceData.coin}]`, {
          avgCost: state.avgCost,
          currentPrice: priceData.price,
          deviation: `${(priceDeviation * 100).toFixed(2)}%`,
          multiplier: multiplier.toFixed(2),
          amount: amount.toFixed(2),
        });
      }
    }

    // 检查金额是否在限制范围内
    if (!this.isValidTradeAmount(amount)) {
      return 0;
    }

    return amount;
  }

  /**
   * 计算置信度和规则分数
   */
  private calculateMetrics(
    priceData: PriceData,
    state: DCAState,
    investAmount: number
  ): { confidence: number; ruleScore: number; reason: string } {
    let confidence = 0.5; // 基础置信度
    let ruleScore = 0.3; // 基础规则分数

    const reasons: string[] = [];

    // 价格偏离分析
    if (state.totalAmount > 0 && state.avgCost > 0) {
      const priceDeviation = (state.avgCost - priceData.price) / state.avgCost;

      if (priceDeviation > this.config.priceDeviationThreshold / 100) {
        // 价格低于平均成本，增加置信度
        const deviationBonus = Math.min(priceDeviation * 2, 0.3);
        confidence += deviationBonus;
        ruleScore += deviationBonus;
        reasons.push(`价格低于均价 ${((1 - priceData.price / state.avgCost) * 100).toFixed(1)}%`);
      } else if (priceDeviation < -this.config.priceDeviationThreshold / 100) {
        // 价格高于平均成本，降低置信度
        confidence -= 0.1;
        ruleScore -= 0.1;
        reasons.push(`价格高于均价 ${((priceData.price / state.avgCost - 1) * 100).toFixed(1)}%`);
      } else {
        reasons.push('价格接近平均成本');
      }
    } else {
      reasons.push('首次定投');
    }

    // 趋势分析
    if (priceData.change24h < -5) {
      // 大幅下跌，可能是抄底机会
      confidence += 0.1;
      reasons.push(`24h 下跌 ${Math.abs(priceData.change24h).toFixed(1)}%`);
    } else if (priceData.change24h > 5) {
      // 大幅上涨，降低置信度
      confidence -= 0.1;
      reasons.push(`24h 上涨 ${priceData.change24h.toFixed(1)}%`);
    }

    // 波动率分析
    const volatility = this.calculateVolatility(priceData);
    if (volatility < 0.05) {
      // 低波动率，适合定投
      confidence += 0.05;
    } else if (volatility > 0.15) {
      // 高波动率，降低置信度
      confidence -= 0.1;
      reasons.push('高波动率');
    }

    // 限制范围
    confidence = Math.max(0.2, Math.min(0.8, confidence));
    ruleScore = Math.max(0.1, Math.min(0.8, ruleScore));

    return {
      confidence,
      ruleScore,
      reason: `DCA 定投: ${reasons.join(', ')}`,
    };
  }

  /**
   * 计算波动率
   */
  private calculateVolatility(priceData: PriceData): number {
    if (!priceData.high24h || !priceData.low24h || priceData.high24h === 0) {
      return 0;
    }
    return (priceData.high24h - priceData.low24h) / priceData.high24h;
  }

  // =====================================================
  // 工具方法
  // =====================================================

  /**
   * 获取所有币种的 DCA 状态
   */
  getAllStates(): DCAState[] {
    return Array.from(this.states.values());
  }

  /**
   * 获取下次定投时间
   */
  getNextInvestTime(coin: string): number | undefined {
    const state = this.states.get(coin);
    if (!state || state.lastInvestTime === 0) {
      return undefined; // 尚未开始
    }
    return state.lastInvestTime + this.config.intervalHours * 60 * 60 * 1000;
  }

  /**
   * 添加币种到 DCA 计划
   */
  addCoin(coin: string): void {
    if (!this.config.coins.includes(coin)) {
      this.config.coins.push(coin);
      this.states.set(coin, {
        coin,
        avgCost: 0,
        totalInvested: 0,
        totalAmount: 0,
        lastInvestTime: 0,
        investmentCount: 0,
      });
      logger.info(`已添加币种到 DCA 计划: ${coin}`);
    }
  }

  /**
   * 从 DCA 计划移除币种
   */
  removeCoin(coin: string): void {
    const index = this.config.coins.indexOf(coin);
    if (index > -1) {
      this.config.coins.splice(index, 1);
      this.states.delete(coin);
      logger.info(`已从 DCA 计划移除币种: ${coin}`);
    }
  }
}
