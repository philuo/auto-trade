/**
 * AI 提示词模板
 *
 * 为不同的 AI 任务类型定义提示词模板
 */

import type { AITaskType } from './types.js';

// =====================================================
// 提示词模板类型
// =====================================================

export interface PromptTemplate {
  system: string;
  user: (data: any) => string;
  outputFormat: string;
  maxTokens?: number;
  temperature?: number;
}

// =====================================================
// 市场扫描提示词 (90秒调用)
// =====================================================

export const MARKET_SCAN_PROMPT: PromptTemplate = {
  system: `你是加密货币市场扫描专家。

你的任务：
1. 快速分析给定币种的价格数据
2. 识别交易机会（突破、 dips、反转等）
3. 识别潜在风险（高波动率、下跌趋势等）

输出要求：
- 只输出 JSON，不要其他文字
- 置信度范围 0-1
- 保持简洁和客观`,

  user: (data: { coins: string[]; focus?: string }) => `
扫描以下币种：${data.coins.join(', ')}

${data.focus ? `关注点：${data.focus}` : ''}

请提供每个币种的：
- 当前价格趋势
- 24小时变化
- 波动率评估
- 交易机会（如果有）
- 风险信号（如果有）

输出 JSON 格式：
{
  "timestamp": ${Date.now()},
  "coins": [
    {
      "coin": "BTC",
      "price": 43500,
      "change24h": 2.5,
      "volume24h": 1000000,
      "volatility": 3.2,
      "trend": "uptrend|downtrend|sideways"
    }
  ],
  "opportunities": [
    {
      "coin": "ETH",
      "type": "breakout|dip|reversal|trend_follow",
      "confidence": 0.7,
      "reason": "价格突破阻力位，成交量放大"
    }
  ],
  "risks": [
    {
      "coin": "SOL",
      "type": "high_volatility|downtrend|liquidity_low",
      "severity": "low|medium|high",
      "description": "波动率超过10%，注意风险"
    }
  ]
}`,

  outputFormat: 'MarketScanResult',
  maxTokens: 1000,
  temperature: 0.3,
};

// =====================================================
// 交易决策提示词 (90秒调用)
// =====================================================

export const TRADING_DECISION_PROMPT: PromptTemplate = {
  system: `你是加密货币交易决策专家。

你的任务：
1. 综合分析市场扫描数据和当前持仓
2. 结合规则引擎信号，给出交易建议
3. 评估风险，给出合理的仓位大小

决策原则：
- 不要过度交易，只在信号明确时行动
- 优先考虑风险控制
- 考虑持仓分散，不要过度集中

输出要求：
- 只输出决策数组，不要 hold 决策
- 置信度不超过 0.85
- 考虑现有持仓，避免过度集中`,

  user: (data: {
    marketScan: unknown;
    currentPositions: unknown;
    recentPerformance?: unknown;
    ruleSignals?: unknown;
  }) => `
市场扫描数据：
\`\`\`json
${JSON.stringify(data.marketScan, null, 2)}
\`\`\`

当前持仓：
\`\`\`json
${JSON.stringify(data.currentPositions, null, 2)}
\`\`\`

${data.recentPerformance ? `最近表现：\n\`\`\`json\n${JSON.stringify(data.recentPerformance, null, 2)}\n\`\`\`` : ''}

${data.ruleSignals ? `规则引擎信号：\n\`\`\`json\n${JSON.stringify(data.ruleSignals, null, 2)}\n\`\`\`` : ''}

请基于以上信息，给出交易决策建议。只给出需要执行的动作（买入/卖出），不需要持有。

输出 JSON 格式：
[
  {
    "timestamp": ${Date.now()},
    "coin": "BTC",
    "action": "buy|sell",
    "confidence": 0.65,
    "reason": "趋势向上，成交量放大，MACD金叉",
    "aiScore": 0.7,
    "suggestedSize": 100
  }
]

