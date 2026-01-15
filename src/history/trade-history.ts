/**
 * 交易历史记录和管理
 *
 * 职责：
 * 1. 记录交易决策
 * 2. 记录交易执行
 * 3. 记录交易结果（平仓时）
 * 4. 计算性能统计
 * 5. 分析决策模式
 * 6. 生成AI学习反馈
 */

import { logger } from '../utils/logger.js';
import { Database } from 'bun:sqlite';
import type {
  TradeRecord,
  PerformanceStats,
  CoinPerformance,
  DecisionPatternAnalysis,
  TradingFeedback,
  MarketCondition,
} from './types.js';
import { getTrendCondition, getRSICondition } from './types.js';
import type { CoordinatedDecision } from '../trading/types.js';
import type { ExecutionResult } from '../trading/types.js';
import type { PriceData, TechnicalIndicators } from '../market/types.js';

/**
 * 交易历史管理类
 */
export class TradeHistory {
  private db: Database;
  private trades: Map<string, TradeRecord> = new Map();
  private openPositions: Map<string, TradeRecord> = new Map(); // coin -> buy trade

  constructor(dbPath: string = ':memory:') {
    // 初始化数据库
    this.db = new Database(dbPath);
    this.initDatabase();

    logger.info('交易历史初始化', { dbPath });
  }

  // =====================================================
  // 公共方法
  // =====================================================

  /**
   * 记录交易决策
   */
  recordDecision(
    decision: CoordinatedDecision,
    marketData: {
      price: PriceData;
      indicators?: TechnicalIndicators;
    }
  ): string {
    const id = this.generateId();

    // suggestedAmount 是 USDT 价值，需要转换为币种数量
    const price = decision.suggestedPrice || marketData.price.price;
    const valueUSDT = decision.suggestedAmount || 0;
    const amountCoin = valueUSDT / price;

    // Filter out 'hold' actions - only record actual buy/sell decisions
    if (decision.action === 'hold') {
      logger.debug(`跳过持有决策记录 [${decision.coin}]`);
      return id;
    }

    const record: TradeRecord = {
      id,
      timestamp: decision.timestamp,
      coin: decision.coin,
      action: decision.action as 'buy' | 'sell',
      price,
      amount: amountCoin,  // 币种数量
      value: valueUSDT,  // USDT 价值
      decision: {
        source: decision.source,
        aiScore: decision.aiScore,
        ruleScore: decision.ruleScore,
        combinedScore: decision.combinedScore,
        confidence: decision.confidence,
        reason: decision.reason,
      },
      marketSnapshot: {
        price: marketData.price.price,
        change24h: marketData.price.change24h,
        rsi: marketData.indicators?.rsi,
        macd: marketData.indicators?.macd?.macd,
      },
    };

    this.trades.set(id, record);

    // 如果是买入，记录为开仓
    if (decision.action === 'buy') {
      this.openPositions.set(decision.coin, record);
    }

    logger.debug(`记录交易决策: ${decision.coin} ${decision.action}`, {
      id,
      source: decision.source,
      confidence: decision.confidence,
      value: valueUSDT,
      amount: amountCoin,
    });

    return id;
  }

  /**
   * 记录交易执行
   */
  recordExecution(result: ExecutionResult): void {
    // 查找该币种最新的交易记录
    const coinTrades = Array.from(this.trades.values())
      .filter(t => t.coin === result.decision.coin && !t.execution)
      .sort((a, b) => b.timestamp - a.timestamp);

    const record = coinTrades[0];
    if (!record) {
      logger.warn(`未找到交易记录: ${result.decision.coin}`);
      return;
    }

    record.execution = {
      orderId: result.orderId || '',
      actualPrice: result.actualPrice || record.price,
      actualAmount: result.actualAmount || record.amount,
      fee: (result.actualAmount || record.amount) * 0.001, // 假设0.1%手续费
    };

    // 更新实际执行的价格和数量
    record.price = record.execution.actualPrice;
    record.amount = record.execution.actualAmount;
    record.value = record.amount * record.price;

    logger.debug(`记录交易执行: ${result.orderId}`, {
      coin: result.decision.coin,
      actualPrice: record.execution.actualPrice,
    });

    // 持久化到数据库
    this.saveToDatabase(record);
  }

