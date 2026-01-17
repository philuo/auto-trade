/**
 * 策略引擎抽象基类
 *
 * 所有策略都应该继承这个基类，避免重复代码
 */

import { logger } from '../../utils/logger;
import type {
  BaseConfig,
  TradingDecision,
  StrategyPerformance,
  MarketContext,
  PositionInfo,
  TradingMode,
} from '../../types/index;
import type { IMarketDataProvider } from '../../market/base-provider;

// =====================================================
// 策略状态
// =====================================================

/**
 * 策略运行状态
 */
export enum StrategyState {
  IDLE = 'idle',                   // 空闲
  RUNNING = 'running',             // 运行中
  PAUSED = 'paused',               // 暂停
  STOPPED = 'stopped',             // 已停止
  ERROR = 'error',                 // 错误状态
}

/**
 * 策略基类配置
 */
export interface BaseStrategyConfig extends BaseConfig {
  /** 交易模式 */
  mode: TradingMode;
  /** 交易币种列表 */
  coins: string[];
  /** 更新频率（毫秒） */
  updateInterval: number;
}

// =====================================================
// 策略引擎抽象基类
// =====================================================

/**
 * 策略引擎抽象基类
 * 提供所有策略的公共功能
 */
export abstract class BaseStrategyEngine<
  TConfig extends BaseStrategyConfig,
  TState extends Record<string, any>
