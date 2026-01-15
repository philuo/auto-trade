/**
 * 日志分析工具
 *
 * 提供日志查询、分析和可视化功能
 */

import { Logger, logger as defaultLogger } from './logger';
import type { DecisionLogEntry, TradeLogEntry } from './logger';

// 当前使用的 logger 实例
let currentLogger: Logger = defaultLogger;

/**
 * 设置 LogAnalyzer 使用的 logger 实例
 */
export function setLogger(logger: Logger): void {
  currentLogger = logger;
}

// =====================================================
// 分析结果接口
// =====================================================

export interface DecisionAnalysis {
  totalDecisions: number;
  byCoin: Record<string, number>;
  byStrategy: Record<string, number>;
  byAction: Record<string, number>;
  timeline: Array<{ timestamp: number; count: number }>;
  avgUrgency: number;
  topReasons: Array<{ reason: string; count: number }>;
}

export interface TradeAnalysis {
  totalOrders: number;
  filledOrders: number;
  cancelledOrders: number;
  failedOrders: number;
  fillRate: number;
  totalValue: number;
  totalFees: number;
  byCoin: Record<string, {
    orders: number;
    value: number;
    fees: number;
  }>;
  bySide: Record<string, number>;
  avgOrderValue: number;
  pnl: number;
}

export interface PerformanceMetrics {
  sharpeRatio: number;
  maxDrawdown: number;
  winRate: number;
  totalReturn: number;
  volatility: number;
}

// =====================================================
// 日志分析器
// =====================================================

export class LogAnalyzer {
  /**
   * 分析决策日志
   */
  static analyzeDecisions(options: {
    coin?: string;
    startTime?: number;
    endTime?: number;
  } = {}): DecisionAnalysis {
    const decisions = currentLogger.getDecisions(options);

    const byCoin: Record<string, number> = {};
    const byStrategy: Record<string, number> = {};
    const byAction: Record<string, number> = {};
    const reasons: Record<string, number> = {};
    const timeline: Array<{ timestamp: number; count: number }> = [];
    const urgencySum = { low: 0, medium: 0, high: 0 };
    const urgencyCount = { low: 0, medium: 0, high: 0 };

    // 按小时统计
    const hourlyBuckets: Record<string, number> = {};

    for (const decision of decisions) {
      // 按币种统计
      byCoin[decision.coin] = (byCoin[decision.coin] || 0) + 1;

      // 按策略统计
      byStrategy[decision.strategy] = (byStrategy[decision.strategy] || 0) + 1;

      // 按操作统计
      byAction[decision.action] = (byAction[decision.action] || 0) + 1;

      // 按原因统计
      reasons[decision.reason] = (reasons[decision.reason] || 0) + 1;

      // 紧急程度统计
      if (decision.decisionFactors?.urgency) {
        const urgency = decision.decisionFactors.urgency as string;
        urgencyCount[urgency] = (urgencyCount[urgency] || 0) + 1;
      }

      // 时间线统计（按小时）
      const hour = new Date(decision.timestamp);
      hour.setMinutes(0, 0, 0);
      const hourKey = hour.getTime();
      hourlyBuckets[hourKey] = (hourlyBuckets[hourKey] || 0) + 1;
    }

    // 构建时间线
    const sortedHours = Object.keys(hourlyBuckets).map(Number).sort((a, b) => a - b);
    for (const hour of sortedHours) {
      timeline.push({ timestamp: hour, count: hourlyBuckets[hour] });
    }

    // 计算平均紧急程度
    const urgencyWeight = { low: 1, medium: 2, high: 3 };
    let totalWeight = 0;
    let totalCount = 0;
    for (const urgency of Object.keys(urgencyCount)) {
      totalWeight += urgencyCount[urgency] * urgencyWeight[urgency as keyof typeof urgencyWeight];
      totalCount += urgencyCount[urgency];
    }
    const avgUrgency = totalCount > 0 ? totalWeight / totalCount : 0;

    // 获取前5个原因
    const topReasons = Object.entries(reasons)
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    return {
      totalDecisions: decisions.length,
      byCoin,
      byStrategy,
      byAction,
      timeline,
      avgUrgency,
      topReasons
    };
  }

