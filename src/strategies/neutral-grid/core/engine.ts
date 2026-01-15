/**
 * 中性合约网格策略引擎
 *
 * 主控引擎，协调所有策略模块
 */

import type {
  SwapAllowedCoin,
  NeutralGridConfig,
  NeutralGridState,
  CoinGridState,
  SwapMarketData,
  NeutralGridDecision,
  FeeCalculation
} from '../config/types';

import { NeutralGridEngine } from './neutral-grid-engine';
import { FundingRateManager } from './funding-manager';

// =====================================================
// 引擎配置
// =====================================================

export interface NeutralEngineConfig {
  okxApi: any;                      // OKX API 客户端
  updateInterval: number;            // 更新间隔（毫秒）
  enableAutoTrade: boolean;          // 是否自动交易
  maxConcurrentOrders: number;       // 最大并发订单数
  feeRates: {
    maker: number;                   // Maker 手续费率
    taker: number;                   // Taker 手续费率
  };
}

// =====================================================
// 中性网格策略引擎类
// =====================================================

export class NeutralGridStrategyEngine {
  private config: NeutralGridConfig;
  private engineConfig: NeutralEngineConfig;

  // 策略模块
  private gridEngine: NeutralGridEngine;
  private fundingManager: FundingRateManager;

  // 策略状态
  private state: NeutralGridState;
  private running: boolean = false;
  private intervalId: NodeJS.Timeout | null = null;

  // 市场数据缓存
  private marketDataCache: Map<SwapAllowedCoin, SwapMarketData> = new Map();

  // 手续费统计
  private feeStats: Map<SwapAllowedCoin, FeeCalculation> = new Map();

  constructor(strategyConfig: NeutralGridConfig, engineConfig: NeutralEngineConfig) {
    this.config = strategyConfig;
    this.engineConfig = engineConfig;

    // 初始化策略模块
    this.gridEngine = new NeutralGridEngine(strategyConfig.grid);
    this.fundingManager = new FundingRateManager(strategyConfig.funding);

    // 初始化状态
    this.state = {
      config: strategyConfig,
      coins: new Map(),
      totalEquity: strategyConfig.capital.totalCapital,
      peakEquity: strategyConfig.capital.totalCapital,
      currentDrawdown: 0,
      totalPnL: 0,
      totalFundingFee: 0,
      startTime: Date.now(),
      lastUpdateTime: Date.now()
    };
  }

  /**
   * 启动策略
   */
  async start(): Promise<void> {
    if (this.running) {
      console.log('[NeutralGridEngine] 策略已在运行中');
      return;
    }

    console.log('[NeutralGridEngine] 启动中性网格策略...');
    console.log('[NeutralGridEngine]', this.config.base.strategyName, 'v' + this.config.base.version);

    // 初始化活跃币种
    await this.initializeActiveCoins();

    // 启动定时更新
    this.running = true;
    this.startUpdateLoop();

    console.log('[NeutralGridEngine] 策略已启动');
  }

  /**
   * 停止策略
   */
  async stop(): Promise<void> {
    if (!this.running) {
      console.log('[NeutralGridEngine] 策略未在运行');
      return;
    }

    console.log('[NeutralGridEngine] 停止策略...');

    this.running = false;

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    console.log('[NeutralGridEngine] 策略已停止');
  }

  /**
   * 初始化活跃币种
   */
  private async initializeActiveCoins(): Promise<void> {
    console.log('[NeutralGridEngine] 初始化币种...');

    const activeCoins = this.config.coins.allowedCoins.slice(0, this.config.coins.activeCoinLimit);

    for (const coin of activeCoins) {
      // 获取当前价格
      const currentPrice = await this.getCurrentPrice(coin);

      // 计算分配资金
      const capitalPerCoin = this.config.capital.totalCapital *
        (this.config.capital.maxCapitalPerCoin / 100) / activeCoins.length;

      // 初始化网格引擎
      this.gridEngine.initializeCoin(coin, capitalPerCoin, currentPrice);

      // 初始化手续费统计
      this.feeStats.set(coin, {
        makerFee: this.engineConfig.feeRates.maker,
        takerFee: this.engineConfig.feeRates.taker,
        fundingRate: 0,
        tradingFees: 0,
        fundingFees: 0,
        netProfit: 0,
        tradeCount: 0,
        makerRatio: 0
      });

      console.log(`[NeutralGridEngine] ${coin}: 初始化完成, 价格 ${currentPrice}, 杠杆 ${this.config.capital.leverage[coin]}x`);
    }

    console.log(`[NeutralGridEngine] 已初始化 ${activeCoins.length} 个币种`);
  }

