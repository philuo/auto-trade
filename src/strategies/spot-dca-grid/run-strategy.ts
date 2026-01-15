/**
 * DCA + 网格混合策略启动脚本
 *
 * 使用方法:
 *   bun run src/strategies/spot-dca-grid/run-strategy.ts
 *
 * 环境变量:
 *   OKX_API_KEY        - OKX API Key
 *   OKX_SECRET_KEY     - OKX Secret Key
 *   OKX_PASSPHRASE     - OKX Passphrase
 *   HTTP_PROXY         - (可选) 代理地址
 */

import { OkxAuth, loadAuthFromEnv } from '../../core/auth.js';
import { TradeApi, createTradeApi } from '../../api/trade.js';
import { MarketApi } from '../../api/market.js';
import { AccountApi } from '../../api/account.js';
import { SpotDCAGridEngine } from './core/engine.js';
import { DEFAULT_CONFIG, type SpotDCAGridConfig } from './config/default-params.js';
import { OrderGenerator } from './order-management/order-generator.js';
import { OrderTracker } from './order-management/order-tracker.js';
import { StopLossManager } from './risk-management/stop-loss.js';
import { DrawdownController } from './risk-management/drawdown-controller.js';
import { PositionController } from './risk-management/position-controller.js';
import { VolatilityCalculator } from './multi-coin/volatility-calculator.js';
import { RangeCalculator } from './dynamic-range/range-calculator.js';
import { createWsClient, type WsClient } from '../../websocket/client.js';

// =====================================================
// 策略运行器类
// =====================================================

export class StrategyRunner {
  private config: SpotDCAGridConfig;
  private auth: OkxAuth;
  private isDemo: boolean;

  // API 客户端
  private tradeApi: TradeApi;
  private marketApi: MarketApi;
  private accountApi: AccountApi;
  private wsClient: WsClient;

  // 策略组件
  private engine: SpotDCAGridEngine;
  private orderGenerator: OrderGenerator;
  private orderTracker: OrderTracker;
  private stopLossManager: StopLossManager;
  private drawdownController: DrawdownController;
  private positionController: PositionController;
  private volatilityCalculator: VolatilityCalculator;
  private rangeCalculator: RangeCalculator;

  // 运行状态
  private running = false;
  private updateFrequencyMs = 5000; // 5 秒更新一次

  constructor(config?: Partial<SpotDCAGridConfig>, isDemo = true) {
    // 加载认证信息
    const authConfig = loadAuthFromEnv();
    if (!authConfig) {
      throw new Error('无法加载认证信息，请检查环境变量 OKX_API_KEY, OKX_SECRET_KEY, OKX_PASSPHRASE');
    }

    this.auth = new OkxAuth(authConfig);
    this.isDemo = isDemo;
    this.config = { ...DEFAULT_CONFIG, ...config };

    // 创建 API 客户端
    const proxy = process.env.HTTP_PROXY || process.env.HTTPS_PROXY;
    this.tradeApi = createTradeApi(this.auth, isDemo, proxy);
    this.marketApi = new MarketApi(this.auth, isDemo, proxy);
    this.accountApi = new AccountApi(this.auth, isDemo, proxy);

    // 创建 WebSocket 客户端
    this.wsClient = createWsClient({
      apiKey: authConfig.apiKey,
      secretKey: authConfig.secretKey,
      passphrase: authConfig.passphrase,
      isDemo,
      autoReconnect: true,
    });

    // 创建策略组件
    this.orderGenerator = new OrderGenerator({
      okxApi: this.tradeApi,
      pricePrecision: 2,
      sizePrecision: 8,
      minOrderSize: 10,
      slippageTolerance: 0.1
    });

    this.orderTracker = new OrderTracker(this.tradeApi, 1000);

    this.stopLossManager = new StopLossManager({
      percentage: {
        enabled: true,
        maxLossPercentage: this.config.risk.stopLoss.percentage,
        warningPercentage: this.config.risk.stopLoss.percentage * 0.7
      },
      trailing: {
        enabled: this.config.risk.stopLoss.trailing.enabled,
        activationProfit: this.config.risk.stopLoss.trailing.activationProfit || 10,
        distance: this.config.risk.stopLoss.trailing.distance || 5,
        updateFrequency: 60000
      },
      time: {
        enabled: false,
        maxHoldingTime: 30 * 24 * 60 * 60 * 1000,
        checkInterval: 24 * 60 * 60 * 1000,
        lossThreshold: 5,
        closePercentage: 50
      },
      volatility: {
        enabled: false,
        volatilityDropThreshold: 50,
        lossThreshold: 3,
        closePercentage: 30
      },
      global: { cooldownPeriod: 3600000, minProfitToDisable: 20 }
    });

    this.drawdownController = new DrawdownController(this.config.capital, {
      warningLevel: this.config.risk.drawdown.warningLevel,
      pauseLevel: this.config.risk.drawdown.pauseLevel,
      emergencyLevel: this.config.risk.drawdown.emergencyLevel,
      recoveryLevel: this.config.risk.drawdown.recoveryLevel
    });

    this.positionController = new PositionController({
      totalCapital: this.config.capital.totalCapital,
      emergencyReserve: this.config.capital.emergencyReserve,
      maxCapitalPerCoin: this.config.capital.maxCapitalPerCoin,
      minCapitalPerCoin: this.config.capital.minCapitalPerCoin,
      enableDiversification: true
    });

    this.volatilityCalculator = new VolatilityCalculator();
    this.rangeCalculator = new RangeCalculator(undefined, this.volatilityCalculator);

    // 创建策略引擎
    this.engine = new SpotDCAGridEngine(this.config, {
      okxApi: {
        getTicker: async (symbol: string) => {
          const tickers = await this.marketApi.getTicker(symbol);
          return tickers[0];
        },
        placeOrder: async (params: any) => this.tradeApi.placeOrder(params),
        getBalance: async () => this.accountApi.getBalance(),
        getCandles: async (params: any) => this.marketApi.getCandles(params)
      },
      updateInterval: this.updateFrequencyMs,
      enableAutoTrade: !this.isDemo,
      maxConcurrentOrders: 20
    });

    // 设置日志级别
    if (this.config.base.logLevel) {
      this.setLogLevel(this.config.base.logLevel);
    }
  }