  /**
   * 记录交易结果（平仓时）
   */
  recordTradeResult(
    coin: string,
    closePrice: number,
    closeTimestamp: number
  ): void {
    const buyTrade = this.openPositions.get(coin);
    if (!buyTrade) {
      logger.warn(`未找到开仓记录: ${coin}`);
      return;
    }

    // 计算盈亏
    const pnl = (closePrice - buyTrade.price) * buyTrade.amount - (buyTrade.execution?.fee || 0) * 2;
    const pnlPercent = ((closePrice - buyTrade.price) / buyTrade.price) * 100;
    const holdDuration = closeTimestamp - buyTrade.timestamp;

    buyTrade.result = {
      closePrice,
      closeTimestamp,
      pnl,
      pnlPercent,
      holdDuration,
    };

    // 从开仓列表中移除
    this.openPositions.delete(coin);

    logger.info(`记录交易结果: ${coin}`, {
      pnl: pnl.toFixed(2),
      pnlPercent: pnlPercent.toFixed(2),
      holdDuration: `${holdDuration / 1000 / 60} 分钟`,
    });

    // 更新数据库
    this.saveToDatabase(buyTrade);
  }

  /**
   * 获取最近交易记录
   */
  getRecentTrades(limit: number = 50): TradeRecord[] {
    const allTrades = Array.from(this.trades.values());
    allTrades.sort((a, b) => b.timestamp - a.timestamp);
    return allTrades.slice(0, limit);
  }

  /**
   * 获取交易性能统计
   */
  getPerformanceStats(): PerformanceStats {
    const completedTrades = Array.from(this.trades.values()).filter(t => t.result);

    if (completedTrades.length === 0) {
      return this.getEmptyStats();
    }

    const wins = completedTrades.filter(t => (t.result?.pnl || 0) > 0);
    const losses = completedTrades.filter(t => (t.result?.pnl || 0) < 0);

    const totalPnL = completedTrades.reduce((sum, t) => sum + (t.result?.pnl || 0), 0);
    const avgWin = wins.length > 0
      ? wins.reduce((sum, t) => sum + (t.result?.pnl || 0), 0) / wins.length
      : 0;
    const avgLoss = losses.length > 0
      ? losses.reduce((sum, t) => sum + (t.result?.pnl || 0), 0) / losses.length
      : 0;

    const profitFactor = avgLoss !== 0 ? Math.abs(avgWin / avgLoss) : avgWin > 0 ? 999 : 0;

    // 计算最大回撤
    const maxDrawdown = this.calculateMaxDrawdown(completedTrades);

    // 计算连胜/连败
    const { maxWinStreak, maxLossStreak } = this.calculateStreaks(completedTrades);

    // 平均持有时长
    const avgHoldDuration = completedTrades.reduce((sum, t) => sum + (t.result?.holdDuration || 0), 0) / completedTrades.length;

    return {
      totalTrades: completedTrades.length,
      winningTrades: wins.length,
      losingTrades: losses.length,
      winRate: wins.length / completedTrades.length,
      totalPnL,
      avgWin,
      avgLoss,
      profitFactor,
      maxDrawdown,
      maxWinStreak,
      maxLossStreak,
      avgHoldDuration,
    };
  }

  /**
   * 获取某个币种的历史表现
   */
  getCoinPerformance(coin: string): CoinPerformance {
    const coinTrades = Array.from(this.trades.values()).filter(t => t.coin === coin && t.result);

    if (coinTrades.length === 0) {
      return {
        coin,
        trades: 0,
        winRate: 0,
        totalPnL: 0,
        avgPnL: 0,
        maxWin: 0,
        maxLoss: 0,
      };
    }

    const wins = coinTrades.filter(t => (t.result?.pnl || 0) > 0);
    const totalPnL = coinTrades.reduce((sum, t) => sum + (t.result?.pnl || 0), 0);
    const maxWin = Math.max(...coinTrades.map(t => t.result?.pnl || 0));
    const maxLoss = Math.min(...coinTrades.map(t => t.result?.pnl || 0));

    return {
      coin,
      trades: coinTrades.length,
      winRate: wins.length / coinTrades.length,
      totalPnL,
      avgPnL: totalPnL / coinTrades.length,
      maxWin,
      maxLoss,
    };
  }

  /**
   * 分析决策模式
   */
  analyzeDecisionPatterns(): DecisionPatternAnalysis {
    const completedTrades = Array.from(this.trades.values()).filter(t => t.result);

    return {
      bySource: this.analyzeBySource(completedTrades),
      byCoin: this.analyzeByCoin(completedTrades),
      byMarketCondition: this.analyzeByMarketCondition(completedTrades),
      byRSI: this.analyzeByRSI(completedTrades),
    };
  }

