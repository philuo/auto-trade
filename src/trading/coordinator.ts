/**
 * 现货交易协调器
 *
 * 协调 AI 决策、规则引擎和安全验证器，生成最终的交易决策
 */

import { logger } from '../utils/logger.js';
import { GLMClient } from '../ai/index.js';
import { RuleEngine } from '../rules/index.js';
import { SafetyValidator } from '../safety/index.js';
import { TradeHistory } from '../history/index.js';
import type {
  SpotCoordinatorConfig,
  CoordinatedDecision,
  ExecutionResult,
  CoordinatorStats,
  MarketContext,
  PositionInfo,
  DecisionCallback,
  ExecutionCallback,
  WeightConfig,
} from './types.js';
import type {
  RuleEngineInput,
  RuleSignal,
  PriceData,
  RiskLevel,
} from '../rules/types.js';
import { SignalType } from '../rules/types.js';
import type {
  TradeRequest,
  MarketStatus,
  AccountStatus,
  SafetyValidationResult,
} from '../safety/types.js';
import { TradeActionType } from '../safety/types.js';
import type { AITradingDecision, MarketScanResult } from '../ai/types.js';

/**
 * 现货交易协调器类
 */
export class SpotCoordinator {
  private config: SpotCoordinatorConfig;
  private aiClient: GLMClient;
  private ruleEngine: RuleEngine;
  private safetyValidator: SafetyValidator;
  private tradeHistory: TradeHistory;

  // 统计信息
  private stats: CoordinatorStats = {
    totalDecisions: 0,
    aiDecisions: 0,
    ruleDecisions: 0,
    coordinatedDecisions: 0,
    buyDecisions: 0,
    sellDecisions: 0,
    holdDecisions: 0,
    totalPnL: 0,
    aiWinRate: 0,
    ruleWinRate: 0,
    overallWinRate: 0,
    profitFactor: 0,
    maxDrawdown: 0,
  };

  // 回调函数
  private decisionCallbacks: Set<DecisionCallback> = new Set();
  private executionCallbacks: Set<ExecutionCallback> = new Set();

  // 状态管理
  private latestMarketScan?: MarketScanResult;
  private latestAIDecisions: AITradingDecision[] = [];
  private latestRuleSignals: RuleSignal[] = [];
  private peakAccountValue = 0;
  private initialAccountValue = 0;

  // 任务管理
  private lastAICallTime = 0;
  private lastPerformanceReportTime = 0;
  private lastDeepAnalysisTime = 0;

  constructor(config: SpotCoordinatorConfig, aiClient: GLMClient, ruleEngine: RuleEngine, safetyValidator: SafetyValidator) {
    this.config = config;
    this.aiClient = aiClient;
    this.ruleEngine = ruleEngine;
    this.safetyValidator = safetyValidator;

    // 初始化交易历史记录（使用内存数据库）
    this.tradeHistory = new TradeHistory(':memory:');

    logger.info('现货交易协调器初始化', {
      enabled: config.enabled,
      aiWeight: config.weights.aiWeight,
      ruleWeight: config.weights.ruleWeight,
      coins: config.coins,
    });
  }

  // =====================================================
  // 公共方法
  // =====================================================

  /**
   * 执行交易协调流程
   */
  async execute(
    marketContext: MarketContext,
    positions: PositionInfo[],
    availableBalance: number
  ): Promise<CoordinatedDecision[]> {
    if (!this.config.enabled) {
      logger.debug('协调器已禁用，跳过执行');
      return [];
    }

    logger.debug('开始交易协调流程', {
      coins: this.config.coins,
      marketNormal: marketContext.isMarketNormal,
      balance: availableBalance,
    });

    const decisions: CoordinatedDecision[] = [];

    // 1. 执行规则引擎
    let ruleSignals: RuleSignal[] = [];
    if (this.config.enableRules) {
      ruleSignals = await this.executeRuleEngine(marketContext, positions, availableBalance);
      this.latestRuleSignals = ruleSignals;
    }

    // 2. 执行 AI 决策
    let aiDecisions: AITradingDecision[] = [];
    if (this.config.enableAI && this.shouldCallAI()) {
      aiDecisions = await this.executeAIDecision(marketContext, positions);
      this.latestAIDecisions = aiDecisions;
      this.lastAICallTime = Date.now();
    }

    // 3. 协调决策
    const coordinated = this.coordinateDecisions(aiDecisions, ruleSignals, marketContext, positions, availableBalance);

    // 4. 安全验证
    for (const decision of coordinated) {
      const validated = await this.validateDecision(decision, marketContext, positions, availableBalance);
      if (validated) {
        decisions.push(validated);
        // 记录交易决策到历史（学习闭环）
        const priceData = marketContext.prices.get(decision.coin);
        const indicators = marketContext.indicators?.get(decision.coin);
        if (priceData) {
          this.tradeHistory.recordDecision(validated, {
            price: priceData,
            indicators: indicators,
          });
        }
      }
    }

    // 5. 更新统计
    this.updateStats(decisions);

    // 6. 触发回调
    for (const decision of decisions) {
      this.notifyDecisionCallbacks(decision);
    }

    logger.debug('交易协调流程完成', {
      decisions: decisions.length,
      aiDecisions: aiDecisions.length,
      ruleSignals: ruleSignals.length,
    });

    return decisions;
  }