> {
  // =====================================================
  // 属性
  // =====================================================

  /** 策略配置 */
  protected readonly config: TConfig;

  /** 市场数据提供者 */
  protected readonly marketDataProvider: IMarketDataProvider;

  /** 策略状态 */
  protected state: StrategyState = StrategyState.STOPPED;

  /** 策略内部状态 */
  protected strategyState: TState;

  /** 运行标志 */
  protected running: boolean = false;

  /** 更新定时器 */
  private updateTimer: NodeJS.Timeout | null = null;

  /** 启动时间 */
  protected startTime: number = 0;

  /** 统计信息 */
  protected stats = {
    totalUpdates: 0,
    totalDecisions: 0,
    totalErrors: 0,
    lastUpdate: 0,
    lastDecision: 0,
    lastError: null as Error | null,
  };

  // =====================================================
  // 构造函数
  // =====================================================

  constructor(
    config: TConfig,
    marketDataProvider: IMarketDataProvider,
    initialState: TState
  ) {
    this.config = config;
    this.marketDataProvider = marketDataProvider;
    this.strategyState = initialState;
  }

  // =====================================================
  // 公共方法
  // =====================================================

  /**
   * 启动策略
   */
  async start(): Promise<void> {
    if (this.running) {
      logger.warn(`[${this.config.strategyName}] 策略已在运行中`);
      return;
    }

    try {
      logger.info(`[${this.config.strategyName}] 启动中...`);
      logger.info(`  模式: ${this.config.mode}`);
      logger.info(`  币种: ${this.config.coins.join(', ')}`);
      logger.info(`  更新频率: ${this.config.updateInterval}ms`);

      // 初始化策略
      await this.initialize();

      // 启动更新循环
      this.startUpdateLoop();

      this.running = true;
      this.state = StrategyState.RUNNING;
      this.startTime = Date.now();

      logger.info(`[${this.config.strategyName}] ✓ 启动成功`);
    } catch (error) {
      logger.error(`[${this.config.strategyName}] 启动失败:`, error as Error | Record<string, unknown>);
      this.state = StrategyState.ERROR;
      throw error;
    }
  }

  /**
   * 停止策略
   */
  async stop(): Promise<void> {
    if (!this.running) {
      return;
    }

    logger.info(`[${this.config.strategyName}] 停止中...`);

    this.running = false;

    // 停止更新循环
    if (this.updateTimer) {
      clearTimeout(this.updateTimer);
      this.updateTimer = null;
    }

    // 清理资源
    await this.cleanup();

    this.state = StrategyState.STOPPED;

    const runtime = Date.now() - this.startTime;
    logger.info(`[${this.config.strategyName}] ✓ 已停止 (运行时间: ${Math.floor(runtime / 1000)}秒)`);
  }

  /**
   * 暂停策略
   */
  async pause(): Promise<void> {
    if (!this.running) {
      return;
    }

    logger.info(`[${this.config.strategyName}] 暂停中...`);

    this.running = false;
    this.state = StrategyState.PAUSED;

    if (this.updateTimer) {
      clearTimeout(this.updateTimer);
      this.updateTimer = null;
    }

    logger.info(`[${this.config.strategyName}] ✓ 已暂停`);
  }

  /**
   * 恢复策略
   */
  async resume(): Promise<void> {
    if (this.running) {
      return;
    }

    if (this.state !== StrategyState.PAUSED) {
      logger.warn(`[${this.config.strategyName}] 策略未暂停，无法恢复`);
      return;
    }

    logger.info(`[${this.config.strategyName}] 恢复中...`);

    this.startUpdateLoop();
    this.running = true;
    this.state = StrategyState.RUNNING;

    logger.info(`[${this.config.strategyName}] ✓ 已恢复`);
  }

  /**
   * 获取策略状态
   */
  getState(): StrategyState {
    return this.state;
  }

  /**
   * 获取统计信息
   */
  getStats() {
    return {
      ...this.stats,
      state: this.state,
      uptime: this.startTime > 0 ? Date.now() - this.startTime : 0,
      performance: this.getPerformance(),
    };
  }

  /**
   * 生成报告
   */
  generateReport(): string {
    const stats = this.getStats();
    const performance = this.getPerformance();
    const uptime = Math.floor(stats.uptime / 1000);

    const lines = [
      `=== ${this.config.strategyName} 报告 ===`,
      ``,
      `状态: ${this.state}`,
      `运行时间: ${Math.floor(uptime / 60)}分${uptime % 60}秒`,
      ``,
      `统计:`,
      `  总更新: ${stats.totalUpdates}次`,
      `  总决策: ${stats.totalDecisions}次`,
      `  总错误: ${stats.totalErrors}次`,
      ``,
      `绩效:`,
      `  总收益率: ${(performance.totalReturn * 100).toFixed(2)}%`,
      `  胜率: ${(performance.winRate * 100).toFixed(1)}%`,
      `  最大回撤: ${(performance.maxDrawdown * 100).toFixed(2)}%`,
    ];

    return lines.join('\n');
  }

  // =====================================================
  // 抽象方法（子类必须实现）
  // =====================================================

  /**
   * 初始化策略
   */
  protected abstract initialize(): Promise<void>;

  /**
   * 执行一次策略更新
   */
  protected abstract update(): Promise<void>;

  /**
   * 清理资源
   */
  protected abstract cleanup(): Promise<void>;

  /**
   * 获取策略绩效
   */
  protected abstract getPerformance(): StrategyPerformance;

  // =====================================================
  // 模板方法（可选重写）
  // =====================================================

  /**
   * 更新前钩子
   */
  protected async beforeUpdate(): Promise<void> {
    // 子类可重写
  }

  /**
   * 更新后钩子
   */
  protected async afterUpdate(): Promise<void> {
    // 子类可重写
  }

  /**
   * 错误处理钩子
   */
  protected async handleError(error: Error): Promise<void> {
    this.stats.totalErrors++;
    this.stats.lastError = error;
    logger.error(`[${this.config.strategyName}] 更新失败:`, error as Error | Record<string, unknown>);

    // 子类可重写以添加自定义错误处理
  }

  // =====================================================
  // 辅助方法
  // =====================================================

  /**
   * 启动更新循环
   */
  private startUpdateLoop(): void {
    const loop = async () => {
      if (!this.running) {
        return;
      }

      try {
        await this.beforeUpdate();
        await this.update();
        await this.afterUpdate();

        this.stats.totalUpdates++;
        this.stats.lastUpdate = Date.now();
      } catch (error) {
        await this.handleError(error as Error);
      }

      // 安排下一次更新
      if (this.running) {
        this.updateTimer = setTimeout(loop, this.config.updateInterval);
      }
    };

    // 立即执行第一次更新
    loop();
  }

  /**
   * 获取市场上下文
   */
  protected async getMarketContext(symbol: string): Promise<MarketContext> {
    return this.marketDataProvider.getMarketContext(symbol);
  }

  /**
   * 批量获取市场上下文
   */
  protected async getMarketContexts(symbols: string[]): Promise<Map<string, MarketContext>> {
    const contexts = new Map<string, MarketContext>();

    await Promise.all(
      symbols.map(async (symbol) => {
        try {
          const context = await this.getMarketContext(symbol);
          contexts.set(symbol, context);
        } catch (error) {
          logger.error(`获取 ${symbol} 市场数据失败:`, error as Error | Record<string, unknown>);
        }
      })
    );

    return contexts;
  }

  /**
   * 记录交易决策
   */
  protected recordDecision(decision: TradingDecision): void {
    this.stats.totalDecisions++;
    this.stats.lastDecision = decision.timestamp;

    logger.info(`[${this.config.strategyName}] 决策:`, {
      symbol: decision.symbol,
      action: decision.action,
      confidence: decision.confidence,
      reason: decision.reason,
    });
  }

  /**
   * 检查策略是否可以交易
   */
  protected canTrade(): boolean {
    return this.running && this.state === StrategyState.RUNNING;
  }

  /**
   * 计算运行时间
   */
  protected getUptime(): number {
    if (this.startTime === 0) {
      return 0;
    }
    return Date.now() - this.startTime;
  }
}
