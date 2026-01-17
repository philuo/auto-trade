/**
 * 风险控制模块
 *
 * 高频合约量化交易风险管理
 * - 持仓时间限制
 * - 动态止盈止损
 * - 风险敞口控制
 * - 连续亏损保护
 */

export {
  HighFrequencySafetyManager,
  getGlobalSafetyManager,
  type Position,
  type RiskLimits,
  type RiskAlert,
  type SafetyDecision,
} from './high-frequency-safety-manager';