  /**
   * 执行交易决策
   */
  async executeDecision(decision: CoordinatedDecision, positions: PositionInfo[], availableBalance: number): Promise<ExecutionResult> {
    const result: ExecutionResult = {
      success: false,
      decision,
      executedAt: Date.now(),
    };

    try {
      // 创建交易请求
      const tradeRequest = this.createTradeRequest(decision);

      // 安全验证
      const marketStatus = this.createMarketStatus(decision);
      const accountStatus = this.createAccountStatus(positions, availableBalance);
      const validation = await this.safetyValidator.validateTrade(tradeRequest, marketStatus, accountStatus);

      if (!validation.passed) {
        result.error = `安全验证失败: ${validation.checks.filter(c => c.result !== 'passed').map(c => c.reason).join(', ')}`;
        logger.warn(`交易决策被安全验证拒绝 [${decision.coin}]`, {
          reason: result.error,
        });
        return result;
      }

      // TODO: 实际执行交易（调用 OKX API）
      // 这里模拟执行成功
      result.success = true;
      result.orderId = `order-${decision.coin}-${Date.now()}`;
      result.actualPrice = decision.suggestedPrice || 0;
      result.actualAmount = decision.suggestedAmount || 0;

      // 记录执行结果（学习闭环）
      this.tradeHistory.recordExecution(result);

      logger.info(`交易决策已执行 [${decision.coin}]`, {
        action: decision.action,
        amount: result.actualAmount,
        price: result.actualPrice,
        orderId: result.orderId,
      });

      // 触发执行回调
      this.notifyExecutionCallbacks(result);

      return result;
    } catch (error) {
      result.error = error instanceof Error ? error.message : String(error);
      logger.error(`交易决策执行失败 [${decision.coin}]`, {
        error: result.error,
      });
      return result;
    }
  }

  /**
   * 获取统计信息
   */
  getStats(): CoordinatorStats {
    return { ...this.stats };
  }

  /**
   * 获取配置
   */
  getConfig(): Readonly<SpotCoordinatorConfig> {
    return { ...this.config };
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<SpotCoordinatorConfig>): void {
    // 更新权重时确保总和为 1
    if (config.weights) {
      const total = config.weights.aiWeight + config.weights.ruleWeight;
      if (Math.abs(total - 1) > 0.01) {
        throw new Error(`权重总和必须为 1，当前为 ${total}`);
      }
    }

    this.config = { ...this.config, ...config };
    logger.info('协调器配置已更新', this.config as unknown as Record<string, unknown>);
  }

  /**
   * 注册决策回调
   */
  onDecision(callback: DecisionCallback): void {
    this.decisionCallbacks.add(callback);
  }

  /**
   * 注册执行回调
   */
  onExecution(callback: ExecutionCallback): void {
    this.executionCallbacks.add(callback);
  }

  /**
   * 移除决策回调
   */
  offDecision(callback: DecisionCallback): void {
    this.decisionCallbacks.delete(callback);
  }

  /**
   * 移除执行回调
   */
  offExecution(callback: ExecutionCallback): void {
    this.executionCallbacks.delete(callback);
  }

  // =====================================================
  // 私有方法
  // =====================================================

  /**
   * 检查是否应该调用 AI
   */
  private shouldCallAI(): boolean {
    const now = Date.now();
    return now - this.lastAICallTime >= this.config.aiCallInterval;
  }

  /**
   * 执行规则引擎
   */
  private async executeRuleEngine(
    marketContext: MarketContext,
    positions: PositionInfo[],
    availableBalance: number
  ): Promise<RuleSignal[]> {
    const prices: PriceData[] = [];
    for (const [coin, priceData] of marketContext.prices) {
      prices.push({
        coin,
        price: priceData.price,
        change24h: priceData.change24h,
        high24h: priceData.high24h,
        low24h: priceData.low24h,
        volume24h: priceData.volume24h,
        timestamp: priceData.timestamp,
      });
    }

    const input: RuleEngineInput = {
      prices,
      positions: positions.map(p => ({
        coin: p.coin,
        amount: p.amount,
        avgCost: p.avgCost,
        unrealizedPnL: p.unrealizedPnL,
      })),
      availableBalance,
      timestamp: marketContext.timestamp,
    };

    const output = await this.ruleEngine.execute(input);
    return output.recommendations || [];
  }

