/**
 * 规则引擎
 *
 * 协调管理所有交易规则，生成综合交易信号
 */

import { logger } from '../utils/logger.js';
import { BaseRule } from './base-rule.js';
import { DCARule } from './dca-rule.js';
import { GridRule } from './grid-rule.js';
import { RiskControlRule } from './risk-control-rule.js';
import type {
  RuleEngineInput,
  RuleEngineOutput,
  RuleSignal,
  BaseRuleConfig,
  DCARuleConfig,
  GridRuleConfig,
  RiskControlRuleConfig,
  RiskAssessment,
} from './types.js';

/**
 * 规则引擎类
 */
export class RuleEngine {
  // 规则列表
  private rules: BaseRule[] = [];
  // 风控规则（优先处理）
  private riskControlRule?: RiskControlRule;

  constructor() {
    logger.info('规则引擎初始化');
  }

  // =====================================================
  // 规则管理
  // =====================================================

  /**
   * 添加规则
   */
  addRule(rule: BaseRule): void {
    // 检查是否已存在相同类型和优先级的规则
    const existingIndex = this.rules.findIndex(
      r => r.getRuleType() === rule.getRuleType() && r.getPriority() === rule.getPriority()
    );

    if (existingIndex >= 0) {
      logger.warn(`替换已存在的规则 [${rule.getRuleType()}]`);
      this.rules[existingIndex] = rule;
    } else {
      this.rules.push(rule);
    }

    // 排序规则（按优先级）
    this.sortRules();

    // 如果是风控规则，单独保存
    if (rule instanceof RiskControlRule) {
      this.riskControlRule = rule;
    }

    logger.info(`规则已添加 [${rule.getRuleType()}]`, {
      priority: rule.getPriority(),
      enabled: rule.isEnabled(),
    });
  }

  /**
   * 移除规则
   */
  removeRule(ruleType: string): void {
    const index = this.rules.findIndex(r => r.getRuleType() === ruleType);
    if (index >= 0) {
      const removed = this.rules.splice(index, 1)[0];
      if (removed instanceof RiskControlRule) {
        this.riskControlRule = undefined;
      }
      logger.info(`规则已移除 [${ruleType}]`);
    }
  }

  /**
   * 获取规则
   */
  getRule(ruleType: string): BaseRule | undefined {
    return this.rules.find(r => r.getRuleType() === ruleType);
  }

  /**
   * 获取所有规则
   */
  getAllRules(): BaseRule[] {
    return [...this.rules];
  }

  /**
   * 按优先级排序规则
   */
  private sortRules(): void {
    this.rules.sort((a, b) => a.getPriority() - b.getPriority());
  }

  // =====================================================
  // 信号生成
  // =====================================================

  /**
   * 执行规则引擎，生成交易信号
   */
  async execute(input: RuleEngineInput): Promise<RuleEngineOutput> {
    logger.debug('规则引擎开始执行', {
      rulesCount: this.rules.length,
      coins: input.prices.map(p => p.coin),
    });

    const allSignals: RuleSignal[] = [];
    const rejections: string[] = [];
    let riskAssessment: RiskAssessment | undefined;

    // 1. 首先执行风控检查
    if (this.riskControlRule && this.riskControlRule.isEnabled()) {
      riskAssessment = this.riskControlRule.assessRisk(input);

      if (riskAssessment.triggered) {
        logger.warn(`风控规则触发，生成风控信号`, {
          level: riskAssessment.level,
          triggeredRules: riskAssessment.triggeredRules,
        });

        const riskSignals = this.riskControlRule.generateSignal(input);
        if (riskSignals) {
          const signals = Array.isArray(riskSignals) ? riskSignals : [riskSignals];
          allSignals.push(...signals);
        }

        // 风控触发时，不执行其他规则
        return {
          signals: allSignals,
          riskAssessment,
          recommendations: allSignals,
          rejections: riskAssessment.triggeredRules,
        };
      }
    }

    // 2. 检查是否允许交易
    if (this.riskControlRule) {
      const canTradeResult = this.riskControlRule.canTrade(input);
      if (!canTradeResult.allowed) {
        rejections.push(canTradeResult.reason || '风控禁止交易');
        logger.info(`风控禁止交易: ${canTradeResult.reason}`);
        return {
          signals: [],
          riskAssessment,
          recommendations: [],
          rejections,
        };
      }
    }

    // 3. 执行所有启用的规则
    for (const rule of this.rules) {
      if (!rule.isEnabled()) {
        continue;
      }

      // 跳过风控规则（已经处理过）
      if (rule instanceof RiskControlRule) {
        continue;
      }

      try {
        const signalOrSignals = rule.generateSignal(input);

        if (signalOrSignals) {
          const signals = Array.isArray(signalOrSignals) ? signalOrSignals : [signalOrSignals];
          allSignals.push(...signals);
        }
      } catch (error) {
        logger.error(`规则执行失败 [${rule.getRuleType()}]`, {
          error: error instanceof Error ? error.message : String(error),
        });
        rejections.push(`规则 ${rule.getRuleType()} 执行失败`);
      }
    }

    // 4. 合并和过滤信号
    const filteredSignals = this.filterAndMergeSignals(allSignals);

    // 5. 生成推荐操作
    const recommendations = this.generateRecommendations(filteredSignals, input);

    logger.debug('规则引擎执行完成', {
      totalSignals: allSignals.length,
      filteredSignals: filteredSignals.length,
      recommendations: recommendations.length,
      rejections: rejections.length,
    });

    return {
      signals: filteredSignals,
      riskAssessment,
      recommendations,
      rejections,
    };
  }

