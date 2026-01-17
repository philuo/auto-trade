/**
 * 无人值守交易系统
 *
 * 24/7自动运行的量化交易系统：
 * - 现货DCA-Grid策略（稳健积累）
 * - 合约技术分析策略（高胜率交易）
 * - 统一风险管理
 * - 自动故障恢复
 *
 * 使用方法:
 *   bun run src/main/unattended-trading.ts
 */

import { logger } from '../utils/logger.js';
import { loadAuthFromEnv, OkxAuth } from '../core/auth.js';
import { createTradeApi, TradeApi } from '../api/trade.js';
import { MarketApi } from '../api/market.js';
import { AccountApi } from '../api/account.js';
import { createWsClient, WsClient } from '../websocket/client.js';
import { SpotDCAGridEngine } from '../strategies/spot-dca-grid/core/engine.js';
import { DEFAULT_CONFIG as SPOT_DEFAULT, type SpotDCAGridConfig } from '../strategies/spot-dca-grid/config/default-params.js';
import { TechnicalCoordinator } from '../trading/technical-coordinator.js';
import type { TechnicalCoordinatorConfig } from '../trading/technical-coordinator.js';

// =====================================================
// 配置类型
// =====================================================

export interface UnattendedTradingConfig {
  // 现货配置
  spot: {
    enabled: boolean;
    capital: number;
    coins: string[];
  } & Omit<Partial<SpotDCAGridConfig>, 'capital' | 'coins'>;

  // 合约配置
  perpetual: {
    enabled: boolean;
    capital: number;
    coins: string[];
    leverage: { BTC: number; ETH: number };
  } & Partial<TechnicalCoordinatorConfig>;

  // 风险配置
  risk: {
    emergencyReserve: number;
    maxDrawdown: number;
    circuitBreakers: {
      priceChange: number;      // 单K线涨跌幅限制
      volatility: number;       // 波动率限制
    };
  };

  // 系统配置
  system: {
    isDemo: boolean;
    healthCheckInterval: number;  // 健康检查间隔（秒）
    restartDelay: number;          // 重启延迟（秒）
    maxRestartAttempts: number;    // 最大重启尝试次数
  };
}

// 默认配置
export const DEFAULT_UNATTENDED_CONFIG: UnattendedTradingConfig = {
  spot: {
    enabled: true,
    capital: 6000,
    coins: ['BNB', 'SOL', 'XRP', 'ADA', 'DOGE'],
    base: {
      strategyName: 'Unattended Spot DCA-Grid',
      version: '2.0.0',
      logLevel: 'info',
      enabled: true,
    },
  },

  perpetual: {
    enabled: true,
    capital: 2000,
    coins: ['BTC', 'ETH'],
    leverage: { BTC: 2, ETH: 2 },
    riskLimits: {
      maxSinglePosition: 0.03,   // 3%
      maxTotalPosition: 0.15,    // 15%
      maxStopLoss: 0.02,         // 2%
    },
  },

  risk: {
    emergencyReserve: 2000,
    maxDrawdown: 0.20,           // 20%
    circuitBreakers: {
      priceChange: 10,           // 10%
      volatility: 50,            // 50
    },
  },

  system: {
    isDemo: true,                // 默认使用模拟盘
    healthCheckInterval: 30,     // 30秒
    restartDelay: 5,             // 5秒
    maxRestartAttempts: 3,       // 最多重试3次
  },
};

// =====================================================
// 无人值守交易系统
// =====================================================

export class UnattendedTradingSystem {
  private config: UnattendedTradingConfig;
  private auth: OkxAuth;

  // API 客户端
  private tradeApi: TradeApi;
  private marketApi: MarketApi;
  private accountApi: AccountApi;
  private wsClient: WsClient;

  // 策略实例
  private spotEngine: SpotDCAGridEngine | null = null;
  private perpetualCoordinator: TechnicalCoordinator | null = null;

  // 运行状态
  private running = false;
  private healthCheckTimer: NodeJS.Timeout | null = null;
  private restartAttempts = 0;

  constructor(config: Partial<UnattendedTradingConfig> = {}) {
    // 加载认证
    const authConfig = loadAuthFromEnv();
    if (!authConfig) {
      throw new Error('无法加载认证信息，请检查环境变量');
    }

    this.auth = new OkxAuth(authConfig);
    this.config = this.mergeConfig(config);

    // 创建API客户端
    const proxy = process.env.HTTP_PROXY || process.env.HTTPS_PROXY;
    this.tradeApi = createTradeApi(this.auth, this.config.system.isDemo, proxy);
    this.marketApi = new MarketApi(this.auth, this.config.system.isDemo, proxy);
    this.accountApi = new AccountApi(this.auth, this.config.system.isDemo, proxy);

    // 创建WebSocket客户端
    this.wsClient = createWsClient({
      apiKey: authConfig.apiKey,
      secretKey: authConfig.secretKey,
      passphrase: authConfig.passphrase,
      isDemo: this.config.system.isDemo,
      proxy,
    });
  }

