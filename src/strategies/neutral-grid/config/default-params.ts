/**
 * 中性合约网格策略默认配置
 *
 * 适用于：BTC、ETH 永续合约交易
 * 策略类型：中性网格（多空双向）
 * 风险等级：中等
 */

import type { NeutralGridConfig } from './types';

/**
 * 默认配置 - 中性合约网格
 *
 * 资金要求：10,000 USDT 起步
 * 杠杆设置：BTC 5x, ETH 3x
 * 预期收益：年化 30-50%
 * 风险等级：中等
 */
export const DEFAULT_NEUTRAL_GRID_CONFIG: NeutralGridConfig = {
  // =====================================================
  // 基础配置
  // =====================================================
  base: {
    strategyName: 'Neutral-Grid-Swap',
    version: '1.0.0',
    enabled: true,
    logLevel: 'info'
  },

  // =====================================================
  // 资金配置
  // =====================================================
  capital: {
    totalCapital: 10000,           // 10,000 USDT
    emergencyReserve: 10,          // 10% 应急储备
    maxCapitalPerCoin: 60,         // 单币种最大 60%
    leverage: {
      'BTC': 5,                    // BTC 5x 杠杆
      'ETH': 3                     // ETH 3x 杠杆
    }
  },

  // =====================================================
  // 币种配置
  // =====================================================
  coins: {
    allowedCoins: ['BTC', 'ETH'],
    activeCoinLimit: 2             // 最多同时运行 2 个币种
  },

  // =====================================================
  // 中性网格配置
  // =====================================================
  grid: {
    enabled: true,

    // 价格区间计算
    rangeCalculation: {
      mode: 'adaptive',            // 自适应模式
      centerPrice: 'sma',          // 使用 SMA 作为中心价
      upperRange: 10,              // 上界 +10%
      lowerRange: 10,              // 下界 -10%
      adjustOnBreakout: true       // 突破后自动调整
    },

    // 网格设置
    gridSettings: {
      gridCount: 10,               // 10 个网格（每侧5个）
      spacing: 'geometric',        // 几何间距
      geometricRatio: 1.02         // 每格 2%
    },

    // 订单设置
    orderSettings: {
      sizeType: 'percentage',
      size: 5,                     // 每格 5% 的分配资金
      maxSizePerLevel: 1000        // 单层最大 1000 USDT
    },

    // 仓位平衡
    balance: {
      threshold: 10,               // 不平衡阈值 10%
      rebalanceMode: 'auto',
      rebalanceInterval: 4         // 每 4 小时再平衡
    },

    // 行为设置
    behavior: {
      closeOnRangeBreak: false,    // 突破时不平仓
      trailOnBreakout: true,       // 突破后跟踪
      trailDistance: 5             // 跟踪距离 5%
    }
  },

  // =====================================================
  // 风险管理配置
  // =====================================================
  risk: {
    // 止损配置
    stopLoss: {
      enabled: true,
      maxDrawdown: 20,             // 最大回撤 20%
      positionLossLimit: 30        // 单边损失限制 30%
    },

    // 仓位控制
    position: {
      maxOpenPositions: 20,        // 最大 20 个开仓
      maxPositionValue: 3000,      // 单边最大 3000 USDT
      minMarginRatio: 20           // 最小保证金率 20%
    },

    // 杠杆风险控制
    leverage: {
      maxLeverageBTC: 5,           // BTC 最大 5x
      maxLeverageETH: 3,           // ETH 最大 3x
      autoReduceLeverage: true     // 接近强平时自动降杠杆
    },

    // 资金费率风险
    funding: {
      maxFundingRate: 0.05,        // 最大可接受 0.05% (8小时)
      hedgeOnHighFunding: true     // 高费率时对冲
    }
  },

  // =====================================================
  // 资金费率配置
  // =====================================================
  funding: {
    // 资金费率套利
    arbitrage: {
      enabled: true,
      threshold: 0.03,             // 套利阈值 0.03%
      minProfit: 0.5               // 最小利润 0.5%
    },

    // 监控设置
    monitoring: {
      checkInterval: 15,           // 每 15 分钟检查
      alertOnHighRate: true
    }
  }
};

/**
 * 保守型配置
 *
 * 更小的网格，更宽的价格区间
 */
