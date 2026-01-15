/**
 * GLM-4.7 AI 客户端
 *
 * 功能：
 * - 使用 OpenAI SDK 封装 GLM-4.7 API 调用
 * - 支持多种任务类型（市场扫描、交易决策、性能报告等）
 * - 错误处理与重试机制
 * - Token 使用统计
 */

import OpenAI from 'openai';
import { logger, LogType } from '../utils/logger.js';
import { ALLOWED_COINS } from '../core/constants.js';
import type {
  AIClientConfig,
  AIRequestConfig,
  AIResponse,
  AITaskType,
  MarketScanResult,
  AITradingDecision,
  PerformanceReport,
  DeepAnalysisResult,
  AnomalyAnalysisResult,
  CoinPriceData,
  TradingOpportunity,
  MarketRisk,
  TradingAction,
  PerformanceSnapshot,
  MarketPattern,
  TradeCase,
  AnomalyEvent,
  RealMarketData,
  ThinkingMode,
} from './types.js';
import type { PriceData, TechnicalIndicators } from '../market/types.js';

// =====================================================
// GLM API 配置
// =====================================================

const GLM_DEFAULT_CONFIG = {
  baseURL: process.env.OPENAI_URL, // Coding套餐专用endpoint
  timeout: 30000,
  maxRetries: 3,
  model: 'glm-4.7', // GLM-4.7 模型（约2秒响应时间）
};

// =====================================================
// GLM Client 类
// =====================================================

export class GLMClient {
  private client: OpenAI;
  private model: string;
  private enableLogging: boolean;
  private coinWhitelist: string[];
  private thinkingMode: AIClientConfig['thinkingMode'];

  // 统计信息
  private stats = {
    totalRequests: 0,
    successRequests: 0,
    failedRequests: 0,
    totalTokens: 0,
    promptTokens: 0,
    completionTokens: 0,
  };