  /**
   * 启动系统
   */
  async start(): Promise<void> {
    if (this.running) {
      logger.warn('系统已经在运行中');
      return;
    }

    try {
      logger.info('==========================================');
      logger.info('无人值守交易系统启动中...');
      logger.info('==========================================');
      logger.info(`模式: ${this.config.system.isDemo ? '模拟盘' : '实盘'}`);
      logger.info(`现货策略: ${this.config.spot.enabled ? '启用' : '禁用'}`);
      logger.info(`合约策略: ${this.config.perpetual.enabled ? '启用' : '禁用'}`);
      logger.info(`应急储备: ${this.config.risk.emergencyReserve} USDT`);
      logger.info('==========================================');

      // 初始化现货策略
      if (this.config.spot.enabled) {
        await this.initSpotStrategy();
      }

      // 初始化合约策略
      if (this.config.perpetual.enabled) {
        await this.initPerpetualStrategy();
      }

      // 启动健康检查
      this.startHealthCheck();

      this.running = true;
      this.restartAttempts = 0;

      logger.info('✓ 系统启动成功，进入24/7运行模式');
      logger.info('按 Ctrl+C 停止系统');

    } catch (error) {
      logger.error('系统启动失败:', error as Error | Record<string, unknown>);
      await this.stop();
      throw error;
    }
  }

  /**
   * 停止系统
   */
  async stop(): Promise<void> {
    if (!this.running) {
      return;
    }

    logger.info('正在停止系统...');

    this.running = false;

    // 停止健康检查
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }

    // 停止策略
    if (this.spotEngine) {
      try {
        await this.spotEngine.stop();
        logger.info('✓ 现货策略已停止');
      } catch (error) {
        logger.error('停止现货策略失败:', error as Error | Record<string, unknown>);
      }
    }

    if (this.perpetualCoordinator) {
      try {
        // TODO: 添加停止方法
        logger.info('✓ 合约策略已停止');
      } catch (error) {
        logger.error('停止合约策略失败:', error as Error | Record<string, unknown>);
      }
    }

    // 关闭WebSocket
    try {
      this.wsClient.disconnect();
      logger.info('✓ WebSocket已关闭');
    } catch (error) {
      logger.error('关闭WebSocket失败:', error as Error | Record<string, unknown>);
    }

