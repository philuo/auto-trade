/**
 * 统一策略管理器
 *
 * 功能：
 * - 协调现货策略和合约策略
 * - 资金分配管理
 * - 风险控制
 * - 统一报告生成
 */

import type { AllowedCoin } from '../../core/constants';

// 策略类型导入
import type {
  SpotDCAGridConfig,
  StrategyState as SpotStrategyState
} from '../spot-dca-grid/config/strategy-config';

import type {
  NeutralGridConfig,
  SwapAllowedCoin,
  NeutralGridState
} from '../neutral-grid/config/types';

// 策略引擎导入
import { SpotDCAGridStrategyEngine } from '../spot-dca-grid/core/engine';
import { NeutralGridStrategyEngine } from '../neutral-grid/core/engine';

// =====================================================
// 资金分配配置
// =====================================================

export interface CapitalAllocation {
  totalCapital: number;
  spotPercentage: number;         // 分配给现货的百分比
  swapPercentage: number;          // 分配给合约的百分比
  reserve: number;                 // 应急储备
}

export interface StrategyManagerConfig {
  capital: CapitalAllocation;
  spot: {
    enabled: boolean;
    config: SpotDCAGridConfig;
    coins: AllowedCoin[];
  };
  swap: {
    enabled: boolean;
    config: NeutralGridConfig;
    coins: SwapAllowedCoin[];
  };
  risk: {
    maxTotalDrawdown: number;      // 最大总回撤
    autoPauseOnDrawdown: boolean;  // 回撤时自动暂停
    rebalanceInterval: number;     // 再平衡间隔（小时）
  };
}

// =====================================================
// 策略管理器类
// =====================================================

export class StrategyManager {
  private config: StrategyManagerConfig;
  private okxApi: any;

  // 策略引擎
  private spotEngine: SpotDCAGridStrategyEngine | null = null;
  private swapEngine: NeutralGridStrategyEngine | null = null;

  // 运行状态
  private running: boolean = false;

  // 手续费配置（VIP 0）
  private readonly SPOT_FEES = {
    maker: 0.08,
    taker: 0.10
  };

  private readonly SWAP_FEES = {
    maker: 0.02,
    taker: 0.05
  };

  constructor(config: StrategyManagerConfig, okxApi: any) {
    this.config = config;
    this.okxApi = okxApi;
  }

  /**
   * 启动所有策略
   */
  async start(): Promise<void> {
    if (this.running) {
      console.log('[StrategyManager] 策略已在运行中');
      return;
    }

    console.log('[StrategyManager] 启动策略管理器...');
    console.log('[StrategyManager] 总资金:', this.config.capital.totalCapital, 'USDT');
    console.log('[StrategyManager] 资金分配:');
    console.log(`  - 现货策略: ${this.config.capital.spotPercentage}% (${this.config.capital.totalCapital * this.config.capital.spotPercentage / 100} USDT)`);
    console.log(`  - 合约策略: ${this.config.capital.swapPercentage}% (${this.config.capital.totalCapital * this.config.capital.swapPercentage / 100} USDT)`);
    console.log(`  - 应急储备: ${this.config.capital.reserve} USDT`);

    // 计算分配资金
    const spotCapital = this.config.capital.totalCapital *
      (this.config.capital.spotPercentage / 100);
    const swapCapital = this.config.capital.totalCapital *
      (this.config.capital.swapPercentage / 100);

    // 启动现货策略
    if (this.config.spot.enabled) {
      console.log('[StrategyManager] 启动现货 DCA-网格策略...');

      // 配置现货策略
      const spotConfig = { ...this.config.spot.config };
      spotConfig.capital.totalCapital = spotCapital;
      spotConfig.coins.allowedCoins = this.config.spot.coins;

      this.spotEngine = new SpotDCAGridStrategyEngine(spotConfig, {
        okxApi: this.okxApi,
        updateInterval: 60000,       // 1分钟
        enableAutoTrade: true,
        maxConcurrentOrders: 20
      });

      await this.spotEngine.start();
      console.log('[StrategyManager] 现货策略已启动');
    }

    // 启动合约策略
    if (this.config.swap.enabled) {
      console.log('[StrategyManager] 启动中性合约网格策略...');

      // 配置合约策略
      const swapConfig = { ...this.config.swap.config };
      swapConfig.capital.totalCapital = swapCapital;

      this.swapEngine = new NeutralGridStrategyEngine(swapConfig, {
        okxApi: this.okxApi,
        updateInterval: 30000,       // 30秒（合约需要更频繁更新）
        enableAutoTrade: true,
        maxConcurrentOrders: 20,
        feeRates: this.SWAP_FEES
      });

      await this.swapEngine.start();
      console.log('[StrategyManager] 合约策略已启动');
    }

    this.running = true;
    console.log('[StrategyManager] 所有策略已启动');
  }

