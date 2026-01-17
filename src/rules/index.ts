/**
 * 规则引擎模块入口
 *
 * 导出所有规则相关的类型、类和函数
 */

// 类型定义
export type {
  // 基础类型
  RuleSignal,
  BaseRuleConfig,
  RuleEngineInput,
  RuleEngineOutput,
  // DCA 规则类型
  DCARuleConfig,
  DCAState,
  // 网格交易规则类型
  GridRuleConfig,
  GridState,
  GridOrder,
  // 风控规则类型
  RiskControlRuleConfig,
  RiskAssessment,
  // 止损止盈类型
  StopLossConfig,
  TakeProfitConfig,
  // 趋势跟随规则类型
  TrendFollowRuleConfig,
  // 市场数据类型
  PriceData,
  CandleData,
  TechnicalIndicators,
} from './types;

// 枚举
export {
  RuleType,
  SignalType,
  SignalStrength,
  RiskLevel,
} from './types;

// 基类
export { BaseRule } from './base-rule;

// 具体规则类
export { DCARule } from './dca-rule;
export { GridRule } from './grid-rule;
export { RiskControlRule } from './risk-control-rule;

// 规则引擎
export {
  RuleEngine,
  createRuleEngine,
  createDCARule,
  createGridRule,
  createRiskControlRule,
} from './rule-engine;