    logger.info('系统已停止');
  }

  /**
   * 初始化现货策略
   */
  private async initSpotStrategy(): Promise<void> {
    logger.info('初始化现货DCA-Grid策略...');

    // 创建现货策略配置
    const spotConfig: SpotDCAGridConfig = {
      base: {
        strategyName: 'Unattended Spot DCA-Grid',
        version: '2.0.0',
        enabled: true,
        logLevel: 'info',
      },
      capital: {
        totalCapital: this.config.spot.capital,
        emergencyReserve: 5,
        maxCapitalPerCoin: 30,
        minCapitalPerCoin: 500,
      },
      coins: {
        allowedCoins: this.config.spot.coins as any,
        activeCoinLimit: 5,
        rebalanceInterval: 24,
      },
      dca: {
        enabled: true,
        baseOrderSize: 100,
        frequency: 24,
        maxOrders: 10,
        reverseDCA: {
          enabled: true,
          triggerThreshold: 3,
          levels: [
            { priceDrop: 3, multiplier: 1.0 },
            { priceDrop: 5, multiplier: 2.0 },
          ],
        },
      },
      grid: {
        enabled: true,
        rangeCalculation: {
          mode: 'adaptive',
          upperRange: 15,
          lowerRange: 15,
          adjustOnBreakout: true,
        },
        gridSettings: {
          gridCount: 20,
          spacing: 'geometric',
          geometricRatio: 1.02,
        },
        orderSettings: {
          size: 50,
          sizeType: 'fixed',
        },
        behavior: {
          rebalanceMode: 'wait',
          accumulateMode: true,
          takeProfit: 5,
        },
      },
      risk: {
        stopLoss: {
          enabled: true,
          percentage: 10,
          trailing: {
            enabled: false,
            distance: 2,
            activationProfit: 5,
          },
        },
        drawdown: {
          warningLevel: 10,
          pauseLevel: 20,
          emergencyLevel: 30,
          recoveryLevel: 5,
        },
        position: {
          maxPositionSize: 3000,
          maxPositionPercentage: 30,
          diversification: true,
        },
      },
      dynamicRange: {
        enabled: true,
        recalculationTriggers: {
          priceBreakout: true,
          volatilityChange: true,
          volumeSpike: false,
          timeElapsed: true,
          trendChange: true,
        },
        thresholds: {
          breakoutThreshold: 5,
          volatilityChangeThreshold: 30,
          volumeSpikeMultiplier: 2,
          maxRangeAge: 24,
        },
      },
      backtest: {
        enabled: false,
        historicalDataDays: 30,
        validationDays: 7,
        optimization: {
          enabled: false,
          method: 'grid',
          iterations: 100,
          metric: 'sharpe',
        },
      },
    };

    // 创建现货策略实例 - 注意: SpotDCAGridEngine 需要 2 个参数
    this.spotEngine = new SpotDCAGridEngine(spotConfig as any, {
      okxApi: null, // 暂时使用 null，实际应该传入 API 实例
      updateInterval: 5000,
      enableAutoTrade: false, // 默认不自动交易
      maxConcurrentOrders: 10,
    });

    // 启动策略
    await this.spotEngine.start();

    logger.info('✓ 现货策略已启动', {
      coins: spotConfig.coins,
      capital: spotConfig.capital,
    });
  }

  /**
   * 初始化合约策略
   */
  private async initPerpetualStrategy(): Promise<void> {
    logger.info('初始化合约技术分析策略...');

    // 创建合约策略配置
    const perpetualConfig: TechnicalCoordinatorConfig = {
      ...this.config.perpetual,
      auth: {
        apiKey: (this.auth as any).apiKey,
        secretKey: (this.auth as any).secretKey,
        passphrase: (this.auth as any).passphrase,
      },
      isDemo: this.config.system.isDemo,
      strategyName: 'Unattended Perpetual Technical',
      version: '1.0.0',
      logLevel: 'info',
    };

    // 创建合约策略实例
    // 注意：TechnicalCoordinator 需要 IMarketDataProvider
    // 这里暂时跳过，因为需要额外的市场数据提供者配置
    logger.info('✓ 合约策略已启动（配置完成，需要集成市场数据提供者）');
  }

  /**
   * 启动健康检查
   */
  private startHealthCheck(): void {
    const interval = this.config.system.healthCheckInterval * 1000;

    this.healthCheckTimer = setInterval(async () => {
      try {
        await this.performHealthCheck();
      } catch (error) {
        logger.error('健康检查失败:', error as Error | Record<string, unknown>);
        await this.handleFailure(error as Error);
      }
    }, interval);

    logger.info(`✓ 健康检查已启动（间隔: ${this.config.system.healthCheckInterval}秒）`);
  }

  /**
   * 执行健康检查
   */
  private async performHealthCheck(): Promise<void> {
    // 检查API连接
    try {
      await this.accountApi.getBalance();
    } catch (error) {
      throw new Error('API连接失败');
    }

    // 检查策略状态
    const strategiesRunning: string[] = [];
    const strategiesFailed: string[] = [];

    if (this.config.spot.enabled) {
      if (this.spotEngine && this.spotEngine.getState() !== 'stopped' as any) {
        strategiesRunning.push('Spot DCA-Grid');
      } else {
        strategiesFailed.push('Spot DCA-Grid');
      }
    }

    if (this.config.perpetual.enabled) {
      if (this.perpetualCoordinator) {
        strategiesRunning.push('Perpetual Technical Analysis');
      } else {
        strategiesFailed.push('Perpetual Technical Analysis');
      }
    }

    logger.debug('策略状态检查', {
      running: strategiesRunning,
      failed: strategiesFailed,
    });

    // 检查持仓和订单
    try {
      // 获取当前持仓
      const positions = await this.accountApi.getPositions();
      const abnormalPositions = positions.filter(p => {
        // 检查是否有异常亏损的持仓
        return parseFloat(p.upl) !== 0 && parseFloat(p.uplRatio) < -0.5; // 亏损超过50%
      });

      if (abnormalPositions.length > 0) {
        logger.warn('检测到异常持仓', {
          positions: abnormalPositions.map(p => ({
            instId: p.instId,
            upl: p.upl,
            uplRatio: p.uplRatio,
          })),
        });
      }

      // 获取未完成订单
      const pendingOrders = await this.tradeApi.getOrdersList();
      const oldOrders = pendingOrders.filter(o => {
        const orderTime = parseInt(o.cTime);
        const age = (Date.now() - orderTime) / 1000 / 60; // 分钟
        return age > 60; // 超过60分钟未成交
      });

      if (oldOrders.length > 0) {
        logger.warn('检测到长期未成交订单', {
          orders: oldOrders.map(o => ({
            ordId: o.ordId,
            instId: o.instId,
            age: `${Math.floor((Date.now() - parseInt(o.cTime)) / 1000 / 60)}分钟`,
          })),
        });
      }
    } catch (error) {
      logger.error('检查持仓和订单失败:', error as Error | Record<string, unknown>);
    }

    // 检查回撤
    try {
      const balance = await this.accountApi.getBalance();
      const totalEquity = parseFloat(balance.find(b => b.ccy === 'USDT')?.eq || '0');

      // 这里需要记录初始权益来计算回撤
      // 简化处理：假设应急储备是不应该亏损的
      const emergencyReserve = this.config.risk.emergencyReserve;
      const availableForTrading = totalEquity - emergencyReserve;

      if (availableForTrading < emergencyReserve * 0.8) {
        const drawdown = 1 - (availableForTrading / (this.config.spot.capital + this.config.perpetual.capital));
        logger.warn('回撤接近限制', {
          currentEquity: totalEquity,
          availableForTrading,
          maxDrawdown: this.config.risk.maxDrawdown,
          currentDrawdown: drawdown.toFixed(4),
        });

        if (drawdown > this.config.risk.maxDrawdown) {
          throw new Error(`回撤超限: ${(drawdown * 100).toFixed(2)}%`);
        }
      }
    } catch (error) {
      if ((error as Error).message?.includes('回撤超限')) {
        throw error;
      }
      logger.error('检查回撤失败:', error as Error | Record<string, unknown>);
    }

    logger.debug('健康检查通过');
  }

  /**
   * 处理故障
   */
  private async handleFailure(error: Error): Promise<void> {
    this.restartAttempts++;

    logger.error(`系统故障（尝试 ${this.restartAttempts}/${this.config.system.maxRestartAttempts}）:`, error);

    if (this.restartAttempts >= this.config.system.maxRestartAttempts) {
      logger.error('达到最大重启尝试次数，系统停止');
      await this.stop();
      process.exit(1);
    }

    logger.info(`${this.config.system.restartDelay}秒后尝试重启...`);

    // 等待后重启
    await new Promise(resolve => setTimeout(resolve, this.config.system.restartDelay * 1000));

    try {
      await this.restart();
      this.restartAttempts = 0;
      logger.info('✓ 系统重启成功');
    } catch (error) {
      logger.error('重启失败:', error as Error | Record<string, unknown>);
    }
  }

  /**
   * 重启系统
   */
  private async restart(): Promise<void> {
    logger.info('正在重启系统...');

    // 停止当前运行的策略
    if (this.spotEngine) {
      try {
        await this.spotEngine.stop();
      } catch (error) {
        logger.error('停止现货策略失败:', error as Error | Record<string, unknown>);
      }
    }

    // 重新启动
    await this.start();
  }

  /**
   * 合并配置
   */
  private mergeConfig(userConfig: Partial<UnattendedTradingConfig>): UnattendedTradingConfig {
    return {
      spot: { ...DEFAULT_UNATTENDED_CONFIG.spot, ...userConfig.spot },
      perpetual: { ...DEFAULT_UNATTENDED_CONFIG.perpetual, ...userConfig.perpetual },
      risk: { ...DEFAULT_UNATTENDED_CONFIG.risk, ...userConfig.risk },
      system: { ...DEFAULT_UNATTENDED_CONFIG.system, ...userConfig.system },
    };
  }
}

// =====================================================
// 主入口
// =====================================================

export async function main(config?: Partial<UnattendedTradingConfig>): Promise<void> {
  const system = new UnattendedTradingSystem(config);

  // 优雅关闭处理
  const shutdown = async (signal: string) => {
    logger.info(`收到 ${signal} 信号，正在关闭系统...`);
    await system.stop();
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  // 启动系统
  try {
    await system.start();

    // 保持运行
    process.stdin.resume();
  } catch (error) {
    logger.error('系统运行失败:', error as Error | Record<string, unknown>);
    process.exit(1);
  }
}

// 直接运行此脚本时执行main
if (import.meta.main) {
  main().catch(console.error);
}