  /**
   * 获取AI学习反馈
   */
  getTradingFeedback(): TradingFeedback {
    const stats = this.getPerformanceStats();
    const recentTrades = this.getRecentTrades(10).filter(t => t.result);
    const allTrades = Array.from(this.trades.values()).filter(t => t.result);

    return {
      overall: {
        totalTrades: stats.totalTrades,
        winRate: stats.winRate,
        avgWin: stats.avgWin,
        avgLoss: stats.avgLoss,
        profitFactor: stats.profitFactor,
        maxDrawdown: stats.maxDrawdown,
      },
      recentTrades: recentTrades.map(t => ({
        coin: t.coin,
        action: t.action,
        price: t.price,
        result: t.result?.pnl || 0,
        marketCondition: getTrendCondition(t.marketSnapshot.change24h),
        decisionReason: t.decision.reason,
        success: (t.result?.pnl || 0) > 0,
      })),
      byCoin: this.getFeedbackByCoin(allTrades),
      byMarketCondition: this.getFeedbackByMarketCondition(allTrades),
      bySource: this.getFeedbackBySource(allTrades),
      failures: this.getFailures(allTrades),
      successes: this.getSuccesses(allTrades),
    };
  }

  /**
   * 清空历史记录
   */
  clear(): void {
    this.trades.clear();
    this.openPositions.clear();
    logger.info('交易历史已清空');
  }

  // =====================================================
  // 私有方法
  // =====================================================

  /**
   * 初始化数据库
   */
  private initDatabase(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS trades (
        id TEXT PRIMARY KEY,
        timestamp INTEGER,
        coin TEXT,
        action TEXT,
        price REAL,
        amount REAL,
        value REAL,
        decision_source TEXT,
        decision_ai_score REAL,
        decision_rule_score REAL,
        decision_combined_score REAL,
        decision_confidence REAL,
        decision_reason TEXT,
        market_price REAL,
        market_change24h REAL,
        market_rsi REAL,
        market_macd REAL,
        execution_order_id TEXT,
        execution_actual_price REAL,
        execution_actual_amount REAL,
        execution_fee REAL,
        result_close_price REAL,
        result_close_timestamp INTEGER,
        result_pnl REAL,
        result_pnl_percent REAL,
        result_hold_duration INTEGER
      )
    `);
  }

  /**
   * 保存到数据库
   */
  private saveToDatabase(record: TradeRecord): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO trades VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      )
    `);

