/**
 * 交易历史记录模块类型定义
 *
 * 定义交易记录、性能统计、决策模式等类型
 */

// =====================================================
// 交易记录类型
// =====================================================

/**
 * 交易记录
 */
export interface TradeRecord {
  // 交易ID
  id: string;
  // 时间戳
  timestamp: number;
  // 币种
  coin: string;
  // 操作类型
  action: 'buy' | 'sell';
  // 价格
  price: number;
  // 数量
  amount: number;
  // 价值（USDT）
  value: number;

  // 决策信息
  decision: {
    // 决策来源
    source: 'ai' | 'rule' | 'coordinated';
    // AI 分数
    aiScore?: number;
    // 规则分数
    ruleScore?: number;
    // 综合分数
    combinedScore: number;
    // 置信度
    confidence: number;
    // 决策理由
    reason: string;
  };

  // 市场快照（决策时的市场状态）
  marketSnapshot: {
    // 价格
    price: number;
    // 24小时变化
    change24h: number;
    // RSI
    rsi?: number;
    // MACD
    macd?: number;
    // 市场位置（相对于布林带）
    position?: number;
  };

  // 执行信息
  execution?: {
    // 订单ID
    orderId: string;
    // 实际价格
    actualPrice: number;
    // 实际数量
    actualAmount: number;
    // 手续费
    fee: number;
  };

  // 结果（平仓后填充）
  result?: {
    // 平仓价格
    closePrice: number;
    // 平仓时间戳
    closeTimestamp: number;
    // 盈亏（USDT）
    pnl: number;
    // 盈亏百分比
    pnlPercent: number;
    // 持有时长（毫秒）
    holdDuration: number;
  };
}

// =====================================================
// 性能统计类型
// =====================================================

/**
 * 性能统计
 */
export interface PerformanceStats {
  // 总交易次数
  totalTrades: number;
  // 获胜交易
  winningTrades: number;
  // 失败交易
  losingTrades: number;
  // 胜率
  winRate: number;

  // 总盈亏
  totalPnL: number;
  // 平均盈利
  avgWin: number;
  // 平均亏损
  avgLoss: number;
  // 盈亏比
  profitFactor: number;

  // 最大回撤
  maxDrawdown: number;
  // 最大连胜
  maxWinStreak: number;
  // 最大连败
  maxLossStreak: number;

  // 平均持有时长
  avgHoldDuration: number;
  // 夏普比率
  sharpeRatio?: number;
}

/**
 * 币种性能统计
 */
export interface CoinPerformance {
  // 币种
  coin: string;
  // 交易次数
  trades: number;
  // 胜率
  winRate: number;
  // 总盈亏
  totalPnL: number;
  // 平均盈亏
  avgPnL: number;
  // 最大盈利
  maxWin: number;
  // 最大亏损
  maxLoss: number;
}

// =====================================================
// 决策模式分析类型
// =====================================================

/**
 * 决策模式分析
 */
export interface DecisionPatternAnalysis {
  // 按来源分析
  bySource: {
    ai: PerformanceStats;
    rule: PerformanceStats;
    coordinated: PerformanceStats;
  };

  // 按币种分析
  byCoin: Map<string, PerformanceStats>;

  // 按市场条件分析
  byMarketCondition: {
    uptrend: PerformanceStats;
    downtrend: PerformanceStats;
    sideways: PerformanceStats;
  };

  // 按RSI区间分析
  byRSI: {
    overbought: PerformanceStats;  // RSI > 70
    neutral: PerformanceStats;     // 30 <= RSI <= 70
    oversold: PerformanceStats;    // RSI < 30
  };
}

// =====================================================
// 反馈数据类型
// =====================================================

/**
 * 交易反馈（用于AI学习）
 */
export interface TradingFeedback {
  // 总体表现
  overall: {
    totalTrades: number;
    winRate: number;
    avgWin: number;
    avgLoss: number;
    profitFactor: number;
    maxDrawdown: number;
  };

  // 最近交易记录
  recentTrades: Array<{
    coin: string;
    action: string;
    price: number;
    result: number;
    marketCondition: string;
    decisionReason: string;
    success: boolean;
  }>;

  // 按币种表现
  byCoin: Map<string, {
    trades: number;
    winRate: number;
    totalPnL: number;
  }>;

  // 按市场条件表现
  byMarketCondition: {
    uptrend: { trades: number; winRate: number; avgPnL: number };
    downtrend: { trades: number; winRate: number; avgPnL: number };
    sideways: { trades: number; winRate: number; avgPnL: number };
  };

  // 按决策源表现
  bySource: {
    ai: { trades: number; winRate: number; avgPnL: number };
    rule: { trades: number; winRate: number; avgPnL: number };
    coordinated: { trades: number; winRate: number; avgPnL: number };
  };

  // 失败案例
  failures: Array<{
    coin: string;
    action: string;
    reason: string;
    marketCondition: string;
    loss: number;
  }>;

  // 成功案例
  successes: Array<{
    coin: string;
    action: string;
    reason: string;
    marketCondition: string;
    profit: number;
  }>;
}

// =====================================================
// 市场条件类型
// =====================================================

/**
 * 市场条件
 */
export type MarketCondition = 'uptrend' | 'downtrend' | 'sideways';

/**
 * 从RSI值判断市场条件
 */
export function getRSICondition(rsi: number): 'overbought' | 'neutral' | 'oversold' {
  if (rsi > 70) return 'overbought';
  if (rsi < 30) return 'oversold';
  return 'neutral';
}

/**
 * 从价格变化判断趋势
 */
export function getTrendCondition(change24h: number): MarketCondition {
  if (change24h > 2) return 'uptrend';
  if (change24h < -2) return 'downtrend';
  return 'sideways';
}
