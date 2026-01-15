/**
 * 现货 DCA + 网格混合策略默认配置
 */

import type {
  SpotDCAGridConfig,
  AllowedCoin
} from './strategy-config';

// Re-export SpotDCAGridConfig for convenience
export type { SpotDCAGridConfig };

/**
 * 默认策略配置
 *
 * 适用于：10,000 USDT 起步资金，多币种组合交易
 * 风险等级：激进型（95% 交易资金，5% 应急储备）
 */
export const DEFAULT_CONFIG: SpotDCAGridConfig = {
  // =====================================================
  // 基础配置
  // =====================================================
  base: {
    strategyName: 'DCA-Grid-Hybrid',
    version: '1.0.0',
    enabled: true,
    logLevel: 'info'
  },

  // =====================================================
  // 资金配置
  // =====================================================
  capital: {
    totalCapital: 10000,         // 10,000 USDT
    emergencyReserve: 5,         // 5% 应急储备（500 USDT）
    maxCapitalPerCoin: 30,       // 单币种最大 30%（3,000 USDT）
    minCapitalPerCoin: 500       // 单币种最小 500 USDT
  },

  // =====================================================
  // 币种配置
  // =====================================================
  coins: {
    allowedCoins: ['BTC', 'ETH', 'BNB', 'SOL', 'XRP', 'ADA', 'DOGE'],
    activeCoinLimit: 5,          // 最多同时运行 5 个币种
    rebalanceInterval: 24        // 每 24 小时重新评估币种选择
  },

  // =====================================================
  // DCA 配置
  // =====================================================
  dca: {
    enabled: true,
    baseOrderSize: 100,          // 每次 100 USDT
    frequency: 24,               // 每 24 小时执行一次常规 DCA
    maxOrders: 10,               // 最多执行 10 次 DCA

    // 逆向 DCA 配置
    reverseDCA: {
      enabled: true,
      triggerThreshold: 3,       // 价格下跌 3% 触发逆向 DCA
      levels: [
        { priceDrop: 3, multiplier: 1.0 },   // 跌 3%: 1 倍买入
        { priceDrop: 5, multiplier: 2.0 },   // 跌 5%: 2 倍买入
        { priceDrop: 8, multiplier: 3.0 },   // 跌 8%: 3 倍买入
        { priceDrop: 12, multiplier: 5.0 },  // 跌 12%: 5 倍买入
        { priceDrop: 18, multiplier: 8.0 }   // 跌 18%: 8 倍买入
      ]
    }
  },

  // =====================================================
  // 网格配置
  // =====================================================
  grid: {
    enabled: true,

    // 价格区间计算
    rangeCalculation: {
      mode: 'adaptive',          // 自适应模式
      upperRange: 15,            // 上限 +15%
      lowerRange: 15,            // 下限 -15%
      adjustOnBreakout: true     // 突破时自动调整
    },

    // 网格设置
    gridSettings: {
      gridCount: 20,             // 20 个网格
      spacing: 'geometric',      // 几何间距（对数分布）
      geometricRatio: 1.02       // 每格 2% 比例
    },

    // 订单设置
    orderSettings: {
      size: 50,                  // 每格 50 USDT
      sizeType: 'fixed'          // 固定大小
    },

    // 行为设置
    behavior: {
      rebalanceMode: 'smart',    // 智能再平衡
      accumulateMode: true,      // 累积模式（不减少持仓）
      takeProfit: 2              // 2% 止盈
    }
  },

  // =====================================================
  // 风险管理配置
  // =====================================================
  risk: {
    // 止损配置
    stopLoss: {
      enabled: true,
      percentage: 15,            // 15% 百分比止损
      trailing: {
        enabled: true,
        distance: 5,             // 移动止损距离 5%
        activationProfit: 10     // 盈利 10% 后激活移动止损
      }
    },

    // 回撤控制
    drawdown: {
      warningLevel: 10,          // 10% 回撤警告
      pauseLevel: 20,            // 20% 回撤暂停新开仓
      emergencyLevel: 30,        // 30% 回撤紧急平仓
      recoveryLevel: 5           // 5% 回撤恢复交易
    },

    // 仓位控制
    position: {
      maxPositionSize: 3000,     // 单币种最大 3000 USDT
      maxPositionPercentage: 30, // 单币种最大 30%
      diversification: true      // 启用分散投资
    }
  },

  // =====================================================
  // 动态价格区间配置
  // =====================================================
  dynamicRange: {
    enabled: true,

    // 重新计算触发条件
    recalculationTriggers: {
      priceBreakout: true,       // 价格接近边界
      volatilityChange: true,    // 波动率变化
      volumeSpike: true,         // 成交量激增
      timeElapsed: true,         // 时间流逝
      trendChange: true          // 趋势变化
    },

    // 触发阈值
    thresholds: {
      breakoutThreshold: 95,     // 接近边界 95%
      volatilityChangeThreshold: 30,  // 波动率变化 30%
      volumeSpikeMultiplier: 2.0,     // 成交量 2 倍
      maxRangeAge: 48            // 48 小时未调整
    }
  },

  // =====================================================
  // 回测配置
  // =====================================================
  backtest: {
    enabled: true,
    historicalDataDays: 90,      // 使用 90 天历史数据
    validationDays: 30,          // 30 天验证数据
    optimization: {
      enabled: true,
      method: 'genetic',         // 使用遗传算法优化
      iterations: 100,           // 100 次迭代
      metric: 'sharpe'           // 优化目标：夏普比率
    }
  }
};