  /**
   * 分析交易日志
   */
  static analyzeTrades(options: {
    coin?: string;
    startTime?: number;
    endTime?: number;
  } = {}): TradeAnalysis {
    const trades = currentLogger.getTrades(options);

    const byCoin: Record<string, { orders: number; value: number; fees: number }> = {};
    const bySide: Record<string, number> = { buy: 0, sell: 0 };
    let filledOrders = 0;
    let cancelledOrders = 0;
    let failedOrders = 0;
    let totalValue = 0;
    let totalFees = 0;

    for (const trade of trades) {
      // 按币种统计
      if (!byCoin[trade.coin]) {
        byCoin[trade.coin] = { orders: 0, value: 0, fees: 0 };
      }
      byCoin[trade.coin].orders += 1;
      byCoin[trade.coin].value += trade.value || 0;
      byCoin[trade.coin].fees += trade.fee || 0;

      // 按方向统计
      bySide[trade.side] = (bySide[trade.side] || 0) + 1;

      // 按状态统计
      if (trade.status === 'filled') {
        filledOrders += 1;
        totalValue += trade.value || 0;
        totalFees += trade.fee || 0;
      } else if (trade.status === 'cancelled') {
        cancelledOrders += 1;
      } else if (trade.status === 'failed') {
        failedOrders += 1;
      }
    }

    const totalOrders = trades.length;
    const fillRate = totalOrders > 0 ? (filledOrders / totalOrders) * 100 : 0;
    const avgOrderValue = filledOrders > 0 ? totalValue / filledOrders : 0;

    return {
      totalOrders,
      filledOrders,
      cancelledOrders,
      failedOrders,
      fillRate,
      totalValue,
      totalFees,
      byCoin,
      bySide,
      avgOrderValue,
      pnl: 0 // 需要根据成本计算
    };
  }

  /**
   * 生成决策分析报告
   */
  static generateDecisionReport(analysis: DecisionAnalysis): string {
    let report = `
📊 决策分析报告
${'='.repeat(60)}

总览:
  总决策数: ${analysis.totalDecisions}
  平均紧急程度: ${analysis.avgUrgency.toFixed(2)}/3.0

按币种分布:
`;

    for (const [coin, count] of Object.entries(analysis.byCoin)) {
      const percent = ((count / analysis.totalDecisions) * 100).toFixed(1);
      report += `  ${coin}: ${count} (${percent}%)\n`;
    }

    report += `
按策略分布:
`;
    for (const [strategy, count] of Object.entries(analysis.byStrategy)) {
      const percent = ((count / analysis.totalDecisions) * 100).toFixed(1);
      report += `  ${strategy}: ${count} (${percent}%)\n`;
    }

    report += `
按操作分布:
`;
    for (const [action, count] of Object.entries(analysis.byAction)) {
      const percent = ((count / analysis.totalDecisions) * 100).toFixed(1);
      report += `  ${action}: ${count} (${percent}%)\n`;
    }

    report += `
常见决策原因 (Top 5):
`;
    for (const { reason, count } of analysis.topReasons) {
      const percent = ((count / analysis.totalDecisions) * 100).toFixed(1);
      report += `  ${reason}: ${count} (${percent}%)\n`;
    }

    return report.trim();
  }

  /**
   * 生成交易分析报告
   */
  static generateTradeReport(analysis: TradeAnalysis): string {
    let report = `
💰 交易分析报告
${'='.repeat(60)}

总览:
  总订单数: ${analysis.totalOrders}
  已成交: ${analysis.filledOrders}
  已取消: ${analysis.cancelledOrders}
  失败: ${analysis.failedOrders}
  成交率: ${analysis.fillRate.toFixed(2)}%

资金统计:
  总交易额: ${analysis.totalValue.toFixed(2)} USDT
  总手续费: ${analysis.totalFees.toFixed(4)} USDT
  平均订单价值: ${analysis.avgOrderValue.toFixed(2)} USDT
  手续费占比: ${analysis.totalValue > 0 ? ((analysis.totalFees / analysis.totalValue) * 100).toFixed(3) : 0}%

按币种分布:
`;

    for (const [coin, stats] of Object.entries(analysis.byCoin)) {
      report += `  ${coin}:\n`;
      report += `    订单数: ${stats.orders}\n`;
      report += `    交易额: ${stats.value.toFixed(2)} USDT\n`;
      report += `    手续费: ${stats.fees.toFixed(4)} USDT\n`;
    }

    report += `
按方向分布:
`;
    for (const [side, count] of Object.entries(analysis.bySide)) {
      const percent = ((count / analysis.totalOrders) * 100).toFixed(1);
      report += `  ${side}: ${count} (${percent}%)\n`;
    }

    return report.trim();
  }