  constructor(config: AIClientConfig) {
    if (!config.apiKey) {
      throw new Error('GLM API Key is required');
    }

    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseURL || GLM_DEFAULT_CONFIG.baseURL,
      timeout: config.timeout || GLM_DEFAULT_CONFIG.timeout,
      maxRetries: config.maxRetries || GLM_DEFAULT_CONFIG.maxRetries,
    });

    this.model = GLM_DEFAULT_CONFIG.model;
    this.enableLogging = config.enableLogging ?? true;

    // 币种白名单：默认使用全局白名单
    this.coinWhitelist = config.coinWhitelist ?? [...ALLOWED_COINS];

    // 思考模式配置：默认配置
    this.thinkingMode = config.thinkingMode ?? {
      marketScan: 'disabled',      // 快速响应
      tradingDecision: 'disabled', // 快速响应
      performanceReport: 'enabled', // 深度分析
      deepAnalysis: 'enabled',     // 深度分析
      anomalyAnalysis: 'enabled',  // 深度分析
    };

    logger.info('GLM Client 初始化', {
      baseURL: config.baseURL || GLM_DEFAULT_CONFIG.baseURL,
      timeout: config.timeout || GLM_DEFAULT_CONFIG.timeout,
      maxRetries: config.maxRetries || GLM_DEFAULT_CONFIG.maxRetries,
      coinWhitelist: this.coinWhitelist,
      thinkingMode: this.thinkingMode,
    });
  }

  // =====================================================
  // 公共 API 方法
  // =====================================================

  /**
   * 市场扫描 (90秒调用)
   * 轻量级，只收集价格数据，识别机会和风险
   */
  async scanMarket(input: {
    coins: string[];
    focus?: string;
    maxTokens?: number;
    realMarketData?: RealMarketData;  // 新增：真实市场数据
  }): Promise<AIResponse<MarketScanResult>> {
    // 过滤币种：只扫描白名单中的币种
    const filteredCoins = input.coins.filter(coin =>
      this.coinWhitelist.includes(coin)
    );

    if (filteredCoins.length === 0) {
      return {
        success: false,
        error: `没有有效的币种：请求的币种 ${input.coins.join(', ')} 都不在白名单中`,
      };
    }

    const userPrompt = this.buildMarketScanPrompt(
      filteredCoins,
      input.focus,
      input.realMarketData
    );

    const response = await this.callGLM({
      taskType: 'market_scan' as AITaskType,
      userPrompt, // 使用构建的提示词
      maxTokens: input.maxTokens || 1000,
      temperature: 0.3,
    });

    if (!response.success || !response.data) {
      return {
        success: false,
        error: response.error,
      };
    }

    // 解析响应
    try {
      const parsed = this.parseJSONResponse(response.data as string);
      const validated = this.validateMarketScanResult(parsed);
      return {
        success: true,
        data: validated,
        usage: response.usage,
      };
    } catch (error) {
      return {
        success: false,
        error: `解析市场扫描结果失败: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * 交易决策 (90秒调用)
   * 基于市场扫描 + 规则引擎信号做决策
   */
  async makeTradingDecision(input: {
    marketScan: MarketScanResult;
    currentPositions: Array<{ coin: string; amount: number; avgCost: number; unrealizedPnL: number }>;
    recentPerformance?: { totalTrades: number; winRate: number; totalPnL: number };
    tradingFeedback?: import('../history/types.js').TradingFeedback;
  }): Promise<AIResponse<AITradingDecision[]>> {
    const userPrompt = this.buildTradingDecisionPrompt(input);

    const response = await this.callGLM({
      taskType: 'trading_decision' as AITaskType,
      userPrompt, // 使用构建的提示词
      maxTokens: 1500,
      temperature: 0.5,
    });

    if (!response.success || !response.data) {
      return {
        success: false,
        error: response.error,
      };
    }

    // 解析响应
    try {
      const parsed = this.parseJSONResponse(response.data as string);
      const decisions = Array.isArray(parsed) ? parsed : [parsed];
      const validated = decisions.map((d: unknown) => this.validateTradingDecision(d));
      return {
        success: true,
        data: validated,
        usage: response.usage,
      };
    } catch (error) {
      return {
        success: false,
        error: `解析交易决策结果失败: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * 性能报告 (6小时调用)
   * 评估策略表现，可选调整权重
   */
  async generatePerformanceReport(input: {
    timeRange?: string;
    performance: {
      totalTrades: number;
      aiDecisions: number;
      ruleDecisions: number;
      totalPnL: number;
      winRate: number;
      aiWinRate: number;
      ruleWinRate: number;
      profitFactor: number;
      maxDrawdown: number;
    };
  }): Promise<AIResponse<PerformanceReport>> {
    const userPrompt = this.buildPerformanceReportPrompt(input);

    const response = await this.callGLM({
      taskType: 'performance_report' as AITaskType,
      userPrompt, // 使用构建的提示词
      maxTokens: 2000,
      temperature: 0.4,
    });

    if (!response.success || !response.data) {
      return {
        success: false,
        error: response.error,
      };
    }

    // 解析响应
    try {
      const parsed = this.parseJSONResponse(response.data as string);
      const validated = this.validatePerformanceReport(parsed);
      return {
        success: true,
        data: validated,
        usage: response.usage,
      };
    } catch (error) {
      return {
        success: false,
        error: `解析性能报告失败: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * 深度分析 (24小时调用)
   * 全面复盘，识别模式，总结经验
   */
  async performDeepAnalysis(input: {
    timeRange?: string;
    includeAllCoins?: boolean;
    focus?: string;
    fullHistory?: boolean;
  }): Promise<AIResponse<DeepAnalysisResult>> {
    const userPrompt = this.buildDeepAnalysisPrompt(input);

    const response = await this.callGLM({
      taskType: 'deep_analysis' as AITaskType,
      userPrompt, // 使用构建的提示词
      maxTokens: 3000,
      temperature: 0.6,
    });

    if (!response.success || !response.data) {
      return {
        success: false,
        error: response.error,
      };
    }

    // 解析响应
    try {
      const parsed = this.parseJSONResponse(response.data as string);
      const validated = this.validateDeepAnalysisResult(parsed);
      return {
        success: true,
        data: validated,
        usage: response.usage,
      };
    } catch (error) {
      return {
        success: false,
        error: `解析深度分析结果失败: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * 异常分析 (按需调用)
   * 分析市场异常情况，给出处理建议
   */
  async analyzeAnomaly(input: {
    anomaly: {
      type: string;
      severity: string;
      description: string;
      data?: Record<string, unknown>;
    };
    marketState?: unknown;
    positions?: unknown;
  }): Promise<AIResponse<AnomalyAnalysisResult>> {
    const userPrompt = this.buildAnomalyAnalysisPrompt(input);

    const response = await this.callGLM({
      taskType: 'anomaly_analysis' as AITaskType,
      userPrompt, // 使用构建的提示词
      maxTokens: 1500,
      temperature: 0.3,
    });

    if (!response.success || !response.data) {
      return {
        success: false,
        error: response.error,
      };
    }

    // 解析响应
    try {
      const parsed = this.parseJSONResponse(response.data as string);
      const validated = this.validateAnomalyAnalysisResult(parsed);
      return {
        success: true,
        data: validated,
        usage: response.usage,
      };
    } catch (error) {
      return {
        success: false,
        error: `解析异常分析结果失败: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  // =====================================================
  // 核心 API 调用方法
  // =====================================================

  /**
   * 调用 GLM API (使用 OpenAI SDK)
   */
  private async callGLM(config: {
    taskType: AITaskType;
    userPrompt: string;
    maxTokens: number;
    temperature: number;
  }): Promise<AIResponse<string>> {
    const { taskType, userPrompt, maxTokens, temperature } = config;

    // 构建消息
    const systemPrompt = this.getSystemPrompt(taskType);

    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ];

    this.stats.totalRequests++;

    try {
      if (this.enableLogging) {
        logger.debug(`GLM 请求 [${taskType}]`, {
          maxTokens,
          temperature,
          promptLength: userPrompt.length,
        });
      }

      const startTime = Date.now();

      // GLM-4.7 思考模式配置
      // 参考：https://docs.bigmodel.cn/cn/guide/capabilities/thinking-mode
      const requestBody: any = {
        model: this.model,
        messages,
        temperature,
        max_tokens: maxTokens,
      };

      // 对于 GLM-4.7 模型，根据任务类型配置思考模式
      if (this.model === 'glm-4.7') {
        // 获取该任务类型的思考模式配置
        const thinkingMode = this.getThinkingMode(taskType);
        requestBody.thinking = { type: thinkingMode };
      }

      const completion = await this.client.chat.completions.create(requestBody);

      const duration = Date.now() - startTime;

      // 成功
      this.stats.successRequests++;
      this.stats.promptTokens += completion.usage?.prompt_tokens || 0;
      this.stats.completionTokens += completion.usage?.completion_tokens || 0;
      this.stats.totalTokens += completion.usage?.total_tokens || 0;

      const message = completion.choices[0]?.message;

      // GLM-4.7 是推理模型，内容可能存放在 reasoning_content 字段中
      // 如果 content 为空，尝试使用 reasoning_content
      let content = message?.content || '';

      // TypeScript 扩展：reasoning_content 字段
      const reasoningContent = (message as unknown as Record<string, string>)?.reasoning_content || '';

      // 如果 content 为空但有 reasoning_content，使用 reasoning_content
      if (!content && reasoningContent) {
        content = reasoningContent;
      }

      // 调试：打印完整的API响应
      if (this.enableLogging) {
        logger.debug(`GLM 完整响应 [${taskType}]`, {
          hasMessage: !!message,
          hasContent: !!content,
          hasReasoningContent: !!reasoningContent,
          contentLength: content.length,
          reasoningContentLength: reasoningContent.length,
          contentPreview: content.substring(0, 200),
          rawMessage: JSON.stringify(message),
        });
      }

      if (this.enableLogging) {
        logger.info(`GLM 响应成功 [${taskType}]`, {
          duration: `${duration}ms`,
          promptTokens: completion.usage?.prompt_tokens || 0,
          completionTokens: completion.usage?.completion_tokens || 0,
          totalTokens: completion.usage?.total_tokens || 0,
          contentLength: content.length,
        });
      }

      return {
        success: true,
        data: content,
        usage: {
          promptTokens: completion.usage?.prompt_tokens || 0,
          completionTokens: completion.usage?.completion_tokens || 0,
          totalTokens: completion.usage?.total_tokens || 0,
        },
      };
    } catch (error) {
      this.stats.failedRequests++;

      const errorMessage = error instanceof Error ? error.message : String(error);

      if (this.enableLogging) {
        logger.warn(`GLM 请求失败 [${taskType}]`, {
          error: errorMessage,
        });
      }

      return {
        success: false,
        error: `GLM API 调用失败: ${errorMessage}`,
      };
    }
  }

  // =====================================================
  // 提示词构建方法
  // =====================================================

  private getSystemPrompt(taskType: AITaskType): string {
    const basePrompt = `你是一个专业的加密货币交易分析助手。你服务于量化交易系统，负责分析市场数据并提供交易建议。

重要规则：
1. 只输出 JSON 格式的响应，不要包含其他文字
2. 置信度范围 0-1，不要超过 0.85
3. 保持客观，不要过度自信
4. 考虑风险，给出平衡的建议
`;

    switch (taskType) {
      case 'market_scan':
        return basePrompt + `你的任务是快速扫描市场，识别价格异常、突破、反转等信号。只输出简洁的 JSON。`;

      case 'trading_decision':
        return basePrompt + `你的任务是结合市场数据和当前持仓，给出买入/卖出/持有建议。必须考虑风险控制。只输出明确的买入或卖出决策，不要输出持有。`;

      case 'performance_report':
        return basePrompt + `你的任务是分析策略表现，评估 AI 和规则的贡献，给出改进建议。`;

      case 'deep_analysis':
        return basePrompt + `你的任务是全面复盘交易，识别市场模式，总结成功和失败案例。`;

      case 'anomaly_analysis':
        return basePrompt + `你的任务是分析异常情况，评估严重程度，给出处理建议。`;

      default:
        return basePrompt;
    }
  }

  /**
   * 根据任务类型获取思考模式
   */
  private getThinkingMode(taskType: AITaskType): ThinkingMode {
    switch (taskType) {
      case 'market_scan':
        return this.thinkingMode?.marketScan ?? 'disabled';
      case 'trading_decision':
        return this.thinkingMode?.tradingDecision ?? 'disabled';
      case 'performance_report':
        return this.thinkingMode?.performanceReport ?? 'enabled';
      case 'deep_analysis':
        return this.thinkingMode?.deepAnalysis ?? 'enabled';
      case 'anomaly_analysis':
        return this.thinkingMode?.anomalyAnalysis ?? 'enabled';
      default:
        return 'disabled';
    }
  }

  private buildMarketScanPrompt(
    coins: string[],
    focus?: string,
    realMarketData?: RealMarketData
  ): string {
    const coinsList = Array.isArray(coins) ? coins.join(', ') : coins;

    // 如果提供了真实市场数据，构建详细的数据摘要
    let marketDataSection = '';
    if (realMarketData && realMarketData.prices.size > 0) {
      marketDataSection = '\n# 真实市场数据\n\n';

      for (const coin of coins) {
        const priceData = realMarketData.prices.get(coin);
        if (!priceData || typeof priceData.price !== 'number') continue;

        marketDataSection += `## ${coin}\n`;
        marketDataSection += `- 价格: ${priceData.price.toFixed(2)} USDT\n`;
        marketDataSection += `- 24h涨跌: ${(priceData.change24h ?? 0).toFixed(2)}%\n`;
        marketDataSection += `- 24h高低: ${(priceData.low24h ?? priceData.price * 0.95).toFixed(2)} - ${(priceData.high24h ?? priceData.price * 1.05).toFixed(2)} USDT\n`;
        marketDataSection += `- 24h成交量: ${(priceData.volume24h ?? 0).toLocaleString()} USDT\n`;

        // 技术指标
        const indicators = realMarketData.indicators?.get(coin);
        if (indicators) {
          marketDataSection += `\n技术指标:\n`;
          marketDataSection += `- MA7: ${indicators.ma.ma7.toFixed(2)}\n`;
          marketDataSection += `- MA25: ${indicators.ma.ma25.toFixed(2)}\n`;
          marketDataSection += `- MA99: ${indicators.ma.ma99.toFixed(2)}\n`;
          marketDataSection += `- RSI: ${indicators.rsi.toFixed(2)}\n`;
          marketDataSection += `- MACD: ${indicators.macd.macd.toFixed(4)} (信号: ${indicators.macd.signal.toFixed(4)})\n`;
          marketDataSection += `- 布林带: [${indicators.bollinger.lower.toFixed(2)}, ${indicators.bollinger.upper.toFixed(2)}]\n`;
        }

        // 最近K线摘要
        const klines = realMarketData.klines?.get(coin);
        if (klines && klines.length > 0) {
          const recent = klines.slice(-3);
          marketDataSection += `\n最近3根K线:\n`;
          for (const k of recent) {
            const time = new Date(k.timestamp).toLocaleTimeString();
            marketDataSection += `- ${time}: O=${k.open.toFixed(2)} H=${k.high.toFixed(2)} L=${k.low.toFixed(2)} C=${k.close.toFixed(2)}\n`;
          }
        }

        marketDataSection += '\n';
      }

      marketDataSection += `请基于以上真实市场数据进行分析，不要编造数据。\n\n`;
    }

    return `扫描以下币种的市场状态: ${coinsList}${focus ? `，关注: ${focus}` : ''}

${marketDataSection}

你的任务：
1. 分析每个币种的价格走势和技术指标
2. 识别交易机会（突破、 dips、反转等）
3. 识别潜在风险（高波动率、下跌趋势等）

输出 JSON 格式：
{
  "timestamp": ${Date.now()},
  "coins": [
    {
      "coin": "BTC",
      "price": ${realMarketData?.prices.get('BTC')?.price ?? 43500},
      "change24h": ${realMarketData?.prices.get('BTC')?.change24h ?? 2.5},
      "volume24h": ${realMarketData?.prices.get('BTC')?.volume24h ?? 1000000},
      "volatility": 3.2,
      "trend": "uptrend|downtrend|sideways"
    }
  ],
  "opportunities": [
    {
      "coin": "ETH",
      "type": "breakout|dip|reversal|trend_follow",
      "confidence": 0.7,
      "reason": "基于真实数据分析：价格突破阻力位，成交量放大"
    }
  ],
  "risks": [
    {
      "coin": "SOL",
      "type": "high_volatility|downtrend|liquidity_low",
      "severity": "low|medium|high",
      "description": "基于真实数据分析：波动率超过10%，注意风险"
    }
  ]
}`;
  }

  private buildTradingDecisionPrompt(input: {
    marketScan: MarketScanResult;
    currentPositions: Array<{ coin: string; amount: number; avgCost: number; unrealizedPnL: number }>;
    recentPerformance?: { totalTrades: number; winRate: number; totalPnL: number };
    tradingFeedback?: import('../history/types.js').TradingFeedback;
  }): string {
    // 构建交易历史反馈部分
    let feedbackSection = '';
    if (input.tradingFeedback) {
      const fb = input.tradingFeedback;
      feedbackSection = `

交易历史反馈（学习闭环）：
总体表现：总交易 ${fb.overall.totalTrades}, 胜率 ${(fb.overall.winRate * 100).toFixed(1)}%, 平均盈利 $${fb.overall.avgWin.toFixed(2)}, 平均亏损 $${fb.overall.avgLoss.toFixed(2)}, 盈亏比 ${fb.overall.profitFactor.toFixed(2)}, 最大回撤 $${fb.overall.maxDrawdown.toFixed(2)}

最近交易记录：
${fb.recentTrades.map(t => `  ${t.coin} ${t.action} @ ${t.price} → ${t.success ? '盈利' : '亏损'} $${Math.abs(t.result).toFixed(2)} (${t.marketCondition}, ${t.decisionReason})`).join('\n')}

按币种表现：
${Array.from(fb.byCoin.entries()).map(([coin, perf]) => `  ${coin}: ${perf.trades}笔, 胜率 ${(perf.winRate * 100).toFixed(1)}%, 盈亏 $${perf.totalPnL.toFixed(2)}`).join('\n')}

按决策源表现：
  AI: ${fb.bySource.ai.trades}笔, 胜率 ${(fb.bySource.ai.winRate * 100).toFixed(1)}%, 平均盈亏 $${fb.bySource.ai.avgPnL.toFixed(2)}
  规则: ${fb.bySource.rule.trades}笔, 胜率 ${(fb.bySource.rule.winRate * 100).toFixed(1)}%, 平均盈亏 $${fb.bySource.rule.avgPnL.toFixed(2)}

失败案例（需要避免的错误）：
${fb.failures.slice(0, 5).map(f => `  ${f.coin} ${f.action}: ${f.reason} (${f.marketCondition}) 亏损 $${Math.abs(f.loss).toFixed(2)}`).join('\n')}

成功案例（学习的模式）：
${fb.successes.slice(0, 5).map(s => `  ${s.coin} ${s.action}: ${s.reason} (${s.marketCondition}) 盈利 $${s.profit.toFixed(2)}`).join('\n')}

按市场条件表现：
  上涨趋势: ${fb.byMarketCondition.uptrend.trades}笔, 胜率 ${(fb.byMarketCondition.uptrend.winRate * 100).toFixed(1)}%, 平均盈亏 $${fb.byMarketCondition.uptrend.avgPnL.toFixed(2)}
  下跌趋势: ${fb.byMarketCondition.downtrend.trades}笔, 胜率 ${(fb.byMarketCondition.downtrend.winRate * 100).toFixed(1)}%, 平均盈亏 $${fb.byMarketCondition.downtrend.avgPnL.toFixed(2)}
  横盘整理: ${fb.byMarketCondition.sideways.trades}笔, 胜率 ${(fb.byMarketCondition.sideways.winRate * 100).toFixed(1)}%, 平均盈亏 $${fb.byMarketCondition.sideways.avgPnL.toFixed(2)}
`;
    }

    return `基于以下市场扫描结果、当前持仓和交易历史反馈，给出交易决策：

市场扫描：
${JSON.stringify(input.marketScan, null, 2)}

当前持仓：
${JSON.stringify(input.currentPositions, null, 2)}

${input.recentPerformance ? `最近表现：\n总交易: ${input.recentPerformance.totalTrades}, 胜率: ${(input.recentPerformance.winRate * 100).toFixed(1)}%, 盈亏: $${input.recentPerformance.totalPnL}` : ''}${feedbackSection}

请基于以上信息，给出交易决策建议。只给出需要执行的动作（买入/卖出），不需要持有。
${feedbackSection ? '\n重要：请参考交易历史反馈，避免重复失败案例的模式，学习成功案例的经验。' : ''}

输出 JSON 格式（决策数组）：
[
  {
    "timestamp": ${Date.now()},
    "coin": "BTC",
    "action": "buy",
    "confidence": 0.65,
    "reason": "趋势向上，波动率适中",
    "aiScore": 0.7,
    "suggestedSize": 100
  }
]

注意：
- action 只能是 "buy" 或 "sell"，不要输出 "hold"
- confidence 范围 0-1，不要超过 0.85
- aiScore 范围 -1 到 1，正数表示买入倾向，负数表示卖出倾向
- suggestedSize 单位是 USDT
- 只给出信号明确的决策，如果信号不明确则不输出任何决策（返回空数组）`;
  }

  private buildPerformanceReportPrompt(input: {
    timeRange?: string;
    performance: {
      totalTrades: number;
      aiDecisions: number;
      ruleDecisions: number;
      totalPnL: number;
      winRate: number;
      aiWinRate: number;
      ruleWinRate: number;
      profitFactor: number;
      maxDrawdown: number;
    };
  }): string {
    const p = input.performance;
    return `分析策略表现：

时间范围：${input.timeRange || '最近6小时'}

性能数据：
- 总交易次数: ${p.totalTrades}
- AI决策: ${p.aiDecisions}
- 规则决策: ${p.ruleDecisions}
- 总盈亏: $${p.totalPnL}
- 胜率: ${(p.winRate * 100).toFixed(1)}%
- AI胜率: ${(p.aiWinRate * 100).toFixed(1)}%
- 规则胜率: ${(p.ruleWinRate * 100).toFixed(1)}%
- 盈亏比: ${p.profitFactor.toFixed(2)}
- 最大回撤: ${(p.maxDrawdown * 100).toFixed(1)}%

请分析策略表现，并给出是否需要调整 AI/规则 权重的建议。

输出 JSON 格式：
{
  "timestamp": ${Date.now()},
  "timeRange": "${input.timeRange || '6h'}",
  "performance": {
    "timeRange": "${input.timeRange || '6h'}",
    "totalTrades": ${p.totalTrades},
    "aiDecisions": ${p.aiDecisions},
    "ruleDecisions": ${p.ruleDecisions},
    "totalPnL": ${p.totalPnL},
    "pnlPercent": ${(p.totalPnL / 10000 * 100).toFixed(2)},
    "winRate": ${p.winRate},
    "aiWinRate": ${p.aiWinRate},
    "ruleWinRate": ${p.ruleWinRate},
    "profitFactor": ${p.profitFactor},
    "maxDrawdown": ${p.maxDrawdown}
  },
  "aiAnalysis": "AI 决策表现分析...",
  "recommendations": ["建议1", "建议2"],
  "shouldAdjustWeight": false,
  "suggestedWeights": {
    "aiWeight": 0.7,
    "ruleWeight": 0.3
  }
}`;
  }

  private buildDeepAnalysisPrompt(input: {
    timeRange?: string;
    includeAllCoins?: boolean;
    focus?: string;
    fullHistory?: boolean;
  }): string {
    return `执行深度复盘分析：

分析参数：
- 时间范围：${input.timeRange || '24小时'}
- 包含所有币种：${input.includeAllCoins ? '是' : '否'}
- 关注点：${input.focus || '全面分析'}
- 完整历史：${input.fullHistory ? '是' : '否'}

请提供全面的复盘分析，包括：
1. 识别的市场模式和规律
2. 成功交易案例分析
3. 失败交易案例分析
4. 改进建议和总结

输出 JSON 格式：
{
  "timestamp": ${Date.now()},
  "timeRange": "${input.timeRange || '24h'}",
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
}`;
  }

  private buildAnomalyAnalysisPrompt(input: {
    anomaly: {
      type: string;
      severity: string;
      description: string;
      data?: Record<string, unknown>;
    };
    marketState?: unknown;
    positions?: unknown;
  }): string {
    return `分析异常情况：

异常信息：
- 类型: ${input.anomaly.type}
- 严重程度: ${input.anomaly.severity}
- 描述: ${input.anomaly.description}
${input.anomaly.data ? `- 数据: ${JSON.stringify(input.anomaly.data)}` : ''}

${input.marketState ? `市场状态：\n${JSON.stringify(input.marketState, null, 2)}` : ''}
${input.positions ? `当前持仓：\n${JSON.stringify(input.positions, null, 2)}` : ''}

请分析异常情况，评估严重程度，并给出处理建议。

输出 JSON 格式：
{
  "timestamp": ${Date.now()},
  "anomaly": ${JSON.stringify(input.anomaly)},
  "severity": "high",
  "rootCause": "异常原因分析...",
  "recommendedAction": "pause_trading",
  "analysis": "详细分析..."
}

recommendedAction 选项：
- ignore: 忽略，继续正常交易
- monitor: 密切监控，暂不需要行动
- pause_trading: 暂停新交易，保持现有持仓
- emergency_close: 紧急平仓`;
  }

  // =====================================================
  // 响应解析和验证方法
  // =====================================================

  private parseJSONResponse(content: string): unknown {
    try {
      // 尝试提取 JSON（处理可能的 markdown 代码块）
      const jsonMatch = content.match(/```(?:json)?\s*(\{[\s\S]*\}|\[[\s\S]*\])\s*```/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[1]);
      }
      return JSON.parse(content);
    } catch (error) {
      throw new Error(`JSON 解析失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private validateMarketScanResult(data: unknown): MarketScanResult {
    if (!data || typeof data !== 'object') {
      throw new Error('无效的响应：不是对象');
    }

    const obj = data as Record<string, unknown>;

    if (typeof obj.timestamp !== 'number') {
      throw new Error('无效的响应：缺少 timestamp');
    }

    if (!Array.isArray(obj.coins)) {
      throw new Error('无效的响应：coins 不是数组');
    }

    // 验证每个币种数据
    for (const coin of obj.coins) {
      this.validateCoinPriceData(coin);
    }

    // 验证 opportunities（如果有）
    if (obj.opportunities) {
      if (!Array.isArray(obj.opportunities)) {
        throw new Error('无效的响应：opportunities 不是数组');
      }
      for (const opp of obj.opportunities) {
        this.validateTradingOpportunity(opp);
      }
    }

    // 验证 risks（如果有）
    if (obj.risks) {
      if (!Array.isArray(obj.risks)) {
        throw new Error('无效的响应：risks 不是数组');
      }
      for (const risk of obj.risks) {
        this.validateMarketRisk(risk);
      }
    }

    return data as MarketScanResult;
  }

  private validateCoinPriceData(data: unknown): asserts data is CoinPriceData {
    if (!data || typeof data !== 'object') {
      throw new Error('无效的币种数据：不是对象');
    }

    const obj = data as Record<string, unknown>;

    if (typeof obj.coin !== 'string') {
      throw new Error('无效的币种数据：coin 不是字符串');
    }

    if (typeof obj.price !== 'number') {
      throw new Error(`无效的币种数据 ${obj.coin}: price 不是数字`);
    }

    if (typeof obj.change24h !== 'number') {
      throw new Error(`无效的币种数据 ${obj.coin}: change24h 不是数字`);
    }

    if (typeof obj.volume24h !== 'number') {
      throw new Error(`无效的币种数据 ${obj.coin}: volume24h 不是数字`);
    }

    if (typeof obj.volatility !== 'number') {
      throw new Error(`无效的币种数据 ${obj.coin}: volatility 不是数字`);
    }

    if (!['uptrend', 'downtrend', 'sideways'].includes(obj.trend as string)) {
      throw new Error(`无效的币种数据 ${obj.coin}: trend 值无效`);
    }
  }

  private validateTradingOpportunity(data: unknown): asserts data is TradingOpportunity {
    if (!data || typeof data !== 'object') {
      throw new Error('无效的交易机会：不是对象');
    }

    const obj = data as Record<string, unknown>;

    if (typeof obj.coin !== 'string') {
      throw new Error('无效的交易机会：coin 不是字符串');
    }

    if (!['breakout', 'dip', 'reversal', 'trend_follow'].includes(obj.type as string)) {
      throw new Error(`无效的交易机会 ${obj.coin}: type 值无效`);
    }

    if (typeof obj.confidence !== 'number' || obj.confidence < 0 || obj.confidence > 1) {
      throw new Error(`无效的交易机会 ${obj.coin}: confidence 不在 [0,1] 范围内`);
    }

    if (typeof obj.reason !== 'string') {
      throw new Error(`无效的交易机会 ${obj.coin}: reason 不是字符串`);
    }
  }

  private validateMarketRisk(data: unknown): asserts data is MarketRisk {
    if (!data || typeof data !== 'object') {
      throw new Error('无效的市场风险：不是对象');
    }

    const obj = data as Record<string, unknown>;

    if (typeof obj.coin !== 'string') {
      throw new Error('无效的市场风险：coin 不是字符串');
    }

    if (!['high_volatility', 'downtrend', 'liquidity_low'].includes(obj.type as string)) {
      throw new Error(`无效的市场风险 ${obj.coin}: type 值无效`);
    }

    if (!['low', 'medium', 'high'].includes(obj.severity as string)) {
      throw new Error(`无效的市场风险 ${obj.coin}: severity 值无效`);
    }

    if (typeof obj.description !== 'string') {
      throw new Error(`无效的市场风险 ${obj.coin}: description 不是字符串`);
    }
  }

  private validateTradingDecision(data: unknown): AITradingDecision {
    if (!data || typeof data !== 'object') {
      throw new Error('无效的交易决策：不是对象');
    }

    const obj = data as Record<string, unknown>;

    if (typeof obj.timestamp !== 'number') {
      throw new Error('无效的交易决策：缺少 timestamp');
    }

    if (typeof obj.coin !== 'string') {
      throw new Error('无效的交易决策：缺少 coin');
    }

    if (!['buy', 'sell', 'hold'].includes(obj.action as string)) {
      throw new Error(`无效的交易决策 ${obj.coin}: action 值无效`);
    }

    if (typeof obj.confidence !== 'number' || obj.confidence < 0 || obj.confidence > 1) {
      throw new Error(`无效的交易决策 ${obj.coin}: confidence 不在 [0,1] 范围内`);
    }

    if (typeof obj.reason !== 'string') {
      throw new Error(`无效的交易决策 ${obj.coin}: reason 不是字符串`);
    }

    if (typeof obj.aiScore !== 'number' || obj.aiScore < -1 || obj.aiScore > 1) {
      throw new Error(`无效的交易决策 ${obj.coin}: aiScore 不在 [-1,1] 范围内`);
    }

    if (obj.suggestedSize !== undefined && typeof obj.suggestedSize !== 'number') {
      throw new Error(`无效的交易决策 ${obj.coin}: suggestedSize 不是数字`);
    }

    return data as AITradingDecision;
  }

  private validatePerformanceReport(data: unknown): PerformanceReport {
    if (!data || typeof data !== 'object') {
      throw new Error('无效的性能报告：不是对象');
    }

    const obj = data as Record<string, unknown>;

    if (typeof obj.timestamp !== 'number') {
      throw new Error('无效的性能报告：缺少 timestamp');
    }

    if (typeof obj.timeRange !== 'string') {
      throw new Error('无效的性能报告：缺少 timeRange');
    }

    if (!obj.performance || typeof obj.performance !== 'object') {
      throw new Error('无效的性能报告：缺少 performance');
    }

    if (typeof obj.aiAnalysis !== 'string') {
      throw new Error('无效的性能报告：缺少 aiAnalysis');
    }

    if (!Array.isArray(obj.recommendations)) {
      throw new Error('无效的性能报告：recommendations 不是数组');
    }

    if (typeof obj.shouldAdjustWeight !== 'boolean') {
      throw new Error('无效的性能报告：shouldAdjustWeight 不是布尔值');
    }

    return data as PerformanceReport;
  }

  private validateDeepAnalysisResult(data: unknown): DeepAnalysisResult {
    if (!data || typeof data !== 'object') {
      throw new Error('无效的深度分析：不是对象');
    }

    const obj = data as Record<string, unknown>;

    if (typeof obj.timestamp !== 'number') {
      throw new Error('无效的深度分析：缺少 timestamp');
    }

    if (typeof obj.timeRange !== 'string') {
      throw new Error('无效的深度分析：缺少 timeRange');
    }

    if (!Array.isArray(obj.patterns)) {
      throw new Error('无效的深度分析：patterns 不是数组');
    }

    if (!Array.isArray(obj.successCases)) {
      throw new Error('无效的深度分析：successCases 不是数组');
    }

    if (!Array.isArray(obj.failureCases)) {
      throw new Error('无效的深度分析：failureCases 不是数组');
    }

    if (!Array.isArray(obj.recommendations)) {
      throw new Error('无效的深度分析：recommendations 不是数组');
    }

    if (typeof obj.summary !== 'string') {
      throw new Error('无效的深度分析：summary 不是字符串');
    }

    return data as DeepAnalysisResult;
  }

  private validateAnomalyAnalysisResult(data: unknown): AnomalyAnalysisResult {
    if (!data || typeof data !== 'object') {
      throw new Error('无效的异常分析：不是对象');
    }

    const obj = data as Record<string, unknown>;

    if (typeof obj.timestamp !== 'number') {
      throw new Error('无效的异常分析：缺少 timestamp');
    }

    if (!obj.anomaly || typeof obj.anomaly !== 'object') {
      throw new Error('无效的异常分析：缺少 anomaly');
    }

    if (!['low', 'medium', 'high', 'critical'].includes(obj.severity as string)) {
      throw new Error('无效的异常分析：severity 值无效');
    }

    if (typeof obj.rootCause !== 'string') {
      throw new Error('无效的异常分析：缺少 rootCause');
    }

    if (!['ignore', 'monitor', 'pause_trading', 'emergency_close'].includes(obj.recommendedAction as string)) {
      throw new Error('无效的异常分析：recommendedAction 值无效');
    }

    if (typeof obj.analysis !== 'string') {
      throw new Error('无效的异常分析：缺少 analysis');
    }

    return data as AnomalyAnalysisResult;
  }

  // =====================================================
  // 统计和工具方法
  // =====================================================

  /**
   * 获取统计信息
   */
  getStats() {
    return {
      ...this.stats,
      successRate: this.stats.totalRequests > 0
        ? this.stats.successRequests / this.stats.totalRequests
        : 0,
    };
  }

  /**
   * 重置统计信息
   */
  resetStats(): void {
    this.stats = {
      totalRequests: 0,
      successRequests: 0,
      failedRequests: 0,
      totalTokens: 0,
      promptTokens: 0,
      completionTokens: 0,
    };
  }

  /**
   * 健康检查
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await this.callGLM({
        taskType: 'market_scan' as AITaskType,
        userPrompt: this.buildMarketScanPrompt(['BTC'], 'health_check'),
        maxTokens: 100,
        temperature: 0.1,
      });
      return response.success;
    } catch {
      return false;
    }
  }
}
