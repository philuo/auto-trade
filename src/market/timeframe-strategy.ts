/**
 * 多时间周期分析策略
 *
 * 根据不同的分析目的选择合适的K线周期
 *
 * 时间周期分类：
 * - 超短期：1m, 3m - 用于秒级/分钟级交易，高频交易
 * - 短期：5m, 15m - 用于日内交易，短期波动
 * - 中期：30m, 1H, 2H - 用于日内到几日的趋势分析
 * - 长期：4H, 6H, 12H - 用于几日到几周的趋势分析
 * - 超长期：1D, 1W, 1M - 用于长期趋势分析，基本面配合
 */

import type { KLineInterval } from './types;

/**
 * 分析时间范围
 */
export type AnalysisTimeRange =
  | 'ultra_short'  // 超短期：几秒到几分钟
  | 'short'        // 短期：几分钟到几小时
  | 'medium'       // 中期：几小时到1-2天
  | 'long'         // 长期：几天到几周
  | 'ultra_long';  // 超长期：几周到几月

/**
 * 分析目的
 */
export type AnalysisPurpose =
  | 'scalping'        // 剥头皮：快速进出，赚小利
  | 'day_trading'     // 日内交易：当天进出
  | 'swing_trading'   // 波段交易：持仓几天
  | 'position_trading' // 中长线持仓：持仓几周
  | 'investment';     // 投资：长期持有

/**
 * K线周期配置
 */
export interface TimeFrameConfig {
  /** 周期 */
  interval: KLineInterval;
  /** 周期描述 */
  description: string;
  /** 典型使用场景 */
  useCases: string[];
  /** 建议的K线数量 */
  suggestedLimit: number;
  /** 分析时间范围 */
  timeRange: AnalysisTimeRange;
  /** 数据覆盖时间（小时） */
  coverageHours: number;
}

/**
 * K线周期配置表
 */
export const TIME_FRAME_CONFIGS: Record<KLineInterval, TimeFrameConfig> = {
  '1m': {
    interval: '1m',
    description: '1分钟K线',
    useCases: ['剥头皮交易', '高频交易', '精确入场点'],
    suggestedLimit: 100,
    timeRange: 'ultra_short',
    coverageHours: 1.67,
  },
  '3m': {
    interval: '3m',
    description: '3分钟K线',
    useCases: ['超短期交易', '快速反应市场变化'],
    suggestedLimit: 100,
    timeRange: 'ultra_short',
    coverageHours: 5,
  },
  '5m': {
    interval: '5m',
    description: '5分钟K线',
    useCases: ['日内交易', '短期波动捕捉'],
    suggestedLimit: 144,
    timeRange: 'short',
    coverageHours: 12,
  },
  '15m': {
    interval: '15m',
    description: '15分钟K线',
    useCases: ['日内交易', '趋势确认', '技术指标计算'],
    suggestedLimit: 150,
    timeRange: 'short',
    coverageHours: 37.5,
  },
  '30m': {
    interval: '30m',
    description: '30分钟K线',
    useCases: ['波段交易', '趋势跟踪'],
    suggestedLimit: 120,
    timeRange: 'medium',
    coverageHours: 60,
  },
  '1H': {
    interval: '1H',
    description: '1小时K线',
    useCases: ['波段交易', '日间趋势', '主要趋势判断'],
    suggestedLimit: 100,
    timeRange: 'medium',
    coverageHours: 100,
  },
  '2H': {
    interval: '2H',
    description: '2小时K线',
    useCases: ['波段交易', '多日趋势'],
    suggestedLimit: 80,
    timeRange: 'medium',
    coverageHours: 160,
  },
  '4H': {
    interval: '4H',
    description: '4小时K线',
    useCases: ['波段交易', '周间趋势'],
    suggestedLimit: 60,
    timeRange: 'long',
    coverageHours: 240,
  },
  '6H': {
    interval: '6H',
    description: '6小时K线',
    useCases: ['中长线交易', '趋势确认'],
    suggestedLimit: 50,
    timeRange: 'long',
    coverageHours: 300,
  },
  '12H': {
    interval: '12H',
    description: '12小时K线',
    useCases: ['中长线交易', '主要趋势'],
    suggestedLimit: 40,
    timeRange: 'long',
    coverageHours: 480,
  },
  '1D': {
    interval: '1D',
    description: '日K线',
    useCases: ['趋势分析', '支撑阻力位', '长期投资'],
    suggestedLimit: 100,
    timeRange: 'ultra_long',
    coverageHours: 2400,
  },
  '1W': {
    interval: '1W',
    description: '周K线',
    useCases: ['长期趋势', '主要周期', '投资决策'],
    suggestedLimit: 52,
    timeRange: 'ultra_long',
    coverageHours: 8736,
  },
  '1M': {
    interval: '1M',
    description: '月K线',
    useCases: ['超长期趋势', '宏观经济分析'],
    suggestedLimit: 36,
    timeRange: 'ultra_long',
    coverageHours: 8760, // 约1年
  },
};

/**
 * 根据分析目的推荐K线周期
 */