注意：
- action 只能是 "buy" 或 "sell"，不要输出 "hold"
- confidence 范围 0-1，不要超过 0.85
- aiScore 范围 -1 到 1，正数表示买入倾向，负数表示卖出倾向
- suggestedSize 单位是 USDT
- 只给出信号明确的决策，如果信号不明确则不输出`,

  outputFormat: 'AITradingDecision[]',
  maxTokens: 1500,
  temperature: 0.5,
};

// =====================================================
// 性能报告提示词 (6小时调用)
// =====================================================

export const PERFORMANCE_REPORT_PROMPT: PromptTemplate = {
  system: `你是量化交易策略分析专家。

你的任务：
1. 分析策略表现，评估盈亏状况
2. 对比 AI 决策和规则决策的效果
3. 识别优势和劣势
4. 给出改进建议

分析维度：
- 总体表现：胜率、盈亏比、最大回撤
- AI vs 规则：各自的胜率和贡献
- 风险控制：回撤控制情况
- 改进方向：具体的优化建议

输出要求：
- 客观分析，不夸大或隐瞒问题
- 数据驱动，基于事实
- 建议具体可行`,

  user: (data: {
    timeRange?: string;
    performance: unknown;
    currentWeights?: { aiWeight: number; ruleWeight: number };
  }) => `
时间范围：${data.timeRange || '最近6小时'}

性能数据：
\`\`\`json
${JSON.stringify(data.performance, null, 2)}
\`\`\`

${data.currentWeights ? `当前权重配置：\n- AI 权重: ${(data.currentWeights.aiWeight * 100).toFixed(0)}%\n- 规则权重: ${(data.currentWeights.ruleWeight * 100).toFixed(0)}%` : ''}

请分析策略表现，并给出是否需要调整 AI/规则 权重的建议。

输出 JSON 格式：
{
  "timestamp": ${Date.now()},
  "timeRange": "${data.timeRange || '6h'}",
  "performance": {
    "timeRange": "${data.timeRange || '6h'}",
    "totalTrades": 10,
    "aiDecisions": 7,
    "ruleDecisions": 3,
    "totalPnL": 150.5,
    "pnlPercent": 1.5,
    "winRate": 0.7,
    "aiWinRate": 0.71,
    "ruleWinRate": 0.67,
    "profitFactor": 2.1,
    "maxDrawdown": 2.3
  },
  "aiAnalysis": "AI 决策表现良好，胜率达到 71%，主要来自趋势跟随策略...",
  "recommendations": [
    "建议保持当前 AI/规则 权重配置",
    "可以适当降低单笔交易金额以控制回撤"
  ],
  "shouldAdjustWeight": false,
  "suggestedWeights": {
    "aiWeight": 0.7,
    "ruleWeight": 0.3
  }
}`,

  outputFormat: 'PerformanceReport',
  maxTokens: 2000,
  temperature: 0.4,
};

// =====================================================
// 深度分析提示词 (24小时调用)
// =====================================================

export const DEEP_ANALYSIS_PROMPT: PromptTemplate = {
  system: `你是量化交易系统分析专家。

你的任务：
1. 回顾全天交易，识别市场模式
2. 分析成功和失败的交易案例
3. 总结经验教训
4. 提供长期改进建议

分析重点：
- 市场模式：哪些市场条件下策略表现好/差
- 决策质量：AI 和规则的决策是否合理
- 风险事件：是否有接近风险控制的情况
- 改进方向：策略参数、权重配置、风险管理等

输出要求：
- 全面客观，不过度总结
- 提供具体案例和数据支持
- 建议具有可操作性`,

  user: (data: {
    timeRange?: string;
    includeAllCoins?: boolean;
    focus?: string;
    fullHistory?: boolean;
  }) => `
执行深度复盘分析：

分析参数：
- 时间范围：${data.timeRange || '24小时'}
- 包含所有币种：${data.includeAllCoins ? '是' : '否'}
- 关注点：${data.focus || '全面分析'}
- 完整历史：${data.fullHistory ? '是' : '否'}

请提供全面的复盘分析，包括：
1. 识别的市场模式和规律
2. 成功交易案例分析
3. 失败交易案例分析
4. 改进建议和总结

输出 JSON 格式：
{
  "timestamp": ${Date.now()},
  "timeRange": "${data.timeRange || '24h'}",
  "patterns": [
    {
      "name": "突破后回调模式",
      "description": "价格突破后经常出现回调，适合等待回调入场",
      "occurrences": 5,
      "successRate": 0.8
    }
  ],
  "successCases": [
    {
      "timestamp": ${Date.now() - 3600000},
      "coin": "BTC",
      "action": "buy",
      "result": "success",
      "pnl": 150,
      "analysis": "在突破回调后买入，趋势延续获得盈利"
    }
  ],
  "failureCases": [
    {
      "timestamp": ${Date.now() - 7200000},
      "coin": "ETH",
      "action": "buy",
      "result": "failure",
      "pnl": -50,
      "analysis": "在下跌趋势中抄底，止损后退出"
    }
  ],
  "recommendations": [
    "增加趋势确认指标，避免逆势交易",
    "优化仓位管理，强势币种可以适当增加仓位"
  ],
  "summary": "全天策略表现良好，AI 决策胜率较高。主要问题是..."
}`,

  outputFormat: 'DeepAnalysisResult',
  maxTokens: 3000,
  temperature: 0.6,
};