  /**
   * 停止所有策略
   */
  async stop(): Promise<void> {
    if (!this.running) {
      console.log('[StrategyManager] 策略未在运行');
      return;
    }

    console.log('[StrategyManager] 停止所有策略...');

    if (this.spotEngine) {
      await this.spotEngine.stop();
    }

    if (this.swapEngine) {
      await this.swapEngine.stop();
    }

    this.running = false;
    console.log('[StrategyManager] 所有策略已停止');
  }

  /**
   * 暂停现货策略
   */
  async pauseSpotStrategy(): Promise<void> {
    if (this.spotEngine) {
      await this.spotEngine.stop();
      console.log('[StrategyManager] 现货策略已暂停');
    }
  }

  /**
   * 暂停合约策略
   */
  async pauseSwapStrategy(): Promise<void> {
    if (this.swapEngine) {
      await this.swapEngine.stop();
      console.log('[StrategyManager] 合约策略已暂停');
    }
  }

  /**
   * 恢复现货策略
   */
  async resumeSpotStrategy(): Promise<void> {
    if (this.spotEngine && !this.spotEngine) {
      await this.spotEngine.start();
      console.log('[StrategyManager] 现货策略已恢复');
    }
  }

  /**
   * 恢复合约策略
   */
  async resumeSwapStrategy(): Promise<void> {
    if (this.swapEngine && !this.swapEngine) {
      await this.swapEngine.start();
      console.log('[StrategyManager] 合约策略已恢复');
    }
  }

  /**
   * 获取综合状态
   */
  getOverallState(): {
    running: boolean;
    spot: SpotStrategyState | null;
    swap: NeutralGridState | null;
    totalEquity: number;
    totalPnL: number;
  } {
    const spotState = this.spotEngine?.getState() || null;
    const swapState = this.swapEngine?.getState() || null;

    const totalEquity =
      (spotState?.totalEquity || 0) +
      (swapState?.totalEquity || 0);

    const totalPnL = totalEquity - this.config.capital.totalCapital;

    return {
      running: this.running,
      spot: spotState,
      swap: swapState,
      totalEquity,
      totalPnL
    };
  }

