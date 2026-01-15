/**
 * 风控规则
 *
 * 监控风险指标，在超出阈值时触发风控
 */

import { logger } from '../utils/logger.js';
import { BaseRule } from './base-rule.js';
import type {
  RiskControlRuleConfig,
  RiskAssessment,
  RuleEngineInput,
  RuleSignal,
  PriceData,
} from './types.js';
import { RiskLevel, SignalStrength } from './types.js';

/**
 * 风控规则类
 */
export class RiskControlRule extends BaseRule<RiskControlRuleConfig> {
  // 日度累计亏损
  private dailyLoss = 0;
  // 日度开始时间
  private dailyStartTime = Date.now();
  // 初始账户价值（用于计算回撤）
  private initialAccountValue = 0;
  // 最高账户价值
  private peakAccountValue = 0;

  constructor(config: RiskControlRuleConfig) {
    super(config, 'risk_control' as any);
  }

  // =====================================================
  // 风险评估
  // =====================================================

  /**
   * 执行风险评估
   */
  assessRisk(input: RuleEngineInput): RiskAssessment {
    const totalPositionValue = this.calculateTotalPositionValue(input);
    const availableBalance = input.availableBalance;

    // 总账户价值
    const totalAccountValue = totalPositionValue + availableBalance;

    // 更新最高账户价值
    if (totalAccountValue > this.peakAccountValue) {
      this.peakAccountValue = totalAccountValue;
    }

    // 检查各项风控指标
    const triggeredRules: string[] = [];
    const recommendations: string[] = [];
    let riskLevel: RiskLevel = RiskLevel.LOW;

    // 1. 检查最大持仓价值
    if (totalPositionValue > this.config.maxPositionValue) {
      triggeredRules.push('最大持仓价值超限');
      recommendations.push(`当前持仓价值 ${totalPositionValue.toFixed(2)} 超过限制 ${this.config.maxPositionValue}`);
      riskLevel = RiskLevel.HIGH;
    }

    // 2. 检查单币种持仓比例
    for (const position of input.positions) {
      const positionRatio = (position.amount * position.avgCost) / totalPositionValue;
      const maxRatio = this.config.maxCoinPositionRatio / 100;

      if (positionRatio > maxRatio) {
        triggeredRules.push(`单币种持仓比例超限: ${position.coin}`);
        recommendations.push(
          `${position.coin} 持仓比例 ${(positionRatio * 100).toFixed(1)}% 超过限制 ${this.config.maxCoinPositionRatio}%`
        );
        riskLevel = RiskLevel.CRITICAL;
      }
    }

    // 3. 检查最大回撤
    if (this.peakAccountValue > 0) {
      const drawdown = (this.peakAccountValue - totalAccountValue) / this.peakAccountValue;
      const maxDrawdown = this.config.maxDrawdownRatio / 100;

      if (drawdown > maxDrawdown) {
        triggeredRules.push('最大回撤超限');
        recommendations.push(
          `当前回撤 ${(drawdown * 100).toFixed(1)}% 超过限制 ${this.config.maxDrawdownRatio}%`
        );
        riskLevel = RiskLevel.CRITICAL;

        // 检查是否需要紧急止损
        if (this.config.enableEmergencyStop) {
          const emergencyThreshold = this.config.emergencyStopThreshold / 100;
          if (drawdown > emergencyThreshold) {
            triggeredRules.push('紧急止损触发');
            recommendations.push('触发紧急止损，建议立即平仓');
            riskLevel = RiskLevel.CRITICAL;
          }
        }
      } else if (drawdown > maxDrawdown * 0.5) {
        riskLevel = riskLevel === RiskLevel.LOW ? RiskLevel.MEDIUM : riskLevel;
      }
    }

    // 4. 检查日度亏损
    if (this.dailyLoss > this.config.maxDailyLoss) {
      triggeredRules.push('日度亏损超限');
      recommendations.push(`今日亏损 ${this.dailyLoss.toFixed(2)} 超过限制 ${this.config.maxDailyLoss}`);
      riskLevel = RiskLevel.CRITICAL;
    } else if (this.dailyLoss > this.config.maxDailyLoss * 0.7) {
      recommendations.push(`今日亏损 ${this.dailyLoss.toFixed(2)} 接近限制 ${this.config.maxDailyLoss}`);
      riskLevel = riskLevel === RiskLevel.LOW ? RiskLevel.MEDIUM : riskLevel;
    }

    return {
      level: riskLevel,
      totalPositionValue,
      availableBalance,
      triggered: triggeredRules.length > 0,
      triggeredRules,
      recommendations,
    };
  }