  /**
   * 启动策略
   */
  async start(): Promise<void> {
    if (this.running) {
      console.warn('[StrategyRunner] 策略已在运行中');
      return;
    }

    console.log('[StrategyRunner] 启动 DCA + 网格混合策略...');
    console.log(`  模拟盘: ${this.isDemo ? '是' : '否'}`);
    console.log(`  总资金: ${this.config.capital.totalCapital} USDT`);
    console.log(`  交易币种: ${this.config.coins.allowedCoins.join(', ')}`);
    console.log(`  DCA: ${this.config.dca.enabled ? '启用' : '禁用'}`);
    console.log(`  网格: ${this.config.grid.enabled ? '启用' : '禁用'}`);
    console.log('');

    this.running = true;

    try {
      // 启动订单追踪器
      this.orderTracker.start();

      // 连接 WebSocket
      await this.wsClient.connectPublic();
      console.log('[StrategyRunner] WebSocket 公共连接已建立');

      await this.wsClient.connectPrivate();
      console.log('[StrategyRunner] WebSocket 私有连接已建立');

      // 启动策略引擎
      await this.engine.start();
      console.log('[StrategyRunner] 策略引擎已启动');

      console.log('[StrategyRunner] 策略已启动');
      console.log('');
      this.printStatus();

    } catch (error) {
      console.error('[StrategyRunner] 启动失败:', error);
      this.running = false;
      throw error;
    }
  }

  /**
   * 停止策略
   */
  async stop(): Promise<void> {
    if (!this.running) {
      console.warn('[StrategyRunner] 策略未在运行');
      return;
    }

    console.log('[StrategyRunner] 正在停止策略...');
    this.running = false;

    try {
      // 停止订单追踪
      this.orderTracker.stop();

      // 停止策略引擎
      await this.engine.stop();

      // 断开 WebSocket
      this.wsClient.disconnect();

      console.log('[StrategyRunner] 策略已停止');
      this.printFinalReport();

    } catch (error) {
      console.error('[StrategyRunner] 停止时出错:', error);
    }
  }

  /**
   * 打印当前状态
   */
  private printStatus(): void {
    const stats = this.orderTracker.getStats();
    const positionReport = this.positionController.generateReport();
    const drawdownReport = this.drawdownController.generateReport();

    console.log('========================================');
    console.log('策略状态');
    console.log('========================================');
    console.log(positionReport);
    console.log('');
    console.log(drawdownReport);
    console.log('');
    console.log('订单统计:');
    console.log(`  活跃订单: ${stats.activeOrders}`);
    console.log(`  已成交: ${stats.filledOrders}`);
    console.log('========================================');
    console.log('');
  }

  /**
   * 打印最终报告
   */
  private printFinalReport(): void {
    console.log('');
    console.log('========================================');
    console.log('最终报告');
    console.log('========================================');

    const stats = this.orderTracker.getStats();
    console.log(`总订单数: ${stats.totalOrders}`);
    console.log(`已成交: ${stats.filledOrders}`);
    console.log(`已取消: ${stats.cancelledOrders}`);
    console.log(`成交总额: ${stats.filledValue.toFixed(2)} USDT`);

    console.log('');
    console.log('各币种 DCA 状态:');
    for (const coin of this.config.coins.allowedCoins) {
      const dcaState = this.engine.getDCAEngine().getCoinState(coin as any);
      if (dcaState) {
        console.log(`  ${coin}: ${dcaState.totalOrders} 单, ${dcaState.totalInvested.toFixed(2)} USDT`);
      }
    }

    console.log('');
    console.log('各币种网格状态:');
    for (const coin of this.config.coins.allowedCoins) {
      const gridStats = this.engine.getGridEngine().getGridStats(coin as any);
      if (gridStats) {
        console.log(`  ${coin}: ${gridStats.totalBuyOrders} 买单, ${gridStats.totalSellOrders} 卖单, ${gridStats.realizedProfit.toFixed(2)} USDT`);
      }
    }

    console.log('========================================');
  }

  /**
   * 设置日志级别
   */
  private setLogLevel(level: string): void {
    const levels = ['debug', 'info', 'warn', 'error'];
    if (levels.includes(level)) {
      // TODO: 实现日志级别控制
    }
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<SpotDCAGridConfig>): void {
    this.config = { ...this.config, ...config };
    // 注意：需要重启引擎才能应用新配置
    console.log('[StrategyRunner] 配置已更新，需要重启引擎才能生效');
  }

  /**
   * 获取策略引擎（用于高级操作）
   */
  getEngine(): SpotDCAGridEngine {
    return this.engine;
  }
}

// =====================================================
// 主程序入口
// =====================================================

async function main() {
  const runner = new StrategyRunner({}, true); // 默认使用模拟盘

  // 处理退出信号
  const shutdown = async (signal: string) => {
    console.log(``);
    console.log(`收到 ${signal} 信号，正在关闭...`);
    await runner.stop();
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  try {
    await runner.start();

    // 保持运行
    process.stdin.resume();

  } catch (error) {
    console.error('策略运行失败:', error);
    process.exit(1);
  }
}

// 直接运行此文件时执行主程序
if (import.meta.main) {
  main().catch(console.error);
}