export function recommendTimeFrame(purpose: AnalysisPurpose): KLineInterval[] {
  switch (purpose) {
    case 'scalping':
      return ['1m', '3m', '5m'];
    case 'day_trading':
      return ['5m', '15m', '30m'];
    case 'swing_trading':
      return ['15m', '30m', '1H', '2H', '4H'];
    case 'position_trading':
      return ['4H', '1D', '1W'];
    case 'investment':
      return ['1D', '1W', '1M'];
    default:
      return ['15m', '1H', '4H', '1D'];
  }
}

/**
 * 根据时间范围推荐K线周期
 */
export function recommendTimeFrameByRange(range: AnalysisTimeRange): KLineInterval[] {
  switch (range) {
    case 'ultra_short':
      return ['1m', '3m', '5m'];
    case 'short':
      return ['5m', '15m', '30m'];
    case 'medium':
      return ['30m', '1H', '2H', '4H'];
    case 'long':
      return ['4H', '6H', '12H', '1D'];
    case 'ultra_long':
      return ['1D', '1W', '1M'];
    default:
      return ['15m', '1H'];
  }
}

/**
 * 多周期分析配置
 */
export interface MultiTimeFrameConfig {
  /** 主周期（主要分析周期） */
  primary: KLineInterval;
  /** 次要周期（用于确认） */
  secondary?: KLineInterval;
  /** 趋势周期（判断大趋势） */
  trend?: KLineInterval;
  /** 入场周期（精确入场点） */
  entry?: KLineInterval;
}

/**
 * 预定义的多周期分析策略
 */
export const MULTI_TIME_FRAME_STRATEGIES: Record<string, MultiTimeFrameConfig> = {
  // 剥头皮策略
  scalping: {
    primary: '1m',
    secondary: '3m',
    trend: '15m',
  },

  // 日内交易策略
  day_trading: {
    primary: '5m',
    secondary: '15m',
    trend: '1H',
    entry: '1m',
  },

  // 波段交易策略
  swing_trading: {
    primary: '1H',
    secondary: '4H',
    trend: '1D',
    entry: '15m',
  },

  // 中长线策略
  position_trading: {
    primary: '4H',
    secondary: '1D',
    trend: '1W',
    entry: '1H',
  },

  // 长期投资策略
  investment: {
    primary: '1D',
    secondary: '1W',
    trend: '1M',
    entry: '4H',
  },

  // 均衡策略（默认）
  balanced: {
    primary: '15m',
    secondary: '1H',
    trend: '4H',
    entry: '5m',
  },
};

/**
 * 根据分析目的获取多周期配置
 */
export function getMultiTimeFrameConfig(purpose: AnalysisPurpose): MultiTimeFrameConfig {
  switch (purpose) {
    case 'scalping':
      return MULTI_TIME_FRAME_STRATEGIES.scalping;
    case 'day_trading':
      return MULTI_TIME_FRAME_STRATEGIES.day_trading;
    case 'swing_trading':
      return MULTI_TIME_FRAME_STRATEGIES.swing_trading;
    case 'position_trading':
      return MULTI_TIME_FRAME_STRATEGIES.position_trading;
    case 'investment':
      return MULTI_TIME_FRAME_STRATEGIES.investment;
    default:
      return MULTI_TIME_FRAME_STRATEGIES.balanced;
  }
}

/**
 * 获取周期的毫秒数
 */
export function getTimeFrameMs(interval: KLineInterval): number {
  const msMap: Record<KLineInterval, number> = {
    '1m': 60 * 1000,
    '3m': 3 * 60 * 1000,
    '5m': 5 * 60 * 1000,
    '15m': 15 * 60 * 1000,
    '30m': 30 * 60 * 1000,
    '1H': 60 * 60 * 1000,
    '2H': 2 * 60 * 60 * 1000,
    '4H': 4 * 60 * 60 * 1000,
    '6H': 6 * 60 * 60 * 1000,
    '12H': 12 * 60 * 60 * 1000,
    '1D': 24 * 60 * 60 * 1000,
    '1W': 7 * 24 * 60 * 60 * 1000,
    '1M': 30 * 24 * 60 * 60 * 1000,
  };
  return msMap[interval];
}

/**
 * 获取周期的描述性名称
 */
export function getTimeFrameName(interval: KLineInterval): string {
  return TIME_FRAME_CONFIGS[interval]?.description || interval;
}

/**
 * 检查周期是否适合计算指定数量的指标
 */
export function canCalculateIndicators(interval: KLineInterval, availableKlines: number): boolean {
  // MA99需要至少99根K线
  return availableKlines >= 99;
}

/**
 * 获取指定周期下建议的K线数量
 */
export function getSuggestedKlineLimit(interval: KLineInterval): number {
  return TIME_FRAME_CONFIGS[interval]?.suggestedLimit || 100;
}

/**
 * 计算多个周期的数据覆盖时间
 */
export function calculateCoverageHours(interval: KLineInterval, limit: number): number {
  const ms = getTimeFrameMs(interval);
  return (ms * limit) / (1000 * 60 * 60);
}