  /**
   * 计算总持仓价值
   */
  private calculateTotalPositionValue(input: RuleEngineInput): number {
    return input.positions.reduce((total, position) => {
      return total + position.amount * position.avgCost;
    }, 0);
  }

  // =====================================================
  // 信号生成
  // =====================================================

  /**
   * 生成风控信号
   */
  generateSignal(input: RuleEngineInput): RuleSignal | RuleSignal[] | null {
    if (!this.isEnabled()) {
      return null;
    }

    // 重置日度统计（如果新的一天）
    this.checkDailyReset();

    // 执行风险评估
    const riskAssessment = this.assessRisk(input);

    // 如果没有触发风控，返回 null
    if (!riskAssessment.triggered) {
      return null;
    }

    const signals: RuleSignal[] = [];

    // 如果风险等级是 critical，生成平仓信号
    if (riskAssessment.level === 'critical') {
      // 检查是否需要紧急平仓
      const emergencyStop = riskAssessment.triggeredRules.includes('紧急止损触发');

      if (emergencyStop || this.config.enableEmergencyStop) {
        // 对所有持仓生成卖出信号
        for (const position of input.positions) {
          const signal = this.createSellSignal({
            coin: position.coin,
            reason: `风控平仓: ${riskAssessment.triggeredRules.join(', ')}`,
            confidence: 1.0,
            ruleScore: -1.0,
            strength: SignalStrength.STRONG,
            suggestedAmount: position.amount,
          });

          if (this.validateSignal(signal)) {
            signals.push(signal);
            this.logSignal(signal);
          }
        }
      }
    }

    // 记录风控触发
    if (signals.length > 0) {
      logger.warn(`风控规则触发 [${this.config.ruleType}]`, {
        level: riskAssessment.level,
        triggeredRules: riskAssessment.triggeredRules,
        signalsCount: signals.length,
      });
    }

    return signals.length > 0 ? signals : null;
  }

  // =====================================================
  // 日度管理
  // =====================================================

  /**
   * 检查是否需要重置日度统计
   */
  private checkDailyReset(): void {
    const now = Date.now();
    const dayInMs = 24 * 60 * 60 * 1000;

    if (now - this.dailyStartTime > dayInMs) {
      logger.info('重置风控日度统计', {
        previousDailyLoss: this.dailyLoss,
      });
      this.dailyLoss = 0;
      this.dailyStartTime = now;
    }
  }

  /**
   * 更新日度亏损
   */
  updateDailyLoss(loss: number): void {
    this.dailyLoss += loss;
    logger.debug(`更新日度亏损`, {
      loss: loss.toFixed(2),
      totalDailyLoss: this.dailyLoss.toFixed(2),
      maxDailyLoss: this.config.maxDailyLoss,
    });
  }

  /**
   * 重置日度亏损
   */
  resetDailyLoss(): void {
    this.dailyLoss = 0;
    this.dailyStartTime = Date.now();
  }

  // =====================================================
  // 账户管理
  // =====================================================

  /**
   * 设置初始账户价值
   */
  setInitialAccountValue(value: number): void {
    this.initialAccountValue = value;
    this.peakAccountValue = value;
    logger.info(`设置初始账户价值: ${value.toFixed(2)}`);
  }

  /**
   * 获取当前回撤
   */
  getCurrentDrawdown(): number {
    if (this.peakAccountValue === 0) {
      return 0;
    }
    // 需要传入当前账户价值，这里简化处理
    return 0;
  }

  // =====================================================
  // 工具方法
  // =====================================================

  /**
   * 获取风控状态
   */
  getRiskControlStatus(): {
    dailyLoss: number;
    dailyStartTime: number;
    peakAccountValue: number;
    remainingDailyLoss: number;
  } {
    return {
      dailyLoss: this.dailyLoss,
      dailyStartTime: this.dailyStartTime,
      peakAccountValue: this.peakAccountValue,
      remainingDailyLoss: Math.max(0, this.config.maxDailyLoss - this.dailyLoss),
    };
  }

  /**
   * 检查是否可以交易
   */
  canTrade(input: RuleEngineInput): { allowed: boolean; reason?: string } {
    const riskAssessment = this.assessRisk(input);

    if (riskAssessment.level === 'critical') {
      return {
        allowed: false,
        reason: `风控触发: ${riskAssessment.triggeredRules.join(', ')}`,
      };
    }

    if (riskAssessment.level === 'high') {
      return {
        allowed: true,
        reason: '风控警告，建议谨慎交易',
      };
    }

    return { allowed: true };
  }
}
