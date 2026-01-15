/**
 * 策略引擎主控
 *
 * 功能：
 * - 策略生命周期管理
 * - 协调所有策略模块
 * - 处理市场数据更新
 * - 执行交易决策
 * - 状态监控和报告
 */

import type {
  AllowedCoin,
  SpotDCAGridConfig,
  StrategyState,
  Decision
} from '../config/strategy-config';
import type {
  MarketData,
  CoinPosition,
  PriceRange
} from '../config/types';

import { DCAEngine } from './dca-engine';
import { GridEngine } from './grid-engine';
import { StrategyCoordinator } from './coordinator';
import { NetworkStateManager } from '../../../core/network-state-manager.js';
import { DualDataSourceManager, type DataSourceType } from '../../../core/dual-data-source-manager.js';
import { Logger } from '../../../utils/logger.js';

// =====================================================
// 策略引擎配置
// =====================================================

export interface EngineConfig {
  okxApi: any;                  // OKX API 客户端
  wsClient?: any;               // WebSocket 客户端（可选）
  updateInterval: number;        // 更新间隔（毫秒）
  enableAutoTrade: boolean;      // 是否自动交易
  maxConcurrentOrders: number;   // 最大并发订单数

  // 双重数据源配置（可选）
  enableDualDataSource?: boolean;   // 是否启用双重数据源（默认 false）
  restPollInterval?: number;        // REST 轮询间隔（毫秒，默认 2000）
}

// =====================================================
// 策略引擎类
// =====================================================

export class SpotDCAGridStrategyEngine {
  private config: SpotDCAGridConfig;
  private engineConfig: EngineConfig;

  // 策略模块
  private dcaEngine: DCAEngine;
  private gridEngine: GridEngine;
  private coordinator: StrategyCoordinator;

  // 策略状态
  private state: StrategyState;
  private running: boolean = false;
  private intervalId: NodeJS.Timeout | null = null;

  // 市场数据缓存
  private marketDataCache: Map<AllowedCoin, MarketData> = new Map();

  // 双重数据源管理
  private networkStateManager: NetworkStateManager;
  private dataSourceManager: DualDataSourceManager | null = null;
  private logger: Logger;

  constructor(strategyConfig: SpotDCAGridConfig, engineConfig: EngineConfig) {
    this.config = strategyConfig;
    this.engineConfig = engineConfig;

    // 初始化策略模块
    this.dcaEngine = new DCAEngine(strategyConfig.dca);
    this.gridEngine = new GridEngine(strategyConfig.grid);
    this.coordinator = new StrategyCoordinator(this.dcaEngine, this.gridEngine);

    // 初始化状态
    this.state = {
      config: strategyConfig,
      coins: new Map(),
      totalEquity: strategyConfig.capital.totalCapital,
      peakEquity: strategyConfig.capital.totalCapital,
      currentDrawdown: 0,
      startTime: Date.now(),
      lastUpdateTime: Date.now()
    };

    // 初始化网络状态管理器
    this.networkStateManager = new NetworkStateManager({
      websocketStaleThreshold: 5000,   // 5 秒
      restStaleThreshold: 10000,       // 10 秒
      silentDisconnectThreshold: 8000, // 8 秒
      logStateChanges: true
    });

    // 初始化日志
    this.logger = Logger.getInstance();

    // 初始化双重数据源管理器（如果启用）
    if (this.engineConfig.enableDualDataSource === true) {
      this.dataSourceManager = new DualDataSourceManager(
        this.engineConfig.okxApi,
        this.networkStateManager,
        this.engineConfig.wsClient,
        {
          restPollInterval: this.engineConfig.restPollInterval ?? 2000,
          enableWebSocket: !!this.engineConfig.wsClient,
          enableDataValidation: true,
          logDataSourceSwitches: true
        }
      );

      // 监听市场数据更新
      this.dataSourceManager.onMarketData((coin, data, source) => {
        this.handleMarketDataUpdate(coin, data, source);
      });

      // 监听数据源切换事件
      this.dataSourceManager.on('switch', (event) => {
        this.logger.info('数据源切换', {
          from: event.details?.from,
          to: event.details?.to,
          reason: event.details?.reason
        });
      });
    }
  }