/**
 * 保守型配置
 *
 * 适用于：风险厌恶型投资者
 * 特点：更小的订单，更宽的止损，更保守的资金分配
 */
export const CONSERVATIVE_CONFIG: SpotDCAGridConfig = {
  ...DEFAULT_CONFIG,
  base: {
    ...DEFAULT_CONFIG.base,
    strategyName: 'DCA-Grid-Hybrid-Conservative'
  },
  capital: {
    ...DEFAULT_CONFIG.capital,
    emergencyReserve: 20,        // 20% 应急储备
    maxCapitalPerCoin: 15,       // 单币种最大 15%
  },
  dca: {
    ...DEFAULT_CONFIG.dca,
    baseOrderSize: 50,           // 更小的 DCA 订单
    reverseDCA: {
      ...DEFAULT_CONFIG.dca.reverseDCA,
      levels: [
        { priceDrop: 5, multiplier: 1.3 },
        { priceDrop: 8, multiplier: 1.5 },
        { priceDrop: 12, multiplier: 2.0 },
        { priceDrop: 18, multiplier: 3.0 }
      ]
    }
  },
  grid: {
    ...DEFAULT_CONFIG.grid,
    gridSettings: {
      ...DEFAULT_CONFIG.grid.gridSettings,
      gridCount: 15              // 更少的网格
    },
    orderSettings: {
      ...DEFAULT_CONFIG.grid.orderSettings,
      size: 30                   // 更小的网格订单
    }
  },
  risk: {
    ...DEFAULT_CONFIG.risk,
    stopLoss: {
      ...DEFAULT_CONFIG.risk.stopLoss,
      percentage: 10             // 更严格的止损
    },
    drawdown: {
      ...DEFAULT_CONFIG.risk.drawdown,
      warningLevel: 5,
      pauseLevel: 10,
      emergencyLevel: 15
    }
  }
};

/**
 * 激进型配置
 *
 * 适用于：风险偏好型投资者
 * 特点：更大的订单，更紧的止损，更高的资金利用率
 */
export const AGGRESSIVE_CONFIG: SpotDCAGridConfig = {
  ...DEFAULT_CONFIG,
  base: {
    ...DEFAULT_CONFIG.base,
    strategyName: 'DCA-Grid-Hybrid-Aggressive'
  },
  capital: {
    ...DEFAULT_CONFIG.capital,
    emergencyReserve: 2,         // 仅 2% 应急储备
    maxCapitalPerCoin: 40        // 单币种最大 40%
  },
  dca: {
    ...DEFAULT_CONFIG.dca,
    baseOrderSize: 200,          // 更大的 DCA 订单
    reverseDCA: {
      ...DEFAULT_CONFIG.dca.reverseDCA,
      levels: [
        { priceDrop: 2, multiplier: 2.0 },
        { priceDrop: 4, multiplier: 3.0 },
        { priceDrop: 7, multiplier: 5.0 },
        { priceDrop: 10, multiplier: 8.0 },
        { priceDrop: 15, multiplier: 12.0 }
      ]
    }
  },
  grid: {
    ...DEFAULT_CONFIG.grid,
    gridSettings: {
      ...DEFAULT_CONFIG.grid.gridSettings,
      gridCount: 30              // 更多的网格
    },
    orderSettings: {
      ...DEFAULT_CONFIG.grid.orderSettings,
      size: 100                  // 更大的网格订单
    }
  }
};

