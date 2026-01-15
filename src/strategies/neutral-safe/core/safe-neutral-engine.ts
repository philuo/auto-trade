/**
 * 安全型中性网格策略 - 专为加密货币极端市场设计
 *
 * 核心安全机制:
 * 1. 超低杠杆 (1-2x) 或无杠杆
 * 2. 宽止损，避免插针止损
 * 3. 熔断机制，极端行情自动暂停
 * 4. 价格异常检测
 * 5. 分批建仓，避免一次性满仓
 */

export interface SafeNeutralGridConfig {
  base: {
    strategyName: string;
    version: string;
    enabled: boolean;
  };

  // 🔴 关键：杠杆控制
  leverage: {
    btc: 1 | 2 | 3;           // BTC 最大 2x，推荐 1x
    eth: 1 | 2 | 3;           // ETH 最大 2x，推荐 1x
    autoReduce: boolean;      // 接近强平时自动降杠杆
  };

  capital: {
    totalCapital: number;
    maxPositionPercent: number;   // 单边最大仓位（推荐20%）
    emergencyReserve: number;     // 应急储备（推荐30%）
  };

  grid: {
    enabled: boolean;

    // 🔴 关键：更宽的价格区间
    rangeCalculation: {
      mode: 'wide' | 'adaptive';   // 推荐使用 wide
      upperRange: number;          // 推荐 20-30%（不是10%）
      lowerRange: number;
      adjustOnBreakout: boolean;   // 突破时平仓，而不是跟踪
    };

    gridSettings: {
      gridCount: number;           // 推荐 6-10 个（不是20个）
      spacing: 'geometric';
      geometricRatio: number;      // 推荐 3-5%（不是2%）
    };

    // 🔴 关键：小仓位
    orderSettings: {
      sizeType: 'percentage';
      size: number;                // 推荐 2-3%（不是5%）
      maxSizePerLevel: number;
    };
  };

  // 🔴 关键：安全机制
  safety: {
    // 熔断机制
    circuitBreaker: {
      enabled: boolean;
      priceChangeThreshold: number;  // 单根K线涨跌超过10%就熔断
      volatilityThreshold: number;   // 波动率超过阈值就熔断
      pauseDuration: number;          // 暂停时长（分钟）
    };

    // 异常检测
    anomalyDetection: {
      enabled: boolean;
      minVolumeThreshold: number;    // 成交量异常低
      priceDeviationThreshold: number; // 价格偏离指数超过阈值
    };

    // 风险控制
    riskControl: {
      maxDrawdown: number;           // 最大回撤 15%（不是20%）
      stopLossPercent: number;       // 止损 25%（不是15%，避免插针）
      emergencyCloseAll: boolean;    // 触发止损时全部平仓
    };

    // 分批建仓
    positionBuilding: {
      enabled: boolean;
      initialPositionPercent: number; // 初始仓位 20%
      buildSteps: number;             // 分5批建仓
      buildInterval: number;          // 每批间隔（小时）
    };
  };
}

/**
 * 默认安全配置
 *
 * 风险等级：保守
 * 适用场景：所有市场环境，特别是高波动期
 */
