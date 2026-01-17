/**
 * 信号模块
 *
 * 提供技术信号生成功能
 */

export { TechnicalSignalGenerator } from './generator.js';
export type { SignalGeneratorConfig } from './generator.js';

// 高级信号生成器（事件驱动、趋势过滤）
export { AdvancedSignalGenerator } from './advanced-generator.js';
export type { AdvancedSignalGeneratorConfig, HistoryState } from './advanced-generator.js';