  /**
   * 执行 AI 决策
   */
  private async executeAIDecision(
    marketContext: MarketContext,
    positions: PositionInfo[]
  ): Promise<AITradingDecision[]> {
    // 1. 先进行市场扫描，传入真实市场数据
    const scanResult = await this.scanMarketWithRealData(marketContext);
    if (scanResult) {
      this.latestMarketScan = scanResult;
    }

    // 2. 获取交易历史反馈（学习闭环）
    const tradingFeedback = this.tradeHistory.getTradingFeedback();

    // 3. 基于市场扫描结果和交易历史反馈进行交易决策
    const response = await this.aiClient.makeTradingDecision({
      marketScan: this.latestMarketScan || this.createEmptyMarketScan(),
      currentPositions: positions.map(p => ({
        coin: p.coin,
        amount: p.amount,
        avgCost: p.avgCost,
        unrealizedPnL: p.unrealizedPnL,
      })),
      recentPerformance: {
        totalTrades: this.stats.totalDecisions,
        winRate: this.stats.overallWinRate,
        totalPnL: this.stats.totalPnL,
      },
      tradingFeedback: tradingFeedback,
    });

    if (!response.success || !response.data) {
      logger.warn('AI 决策失败', { error: response.error });
      return [];
    }

    return response.data;
  }

  /**
   * 使用真实市场数据进行市场扫描
   */
  private async scanMarketWithRealData(marketContext: MarketContext) {
    // 构建真实市场数据结构
    const realMarketData = {
      prices: new Map(
        Array.from(marketContext.prices.entries()).map(([coin, data]) => [
          coin,
          {
            price: data.price,
            change24h: data.change24h,
            high24h: data.high24h,
            low24h: data.low24h,
            volume24h: data.volume24h,
            timestamp: data.timestamp,
          },
        ])
      ),
      indicators: marketContext.indicators && marketContext.indicators.size > 0
        ? new Map(
            Array.from(marketContext.indicators.entries()).map(([coin, indicators]) => [
              coin,
              {
                ma: indicators.ma,
                rsi: indicators.rsi,
                macd: indicators.macd,
                bollinger: indicators.bollinger,
              },
            ])
          )
        : undefined,
      klines: marketContext.klines && marketContext.klines.size > 0
        ? new Map(
            Array.from(marketContext.klines.entries()).map(([coin, klines]) => [
              coin,
              klines.slice(-5), // 最近5根K线
            ])
          )
        : undefined,
    };

    logger.debug('使用真实市场数据进行扫描', {
      coins: Array.from(realMarketData.prices.keys()),
      hasIndicators: (realMarketData.indicators?.size || 0) > 0,
      hasKlines: (realMarketData.klines?.size || 0) > 0,
    });

    const response = await this.aiClient.scanMarket({
      coins: this.config.coins,
      realMarketData,
    });

    if (!response.success || !response.data) {
      logger.warn('市场扫描失败', { error: response.error });
      return null;
    }

    logger.debug('市场扫描成功', {
      coins: response.data.coins.length,
      opportunities: response.data.opportunities?.length || 0,
      risks: response.data.risks?.length || 0,
    });

    return response.data;
  }