  /**
   * 过滤和合并信号
   */
  private filterAndMergeSignals(signals: RuleSignal[]): RuleSignal[] {
    // 按币种分组
    const signalsByCoin = new Map<string, RuleSignal[]>();

    for (const signal of signals) {
      const coinSignals = signalsByCoin.get(signal.coin) || [];
      coinSignals.push(signal);
      signalsByCoin.set(signal.coin, coinSignals);
    }

    // 对每个币种，选择最佳信号
    const filteredSignals: RuleSignal[] = [];

    for (const [coin, coinSignals] of signalsByCoin) {
      // 计算每个信号的加权分数
      const scoredSignals = coinSignals.map(signal => ({
        signal,
        score: this.calculateSignalScore(signal),
      }));

      // 按分数排序
      scoredSignals.sort((a, b) => b.score - a.score);

      // 选择最高分的信号
      const best = scoredSignals[0];
      if (best) {
        filteredSignals.push(best.signal);
      }
    }

    return filteredSignals;
  }

  /**
   * 计算信号分数
   */
  private calculateSignalScore(signal: RuleSignal): number {
    // 基础分数：置信度 * 规则分数绝对值
    let score = signal.confidence * Math.abs(signal.ruleScore);

    // 信号强度加成
    const strengthBonus = {
      weak: 0.8,
      moderate: 1.0,
      strong: 1.2,
    };
    score *= strengthBonus[signal.strength];

    // 规则类型加成
    const ruleTypeBonus: Record<string, number> = {
      dca: 0.9, // DCA 较保守
      grid: 1.0, // 网格交易中性
      risk_control: 2.0, // 风控最高优先级
      stop_loss: 1.8, // 止损高优先级
      take_profit: 1.5, // 止盈中高优先级
      trend_follow: 1.0, // 趋势跟随中性
    };
    score *= ruleTypeBonus[signal.ruleType] || 1.0;

    return score;
  }

  /**
   * 生成推荐操作
   */
  private generateRecommendations(signals: RuleSignal[], input: RuleEngineInput): RuleSignal[] {
    // 检查资金是否足够
    const recommendations: RuleSignal[] = [];

    for (const signal of signals) {
      if (signal.signalType === 'buy' && signal.suggestedAmount) {
        // 检查余额是否足够
        if (signal.suggestedAmount > input.availableBalance) {
          logger.debug(`资金不足，跳过买入信号 [${signal.coin}]`, {
            required: signal.suggestedAmount,
            available: input.availableBalance,
          });
          continue;
        }
      }

      if (signal.signalType === 'sell' && signal.suggestedAmount) {
        // 检查持仓是否足够
        const position = input.positions.find(p => p.coin === signal.coin);
        if (!position || position.amount < signal.suggestedAmount) {
          logger.debug(`持仓不足，跳过卖出信号 [${signal.coin}]`, {
            required: signal.suggestedAmount,
            available: position?.amount || 0,
          });
          continue;
        }
      }

      recommendations.push(signal);
    }

    return recommendations;
  }

  // =====================================================
  // 工具方法
  // =====================================================

  /**
   * 获取规则统计
   */
  getStats(): {
    totalRules: number;
    enabledRules: number;
    rulesByType: Record<string, number>;
  } {
    const rulesByType: Record<string, number> = {};

    for (const rule of this.rules) {
      const type = rule.getRuleType();
      rulesByType[type] = (rulesByType[type] || 0) + 1;
    }

    return {
      totalRules: this.rules.length,
      enabledRules: this.rules.filter(r => r.isEnabled()).length,
      rulesByType,
    };
  }

  /**
   * 启用/禁用所有规则
   */
  setAllRulesEnabled(enabled: boolean): void {
    for (const rule of this.rules) {
      rule.updateConfig({ enabled } as Partial<BaseRuleConfig>);
    }
    logger.info(`所有规则已${enabled ? '启用' : '禁用'}`);
  }

  /**
   * 启用/禁用特定规则
   */
  setRuleEnabled(ruleType: string, enabled: boolean): void {
    const rule = this.getRule(ruleType);
    if (rule) {
      rule.updateConfig({ enabled } as Partial<BaseRuleConfig>);
      logger.info(`规则 [${ruleType}] 已${enabled ? '启用' : '禁用'}`);
    }
  }
}

// =====================================================
// 导出工厂函数
// =====================================================

/**
 * 创建规则引擎实例
 */
export function createRuleEngine(): RuleEngine {
  return new RuleEngine();
}

/**
 * 创建 DCA 规则
 */
export function createDCARule(config: DCARuleConfig): DCARule {
  return new DCARule(config);
}

/**
 * 创建网格交易规则
 */
export function createGridRule(config: GridRuleConfig): GridRule {
  return new GridRule(config);
}

/**
 * 创建风控规则
 */
export function createRiskControlRule(config: RiskControlRuleConfig): RiskControlRule {
  return new RiskControlRule(config);
}