  /**
   * 生成综合报告
   */
  static generateComprehensiveReport(options: {
    coin?: string;
    startTime?: number;
    endTime?: number;
  } = {}): string {
    const decisionAnalysis = this.analyzeDecisions(options);
    const tradeAnalysis = this.analyzeTrades(options);

    let report = `
╔══════════════════════════════════════════════════════════════╗
║              OKX 量化交易系统 - 日志分析报告                ║
╚══════════════════════════════════════════════════════════════╝

分析时间: ${new Date().toISOString()}
`;

    if (options.coin) {
      report += `币种: ${options.coin}\n`;
    }
    if (options.startTime) {
      report += `起始时间: ${new Date(options.startTime).toISOString()}\n`;
    }
    if (options.endTime) {
      report += `结束时间: ${new Date(options.endTime).toISOString()}\n`;
    }

    report += '\n';
    report += this.generateDecisionReport(decisionAnalysis);
    report += '\n\n';
    report += this.generateTradeReport(tradeAnalysis);
    report += '\n';

    return report;
  }

  /**
   * 导出决策日志为 CSV
   */
  static exportDecisionsToCSV(options: {
    coin?: string;
    startTime?: number;
    endTime?: number;
  } = {}): string {
    const decisions = currentLogger.getDecisions(options);

    let csv = 'Timestamp,Coin,Strategy,Action,Reason,Price,Change24h,Volume24h,Urgency\n';

    for (const decision of decisions) {
      const timestamp = new Date(decision.timestamp).toISOString();
      const price = decision.marketData?.price || 0;
      const change24h = decision.marketData?.change24h || 0;
      const volume24h = decision.marketData?.volume24h || 0;
      const urgency = decision.decisionFactors?.urgency || 'low';

      csv += `${timestamp},${decision.coin},${decision.strategy},${decision.action},"${decision.reason}",${price},${change24h},${volume24h},${urgency}\n`;
    }

    return csv;
  }

  /**
   * 导出交易日志为 CSV
   */
  static exportTradesToCSV(options: {
    coin?: string;
    startTime?: number;
    endTime?: number;
  } = {}): string {
    const trades = currentLogger.getTrades(options);

    let csv = 'Timestamp,OrderId,ClientOrderId,Coin,Side,Price,Size,Value,Fee,Status\n';

    for (const trade of trades) {
      const timestamp = new Date(trade.timestamp).toISOString();
      const price = trade.price || 0;
      const size = trade.size || 0;
      const value = trade.value || 0;
      const fee = trade.fee || 0;

      csv += `${timestamp},${trade.orderId},${trade.clientOrderId},${trade.coin},${trade.side},${price},${size},${value},${fee},${trade.status}\n`;
    }

    return csv;
  }

  /**
   * 获取最近的决策
   */
  static getRecentDecisions(limit: number = 10): DecisionLogEntry[] {
    return currentLogger.getDecisions({ limit });
  }

  /**
   * 获取最近的交易
   */
  static getRecentTrades(limit: number = 10): TradeLogEntry[] {
    return currentLogger.getTrades({ limit });
  }

  /**
   * 获取特定币种的决策历史
   */
  static getCoinDecisionHistory(coin: string, days: number = 7): DecisionLogEntry[] {
    const startTime = Date.now() - days * 24 * 60 * 60 * 1000;
    return currentLogger.getDecisions({ coin, startTime });
  }

  /**
   * 获取特定币种的交易历史
   */
  static getCoinTradeHistory(coin: string, days: number = 7): TradeLogEntry[] {
    const startTime = Date.now() - days * 24 * 60 * 60 * 1000;
    return currentLogger.getTrades({ coin, startTime });
  }

  /**
   * 计算性能指标
   */
  static calculatePerformanceMetrics(options: {
    coin?: string;
    startTime?: number;
    endTime?: number;
  } = {}): PerformanceMetrics {
    // TODO: 实现性能指标计算
    // 这需要基于交易日志和持仓数据来计算
    return {
      sharpeRatio: 0,
      maxDrawdown: 0,
      winRate: 0,
      totalReturn: 0,
      volatility: 0
    };
  }
}

// =====================================================
// 导出便捷函数
// =====================================================

export const analyzeDecisions = LogAnalyzer.analyzeDecisions;
export const analyzeTrades = LogAnalyzer.analyzeTrades;
export const generateDecisionReport = LogAnalyzer.generateDecisionReport;
export const generateTradeReport = LogAnalyzer.generateTradeReport;
export const generateComprehensiveReport = LogAnalyzer.generateComprehensiveReport;
export const exportDecisionsToCSV = LogAnalyzer.exportDecisionsToCSV;
export const exportTradesToCSV = LogAnalyzer.exportTradesToCSV;
export const getRecentDecisions = LogAnalyzer.getRecentDecisions;
export const getRecentTrades = LogAnalyzer.getRecentTrades;
export const getCoinDecisionHistory = LogAnalyzer.getCoinDecisionHistory;
export const getCoinTradeHistory = LogAnalyzer.getCoinTradeHistory;