export const CONSERVATIVE_NEUTRAL_GRID_CONFIG: NeutralGridConfig = {
  ...DEFAULT_NEUTRAL_GRID_CONFIG,
  base: {
    ...DEFAULT_NEUTRAL_GRID_CONFIG.base,
    strategyName: 'Neutral-Grid-Swap-Conservative'
  },
  capital: {
    ...DEFAULT_NEUTRAL_GRID_CONFIG.capital,
    emergencyReserve: 20,          // 20% 应急储备
    maxCapitalPerCoin: 40
  },
  grid: {
    ...DEFAULT_NEUTRAL_GRID_CONFIG.grid,
    rangeCalculation: {
      ...DEFAULT_NEUTRAL_GRID_CONFIG.grid.rangeCalculation,
      upperRange: 15,              // 更宽的区间
      lowerRange: 15
    },
    gridSettings: {
      ...DEFAULT_NEUTRAL_GRID_CONFIG.grid.gridSettings,
      gridCount: 6,                // 更少的网格
      geometricRatio: 1.03         // 每格 3%
    },
    orderSettings: {
      ...DEFAULT_NEUTRAL_GRID_CONFIG.grid.orderSettings,
      size: 3                      // 更小的订单
    }
  },
  risk: {
    ...DEFAULT_NEUTRAL_GRID_CONFIG.risk,
    stopLoss: {
      ...DEFAULT_NEUTRAL_GRID_CONFIG.risk.stopLoss,
      maxDrawdown: 10,
      positionLossLimit: 15
    },
    position: {
      ...DEFAULT_NEUTRAL_GRID_CONFIG.risk.position,
      maxPositionValue: 1500,
      minMarginRatio: 30
    }
  }
};

/**
 * 激进型配置
 *
 * 更多的网格，更窄的价格区间
 */
export const AGGRESSIVE_NEUTRAL_GRID_CONFIG: NeutralGridConfig = {
  ...DEFAULT_NEUTRAL_GRID_CONFIG,
  base: {
    ...DEFAULT_NEUTRAL_GRID_CONFIG.base,
    strategyName: 'Neutral-Grid-Swap-Aggressive'
  },
  capital: {
    ...DEFAULT_NEUTRAL_GRID_CONFIG.capital,
    emergencyReserve: 5,           // 仅 5% 应急储备
    maxCapitalPerCoin: 80
  },
  grid: {
    ...DEFAULT_NEUTRAL_GRID_CONFIG.grid,
    rangeCalculation: {
      ...DEFAULT_NEUTRAL_GRID_CONFIG.grid.rangeCalculation,
      upperRange: 5,               // 更窄的区间
      lowerRange: 5
    },
    gridSettings: {
      ...DEFAULT_NEUTRAL_GRID_CONFIG.grid.gridSettings,
      gridCount: 20,               // 更多的网格
      geometricRatio: 1.01         // 每格 1%
    },
    orderSettings: {
      ...DEFAULT_NEUTRAL_GRID_CONFIG.grid.orderSettings,
      size: 8                      // 更大的订单
    }
  }
};

/**
 * 根据资金规模获取推荐配置
 */
export function getNeutralGridConfig(capital: number): NeutralGridConfig {
  const config = { ...DEFAULT_NEUTRAL_GRID_CONFIG };
  config.capital.totalCapital = capital;

  if (capital < 5000) {
    // 小资金
    config.capital.emergencyReserve = 15;
    config.capital.maxCapitalPerCoin = 50;
    config.grid.orderSettings.size = 3;
    config.grid.gridSettings.gridCount = 6;
  } else if (capital < 20000) {
    // 中等资金（默认配置）
    // 使用默认配置
  } else {
    // 大资金
    config.capital.maxCapitalPerCoin = 40;
    config.grid.orderSettings.size = 4;
    config.grid.gridSettings.gridCount = 15;
  }

  return config;
}

/**
 * 配置预设
 */
export const NEUTRAL_GRID_PRESETS = {
  default: DEFAULT_NEUTRAL_GRID_CONFIG,
  conservative: CONSERVATIVE_NEUTRAL_GRID_CONFIG,
  aggressive: AGGRESSIVE_NEUTRAL_GRID_CONFIG
} as const;

export type NeutralGridPreset = keyof typeof NEUTRAL_GRID_PRESETS;

/**
 * 获取预设配置
 */
export function getPresetNeutralGridConfig(preset: NeutralGridPreset): NeutralGridConfig {
  return NEUTRAL_GRID_PRESETS[preset];
}