  /**
   * 生成综合报告
   */
  generateReport(): string {
    const state = this.getOverallState();
    const runtimeHours = this.running
      ? (Date.now() - (this.spotEngine?.getState().startTime || Date.now())) / (1000 * 60 * 60)
      : 0;

    let report = `
${'='.repeat(80)}
                      OKX 量化交易系统 - 综合报告
${'='.repeat(80)}

运行状态: ${this.running ? '运行中' : '已停止'}
运行时长: ${runtimeHours.toFixed(1)} 小时

资金分配:
  总资金: ${this.config.capital.totalCapital.toFixed(2)} USDT
  现货策略: ${this.config.capital.spotPercentage}% (${(this.config.capital.totalCapital * this.config.capital.spotPercentage / 100).toFixed(2)} USDT)
  合约策略: ${this.config.capital.swapPercentage}% (${(this.config.capital.totalCapital * this.config.capital.swapPercentage / 100).toFixed(2)} USDT)
  应急储备: ${this.config.capital.reserve.toFixed(2)} USDT

总览:
  总权益: ${state.totalEquity.toFixed(2)} USDT
  总盈亏: ${state.totalPnL.toFixed(2)} USDT
  总收益率: ${((state.totalEquity / this.config.capital.totalCapital - 1) * 100).toFixed(2)}%

${'='.repeat(80)}
`;

    // 现货策略报告
    if (this.spotEngine) {
      report += '\n' + '='.repeat(80) + '\n';
      report += '现货策略 (DCA-网格混合)\n';
      report += '='.repeat(80) + '\n';
      report += this.spotEngine.generateReport();
    }

    // 合约策略报告
    if (this.swapEngine) {
      report += '\n' + '='.repeat(80) + '\n';
      report += '合约策略 (中性网格)\n';
      report += '='.repeat(80) + '\n';
      report += this.swapEngine.generateReport();
    }

    // 手续费分析
    report += '\n' + '='.repeat(80) + '\n';
    report += '手续费分析\n';
    report += '='.repeat(80) + '\n';
    report += this.generateFeeAnalysis();

    return report;
  }

  /**
   * 生成手续费分析
   */
  private generateFeeAnalysis(): string {
    let analysis = `
VIP 等级: 普通用户 (VIP 0)

现货手续费:
  Maker (挂单): ${this.SPOT_FEES.maker}%
  Taker (吃单): ${this.SPOT_FEES.taker}%

合约手续费:
  Maker (挂单): ${this.SWAP_FEES.maker}%
  Taker (吃单): ${this.SWAP_FEES.taker}%

资金费率:
  每8小时收取一次
  默认费率: ~0.01%
  年化成本: ~10.95%

优化建议:
  1. 优先使用限价单 (Maker) 获取更低手续费
  2. 合约交易手续费仅为现货的 39%，频繁交易优先用合约
  3. 中性网格策略多空对冲，资金费率相互抵消
  4. 注意资金费率方向，正费率时多头付费
`;

    return analysis;
  }

  /**
   * 风险检查
   */
  async checkRisk(): Promise<{
    level: 'normal' | 'warning' | 'danger';
    message: string;
    actions: string[];
  }> {
    const state = this.getOverallState();

    const totalDrawdown = state.spot?.currentDrawdown || 0;
    const maxDrawdown = this.config.risk.maxTotalDrawdown;

    if (totalDrawdown >= maxDrawdown) {
      return {
        level: 'danger',
        message: `回撤过大: ${totalDrawdown.toFixed(2)}% >= ${maxDrawdown}%`,
        actions: [
          '立即停止所有交易',
          '评估持仓状况',
          '考虑止损'
        ]
      };
    }

    if (totalDrawdown >= maxDrawdown * 0.7) {
      return {
        level: 'warning',
        message: `回撤警告: ${totalDrawdown.toFixed(2)}%`,
        actions: [
          '暂停新开仓',
          '检查市场状况',
          '准备止损'
        ]
      };
    }

    return {
      level: 'normal',
      message: '风险正常',
      actions: []
    };
  }

  /**
   * 再平衡资金
   */
  async rebalanceCapital(): Promise<void> {
    console.log('[StrategyManager] 执行资金再平衡...');

    // 获取当前权益
    const state = this.getOverallState();
    const currentTotal = state.totalEquity;

    // 重新计算分配
    const newSpotCapital = currentTotal * (this.config.capital.spotPercentage / 100);
    const newSwapCapital = currentTotal * (this.config.capital.swapPercentage / 100);

    console.log(`[StrategyManager] 新的资金分配:`);
    console.log(`  - 现货: ${newSpotCapital.toFixed(2)} USDT`);
    console.log(`  - 合约: ${newSwapCapital.toFixed(2)} USDT`);

    // 更新策略配置（需要重启策略）
    console.log('[StrategyManager] 注意：需要重启策略以应用新的资金分配');
  }
}