  /**
   * 启动策略
   */
  async start(): Promise<void> {
    if (this.running) {
      console.log('[StrategyEngine] 策略已在运行中');
      return;
    }

    console.log('[StrategyEngine] 启动策略...');
    console.log('[StrategyEngine]', this.config.base.strategyName, 'v' + this.config.base.version);

    // 验证配置
    // const validation = ConfigValidator.validate(this.config);
    // if (!validation.valid) {
    //   throw new Error(`配置验证失败: ${validation.errors.join(', ')}`);
    // }

    // 初始化活跃币种
    await this.initializeActiveCoins();

    // 启动双重数据源管理器
    if (this.dataSourceManager) {
      const coins = Array.from(this.state.coins.keys());
      await this.dataSourceManager.start(coins);
      console.log('[StrategyEngine] 双重数据源管理器已启动');
    }

    // 启动定时更新
    this.running = true;
    this.startUpdateLoop();

    console.log('[StrategyEngine] 策略已启动');
  }

  /**
   * 停止策略
   */
  async stop(): Promise<void> {
    if (!this.running) {
      console.log('[StrategyEngine] 策略未在运行');
      return;
    }

    console.log('[StrategyEngine] 停止策略...');

    this.running = false;

    // 停止定时更新
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    // 停止双重数据源管理器
    if (this.dataSourceManager) {
      this.dataSourceManager.stop();
      console.log('[StrategyEngine] 双重数据源管理器已停止');
    }

    // 取消所有挂单（可选）
    // await this.cancelAllPendingOrders();

    console.log('[StrategyEngine] 策略已停止');
  }

  /**
   * 初始化活跃币种
   */
  private async initializeActiveCoins(): Promise<void> {
    console.log('[StrategyEngine] 初始化活跃币种...');

    // 简化处理：使用配置中的所有允许币种
    // 实际应用中应该通过币种选择器动态选择
    const activeCoins = this.config.coins.allowedCoins.slice(0, this.config.coins.activeCoinLimit);

    for (const coin of activeCoins) {
      // 获取当前价格
      const currentPrice = await this.getCurrentPrice(coin);

      // 初始化 DCA 引擎
      this.dcaEngine.initializeCoin(coin);

      // 初始化网格引擎
      this.gridEngine.initializeCoin(coin, currentPrice);

      // 初始化协同调度器
      this.coordinator.initializeCoin(coin);

      // 初始化币种状态
      this.state.coins.set(coin, {
        coin,
        enabled: true,
        allocatedCapital: this.config.capital.totalCapital / activeCoins.length,
        currentPrice,
        avgEntryPrice: 0,
        totalAmount: 0,
        totalValue: 0,
        unrealizedPnL: 0,
        lastDCA: 0
      });

      console.log(`[StrategyEngine] ${coin}: 初始化完成, 当前价格 ${currentPrice}`);
    }

    console.log(`[StrategyEngine] 已初始化 ${activeCoins.length} 个币种`);
  }

  /**
   * 启动更新循环
   */
  private startUpdateLoop(): void {
    this.intervalId = setInterval(async () => {
      try {
        await this.update();
      } catch (error) {
        console.error('[StrategyEngine] 更新出错:', error);
      }
    }, this.engineConfig.updateInterval);
  }

  /**
   * 主更新函数
   */
  private async update(): Promise<void> {
    if (!this.running) {
      return;
    }

    const now = Date.now();

    // 1. 更新市场数据
    await this.updateMarketData();

    // 2. 更新币种状态
    for (const [coin, coinState] of this.state.coins) {
      if (!coinState.enabled) {
        continue;
      }

      const marketData = this.marketDataCache.get(coin);
      if (!marketData) {
        continue;
      }

      // 更新价格
      coinState.currentPrice = marketData.price;
      this.gridEngine.updatePrice(coin, marketData.price);

      // 构建仓位信息
      const position: CoinPosition = {
        coin,
        symbol: `${coin}-USDT`,
        amount: coinState.totalAmount,
        avgPrice: coinState.avgEntryPrice,
        currentPrice: marketData.price,
        value: coinState.totalValue,
        cost: coinState.totalAmount * coinState.avgEntryPrice,
        unrealizedPnL: coinState.unrealizedPnL,
        unrealizedPnLPercent: coinState.avgEntryPrice > 0
          ? ((marketData.price - coinState.avgEntryPrice) / coinState.avgEntryPrice) * 100
          : 0,
        lastUpdate: now
      };

      // 自动调整协同模式
      await this.coordinator.autoAdjustMode(coin, position);

      // 3. 生成决策
      const decision = await this.coordinator.makeDecision(coin, marketData, position);

      // 4. 执行决策
      if (decision && decision.action !== 'hold') {
        await this.executeDecision(decision);
      }
    }

    // 5. 更新总权益和回撤
    await this.updateEquity();

    this.state.lastUpdateTime = now;
  }

