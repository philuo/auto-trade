/**
 * 安全验证器模块入口
 *
 * 导出所有安全验证相关的类型、类和枚举
 */

// 类型定义
export type {
  SafetyCheck,
  SafetyValidationResult,
  TradeAdjustment,
  SafetyValidatorConfig,
  TradeRequest,
  MarketStatus,
  AccountStatus,
  TradeHistory,
  SafetyCheckFunction,
} from './types.js';

// 枚举
export {
  SafetyCheckResult,
  SafetyCheckType,
  TradeActionType,
} from './types.js';

// 安全验证器类
export { SafetyValidator } from './validator.js';