export const DEFAULT_SAFE_CONFIG: SafeNeutralGridConfig = {
  base: {
    strategyName: 'Safe-Neutral-Grid',
    version: '2.0.0-Safe',
    enabled: true
  },

  // 🔴 关键：超低杠杆
  leverage: {
    btc: 1,                    // BTC 无杠杆或 1x
    eth: 1,                    // ETH 无杠杆或 1x
    autoReduce: true
  },

  capital: {
    totalCapital: 10000,
    maxPositionPercent: 20,    // 单边最大 20%
    emergencyReserve: 30       // 30% 应急储备
  },

  grid: {
    enabled: true,
    rangeCalculation: {
      mode: 'wide',            // 宽区间模式
      upperRange: 25,          // 上界 +25%
      lowerRange: 25,          // 下界 -25%
      adjustOnBreakout: true
    },
    gridSettings: {
      gridCount: 8,            // 仅 8 个网格
      spacing: 'geometric',
      geometricRatio: 1.04     // 每格 4%
    },
    orderSettings: {
      sizeType: 'percentage',
      size: 2,                 // 每格仅 2%
      maxSizePerLevel: 200
    }
  },

  // 🔴 关键：多重安全机制
  safety: {
    circuitBreaker: {
      enabled: true,
      priceChangeThreshold: 10,  // 单根K线涨跌10%就熔断
      volatilityThreshold: 50,   // ATR超过50就熔断
      pauseDuration: 60          // 暂停60分钟
    },
    anomalyDetection: {
      enabled: true,
      minVolumeThreshold: 0.3,   // 成交量低于30%异常
      priceDeviationThreshold: 5 // 价格偏离指数5%异常
    },
    riskControl: {
      maxDrawdown: 15,           // 最大回撤15%
      stopLossPercent: 25,       // 25%止损（避免插针）
      emergencyCloseAll: true
    },
    positionBuilding: {
      enabled: true,
      initialPositionPercent: 20, // 初始仅20%仓位
      buildSteps: 5,
      buildInterval: 4           // 每4小时加一批
    }
  }
};

/**
 * 极端安全配置
 *
 * 风险等级：极保守
 * 适用场景：极端行情期、新手、大资金
 */
export const ULTRA_SAFE_CONFIG: SafeNeutralGridConfig = {
  ...DEFAULT_SAFE_CONFIG,
  base: {
    ...DEFAULT_SAFE_CONFIG.base,
    strategyName: 'Ultra-Safe-Neutral-Grid',
    version: '2.0.0-UltraSafe'
  },
  leverage: {
    btc: 1,                    // 绝对不用杠杆
    eth: 1,
    autoReduce: true
  },
  capital: {
    totalCapital: 10000,
    maxPositionPercent: 10,    // 单边最大仅10%
    emergencyReserve: 50       // 50% 应急储备
  },
  grid: {
    ...DEFAULT_SAFE_CONFIG.grid,
    rangeCalculation: {
      mode: 'wide',
      upperRange: 40,          // 超宽区间 ±40%
      lowerRange: 40,
      adjustOnBreakout: true
    },
    gridSettings: {
      gridCount: 4,            // 仅4个网格
      spacing: 'geometric',
      geometricRatio: 1.10     // 每格10%
    },
    orderSettings: {
      ...DEFAULT_SAFE_CONFIG.grid.orderSettings,
      size: 1                  // 每格仅1%
    }
  },
  safety: {
    ...DEFAULT_SAFE_CONFIG.safety,
    circuitBreaker: {
      enabled: true,
      priceChangeThreshold: 5,   // 5%就熔断
      volatilityThreshold: 30,
      pauseDuration: 120         // 暂停2小时
    },
    riskControl: {
      maxDrawdown: 10,           // 最大回撤10%
      stopLossPercent: 20,
      emergencyCloseAll: true
    }
  }
};

/**
 * 安全建议
 */
export const SAFETY_RECOMMENDATIONS = {
  // ❌ 绝对不要做的
  never: [
    '不要使用5x杠杆',
    '不要满仓操作',
    '不要在新闻发布前持有大仓位',
    '不要忽视插针风险',
    '不要认为"这次不一样"'
  ],

  // ✅ 必须要做的
  must: [
    '必须设置止损',
    '必须保留应急储备',
    '必须监控持仓',
    '必须了解极端风险',
    '必须先用小资金测试'
  ],

  // 💡 建议做的
  should: [
    '优先使用现货策略',
    '如用合约，杠杆不超过2x',
    '分批建仓，不要一次性满仓',
    '设置价格异常警报',
    '定期评估风险',
    '在极端行情时暂停策略',
    '保持充足的保证金'
  ]
};