    stmt.run(
      record.id,
      record.timestamp,
      record.coin,
      record.action,
      record.price,
      record.amount,
      record.value,
      record.decision.source,
      record.decision.aiScore,
      record.decision.ruleScore,
      record.decision.combinedScore,
      record.decision.confidence,
      record.decision.reason,
      record.marketSnapshot.price,
      record.marketSnapshot.change24h,
      record.marketSnapshot.rsi,
      record.marketSnapshot.macd,
      record.execution?.orderId,
      record.execution?.actualPrice,
      record.execution?.actualAmount,
      record.execution?.fee,
      record.result?.closePrice,
      record.result?.closeTimestamp,
      record.result?.pnl,
      record.result?.pnlPercent,
      record.result?.holdDuration
    );
  }

  /**
   * 生成ID
   */
  private generateId(): string {
    return `trade_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 获取空统计
   */
  private getEmptyStats(): PerformanceStats {
    return {
      totalTrades: 0,
      winningTrades: 0,
      losingTrades: 0,
      winRate: 0,
      totalPnL: 0,
      avgWin: 0,
      avgLoss: 0,
      profitFactor: 0,
      maxDrawdown: 0,
      maxWinStreak: 0,
      maxLossStreak: 0,
      avgHoldDuration: 0,
    };
  }

  /**
   * 计算最大回撤
   */
  private calculateMaxDrawdown(trades: TradeRecord[]): number {
    let peak = 0;
    let maxDrawdown = 0;
    let cumulativePnL = 0;

    const sortedTrades = [...trades].sort((a, b) => a.timestamp - b.timestamp);

    for (const trade of sortedTrades) {
      cumulativePnL += trade.result?.pnl || 0;

      if (cumulativePnL > peak) {
        peak = cumulativePnL;
      }

      const drawdown = peak - cumulativePnL;
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
      }
    }

    return maxDrawdown;
  }

  /**
   * 计算连胜/连败
   */
  private calculateStreaks(trades: TradeRecord[]): { maxWinStreak: number; maxLossStreak: number } {
    const sortedTrades = [...trades].sort((a, b) => a.timestamp - b.timestamp);

    let maxWinStreak = 0;
    let maxLossStreak = 0;
    let currentWinStreak = 0;
    let currentLossStreak = 0;

    for (const trade of sortedTrades) {
      const pnl = trade.result?.pnl || 0;

      if (pnl > 0) {
        currentWinStreak++;
        currentLossStreak = 0;
        maxWinStreak = Math.max(maxWinStreak, currentWinStreak);
      } else if (pnl < 0) {
        currentLossStreak++;
        currentWinStreak = 0;
        maxLossStreak = Math.max(maxLossStreak, currentLossStreak);
      }
    }

    return { maxWinStreak, maxLossStreak };
  }

  /**
   * 按来源分析
   */
  private analyzeBySource(trades: TradeRecord[]): DecisionPatternAnalysis['bySource'] {
    const aiTrades = trades.filter(t => t.decision.source === 'ai' && t.result);
    const ruleTrades = trades.filter(t => t.decision.source === 'rule' && t.result);
    const coordinatedTrades = trades.filter(t => t.decision.source === 'coordinated' && t.result);

    return {
      ai: this.calculateStatsForTrades(aiTrades),
      rule: this.calculateStatsForTrades(ruleTrades),
      coordinated: this.calculateStatsForTrades(coordinatedTrades),
    };
  }

  /**
   * 按币种分析
   */
  private analyzeByCoin(trades: TradeRecord[]): Map<string, PerformanceStats> {
    const byCoin = new Map<string, TradeRecord[]>();

    for (const trade of trades) {
      const coinTrades = byCoin.get(trade.coin) || [];
      coinTrades.push(trade);
      byCoin.set(trade.coin, coinTrades);
    }

    const result = new Map<string, PerformanceStats>();
    for (const [coin, coinTrades] of byCoin) {
      result.set(coin, this.calculateStatsForTrades(coinTrades));
    }

    return result;
  }

  /**
   * 按市场条件分析
   */
  private analyzeByMarketCondition(trades: TradeRecord[]): DecisionPatternAnalysis['byMarketCondition'] {
    const uptrend = trades.filter(t => t.marketSnapshot.change24h > 2 && t.result);
    const downtrend = trades.filter(t => t.marketSnapshot.change24h < -2 && t.result);
    const sideways = trades.filter(t => Math.abs(t.marketSnapshot.change24h) <= 2 && t.result);

    return {
      uptrend: this.calculateStatsForTrades(uptrend),
      downtrend: this.calculateStatsForTrades(downtrend),
      sideways: this.calculateStatsForTrades(sideways),
    };
  }

  /**
   * 按RSI分析
   */
  private analyzeByRSI(trades: TradeRecord[]): DecisionPatternAnalysis['byRSI'] {
    const overbought = trades.filter(t => t.marketSnapshot.rsi && t.marketSnapshot.rsi > 70 && t.result);
    const neutral = trades.filter(t => t.marketSnapshot.rsi && t.marketSnapshot.rsi >= 30 && t.marketSnapshot.rsi <= 70 && t.result);
    const oversold = trades.filter(t => t.marketSnapshot.rsi && t.marketSnapshot.rsi < 30 && t.result);

    return {
      overbought: this.calculateStatsForTrades(overbought),
      neutral: this.calculateStatsForTrades(neutral),
      oversold: this.calculateStatsForTrades(oversold),
    };
  }

  /**
   * 为交易集合计算统计
   */
  private calculateStatsForTrades(trades: TradeRecord[]): PerformanceStats {
    if (trades.length === 0) {
      return this.getEmptyStats();
    }

    const wins = trades.filter(t => (t.result?.pnl || 0) > 0);
    const losses = trades.filter(t => (t.result?.pnl || 0) < 0);

    const totalPnL = trades.reduce((sum, t) => sum + (t.result?.pnl || 0), 0);
    const avgWin = wins.length > 0
      ? wins.reduce((sum, t) => sum + (t.result?.pnl || 0), 0) / wins.length
      : 0;
    const avgLoss = losses.length > 0
      ? losses.reduce((sum, t) => sum + (t.result?.pnl || 0), 0) / losses.length
      : 0;

    const profitFactor = avgLoss !== 0 ? Math.abs(avgWin / avgLoss) : avgWin > 0 ? 999 : 0;

    return {
      totalTrades: trades.length,
      winningTrades: wins.length,
      losingTrades: losses.length,
      winRate: wins.length / trades.length,
      totalPnL,
      avgWin,
      avgLoss,
      profitFactor,
      maxDrawdown: this.calculateMaxDrawdown(trades),
      maxWinStreak: 0, // 简化处理
      maxLossStreak: 0,
      avgHoldDuration: trades.reduce((sum, t) => sum + (t.result?.holdDuration || 0), 0) / trades.length,
    };
  }

  /**
   * 获取按币种的反馈
   */
  private getFeedbackByCoin(trades: TradeRecord[]): Map<string, { trades: number; winRate: number; totalPnL: number }> {
    const byCoin = new Map<string, TradeRecord[]>();

    for (const trade of trades) {
      const coinTrades = byCoin.get(trade.coin) || [];
      coinTrades.push(trade);
      byCoin.set(trade.coin, coinTrades);
    }

    const result = new Map();
    for (const [coin, coinTrades] of byCoin) {
      const wins = coinTrades.filter(t => (t.result?.pnl || 0) > 0);
      result.set(coin, {
        trades: coinTrades.length,
        winRate: wins.length / coinTrades.length,
        totalPnL: coinTrades.reduce((sum, t) => sum + (t.result?.pnl || 0), 0),
      });
    }

    return result;
  }

  /**
   * 获取按市场条件的反馈
   */
  private getFeedbackByMarketCondition(trades: TradeRecord[]): {
    uptrend: { trades: number; winRate: number; avgPnL: number };
    downtrend: { trades: number; winRate: number; avgPnL: number };
    sideways: { trades: number; winRate: number; avgPnL: number };
  } {
    const uptrendTrades = trades.filter(t => t.marketSnapshot.change24h > 2);
    const downtrendTrades = trades.filter(t => t.marketSnapshot.change24h < -2);
    const sidewaysTrades = trades.filter(t => Math.abs(t.marketSnapshot.change24h) <= 2);

    return {
      uptrend: this.getFeedbackStats(uptrendTrades),
      downtrend: this.getFeedbackStats(downtrendTrades),
      sideways: this.getFeedbackStats(sidewaysTrades),
    };
  }

  /**
   * 获取按来源的反馈
   */
  private getFeedbackBySource(trades: TradeRecord[]): {
    ai: { trades: number; winRate: number; avgPnL: number };
    rule: { trades: number; winRate: number; avgPnL: number };
    coordinated: { trades: number; winRate: number; avgPnL: number };
  } {
    const aiTrades = trades.filter(t => t.decision.source === 'ai');
    const ruleTrades = trades.filter(t => t.decision.source === 'rule');
    const coordinatedTrades = trades.filter(t => t.decision.source === 'coordinated');

    return {
      ai: this.getFeedbackStats(aiTrades),
      rule: this.getFeedbackStats(ruleTrades),
      coordinated: this.getFeedbackStats(coordinatedTrades),
    };
  }

  /**
   * 获取反馈统计
   */
  private getFeedbackStats(trades: TradeRecord[]): { trades: number; winRate: number; avgPnL: number } {
    const wins = trades.filter(t => (t.result?.pnl || 0) > 0);
    return {
      trades: trades.length,
      winRate: trades.length > 0 ? wins.length / trades.length : 0,
      avgPnL: trades.length > 0
        ? trades.reduce((sum, t) => sum + (t.result?.pnl || 0), 0) / trades.length
        : 0,
    };
  }

  /**
   * 获取失败案例
   */
  private getFailures(trades: TradeRecord[]): Array<{
    coin: string;
    action: string;
    reason: string;
    marketCondition: string;
    loss: number;
  }> {
    return trades
      .filter(t => (t.result?.pnl || 0) < 0)
      .map(t => ({
        coin: t.coin,
        action: t.action,
        reason: t.decision.reason,
        marketCondition: getTrendCondition(t.marketSnapshot.change24h),
        loss: t.result?.pnl || 0,
      }))
      .sort((a, b) => a.loss - b.loss) // 亏损最大的在前
      .slice(0, 5);
  }

  /**
   * 获取成功案例
   */
  private getSuccesses(trades: TradeRecord[]): Array<{
    coin: string;
    action: string;
    reason: string;
    marketCondition: string;
    profit: number;
  }> {
    return trades
      .filter(t => (t.result?.pnl || 0) > 0)
      .map(t => ({
        coin: t.coin,
        action: t.action,
        reason: t.decision.reason,
        marketCondition: getTrendCondition(t.marketSnapshot.change24h),
        profit: t.result?.pnl || 0,
      }))
      .sort((a, b) => b.profit - a.profit) // 盈利最大的在前
      .slice(0, 5);
  }
}