  /**
   * 启动更新循环
   */
  private startUpdateLoop(): void {
    this.intervalId = setInterval(async () => {
      try {
        await this.update();
      } catch (error) {
        console.error('[NeutralGridEngine] 更新出错:', error);
      }
    }, this.engineConfig.updateInterval);
  }

  /**
   * 主更新函数
   */
  private async update(): Promise<void> {
    if (!this.running) return;

    // 1. 更新市场数据
    await this.updateMarketData();

    // 2. 更新每个币种
    for (const [coin, coinState] of this.state.coins) {
      if (!coinState.enabled) continue;

      const marketData = this.marketDataCache.get(coin);
      if (!marketData) continue;

      // 更新价格
      this.gridEngine.updatePrice(coin, marketData.price);

      // 检查资金费率
      if (this.fundingManager.needsUpdate()) {
        const fundingInfo = this.fundingManager.checkFundingRate(coin, marketData, coinState);
        this.fundingManager.recordFundingRate(coin, marketData.fundingRate);

        if (fundingInfo.recommendation !== 'hold') {
          console.log(`[NeutralGridEngine] ${coin} 资金费率建议: ${fundingInfo.reason}`);
        }
      }

      // 生成交易决策
      const decisions = this.gridEngine.generateDecisions(coin, marketData);

      // 执行决策
      for (const decision of decisions) {
        await this.executeDecision(decision);
      }
    }

    // 3. 更新总权益
    await this.updateEquity();

    this.state.lastUpdateTime = Date.now();
  }

  /**
   * 更新市场数据
   */
  private async updateMarketData(): Promise<void> {
    for (const coin of this.state.coins.keys()) {
      try {
        const instId = `${coin}-USDT-SWAP`;
        const ticker = await this.engineConfig.okxApi.getSwapTicker(instId);

        const marketData: SwapMarketData = {
          coin,
          symbol: instId,
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
          low24h: parseFloat(ticker.low24h),
          fundingRate: parseFloat(ticker.fundingRate || '0'),
          nextFundingTime: Date.now() + 8 * 60 * 60 * 1000,
          markPrice: parseFloat(ticker.markPx || ticker.last),
          indexPrice: parseFloat(ticker.idxPx || ticker.last)
        };

        this.marketDataCache.set(coin, marketData);
      } catch (error) {
        console.error(`[NeutralGridEngine] 获取 ${coin} 市场数据失败:`, error);
      }
    }
  }

  /**
   * 执行决策
   */
  private async executeDecision(decision: NeutralGridDecision): Promise<void> {
    console.log(`[NeutralGridEngine] ${decision.coin} ${decision.action} - ${decision.reason}`);

    if (!this.engineConfig.enableAutoTrade) {
      console.log('[NeutralGridEngine] 自动交易已禁用');
      return;
    }

    try {
      const instId = `${decision.coin}-USDT-SWAP`;
      const leverage = this.config.capital.leverage[decision.coin];

      switch (decision.action) {
        case 'open_long':
          await this.placeOrder(instId, 'buy', decision.size || 0, decision.price || 0, leverage);
          break;

        case 'open_short':
          await this.placeOrder(instId, 'sell', decision.size || 0, decision.price || 0, leverage);
          break;

        case 'close_long':
          await this.closePosition(instId, 'long', decision.size || 0);
          break;

        case 'close_short':
          await this.closePosition(instId, 'short', decision.size || 0);
          break;

        case 'rebalance':
          this.gridEngine.rebalance(decision.coin);
          break;

        case 'pause':
          const coinState = this.state.coins.get(decision.coin);
          if (coinState) {
            coinState.enabled = false;
          }
          break;
      }
    } catch (error) {
      console.error(`[NeutralGridEngine] 执行决策失败:`, error);
    }
  }

  /**
   * 下单（优先使用 Maker）
   */
  private async placeOrder(
    instId: string,
    side: 'buy' | 'sell',
    size: number,
    price: number,
    leverage: number
  ): Promise<void> {
    if (size <= 0 || price <= 0) {
      console.warn('[NeutralGridEngine] 无效的订单参数');
      return;
    }

    // 计算合约张数
    const contractValue = 1; // USDT本位合约，每张1 USDT
    const sizeInContracts = Math.floor(size / contractValue);

    // 下限价单（Maker）
    const order = await this.engineConfig.okxApi.placeSwapOrder({
      instId,
      tdMode: 'isolated',
      side,
      posSide: side === 'buy' ? 'long' : 'short',
      ordType: 'limit',
      sz: sizeInContracts.toString(),
      px: price.toFixed(2),
      lever: leverage.toString()
    });

    console.log(`[NeutralGridEngine] 订单已提交: ${instId} ${side} ${sizeInContracts}张 @ ${price.toFixed(2)}`);

    // 更新手续费统计
    const coin = instId.split('-')[0] as SwapAllowedCoin;
    const stats = this.feeStats.get(coin);
    if (stats) {
      stats.tradeCount++;
      stats.tradingFees += size * (stats.makerFee / 100);
      stats.makerRatio = 0.9; // 假设90%是Maker
    }
  }

