/**
 * 动态策略实用配置示例
 *
 * 核心思想: 不是一层不变，而是根据市场智能调整
 */

import { AdaptiveStrategyExecutor } from './adaptive-strategy';

// =====================================================
// 实用配置：10,000 USDT 本金
// =====================================================

export const PRACTICAL_DYNAMIC_CONFIG = {
  totalCapital: 10000,

  // 资金分配（基础）
  baseAllocation: {
    spotPercent: 40,           // 40% 现货（4000 USDT）
    swapPercent: 40,           // 40% 合约（4000 USDT）
    reservePercent: 20         // 20% 应急（2000 USDT）
  },

  // 现货配置
  spot: {
    coins: ['BNB', 'SOL', 'XRP', 'ADA', 'DOGE'],
    capitalPerCoin: 800,       // 每个币种 800 USDT
    strategy: 'DCA-Grid',
    params: {
      dca: {
        amount: 50,            // 每次50 USDT
        frequency: 24          // 每24小时
      },
      grid: {
        count: 10,
        rangePercent: 30,      // ±30%
        sizePercent: 5         // 每格5%
      }
    }
  },

  // 合约配置（动态）
  swap: {
    coins: ['BTC', 'ETH'],
    totalCapital: 4000,        // 合约总资金
    perCoinBase: 2000,         // 每个币种基础资金

    // BTC动态配置
    BTC: {
      // 市场好时: 3x杠杆, 30%仓位
      goodMarket: {
        leverage: 3,
        positionPercent: 30,   // 2000 * 0.3 = 600 USDT 本金
        grids: 12,
        mode: 'aggressive'
      },

      // 市场一般时: 2x杠杆, 25%仓位
      normalMarket: {
        leverage: 2,
        positionPercent: 25,   // 2000 * 0.25 = 500 USDT 本金
        grids: 10,
        mode: 'normal'
      },

      // 市场差时: 1.5x杠杆, 15%仓位
      badMarket: {
        leverage: 1.5,
        positionPercent: 15,   // 2000 * 0.15 = 300 USDT 本金
        grids: 6,
        mode: 'conservative'
      },

      // 极端行情: 1x杠杆, 5%仓位观察
      extremeMarket: {
        leverage: 1,
        positionPercent: 5,    // 2000 * 0.05 = 100 USDT 本金
        grids: 4,
        mode: 'pause'
      }
    },

    // ETH动态配置（更保守）
    ETH: {
      goodMarket: {
        leverage: 2,
        positionPercent: 25,
        grids: 12,
        mode: 'normal'
      },
      normalMarket: {
        leverage: 2,
        positionPercent: 20,
        grids: 10,
        mode: 'normal'
      },
      badMarket: {
        leverage: 1,
        positionPercent: 10,
        grids: 6,
        mode: 'conservative'
      },
      extremeMarket: {
        leverage: 1,
        positionPercent: 0,    // 完全不开仓
        grids: 0,
        mode: 'pause'
      }
    }
  },

  // 动态调整规则
  dynamicRules: {
    // 每5分钟评估一次
    updateInterval: 5 * 60 * 1000,

    // 波动率阈值
    volatility: {
      low: 4,                  // ATR < 4%
      medium: 8,               // ATR 4-8%
      high: 15,                // ATR 8-15%
      extreme: 15              // ATR > 15%
    },

    // 风险评分阈值
    riskScore: {
      safe: 30,                // < 30: 激进模式
      normal: 50,              // 30-50: 正常模式
      warning: 70,             // 50-70: 保守模式
      danger: 70               // > 70: 暂停
    },

    // 调整幅度限制
    adjustmentLimits: {
      maxLeverageIncrease: 0.5,   // 每次最多增加0.5x
      maxLeverageDecrease: 1,     // 每次最多降低1x
      maxPositionChange: 10       // 每次最多调整10%仓位
    }
  }
};

// =====================================================
// 实际使用示例
// =====================================================

export class DynamicStrategyRunner {
  private executorBTC: AdaptiveStrategyExecutor;
  private executorETH: AdaptiveStrategyExecutor;
  private currentBTCConfig: any;
  private currentETHConfig: any;

  constructor() {
    this.executorBTC = new AdaptiveStrategyExecutor();
    this.executorETH = new AdaptiveStrategyExecutor();

    // 初始配置（正常市场）
    this.currentBTCConfig = PRACTICAL_DYNAMIC_CONFIG.swap.BTC.normalMarket;
    this.currentETHConfig = PRACTICAL_DYNAMIC_CONFIG.swap.ETH.normalMarket;
  }

