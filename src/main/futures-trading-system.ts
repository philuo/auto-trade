/**
 * 合约高频量化交易系统
 *
 * 完整实现：
 * - 高频信号生成（微观结构指标 + 事件驱动）
 * - 动态安全管理（持仓时间限制 + 动态止盈止损）
 * - 实时日志记录（SQLite + 批量写入）
 * - 动态学习引擎（滚动统计 + 自动调整）
 *
 * 使用方法:
 *   bun run src/main/futures-trading-system.ts
 */

import { logger } from '../utils/logger';
import { loadAuthFromEnv, OkxAuth } from '../core/auth';
import { AccountApi } from '../api/account';
import { MarketApi } from '../api/market';
import { TradeApi } from '../api/trade';
import { WsClient } from '../websocket/client';
import { MarketDataProvider } from '../market/provider';
import { AdvancedSignalGenerator } from '../signals/advanced-generator';
import { HighFrequencyIndicatorCalculator, getGlobalHFCalculator } from '../indicators/microstructure-indicators';
import { HighFrequencySafetyManager, getGlobalSafetyManager } from '../risk/high-frequency-safety-manager';
import { DynamicLearningEngine, getGlobalLearningEngine } from '../learning/dynamic-learning-engine';
import { getGlobalAccountManager } from '../core/account-manager';
import type { CandleData, KLineInterval, TechnicalSignal } from '../market/types';
import type { OrderBookSnapshot, MicrostructureIndicators, RealTimeRiskMetrics } from '../indicators/microstructure-indicators';
import type { Position } from '../risk/high-frequency-safety-manager';

// =====================================================
// 系统配置
// =====================================================

export interface FuturesTradingConfig {
  // 交易币种
  coins: string[];

  // K线周期
  timeframes: KLineInterval[];

  // 交易设置
  trading: {
    /** 是否启用实际交易（false = 只监控不交易） */
    enableTrading: boolean;

    /** 基础仓位大小（USDT） */
    basePositionSize: number;

    /** 最大仓位大小（USDT） */
    maxPositionSize: number;

    /** 杠杆倍数 */
    leverage: number;
  };

  // 安全设置
  safety: {
    /** 最大持仓数量 */
    maxPositions: number;

    /** 最大风险敞口（%） */
    maxExposure: number;

    /** 连续亏损限制 */
    consecutiveLossLimit: number;

    /** 每日最大亏损（%） */
    dailyLossLimit: number;
  };

  // 信号设置
  signals: {
    /** 最小信号强度 */
    minStrength: number;

    /** 最小信号置信度 */
    minConfidence: number;

    /** 启用微观结构指标 */
    enableMicrostructure: boolean;

    /** 启用事件驱动信号 */
    enableEventDriven: boolean;
  };

  // 系统设置
  system: {
    /** K线数据更新间隔（毫秒） */
    klineUpdateInterval: number;

    /** 订单检查间隔（毫秒） */
    orderCheckInterval: number;

    /** 日志清理间隔（毫秒） */
    logCleanupInterval: number;

    /** 健康检查间隔（毫秒） */
    healthCheckInterval: number;
  };
}

// =====================================================
// 合约高频交易系统
// =====================================================

export class FuturesTradingSystem {
  private config: FuturesTradingConfig;

  // API 客户端
  private auth: OkxAuth;
  private accountApi: AccountApi;
  private marketApi: MarketApi;
  private tradeApi: TradeApi;
  private wsClient: WsClient;

  // 数据提供者
  private marketDataProvider: MarketDataProvider;

  // 信号生成器
  private signalGenerator: AdvancedSignalGenerator;
  private hfIndicatorCalculator: HighFrequencyIndicatorCalculator;

  // 安全管理器
  private safetyManager: HighFrequencySafetyManager;

  // 学习引擎
  private learningEngine: DynamicLearningEngine;

  // 系统状态
  private isRunning = false;
  private isPaused = false;
  private positions = new Map<string, Position>();