  /**
   * 协调决策
   */
  private coordinateDecisions(
    aiDecisions: AITradingDecision[],
    ruleSignals: RuleSignal[],
    marketContext: MarketContext,
    positions: PositionInfo[],
    availableBalance: number
  ): CoordinatedDecision[] {
    const decisions: CoordinatedDecision[] = [];
    const decisionMap = new Map<string, CoordinatedDecision>();
    const conflicts: Array<{ coin: string; aiAction: string; ruleAction: string; resolution: string }> = [];

    // 记录 AI 决策详情
    logger.debug('协调 AI 决策', {
      count: aiDecisions.length,
      decisions: aiDecisions.map(d => ({
        coin: d.coin,
        action: d.action,
        confidence: d.confidence,
        aiScore: d.aiScore,
        reason: d.reason,
      })),
    });

    // 处理 AI 决策
    for (const ai of aiDecisions) {
      const decision: CoordinatedDecision = {
        timestamp: ai.timestamp,
        coin: ai.coin,
        action: ai.action,
        confidence: ai.confidence,
        combinedScore: ai.aiScore,
        aiScore: ai.aiScore,
        ruleScore: 0,
        reason: ai.reason,
        suggestedPrice: marketContext.prices.get(ai.coin)?.price,
        suggestedAmount: ai.suggestedSize,
        source: 'ai',
      };
      decisionMap.set(ai.coin, decision);
    }

    // 记录规则信号详情
    logger.debug('协调规则信号', {
      count: ruleSignals.length,
      signals: ruleSignals.map(s => ({
        coin: s.coin,
        action: s.signalType,
        confidence: s.confidence,
        ruleScore: s.ruleScore,
        ruleType: s.ruleType,
        reason: s.reason,
      })),
    });

    // 处理规则信号
    for (const rule of ruleSignals) {
      if (rule.signalType === SignalType.HOLD) {
        continue; // 跳过持有信号
      }

      const existing = decisionMap.get(rule.coin);
      const ruleScore = rule.ruleScore;

      if (existing) {
        // 记录冲突
        if (existing.action !== rule.signalType) {
          conflicts.push({
            coin: rule.coin,
            aiAction: existing.action,
            ruleAction: rule.signalType,
            resolution: Math.abs(ruleScore) > Math.abs(existing.aiScore || 0) ? 'rule' : 'ai',
          });
        }

        // 协调 AI 和规则
        const combined = this.combineScores(existing.aiScore || 0, ruleScore);
        existing.combinedScore = combined;
        existing.ruleScore = ruleScore;
        existing.source = 'coordinated';
        existing.reason = `${existing.reason} | ${rule.reason}`;

        // 如果规则信号更强，使用规则的建议
        if (Math.abs(ruleScore) > Math.abs(existing.aiScore || 0)) {
          existing.action = rule.signalType;
          existing.suggestedPrice = rule.suggestedPrice;
          existing.suggestedAmount = rule.suggestedAmount;
        }
      } else {
        // 只有规则信号
        const decision: CoordinatedDecision = {
          timestamp: rule.timestamp,
          coin: rule.coin,
          action: rule.signalType,
          confidence: rule.confidence,
          combinedScore: ruleScore,
          ruleScore,
          reason: rule.reason,
          suggestedPrice: rule.suggestedPrice,
          suggestedAmount: rule.suggestedAmount,
          source: 'rule',
        };
        decisionMap.set(rule.coin, decision);
      }
    }

    // 记录协调结果
    if (conflicts.length > 0) {
      logger.debug('决策冲突解决', {
        conflicts,
        resolutions: conflicts.map(c => `${c.coin}: ${c.aiAction}(AI) vs ${c.ruleAction}(Rule) → ${c.resolution}wins`),
      });
    }

    // 过滤和限制决策
    for (const decision of decisionMap.values()) {
      // 过滤掉持有决策
      if (decision.action === 'hold') {
        continue;
      }

      // 检查金额限制
      if (decision.suggestedAmount && decision.suggestedAmount > this.config.maxTradeAmount) {
        decision.suggestedAmount = this.config.maxTradeAmount;
      }

      // 检查币种白名单
      if (!this.config.coins.includes(decision.coin)) {
        continue;
      }

      decisions.push(decision);
    }

    // 记录最终决策
    logger.debug('协调后决策', {
      count: decisions.length,
      decisions: decisions.map(d => ({
        coin: d.coin,
        action: d.action,
        source: d.source,
        confidence: d.confidence,
        combinedScore: d.combinedScore,
        aiScore: d.aiScore,
        ruleScore: d.ruleScore,
        amount: d.suggestedAmount,
        price: d.suggestedPrice,
      })),
    });

    return decisions;
  }

  /**
   * 组合分数
   */
  private combineScores(aiScore: number, ruleScore: number): number {
    return aiScore * this.config.weights.aiWeight + ruleScore * this.config.weights.ruleWeight;
  }