  /**
   * 运行策略（定期调用）
   */
  async runStrategy(
    btcCandles: any[],
    ethCandles: any[],
    btcPrice: number,
    ethPrice: number,
    btcVolume: number,
    ethVolume: number
  ) {
    // 1. 更新BTC市场状况
    const btcCondition = await this.executorBTC.updateAndAdjust(
      'BTC',
      btcCandles,
      btcPrice,
      btcVolume
    );

    // 2. 更新ETH市场状况
    const ethCondition = await this.executorETH.updateAndAdjust(
      'ETH',
      ethCandles,
      ethPrice,
      ethVolume
    );

    // 3. 获取最新配置
    const newBTCConfig = this.executorBTC.getCurrentConfig('BTC');
    const newETHConfig = this.executorETH.getCurrentConfig('ETH');

    // 4. 检查是否需要调整
    const btcNeedsAdjust = this.needsAdjustment(this.currentBTCConfig, newBTCConfig);
    const ethNeedsAdjust = this.needsAdjustment(this.currentETHConfig, newETHConfig);

    // 5. 执行调整
    if (btcNeedsAdjust) {
      console.log('\n🔄 BTC策略需要调整');
      await this.adjustBTCStrategy(newBTCConfig);
      this.currentBTCConfig = newBTCConfig;
    }

    if (ethNeedsAdjust) {
      console.log('\n🔄 ETH策略需要调整');
      await this.adjustETHStrategy(newETHConfig);
      this.currentETHConfig = newETHConfig;
    }

    // 6. 检查是否应该暂停
    if (this.executorBTC.shouldPause()) {
      console.log('\n⚠️  BTC策略已暂停（市场风险过高）');
      await this.pauseBTCStrategy();
    }

    if (this.executorETH.shouldPause()) {
      console.log('\n⚠️  ETH策略已暂停（市场风险过高）');
      await this.pauseETHStrategy();
    }

    // 7. 生成报告
    console.log('\n' + this.generateReport());
  }

  /**
   * 检查是否需要调整
   */
  private needsAdjustment(current: any, recommended: any): boolean {
    return current.leverage !== recommended.leverage ||
           current.positionPercent !== recommended.positionPercent ||
           current.grids !== recommended.grids;
  }

  /**
   * 调整BTC策略
   */
  private async adjustBTCStrategy(newConfig: any) {
    console.log(`调整BTC: ${this.currentBTCConfig.leverage}x → ${newConfig.leverage}x 杠杆`);
    console.log(`调整BTC仓位: ${this.currentBTCConfig.positionPercent}% → ${newConfig.positionPercent}%`);

    // 这里调用实际的API调整仓位
    // await api.adjustLeverage('BTC-USDT-SWAP', newConfig.leverage);
    // await api.adjustGridSize(newConfig.grids);
  }

  /**
   * 调整ETH策略
   */
  private async adjustETHStrategy(newConfig: any) {
    console.log(`调整ETH: ${this.currentETHConfig.leverage}x → ${newConfig.leverage}x 杠杆`);
    console.log(`调整ETH仓位: ${this.currentETHConfig.positionPercent}% → ${newConfig.positionPercent}%`);

    // 这里调用实际的API调整仓位
  }

  /**
   * 暂停BTC策略
   */
  private async pauseBTCStrategy() {
    console.log('暂停BTC新开仓，保持现有仓位观察');
    // await api.cancelAllPendingOrders('BTC-USDT-SWAP');
  }

  /**
   * 暂停ETH策略
   */
  private async pauseETHStrategy() {
    console.log('暂停ETH新开仓，保持现有仓位观察');
    // await api.cancelAllPendingOrders('ETH-USDT-SWAP');
  }

  /**
   * 生成报告
   */
  private generateReport(): string {
    return `
${'='.repeat(70)}
                  动态策略运行报告
${'='.repeat(70)}

BTC策略:
  当前杠杆: ${this.currentBTCConfig.leverage}x
  当前仓位: ${this.currentBTCConfig.positionPercent}%
  网格数量: ${this.currentBTCConfig.grids}
  运行模式: ${this.currentBTCConfig.mode}

ETH策略:
  当前杠杆: ${this.currentETHConfig.leverage}x
  当前仓位: ${this.currentETHConfig.positionPercent}%
  网格数量: ${this.currentETHConfig.grids}
  运行模式: ${this.currentETHConfig.mode}

${'='.repeat(70)}
`;
  }
}

// =====================================================
// 使用示例
// =====================================================

export async function exampleUsage() {
  const runner = new DynamicStrategyRunner();

  // 模拟数据
  const mockCandles = [];
  for (let i = 0; i < 50; i++) {
    mockCandles.push({
      timestamp: Date.now() - (50 - i) * 3600000,
      open: 50000 + i * 100,
      high: 50200 + i * 100,
      low: 49800 + i * 100,
      close: 50100 + i * 100,
      volume: 1000000
    });
  }

  // 运行策略
  await runner.runStrategy(
    mockCandles,           // BTC K线
    mockCandles,           // ETH K线
    50000,                 // BTC价格
    3000,                  // ETH价格
    1000000,               // BTC成交量
    500000                 // ETH成交量
  );
}