  /**
   * 平仓
   */
  private async closePosition(instId: string, posSide: 'long' | 'short', size: number): Promise<void> {
    // 使用市价单快速平仓
    const sizeInContracts = Math.floor(size);

    await this.engineConfig.okxApi.placeSwapOrder({
      instId,
      tdMode: 'isolated',
      side: posSide === 'long' ? 'sell' : 'buy',
      posSide,
      ordType: 'market',
      sz: sizeInContracts.toString(),
      reduceOnly: true
    });

    console.log(`[NeutralGridEngine] 平仓: ${instId} ${posSide} ${sizeInContracts}张`);
  }

  /**
   * 更新总权益
   */
  private async updateEquity(): Promise<void> {
    let totalValue = this.config.capital.totalCapital;

    for (const [coin, coinState] of this.state.coins) {
      if (!coinState.enabled) continue;

      // 多头盈亏
      totalValue += coinState.longPosition.unrealizedPnL;

      // 空头盈亏
      totalValue += coinState.shortPosition.unrealizedPnL;

      // 资金费
      totalValue += coinState.fundingReceived - coinState.fundingPaid;
    }

    this.state.totalEquity = totalValue;

    // 更新峰值
    if (totalValue > this.state.peakEquity) {
      this.state.peakEquity = totalValue;
    }

    // 计算回撤
    this.state.currentDrawdown = ((this.state.peakEquity - totalValue) / this.state.peakEquity) * 100;
  }

  /**
   * 获取当前价格
   */
  private async getCurrentPrice(coin: SwapAllowedCoin): Promise<number> {
    try {
      const instId = `${coin}-USDT-SWAP`;
      const ticker = await this.engineConfig.okxApi.getSwapTicker(instId);
      return parseFloat(ticker.last);
    } catch (error) {
      console.error(`[NeutralGridEngine] 获取 ${coin} 价格失败:`, error);
      return 0;
    }
  }

  /**
   * 获取策略状态
   */
  getState(): NeutralGridState {
    return { ...this.state };
  }

  /**
   * 生成策略报告
   */
  generateReport(): string {
    const runtimeHours = (Date.now() - this.state.startTime) / (1000 * 60 * 60);

    let report = `
${'='.repeat(80)}
              ${this.config.base.strategyName} v${this.config.base.version}
${'='.repeat(80)}

运行状态: ${this.running ? '运行中' : '已停止'}
运行时长: ${runtimeHours.toFixed(1)} 小时
最后更新: ${new Date(this.state.lastUpdateTime).toLocaleString()}

资金概览:
  总权益: ${this.state.totalEquity.toFixed(2)} USDT
  峰值权益: ${this.state.peakEquity.toFixed(2)} USDT
  当前回撤: ${this.state.currentDrawdown.toFixed(2)}%
  总收益率: ${((this.state.totalEquity / this.config.capital.totalCapital - 1) * 100).toFixed(2)}%
  总盈亏: ${this.state.totalPnL.toFixed(2)} USDT
  净资金费: ${this.state.totalFundingFee.toFixed(4)} USDT

活跃币种: ${this.state.coins.size}
`;

    for (const [coin, coinState] of this.state.coins) {
      if (!coinState.enabled) continue;

      const marketData = this.marketDataCache.get(coin);
      report += '\n' + this.gridEngine.generateReport(coin);

      if (marketData) {
        report += '\n' + this.fundingManager.generateReport(coin, marketData);
      }

      const feeStats = this.feeStats.get(coin);
      if (feeStats) {
        report += `
手续费统计:
  交易次数: ${feeStats.tradeCount}
  交易手续费: ${feeStats.tradingFees.toFixed(4)} USDT
  资金费用: ${feeStats.fundingFees.toFixed(4)} USDT
  净利润: ${feeStats.netProfit.toFixed(2)} USDT
  Maker比例: ${(feeStats.makerRatio * 100).toFixed(1)}%
`;
      }

      report += '\n' + '='.repeat(80) + '\n';
    }

    return report;
  }
}