  /**
   * 验证决策
   */
  private async validateDecision(
    decision: CoordinatedDecision,
    marketContext: MarketContext,
    positions: PositionInfo[],
    availableBalance: number
  ): Promise<CoordinatedDecision | null> {
    // 创建交易请求
    const tradeRequest = this.createTradeRequest(decision);

    // 创建市场状态
    const priceData = marketContext.prices.get(decision.coin);
    const marketStatus: MarketStatus = {
      isNormal: marketContext.isMarketNormal,
      volatility: 0.05,
      volume24h: priceData?.volume24h || 1000000,
      change24h: priceData?.change24h || 0,
    };

    // 创建账户状态
    const accountStatus: AccountStatus = {
      availableBalance,
      positions: positions.map(p => ({
        coin: p.coin,
        amount: p.amount,
        avgCost: p.avgCost,
        unrealizedPnL: p.unrealizedPnL,
      })),
      todayTradeCount: 0,
      todayTradeAmountByCoin: new Map(),
      lastTradeTime: 0,
    };

    logger.debug(`验证决策 [${decision.coin}]`, {
      action: decision.action,
      amount: decision.suggestedAmount,
      price: decision.suggestedPrice,
      marketNormal: marketStatus.isNormal,
      balance: availableBalance,
    });

    const validation = await this.safetyValidator.validateTrade(tradeRequest, marketStatus, accountStatus);

    // 记录验证结果
    const passedChecks = validation.checks.filter(c => c.result === 'passed');
    const warningChecks = validation.checks.filter(c => c.result === 'warning');
    const blockedChecks = validation.checks.filter(c => c.result === 'blocked');

    if (warningChecks.length > 0) {
      logger.debug(`决策验证警告 [${decision.coin}]`, {
        warnings: warningChecks.map(c => ({ check: c.type, reason: c.reason })),
      });
    }

    if (!validation.passed) {
      logger.debug(`决策未通过安全验证 [${decision.coin}]`, {
        blocked: blockedChecks.map(c => ({ check: c.type, reason: c.reason })),
        allChecks: validation.checks.map(c => ({
          check: c.type,
          result: c.result,
          reason: c.reason,
        })),
      });
      return null;
    }

    logger.debug(`决策通过安全验证 [${decision.coin}]`, {
      passedChecks: passedChecks.map(c => c.type),
      warnings: warningChecks.map(c => c.type),
    });

    return decision;
  }

  /**
   * 创建交易请求
   */
  private createTradeRequest(decision: CoordinatedDecision): TradeRequest {
    const price = decision.suggestedPrice || 0;
    const amount = decision.suggestedAmount || 0;
    const coinAmount = amount > 0 && price > 0 ? amount / price : 0;

    return {
      actionType: decision.action === 'buy' ? ('buy' as TradeActionType) : ('sell' as TradeActionType),
      coin: decision.coin,
      price,
      amount: coinAmount,
      value: amount,
      signalSource: decision.source === 'ai' ? 'ai' : decision.source === 'rule' ? 'rule' : 'ai',
      signalStrength: decision.confidence > 0.7 ? 'strong' : decision.confidence > 0.4 ? 'moderate' : 'weak',
      confidence: decision.confidence,
      timestamp: Date.now(),
    };
  }

  /**
   * 创建市场状态
   */
  private createMarketStatus(decision: CoordinatedDecision): MarketStatus {
    return {
      isNormal: true,
      volatility: 0.05,
      volume24h: 1000000,
      change24h: 0,
    };
  }

  /**
   * 创建账户状态
   */
  private createAccountStatus(positions: PositionInfo[], availableBalance: number): AccountStatus {
    return {
      availableBalance,
      positions: positions.map(p => ({
        coin: p.coin,
        amount: p.amount,
        avgCost: p.avgCost,
        unrealizedPnL: p.unrealizedPnL,
      })),
      todayTradeCount: 0,
      todayTradeAmountByCoin: new Map(),
      lastTradeTime: 0,
    };
  }

  /**
   * 创建空的市场扫描结果
   */
  private createEmptyMarketScan(): MarketScanResult {
    return {
      timestamp: Date.now(),
      coins: [],
    };
  }

  /**
   * 更新统计信息
   */
  private updateStats(decisions: CoordinatedDecision[]): void {
    this.stats.totalDecisions += decisions.length;

    for (const decision of decisions) {
      if (decision.source === 'ai') {
        this.stats.aiDecisions++;
      } else if (decision.source === 'rule') {
        this.stats.ruleDecisions++;
      } else {
        this.stats.coordinatedDecisions++;
      }

      if (decision.action === 'buy') {
        this.stats.buyDecisions++;
      } else if (decision.action === 'sell') {
        this.stats.sellDecisions++;
      } else {
        this.stats.holdDecisions++;
      }
    }
  }

  /**
   * 通知决策回调
   */
  private notifyDecisionCallbacks(decision: CoordinatedDecision): void {
    for (const callback of this.decisionCallbacks) {
      try {
        callback(decision);
      } catch (error) {
        logger.error('决策回调执行失败', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  /**
   * 通知执行回调
   */
  private notifyExecutionCallbacks(result: ExecutionResult): void {
    for (const callback of this.executionCallbacks) {
      try {
        callback(result);
      } catch (error) {
        logger.error('执行回调执行失败', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }
}