  /**
   * 更新市场数据
   */
  private async updateMarketData(): Promise<void> {
    // 如果启用了双重数据源管理器，数据会通过回调自动更新
    // 这里只需要检查数据是否过期
    if (this.dataSourceManager) {
      const now = Date.now();
      const networkState = this.networkStateManager.getState();

      // 如果数据过期，记录警告
      if (networkState.isDataStale) {
        this.logger.warn('市场数据已过期', {
          wsDataAge: now - networkState.lastWsDataTime,
          restDataAge: now - networkState.lastRestDataTime,
          currentSource: networkState.primarySource
        });
      }
      return;
    }

    // 降级到传统 REST 轮询方式
    for (const coin of this.state.coins.keys()) {
      try {
        const symbol = `${coin}-USDT`;
        const ticker = await this.engineConfig.okxApi.getTicker(symbol);

        const marketData: MarketData = {
          symbol,
          coin,
          timestamp: Date.now(),
          price: parseFloat(ticker.last),
          bidPrice: parseFloat(ticker.bidPx),
          askPrice: parseFloat(ticker.askPx),
          volume24h: parseFloat(ticker.vol24h),
          change24h: parseFloat(ticker.open24h) - parseFloat(ticker.last),
          changePercent24h: parseFloat(ticker.last) > 0
            ? ((parseFloat(ticker.last) - parseFloat(ticker.open24h)) / parseFloat(ticker.open24h)) * 100
            : 0,
          high24h: parseFloat(ticker.high24h),
          low24h: parseFloat(ticker.low24h)
        };

        this.marketDataCache.set(coin, marketData);
      } catch (error) {
        console.error(`[StrategyEngine] 获取 ${coin} 市场数据失败:`, error);
      }
    }
  }

  /**
   * 处理双重数据源管理器的市场数据更新
   */
  private handleMarketDataUpdate(coin: AllowedCoin, data: MarketData, source: DataSourceType): void {
    // 更新缓存
    this.marketDataCache.set(coin, data);

    // 记录数据源（用于调试）
    if (this.config.base.logLevel === 'debug') {
      console.debug(`[StrategyEngine] 市场数据更新: ${coin} @ ${data.price} (来源: ${source})`);
    }

    // 注意：实际的策略决策仍然由 update() 方法中的定时器触发
    // 这个方法只是更新缓存的数据
  }

  /**
   * 执行决策
   */
  private async executeDecision(decision: Decision): Promise<void> {
    console.log(`[StrategyEngine] 执行决策: ${decision.coin} ${decision.action} (${decision.type}) - ${decision.reason}`);

    if (!this.engineConfig.enableAutoTrade) {
      console.log('[StrategyEngine] 自动交易已禁用，跳过执行');
      return;
    }

    try {
      switch (decision.action) {
        case 'buy':
        case 'sell':
          await this.placeOrder(decision);
          break;

        case 'hold':
          // 不执行任何操作
          break;

        case 'pause':
          // 暂停策略
          this.coordinator.setMode(decision.coin, 'pause', decision.reason);
          break;

        case 'emergency':
          // 紧急情况处理
          await this.handleEmergency(decision);
          break;

        default:
          console.warn(`[StrategyEngine] 未知的决策动作: ${decision.action}`);
      }
    } catch (error) {
      console.error(`[StrategyEngine] 执行决策失败:`, error);
    }
  }

  /**
   * 下单
   */
  private async placeOrder(decision: Decision): Promise<void> {
    const symbol = `${decision.coin}-USDT`;
    const size = decision.size || 0;
    const price = decision.price || 0;

    if (size <= 0 || price <= 0) {
      console.warn('[StrategyEngine] 无效的订单参数:', decision);
      return;
    }

    // 计算数量（精度处理）
    const amount = size / price;

    // 调用 OKX API 下单
    const order = await this.engineConfig.okxApi.placeOrder({
      instId: symbol,
      tdMode: 'cash',
      side: decision.action,
      ordType: 'limit',
      sz: amount.toFixed(8),
      px: price.toFixed(2)
    });

    console.log(`[StrategyEngine] 订单已提交: ${symbol} ${decision.action} ${amount.toFixed(6)} @ ${price.toFixed(2)}`);

    // 更新状态
    if (decision.type === 'dca') {
      await this.dcaEngine.executeDCA(decision.coin, {
        coin: decision.coin,
        type: decision.reason.includes('reverse') ? 'reverse_dca' : 'regular_dca',
        size,
        price,
        reason: decision.reason,
        timestamp: decision.timestamp
      });
    }
  }

  /**
   * 处理紧急情况
   */
  private async handleEmergency(decision: Decision): Promise<void> {
    console.error(`[StrategyEngine] 紧急情况: ${decision.coin} - ${decision.reason}`);

    // 取消所有挂单
    // await this.cancelAllOrdersForCoin(decision.coin);

    // 暂停策略
    this.coordinator.setMode(decision.coin, 'pause', decision.reason);
  }