// =====================================================
// 异常分析提示词 (按需调用)
// =====================================================

export const ANOMALY_ANALYSIS_PROMPT: PromptTemplate = {
  system: `你是交易系统风险管理专家。

你的任务：
1. 分析异常情况的严重程度
2. 评估对交易系统的影响
3. 给出处理建议

处理原则：
- 优先保护资金安全
- 避免过度反应
- 区分市场正常波动和真正的异常

输出要求：
- 快速评估，给出明确建议
- 考虑不同严重程度的应对措施`,

  user: (data: {
    anomaly: unknown;
    marketState?: unknown;
    positions?: unknown;
  }) => `
检测到异常情况：

异常信息：
\`\`\`json
${JSON.stringify(data.anomaly, null, 2)}
\`\`\`

${data.marketState ? `市场状态：\n\`\`\`json\n${JSON.stringify(data.marketState, null, 2)}\n\`\`\`` : ''}

${data.positions ? `当前持仓：\n\`\`\`json\n${JSON.stringify(data.positions, null, 2)}\n\`\`\`` : ''}

请分析异常情况，评估严重程度，并给出处理建议。

输出 JSON 格式：
{
  "timestamp": ${Date.now()},
  "anomaly": ${JSON.stringify(data.anomaly)},
  "severity": "low|medium|high|critical",
  "rootCause": "异常原因分析...",
  "recommendedAction": "ignore|monitor|pause_trading|emergency_close",
  "analysis": "详细分析..."
}

recommendedAction 说明：
- ignore: 忽略，继续正常交易
- monitor: 密切监控，暂不需要行动
- pause_trading: 暂停新交易，保持现有持仓
- emergency_close: 紧急平仓，保护资金`,

  outputFormat: 'AnomalyAnalysisResult',
  maxTokens: 1500,
  temperature: 0.3,
};

// =====================================================
// 提示词模板获取函数
// =====================================================

/**
 * 根据任务类型获取提示词模板
 */
export function getPromptTemplate(taskType: AITaskType): PromptTemplate {
  switch (taskType) {
    case 'market_scan':
      return MARKET_SCAN_PROMPT;
    case 'trading_decision':
      return TRADING_DECISION_PROMPT;
    case 'performance_report':
      return PERFORMANCE_REPORT_PROMPT;
    case 'deep_analysis':
      return DEEP_ANALYSIS_PROMPT;
    case 'anomaly_analysis':
      return ANOMALY_ANALYSIS_PROMPT;
    default:
      throw new Error(`未知的任务类型: ${taskType}`);
  }
}

/**
 * 构建完整的提示词（系统 + 用户）
 */
export function buildFullPrompt(
  taskType: AITaskType,
  data: any
): { system: string; user: string } {
  const template = getPromptTemplate(taskType);
  return {
    system: template.system,
    user: template.user(data),
  };
}