/**
 * 根据资金规模获取推荐配置
 */
export function getRecommendedConfig(capital: number): SpotDCAGridConfig {
  const config = { ...DEFAULT_CONFIG };

  if (capital < 1000) {
    // 小资金
    config.capital.totalCapital = capital;
    config.capital.maxCapitalPerCoin = 50;
    config.dca.baseOrderSize = Math.max(20, capital * 0.02);
    config.grid.orderSettings.size = Math.max(10, capital * 0.01);
    config.coins.activeCoinLimit = 3;
  } else if (capital < 5000) {
    // 中等资金
    config.capital.totalCapital = capital;
    config.dca.baseOrderSize = Math.max(50, capital * 0.015);
    config.grid.orderSettings.size = Math.max(30, capital * 0.008);
  } else if (capital < 20000) {
    // 使用默认配置
    config.capital.totalCapital = capital;
  } else {
    // 大资金
    config.capital.totalCapital = capital;
    config.capital.maxCapitalPerCoin = 20;
    config.dca.baseOrderSize = Math.max(200, capital * 0.01);
    config.grid.orderSettings.size = Math.max(100, capital * 0.005);
    config.coins.activeCoinLimit = 7;
  }

  return config;
}

/**
 * 获取配置预设列表
 */
export const CONFIG_PRESETS = {
  default: DEFAULT_CONFIG,
  conservative: CONSERVATIVE_CONFIG,
  aggressive: AGGRESSIVE_CONFIG
} as const;

export type ConfigPreset = keyof typeof CONFIG_PRESETS;

/**
 * 获取指定预设配置
 */
export function getPresetConfig(preset: ConfigPreset): SpotDCAGridConfig {
  return CONFIG_PRESETS[preset];
}

/**
 * 合并自定义配置
 */
export function mergeConfig(
  base: SpotDCAGridConfig,
  custom: Partial<SpotDCAGridConfig>
): SpotDCAGridConfig {
  return {
    base: { ...base.base, ...custom.base },
    capital: { ...base.capital, ...custom.capital },
    coins: { ...base.coins, ...custom.coins },
    dca: {
      ...base.dca,
      ...custom.dca,
      reverseDCA: {
        ...base.dca.reverseDCA,
        ...custom.dca?.reverseDCA
      }
    },
    grid: {
      ...base.grid,
      rangeCalculation: { ...base.grid.rangeCalculation, ...custom.grid?.rangeCalculation },
      gridSettings: { ...base.grid.gridSettings, ...custom.grid?.gridSettings },
      orderSettings: { ...base.grid.orderSettings, ...custom.grid?.orderSettings },
      behavior: { ...base.grid.behavior, ...custom.grid?.behavior }
    },
    risk: {
      ...base.risk,
      stopLoss: {
        ...base.risk.stopLoss,
        trailing: { ...base.risk.stopLoss.trailing, ...custom.risk?.stopLoss?.trailing }
      },
      drawdown: { ...base.risk.drawdown, ...custom.risk?.drawdown },
      position: { ...base.risk.position, ...custom.risk?.position }
    },
    dynamicRange: {
      ...base.dynamicRange,
      recalculationTriggers: { ...base.dynamicRange.recalculationTriggers, ...custom.dynamicRange?.recalculationTriggers },
      thresholds: { ...base.dynamicRange.thresholds, ...custom.dynamicRange?.thresholds }
    },
    backtest: {
      ...base.backtest,
      optimization: { ...base.backtest.optimization, ...custom.backtest?.optimization }
    }
  };
}