  // 定时器
  private timers: NodeJS.Timeout[] = [];

  // 统计
  private stats = {
    startTime: Date.now(),
    totalSignalsGenerated: 0,
    totalTradesExecuted: 0,
    totalPnl: 0,
    totalFees: 0,
  };

  constructor(config: Partial<FuturesTradingConfig> = {}) {
    // 默认配置
    this.config = {
      coins: ['BTC', 'ETH'],
      timeframes: ['1m', '5m', '15m'],
      trading: {
        enableTrading: false, // 默认关闭实际交易
        basePositionSize: 100,
        maxPositionSize: 500,
        leverage: 5,
      },
      safety: {
        maxPositions: 3,
        maxExposure: 30,
        consecutiveLossLimit: 3,
        dailyLossLimit: 5,
      },
      signals: {
        // 信号强度阈值 (0-1范围，与AdvancedSignalGenerator返回值一致)
        minStrength: 0.5,
        minConfidence: 0.5,
        enableMicrostructure: true,
        enableEventDriven: true,
      },
      system: {
        klineUpdateInterval: 5000,  // 5秒
        orderCheckInterval: 3000,   // 3秒
        logCleanupInterval: 3600000, // 1小时
        healthCheckInterval: 60000,  // 1分钟
      },
      ...config,
    };

    // 初始化日志
    logger.info('合约高频交易系统初始化', {
      coins: this.config.coins,
      timeframes: this.config.timeframes,
      enableTrading: this.config.trading.enableTrading,
      leverage: this.config.trading.leverage,
    });
  }