  /**
   * 更新总权益
   */
  private async updateEquity(): Promise<void> {
    let totalValue = 0;

    for (const [coin, coinState] of this.state.coins) {
      if (!coinState.enabled) {
        continue;
      }

      const marketData = this.marketDataCache.get(coin);
      if (!marketData) {
        continue;
      }

      // 计算持仓价值
      const positionValue = coinState.totalAmount * marketData.price;
      coinState.totalValue = positionValue;

      // 计算未实现盈亏
      if (coinState.avgEntryPrice > 0) {
        const cost = coinState.totalAmount * coinState.avgEntryPrice;
        coinState.unrealizedPnL = positionValue - cost;
      }

      totalValue += positionValue;
    }

    // 加上现金余额（简化处理）
    totalValue += this.config.capital.totalCapital * (this.config.capital.emergencyReserve / 100);

    this.state.totalEquity = totalValue;

    // 更新峰值权益
    if (totalValue > this.state.peakEquity) {
      this.state.peakEquity = totalValue;
    }

    // 计算回撤
    this.state.currentDrawdown = ((this.state.peakEquity - totalValue) / this.state.peakEquity) * 100;
  }

  /**
   * 获取当前价格
   */
  private async getCurrentPrice(coin: AllowedCoin): Promise<number> {
    try {
      const symbol = `${coin}-USDT`;
      const ticker = await this.engineConfig.okxApi.getTicker(symbol);
      return parseFloat(ticker.last);
    } catch (error) {
      console.error(`[StrategyEngine] 获取 ${coin} 价格失败:`, error);
      return 0;
    }
  }

  /**
   * 获取策略状态
   */
  getState(): StrategyState {
    return { ...this.state };
  }

  /**
   * 获取 DCA 引擎
   */
  getDCAEngine(): DCAEngine {
    return this.dcaEngine;
  }

  /**
   * 获取网格引擎
   */
  getGridEngine(): GridEngine {
    return this.gridEngine;
  }

  /**
   * 获取协同调度器
   */
  getCoordinator(): StrategyCoordinator {
    return this.coordinator;
  }

  /**
   * 生成策略报告
   */
  generateReport(): string {
    const runtimeHours = (Date.now() - this.state.startTime) / (1000 * 60 * 60);

    let report = `
================================================================================
                    ${this.config.base.strategyName} v${this.config.base.version}
================================================================================

运行状态: ${this.running ? '运行中' : '已停止'}
运行时长: ${runtimeHours.toFixed(1)} 小时
最后更新: ${new Date(this.state.lastUpdateTime).toLocaleString()}

资金概览:
  总权益: ${this.state.totalEquity.toFixed(2)} USDT
  峰值权益: ${this.state.peakEquity.toFixed(2)} USDT
  当前回撤: ${this.state.currentDrawdown.toFixed(2)}%
  总收益率: ${((this.state.totalEquity / this.config.capital.totalCapital - 1) * 100).toFixed(2)}%

活跃币种: ${this.state.coins.size}
`;

    for (const [coin, coinState] of this.state.coins) {
      if (!coinState.enabled) {
        continue;
      }

      report += `\n${'='.repeat(80)}\n`;
      report += this.dcaEngine.generateReport(coin);
      report += `\n\n`;
      report += this.gridEngine.generateReport(coin);
      report += `\n\n`;
      report += this.coordinator.generateReport(coin);
    }

    report += `\n${'='.repeat(80)}\n`;

    return report;
  }

  /**
   * 获取网络状态概览
   */
  getNetworkState() {
    return this.networkStateManager.getState();
  }

  /**
   * 获取数据源统计信息
   */
  getDataSourceStats() {
    if (!this.dataSourceManager) {
      return {
        enabled: false,
        message: '双重数据源管理器未启用'
      };
    }

    return {
      enabled: true,
      ...this.dataSourceManager.getStats(),
      networkState: this.networkStateManager.getState(),
      reconnectStats: this.networkStateManager.getReconnectStats()
    };
  }

  /**
   * 获取当前使用的市场数据
   */
  getMarketData(coin: AllowedCoin): MarketData | null {
    return this.marketDataCache.get(coin) || null;
  }

  /**
   * 获取所有市场数据
   */
  getAllMarketData(): Map<AllowedCoin, MarketData> {
    return new Map(this.marketDataCache);
  }
}

// 导出别名，与 index.ts 保持一致
export { SpotDCAGridStrategyEngine as SpotDCAGridEngine };