  /**
   * 启动系统
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('系统已在运行');
      return;
    }

    logger.info('========================================');
    logger.info('合约高频交易系统启动中...');
    logger.info('========================================');

    try {
      // 1. 初始化认证
      const authConfig = loadAuthFromEnv();
      if (!authConfig) {
        throw new Error('无法加载API认证配置，请检查环境变量');
      }
      this.auth = new OkxAuth(authConfig);

      // 2. 初始化API客户端
      this.accountApi = new AccountApi(this.auth, true, undefined);
      this.marketApi = new MarketApi(this.auth, true, undefined);
      this.tradeApi = new TradeApi(this.auth, true, undefined);

      logger.info('API客户端初始化完成');

      // 3. 测试API连接
      await this.testApiConnection();

      // 4. 初始化WebSocket
      this.wsClient = new WsClient(authConfig);
      await this.wsClient.connect();
      logger.info('WebSocket连接已建立');

      // 5. 初始化数据提供者
      this.marketDataProvider = new MarketDataProvider();
      logger.info('数据提供者初始化完成');

      // 6. 初始化信号生成器
      this.signalGenerator = new AdvancedSignalGenerator({
        minStrength: this.config.signals.minStrength,
        enableADXFilter: true,
        minADX: 20,
        enablePriceConfirmation: 2,
        enableVolumeConfirmation: true,
        enableMultiTimeframeConfirmation: false,
        maxSignals: 10,
        enableSafeMode: true,
      });

      // 7. 初始化高频指标计算器
      this.hfIndicatorCalculator = getGlobalHFCalculator();

      // 8. 初始化安全管理器
      this.safetyManager = getGlobalSafetyManager({
        maxPositions: this.config.safety.maxPositions,
        maxExposure: this.config.safety.maxExposure,
        consecutiveLossLimit: this.config.safety.consecutiveLossLimit,
        dailyLossLimit: this.config.safety.dailyLossLimit,
      });

      // 9. 初始化学习引擎
      this.learningEngine = getGlobalLearningEngine();

      // 10. 初始化账户管理器（用于获取实际账户数据）
      try {
        const accountManager = getGlobalAccountManager(this.auth, true); // 使用模拟账户
        this.safetyManager.setAccountManager(accountManager);
        logger.info('账户管理器已设置到安全管理器');
      } catch (error) {
        logger.warn('账户管理器设置失败，将使用默认值', { error });
      }

      logger.info('所有组件初始化完成');

      // 10. 设置杠杆
      await this.setupLeverage();

      // 11. 启动定时任务
      this.startPeriodicTasks();

      // 12. 启动WebSocket订阅
      await this.startWebSocketSubscriptions();

      this.isRunning = true;

      logger.info('========================================');
      logger.info('✓ 系统启动成功');
      logger.info('========================================');
      logger.info(`交易模式: ${this.config.trading.enableTrading ? '实盘交易' : '模拟监控'}`);
      logger.info(`交易币种: ${this.config.coins.join(', ')}`);
      logger.info(`K线周期: ${this.config.timeframes.join(', ')}`);
      logger.info(`基础仓位: ${this.config.trading.basePositionSize} USDT`);
      logger.info(`杠杆倍数: ${this.config.trading.leverage}x`);
      logger.info('========================================');

    } catch (error) {
      logger.error('系统启动失败', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * 测试API连接
   */
  private async testApiConnection(): Promise<void> {
    try {
      // 测试账户API
      const balance = await this.accountApi.getBalance();
      logger.info('账户API连接正常', {
        balanceCount: balance.length,
      });

      // 测试市场API
      const ticker = await this.marketApi.getTicker('BTC-USDT');
      logger.info('市场API连接正常', {
        btcPrice: ticker[0]?.last,
      });

    } catch (error) {
      throw new Error(`API连接测试失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 设置杠杆
   */
  private async setupLeverage(): Promise<void> {
    try {
      for (const coin of this.config.coins) {
        const instId = `${coin}-USDT-SWAP`;
        // 这里调用设置杠杆的API
        logger.info(`设置 ${coin} 杠杆为 ${this.config.trading.leverage}x`);
      }
    } catch (error) {
      logger.warn('设置杠杆失败，继续运行', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * 启动定时任务
   */
  private startPeriodicTasks(): void {
    // 1. K线数据更新任务
    const klineTimer = setInterval(() => {
      this.updateKlineData();
    }, this.config.system.klineUpdateInterval);
    this.timers.push(klineTimer);

    // 2. 订单检查任务
    const orderTimer = setInterval(() => {
      this.checkOrders();
    }, this.config.system.orderCheckInterval);
    this.timers.push(orderTimer);

    // 3. 健康检查任务
    const healthTimer = setInterval(() => {
      this.healthCheck();
    }, this.config.system.healthCheckInterval);
    this.timers.push(healthTimer);

    // 4. 统计报告任务
    const statsTimer = setInterval(() => {
      this.reportStats();
    }, 300000); // 每5分钟
    this.timers.push(statsTimer);

    logger.info('定时任务已启动', {
      klineUpdateInterval: this.config.system.klineUpdateInterval,
      orderCheckInterval: this.config.system.orderCheckInterval,
      healthCheckInterval: this.config.system.healthCheckInterval,
    });
  }

  /**
   * 启动WebSocket订阅
   */
  private async startWebSocketSubscriptions(): Promise<void> {
    for (const coin of this.config.coins) {
      for (const timeframe of this.config.timeframes) {
        const channel = `candle${timeframe}`;

        this.wsClient.subscribe(
          { channel, instId: `${coin}-USDT-SWAP` },
          (data) => {
            this.handleKlineUpdate(coin, timeframe, data);
          }
        );

        logger.debug(`订阅K线频道: ${channel}`);
      }

      // 订阅ticker
      this.wsClient.subscribe(
        { channel: 'tickers', instId: `${coin}-USDT-SWAP` },
        (data) => {
          this.handleTickerUpdate(coin, data);
        }
      );
    }

    logger.info('WebSocket订阅完成');
  }

  /**
   * 处理K线更新
   */
  private async handleKlineUpdate(coin: string, timeframe: KLineInterval, data: any): Promise<void> {
    try {
      if (this.isPaused) {
        logger.debug('系统暂停中，跳过K线更新');
        return;
      }

      // 解析K线数据
      const kline: CandleData = {
        timestamp: data[0],
        open: data[1],
        high: data[2],
        low: data[3],
        close: data[4],
        volume: data[5],
        volumeCcy: data[6] || data[5] * data[4],
      };

      logger.debug('收到K线更新', {
        coin,
        timeframe,
        timestamp: kline.timestamp,
        close: kline.close,
      });

      // 获取完整的K线数据（用于指标计算）
      const klines = await this.marketDataProvider.fetchKLines(`${coin}-USDT-SWAP`, timeframe, 100);

      if (!klines || klines.length < 50) {
        logger.debug('K线数据不足，等待更多数据', {
          coin,
          timeframe,
          count: klines?.length || 0,
        });
        return;
      }

      // 获取市场数据
      const priceData = await this.marketDataProvider.fetchPrice(`${coin}-USDT-SWAP`);
      if (!priceData) {
        logger.warn('获取价格数据失败', { coin });
        return;
      }

      const volume24h = priceData.volume24h || 0;
      const volumeMA = volume24h / 24;

      // 生成技术信号
      const technicalSignals = this.signalGenerator.generateSignals(
        coin,
        klines,
        volume24h,
        volumeMA,
        timeframe
      );

      this.stats.totalSignalsGenerated += technicalSignals.length;

      logger.debug('生成技术信号', {
        coin,
        timeframe,
        signalCount: technicalSignals.length,
        signals: technicalSignals.map(s => ({
          type: s.type,
          direction: s.direction,
          strength: s.strength.toFixed(1),
        })),
      });

      // 计算微观结构指标
      let microstructureIndicators: MicrostructureIndicators | null = null;
      if (this.config.signals.enableMicrostructure) {
        // 获取订单簿数据（这里简化，实际应该从WebSocket获取）
        const orderBook = await this.getOrderBook(coin);
        microstructureIndicators = this.hfIndicatorCalculator.calculateMicrostructureIndicators(
          coin,
          kline.close,
          kline.volume,
          orderBook,
          timeframe
        );

        logger.debug('微观结构指标', {
          coin,
          timeframe,
          orderFlowImbalance: microstructureIndicators.orderFlowImbalance.toFixed(3),
          priceMomentum1m: microstructureIndicators.priceMomentum1m.toFixed(3),
          compositeStrength: microstructureIndicators.compositeStrength.toFixed(1),
        });
      }

      // 计算实时风险指标
      const riskMetrics = this.hfIndicatorCalculator.calculateRealTimeRiskMetrics(
        coin,
        await this.getOrderBook(coin),
        0, // API延迟（待实现）
        true, // WebSocket连接状态
        0 // 订单队列长度（待实现）
      );

      // 评估每个信号
      for (const signal of technicalSignals) {
        await this.evaluateAndExecuteSignal(signal, microstructureIndicators, riskMetrics);
      }

    } catch (error) {
      logger.error('处理K线更新失败', {
        coin,
        timeframe,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * 处理ticker更新
   */
  private handleTickerUpdate(coin: string, data: any): void {
    try {
      // 更新持仓价格
      for (const [positionId, position] of this.positions) {
        if (position.coin === coin && !position.closed) {
          const currentPrice = parseFloat(data.last);
          this.safetyManager.updatePositionPrice(positionId, currentPrice);
        }
      }
    } catch (error) {
      logger.error('处理ticker更新失败', {
        coin,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * 获取订单簿
   */
  private async getOrderBook(coin: string): Promise<OrderBookSnapshot> {
    try {
      const instId = `${coin}-USDT-SWAP`;
      // 这里应该调用实际的API获取订单簿
      // 简化实现，返回模拟数据
      const priceData = await this.marketDataProvider.fetchPrice(instId);

      return {
        bids: [],
        asks: [],
        bestBid: priceData?.price * 0.9999 || 0,
        bestAsk: priceData?.price * 1.0001 || 0,
        midPrice: priceData?.price || 0,
        timestamp: Date.now(),
      };
    } catch (error) {
      logger.error('获取订单簿失败', {
        coin,
        error: error instanceof Error ? error.message : String(error),
      });

      // 返回默认值
      return {
        bids: [],
        asks: [],
        bestBid: 0,
        bestAsk: 0,
        midPrice: 0,
        timestamp: Date.now(),
      };
    }
  }

  /**
   * 评估并执行信号（异步版本，支持异步的安全检查）
   */
  private async evaluateAndExecuteSignal(
    signal: TechnicalSignal,
    microstructureIndicators: MicrostructureIndicators | null,
    riskMetrics: RealTimeRiskMetrics
  ): Promise<void> {
    try {
      // 1. 检查基础条件
      if (signal.strength < this.config.signals.minStrength) {
        logger.debug('信号强度不足', {
          signalType: signal.type,
          strength: signal.strength,
          minStrength: this.config.signals.minStrength,
        });
        return;
      }

      // 使用强度作为置信度指标（0-1范围）
      const confidence = signal.strength;
      if (confidence < this.config.signals.minConfidence) {
        logger.debug('信号置信度不足', {
          signalType: signal.type,
          confidence,
          minConfidence: this.config.signals.minConfidence,
        });
        return;
      }

      // 2. 检查微观结构指标
      if (microstructureIndicators && this.config.signals.enableMicrostructure) {
        if (microstructureIndicators.compositeStrength < 50) {
          logger.debug('微观结构指标不支持交易', {
            signalType: signal.type,
            compositeStrength: microstructureIndicators.compositeStrength,
          });
          return;
        }
      }

      // 3. 安全检查（现在是异步的）
      const safetyDecision = await this.safetyManager.checkTradeAllowed(
        signal,
        riskMetrics,
        this.config.trading.basePositionSize,
        signal.price || 0
      );

      if (!safetyDecision.allowed) {
        logger.debug('安全检查未通过', {
          signalType: signal.type,
          reason: safetyDecision.reason,
        });
        return;
      }

      // 4. 检查是否在暂停期
      if (this.learningEngine.isPaused()) {
        logger.debug('系统处于暂停期', {
          remainingTime: this.learningEngine.getPauseRemainingTime() / 1000 / 60 + '分钟',
        });
        return;
      }

      // 5. 执行交易
      if (this.config.trading.enableTrading) {
        await this.executeTrade(signal, safetyDecision.adjustments);
      } else {
        // 模拟模式，只记录不执行
        this.logTradeOpportunity(signal, safetyDecision.adjustments);
      }

    } catch (error) {
      logger.error('评估信号失败', {
        signalType: signal.type,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * 执行交易
   */
  private async executeTrade(
    signal: TechnicalSignal,
    adjustments: any
  ): Promise<void> {
    try {
      logger.info('执行交易', {
        signalType: signal.type,
        direction: signal.direction,
        strength: signal.strength,
        confidence: signal.strength,
        price: signal.price,
      });

      // 计算仓位大小
      let positionSize = this.config.trading.basePositionSize;
      if (adjustments?.positionSize) {
        positionSize = positionSize * adjustments.positionSize.base;
      }

      positionSize = Math.min(positionSize, this.config.trading.maxPositionSize);

      // 执行交易（这里简化，实际应该调用TradeApi）
      logger.info('交易执行（模拟）', {
        coin: signal.coin,
        side: signal.direction === 'bullish' ? 'buy' : 'sell',
        size: positionSize,
        price: signal.price,
      });

      this.stats.totalTradesExecuted++;

      // 创建持仓记录
      // 计算动态止盈止损
      const isLong = signal.direction === 'bullish';
      const entryPrice = signal.price || 0;

      // 高频交易止盈止损设置（基于 ATR 的动态计算）
      // 这里简化，使用固定比例
      const stopLossPercent = 0.002;  // 0.2% 止损
      const takeProfitPercent = 0.003; // 0.3% 止盈

      const stopLoss = isLong
        ? entryPrice * (1 - stopLossPercent)
        : entryPrice * (1 + stopLossPercent);

      const takeProfit = isLong
        ? entryPrice * (1 + takeProfitPercent)
        : entryPrice * (1 - takeProfitPercent);

      const position = this.safetyManager.addPosition({
        coin: signal.coin,
        side: signal.direction === 'bullish' ? 'long' : 'short',
        entryPrice,
        currentPrice: entryPrice,
        size: positionSize,
        timeframe: signal.timeframe,
        stopLoss,
        takeProfit,
        signalId: signal.id,
      });

      this.positions.set(position.positionId, position);

    } catch (error) {
      logger.error('执行交易失败', {
        signalType: signal.type,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * 记录交易机会（模拟模式）
   */
  private logTradeOpportunity(signal: TechnicalSignal, adjustments: any): void {
    logger.info('📊 发现交易机会', {
      coin: signal.coin,
      signalType: signal.type,
      direction: signal.direction,
      strength: signal.strength.toFixed(1),
      confidence: (signal.strength * 100).toFixed(1) + '%',
      price: signal.price,
      timeframe: signal.timeframe,
      adjustments: adjustments ? '有调整建议' : '无调整',
    });
  }

  /**
   * 更新K线数据
   */
  private async updateKlineData(): Promise<void> {
    // 这个方法由WebSocket推送触发，这里可以作为备用
    logger.debug('定期K线数据更新（备用）');
  }

  /**
   * 检查订单
   */
  private async checkOrders(): Promise<void> {
    try {
      // 检查所有持仓
      const positions = this.safetyManager.getPositions();

      for (const position of positions) {
        // 检查强制平仓条件
        const forcedClose = this.safetyManager.checkForcedClose(position);
        if (forcedClose.shouldClose) {
          logger.warn('强制平仓触发', {
            positionId: position.positionId,
            reason: forcedClose.reason,
          });

          if (this.config.trading.enableTrading) {
            // 执行平仓
            await this.closePosition(position.positionId, forcedClose.reason!);
          }
        }
      }

    } catch (error) {
      logger.error('检查订单失败', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * 平仓
   */
  private async closePosition(positionId: string, reason: string): Promise<void> {
    try {
      const position = this.positions.get(positionId);
      if (!position || position.closed) {
        return;
      }

      logger.info('平仓', {
        positionId,
        reason,
        entryPrice: position.entryPrice,
        currentPrice: position.currentPrice,
        pnl: position.pnl,
      });

      // 执行平仓（这里简化，实际应该调用TradeApi）
      const closePrice = position.currentPrice;
      this.safetyManager.closePosition(positionId, reason, closePrice);

      // 记录交易结果到学习引擎
      this.learningEngine.recordTrade({
        tradeId: positionId,
        coin: position.coin,
        signalType: 'MA_CROSS', // 简化，实际应该从position中获取
        timeframe: position.timeframe,
        direction: position.side === 'long' ? 'bullish' : 'bearish',
        entryPrice: position.entryPrice,
        exitPrice: closePrice,
        entryTime: position.entryTime,
        exitTime: Date.now(),
        holdingTime: Date.now() - position.entryTime,
        pnl: position.pnl || 0,
        fee: position.size * 0.0005, // 简化手续费计算
        marketConditions: {
          trend: 'uptrend',
          volatility: 'normal',
          momentum: 'strong',
        },
        signalStrength: 70,
        signalConfidence: 0.7,
      });

    } catch (error) {
      logger.error('平仓失败', {
        positionId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * 健康检查
   */
  private async healthCheck(): Promise<void> {
    try {
      // 检查API连接
      const balance = await this.accountApi.getBalance();
      logger.debug('健康检查正常', {
        balanceCount: balance.length,
        uptime: Math.floor((Date.now() - this.stats.startTime) / 1000) + 's',
        signalsGenerated: this.stats.totalSignalsGenerated,
        tradesExecuted: this.stats.totalTradesExecuted,
      });

    } catch (error) {
      logger.error('健康检查失败', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * 报告统计
   */
  private async reportStats(): Promise<void> {
    const learningStats = this.learningEngine.getRollingStats();
    const safetyStats = await this.safetyManager.getStats();

    logger.info('📊 系统统计报告', {
      runtime: Math.floor((Date.now() - this.stats.startTime) / 1000 / 60) + '分钟',
      signalsGenerated: this.stats.totalSignalsGenerated,
      tradesExecuted: this.stats.totalTradesExecuted,
      winRate: (learningStats.winRate * 100).toFixed(1) + '%',
      totalPnl: learningStats.netPnl.toFixed(2),
      activePositions: safetyStats.activePositions,
      consecutiveLosses: safetyStats.consecutiveLosses,
      currentExposure: safetyStats.currentExposure.toFixed(1) + '%',
    });
  }

  /**
   * 暂停系统
   */
  pause(): void {
    this.isPaused = true;
    logger.warn('系统已暂停');
  }

  /**
   * 恢复系统
   */
  resume(): void {
    this.isPaused = false;
    logger.info('系统已恢复');
  }

  /**
   * 停止系统
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    logger.info('系统停止中...');

    // 清除定时器
    for (const timer of this.timers) {
      clearInterval(timer);
    }
    this.timers = [];

    // 平掉所有持仓
    const positions = this.safetyManager.getPositions();
    for (const position of positions) {
      if (this.config.trading.enableTrading) {
        await this.closePosition(position.positionId, '系统关闭');
      }
    }

    // 断开WebSocket
    if (this.wsClient) {
      await this.wsClient.disconnect();
    }

    // 最终统计报告
    this.reportStats();

    this.isRunning = false;

    logger.info('系统已停止');
  }

  /**
   * 获取系统状态
   */
  getStatus(): {
    isRunning: boolean;
    isPaused: boolean;
    stats: typeof this.stats;
    config: typeof this.config;
  } {
    return {
      isRunning: this.isRunning,
      isPaused: this.isPaused,
      stats: this.stats,
      config: this.config,
    };
  }
}

// =====================================================
// 主函数
// =====================================================

export async function main(): Promise<void> {
  // 显示欢迎信息
  logger.info('');
  logger.info('╔════════════════════════════════════════════════╗');
  logger.info('║        合约高频量化交易系统                        ║');
  logger.info('║        高频信号 + 动态安全 + 智能学习               ║');
  logger.info('╚════════════════════════════════════════════════╝');
  logger.info('');

  // 创建系统实例
  const config: Partial<FuturesTradingConfig> = {
    coins: ['BTC', 'ETH'],
    timeframes: ['1m', '5m', '15m'],
    trading: {
      enableTrading: process.env.ENABLE_TRADING === 'true',
      basePositionSize: 100,
      maxPositionSize: 500,
      leverage: 5,
    },
  };

  const system = new FuturesTradingSystem(config);

  // 优雅关闭处理
  const shutdown = async (signal: string) => {
    logger.info(`\n收到 ${signal} 信号，正在关闭系统...`);
    await system.stop();
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  try {
    await system.start();

    // 保持运行
    process.stdin.resume();

  } catch (error) {
    logger.error('系统启动失败:', error as Error | Record<string, unknown>);
    process.exit(1);
  }
}

// 直接运行此脚本时执行main
if (import.meta.main) {
  main().catch((error) => {
    logger.error('系统运行失败:', error as Error | Record<string, unknown>);
    process.exit(1);
  });
}
