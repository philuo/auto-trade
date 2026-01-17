/**
 * AI 客户端 - 统一的 AI 交易分析接口
 *
 * 功能：
 * - 支持多种 AI 模型（GLM-4.7 等）
 * - 支持现货交易和合约交易两种白名单
 * - 市场扫描、交易决策、性能报告、深度分析、异常分析
 * - 错误处理与重试机制
 * - Token 使用统计
 */

import OpenAI from 'openai';
import { logger } from '../utils/logger.js';
import { AITaskType, DEFAULT_WHITELISTS } from './types.js';
import type { TradingType } from './types.js';
import type {
  AIClientConfig,
  AIResponse,
  MarketScanResult,
  AITradingDecision,
  PerformanceReport,
  DeepAnalysisResult,
  AnomalyAnalysisResult,
  RealMarketData,
} from './types.js';

// =====================================================
// 常量配置
// =====================================================

const AI_DEFAULT_CONFIG = {
  baseURL: process.env.OPENAI_URL,
  timeout: 30000,
  maxRetries: 3,
  model: 'glm-4.7',
};

// =====================================================
// 统计数据接口
// =====================================================

interface AIClientStats {
  totalRequests: number;
  successRequests: number;
  failedRequests: number;
  totalTokens: number;
  promptTokens: number;
  completionTokens: number;
}

// =====================================================
// AI 客户端类
// =====================================================

export class AIClient {
  private client: OpenAI;
  private model: string;
  private enableLogging: boolean;
  private tradingType: TradingType;
  private coinWhitelist: string[];
  private stats: AIClientStats;

  constructor(config?: AIClientConfig) {
    // 环境变量
    const envApiKey = process.env.OPENAI_API_KEY;
    const envURL = process.env.OPENAI_URL;

    // 确定 apiKey：如果配置中显式指定了 apiKey（包括空字符串），使用配置值；否则从环境变量读取
    let apiKey: string;
    if (config !== undefined && 'apiKey' in config) {
      // 配置中显式指定了 apiKey，使用配置值（即使是空字符串）
      apiKey = config.apiKey ?? '';
    } else {
      // 配置中没有 apiKey，从环境变量读取
      apiKey = envApiKey ?? '';
    }

    // 验证 apiKey
    if (!apiKey || apiKey.trim() === '') {
      throw new Error('AI API Key is required (请设置 OPENAI_API_KEY 环境变量或传入 apiKey)');
    }

    // 构建完整配置
    const effectiveConfig: AIClientConfig = {
      apiKey,
      baseURL: config?.baseURL || envURL,
      model: config?.model || (process.env.OPENAI_MODEL as any),
      timeout: config?.timeout || (process.env.OPENAI_TIMEOUT ? parseInt(process.env.OPENAI_TIMEOUT) : undefined),
      maxRetries: config?.maxRetries,
      enableLogging: config?.enableLogging,
      tradingType: config?.tradingType,
      coinWhitelist: config?.coinWhitelist,
    };

    this.client = new OpenAI({
      apiKey: effectiveConfig.apiKey,
      baseURL: effectiveConfig.baseURL || AI_DEFAULT_CONFIG.baseURL,
      timeout: effectiveConfig.timeout || AI_DEFAULT_CONFIG.timeout,
      maxRetries: effectiveConfig.maxRetries || AI_DEFAULT_CONFIG.maxRetries,
    });

    this.model = effectiveConfig.model || AI_DEFAULT_CONFIG.model;
    this.enableLogging = effectiveConfig.enableLogging ?? true;
    this.tradingType = effectiveConfig.tradingType ?? 'spot'; // 默认使用现货交易

    // 根据配置选择白名单
    if (effectiveConfig.coinWhitelist) {
      this.coinWhitelist = effectiveConfig.coinWhitelist;
    } else {
      // 根据交易类型使用对应的默认白名单
      this.coinWhitelist = [...DEFAULT_WHITELISTS[this.tradingType]];
    }

    this.stats = {
      totalRequests: 0,
      successRequests: 0,
      failedRequests: 0,
      totalTokens: 0,
      promptTokens: 0,
      completionTokens: 0,
    };

    logger.info('AI Client 初始化完成', {
      model: this.model,
      tradingType: this.tradingType,
      coinWhitelist: this.coinWhitelist,
    });
  }

  // =====================================================
  // 核心 API 调用方法
  // =====================================================

  private async callAI(userPrompt: string, taskType: AITaskType, systemPrompt?: string, maxTokens = 102400, temperature = 1.0): Promise<AIResponse<string>> {
    this.stats.totalRequests++;
    const startTime = Date.now();

    try {
      if (this.enableLogging) {
        logger.debug('AI API 调用', {
          taskType,
          maxTokens,
          temperature,
        });
      }

      // 使用 OpenAI SDK 调用 GLM
      // 禁用 thinking 模式以直接获取 JSON 回答（而非思考过程）
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          { role: 'system', content: systemPrompt || this.getSystemPrompt(taskType) },
          { role: 'user', content: userPrompt },
        ],
        // GLM 特定参数：禁用思考模式，直接返回回答内容
        thinking: {
          type: 'disabled',
        },
        temperature,
        max_tokens: maxTokens,
        stream: false,
      } as any);

      // 获取回答内容（禁用 thinking 模式后，直接返回 content）
      const message = response.choices[0]?.message;
      const content = message?.content ?? '';

      // 检查内容是否为空
      if (!content || content.trim().length === 0) {
        this.stats.failedRequests++;
        const elapsed = Date.now() - startTime;
        const errorMsg = 'AI 返回了空响应';
        logger.error('AI API 响应为空', {
          taskType,
          elapsed: `${elapsed}ms`,
          usage: response.usage,
        });
        return {
          success: false,
          error: errorMsg,
        };
      }

      const usage = response.usage ? {
        promptTokens: response.usage.prompt_tokens,
        completionTokens: response.usage.completion_tokens,
        totalTokens: response.usage.total_tokens,
      } : undefined;

      this.stats.successRequests++;
      if (usage) {
        this.stats.totalTokens += usage.totalTokens;
        this.stats.promptTokens += usage.promptTokens;
        this.stats.completionTokens += usage.completionTokens;
      }

      const elapsed = Date.now() - startTime;
      if (this.enableLogging) {
        logger.debug('AI API 响应', {
          taskType,
          elapsed: `${elapsed}ms`,
          tokens: usage?.totalTokens,
          contentLength: content.length,
        });
      }

      return { success: true, data: content, usage };
    } catch (error) {
      this.stats.failedRequests++;
      const elapsed = Date.now() - startTime;
      const errorMsg = error instanceof Error ? error.message : String(error);

      // 区分不同类型的错误，429/401 是正常的API响应，不应作为ERROR
      if (errorMsg.includes('429') || errorMsg.includes('余额不足') || errorMsg.includes('quota')) {
        // 429 - 配额用尽，使用 WARN 级别
        logger.warn('AI API 配额已用尽', {
          taskType,
          error: errorMsg,
          elapsed: `${elapsed}ms`,
        });
      } else if (errorMsg.includes('401') || errorMsg.includes('认证') || errorMsg.includes('auth') || errorMsg.includes('令牌')) {
        // 401 - 认证失败，使用 WARN 级别
        logger.warn('AI API 认证失败', {
          taskType,
          error: errorMsg,
          elapsed: `${elapsed}ms`,
        });
      } else {
        // 其他错误使用 ERROR 级别
        logger.error('AI API 调用失败', {
          taskType,
          error: errorMsg,
          elapsed: `${elapsed}ms`,
        });
      }

      return {
        success: false,
        error: errorMsg,
      };
    }
  }

  // =====================================================
  // 系统提示词
  // =====================================================

  private getSystemPrompt(taskType: AITaskType): string {
    const basePrompt = `你是一个专业的加密货币交易分析助手。只输出 JSON 格式的响应，不要包含其他文字。

重要规则：
1. 只输出 JSON 格式，不要包含 markdown 代码块
2. 严格按照 JSON Schema 输出
3. 置信度根据实际情况给出（0-1）
4. 保持客观，基于数据分析
5. trend 字段只能是 "uptrend"、"downtrend" 或 "sideways"
6. action 字段只能是 "buy" 或 "sell"（不要输出 "hold"）
`;

    switch (taskType) {
      case 'market_scan':
        return basePrompt + `你的任务是快速扫描市场，识别价格异常、突破、反转等信号。

标准 JSON Schema 定义：
{
  "type": "object",
  "properties": {
    "timestamp": {
      "type": "number",
      "description": "扫描时间戳（毫秒）"
    },
    "coins": {
      "type": "array",
      "description": "币种分析结果数组",
      "items": {
        "type": "object",
        "properties": {
          "coin": {
            "type": "string",
            "description": "币种符号，如 BTC、ETH"
          },
          "price": {
            "type": "number",
            "description": "当前价格（USDT）"
          },
          "change24h": {
            "type": "number",
            "description": "24小时涨跌幅（百分比）"
          },
          "volume24h": {
            "type": "number",
            "description": "24小时成交量（USDT）"
          },
          "volatility": {
            "type": "number",
            "minimum": 0,
            "maximum": 1,
            "description": "波动率（0-1之间的数值）"
          },
          "trend": {
            "type": "string",
            "enum": ["uptrend", "downtrend", "sideways"],
            "description": "趋势方向：uptrend=上涨趋势，downtrend=下跌趋势，sideways=横盘整理"
          }
        },
        "required": ["coin", "price", "change24h", "volume24h", "volatility", "trend"]
      }
    },
    "opportunities": {
      "type": "array",
      "description": "识别的交易机会（可选）",
      "items": {
        "type": "object",
        "properties": {
          "coin": {
            "type": "string",
            "description": "币种符号"
          },
          "type": {
            "type": "string",
            "enum": ["breakout", "dip", "reversal", "trend_follow"],
            "description": "机会类型：breakout=突破，dip=回调买入，reversal=反转，trend_follow=趋势跟随"
          },
          "confidence": {
            "type": "number",
            "minimum": 0,
            "maximum": 1,
            "description": "置信度（0-1之间，0最低，1最高）"
          },
          "reason": {
            "type": "string",
            "description": "原因分析（为什么认为这是机会）"
          }
        },
        "required": ["coin", "type", "confidence", "reason"]
      }
    },
    "risks": {
      "type": "array",
      "description": "识别的市场风险（可选）",
      "items": {
        "type": "object",
        "properties": {
          "coin": {
            "type": "string",
            "description": "币种符号"
          },
          "type": {
            "type": "string",
            "enum": ["high_volatility", "downtrend", "liquidity_low"],
            "description": "风险类型：high_volatility=高波动率，downtrend=下跌趋势，liquidity_low=流动性不足"
          },
          "severity": {
            "type": "string",
            "enum": ["low", "medium", "high"],
            "description": "严重程度：low=低，medium=中，high=高"
          },
          "description": {
            "type": "string",
            "description": "风险描述详情"
          }
        },
        "required": ["coin", "type", "severity", "description"]
      }
    }
  },
  "required": ["timestamp", "coins"]
}

严格按照上述 JSON Schema 输出结果。
`;

      case 'trading_decision':
        return basePrompt + `你的任务是结合市场数据和当前持仓，给出买入/卖出建议。

JSON Schema (严格按照此格式输出，数组格式):
{
  "type": "array",
  "description": "交易决策数组，如果无明确信号则返回空数组",
  "items": {
    "type": "object",
    "properties": {
      "timestamp": {
        "type": "number",
        "description": "决策时间戳（毫秒）"
      },
      "coin": {
        "type": "string",
        "description": "币种符号，如 BTC、ETH"
      },
      "action": {
        "type": "string",
        "enum": ["buy", "sell"],
        "description": "交易动作：buy=买入，sell=卖出（注意：不要输出hold）"
      },
      "confidence": {
        "type": "number",
        "minimum": 0,
        "maximum": 1,
        "description": "置信度（0-1之间，表示信号强度）"
      },
      "reason": {
        "type": "string",
        "description": "决策原因（为什么做出这个决策）"
      },
      "aiScore": {
        "type": "number",
        "minimum": -1,
        "maximum": 1,
        "description": "AI评分（-1到1之间，负数表示看空，正数表示看多）"
      },
      "suggestedSize": {
        "type": "number",
        "description": "建议交易金额（USDT，可选字段）"
      }
    },
    "required": ["timestamp", "coin", "action", "confidence", "reason", "aiScore"]
  }
}

严格按照上述 JSON Schema 输出数组结果。如果没有明确信号，返回空数组 []。
`;

      case 'performance_report':
        return basePrompt + `你的任务是分析策略表现，评估 AI 和规则的贡献。

JSON Schema:
- timestamp: number
- timeRange: string
- performance: object
- aiAnalysis: string
- recommendations: array of string
- shouldAdjustWeight: boolean
- suggestedWeights (可选): {aiWeight, ruleWeight}
`;

      case 'deep_analysis':
        return basePrompt + `你的任务是全面复盘交易，识别市场模式。

JSON Schema:
- timestamp: number
- timeRange: string
- patterns: array
- successCases: array
- failureCases: array
- recommendations: array
- summary: string
`;

      case 'anomaly_analysis':
        return basePrompt + `你的任务是分析异常情况。

JSON Schema:
- timestamp: number
- anomaly: object
- severity: "low" | "medium" | "high" | "critical"
- rootCause: string
- recommendedAction: "ignore" | "monitor" | "pause_trading" | "emergency_close"
- analysis: string
`;

      default:
        return basePrompt;
    }
  }

  // =====================================================
  // 提示词构建方法
  // =====================================================

  private buildMarketScanPrompt(coins: string[], focus?: string, realMarketData?: RealMarketData): string {
    let prompt = `扫描以下币种的市场状态: ${coins.join(', ')}${focus ? `，关注: ${focus}` : ''}\n\n`;

    if (realMarketData && realMarketData.prices.size > 0) {
      prompt += `# 真实市场数据\n\n`;
      for (const coin of coins) {
        const priceData = realMarketData.prices.get(coin);
        if (!priceData || typeof priceData.price !== 'number') continue;

        prompt += `## ${coin}\n`;
        prompt += `- 价格: ${priceData.price.toFixed(2)} USDT\n`;
        prompt += `- 24h涨跌: ${(priceData.change24h ?? 0).toFixed(2)}%\n`;
        prompt += `- 24h高低: ${(priceData.low24h ?? priceData.price * 0.95).toFixed(2)} - ${(priceData.high24h ?? priceData.price * 1.05).toFixed(2)} USDT\n`;
        prompt += `- 24h成交量: ${(priceData.volume24h ?? 0).toLocaleString()} USDT\n`;

        const indicators = realMarketData.indicators?.get(coin);
        if (indicators) {
          prompt += `\n技术指标:\n`;
          prompt += `- MA7: ${indicators.ma.ma7.toFixed(2)}, MA25: ${indicators.ma.ma25.toFixed(2)}, MA99: ${indicators.ma.ma99.toFixed(2)}\n`;
          prompt += `- RSI: ${indicators.rsi.toFixed(2)}\n`;
          prompt += `- MACD: ${indicators.macd.macd.toFixed(4)} (信号: ${indicators.macd.signal.toFixed(4)})\n`;
          prompt += `- 布林带: [${indicators.bollinger.lower.toFixed(2)}, ${indicators.bollinger.upper.toFixed(2)}]\n`;
        }

        const klines = realMarketData.klines?.get(coin);
        if (klines && klines.length > 0) {
          const recent = klines.slice(-3);
          prompt += `\n最近3根K线:\n`;
          for (const k of recent) {
            const time = new Date(k.timestamp).toLocaleTimeString();
            prompt += `- ${time}: O=${k.open.toFixed(2)} H=${k.high.toFixed(2)} L=${k.low.toFixed(2)} C=${k.close.toFixed(2)}\n`;
          }
        }
        prompt += '\n';
      }
      prompt += `请基于以上真实市场数据进行分析，不要编造数据。\n\n`;
    }

    prompt += `你的任务：
1. 分析每个币种的价格走势和技术指标
2. 识别交易机会（突破、dips、反转等）
3. 识别潜在风险（高波动率、下跌趋势等）

请严格按照 JSON Schema 要求输出结果。`;

    return prompt;
  }

  private buildTradingDecisionPrompt(input: {
    marketScan: MarketScanResult;
    currentPositions: Array<{ coin: string; amount: number; avgCost: number; positionPnL: number }>;
    recentPerformance?: { totalTrades: number; winRate: number; totalPnL: number };
    tradingFeedback?: any;
  }): string {
    let prompt = `基于以下市场扫描结果和当前持仓，给出交易决策：

市场扫描：
${JSON.stringify(input.marketScan, null, 2)}

当前持仓：
${JSON.stringify(input.currentPositions, null, 2)}
`;

    if (input.recentPerformance) {
      prompt += `\n最近表现：总交易: ${input.recentPerformance.totalTrades}, 胜率: ${(input.recentPerformance.winRate * 100).toFixed(1)}%, 盈亏: $${input.recentPerformance.totalPnL}\n`;
    }

    prompt += `\n请基于以上信息，给出交易决策建议。只给出需要执行的动作（买入/卖出），不需要持有。
只输出信号明确的决策，如果信号不明确则返回空数组。

注意：
- action 只能是 "buy" 或 "sell"，不要输出 "hold"
- confidence 范围 0-1，根据信号强度给出合理值
- aiScore 范围 -1 到 1
- suggestedSize 单位是 USDT

请严格按照 JSON Schema 要求输出结果（数组格式）。`;

    return prompt;
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

请严格按照 JSON Schema 要求输出结果。`;
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

请严格按照 JSON Schema 要求输出结果。`;
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
    let prompt = `分析异常情况：

异常信息：
- 类型: ${input.anomaly.type}
- 严重程度: ${input.anomaly.severity}
- 描述: ${input.anomaly.description}
${input.anomaly.data ? `- 数据: ${JSON.stringify(input.anomaly.data)}` : ''}

${input.marketState ? `市场状态：\n${JSON.stringify(input.marketState, null, 2)}` : ''}
${input.positions ? `当前持仓：\n${JSON.stringify(input.positions, null, 2)}` : ''}

请分析异常情况，评估严重程度，并给出处理建议。

recommendedAction 选项：
- ignore: 忽略，继续正常交易
- monitor: 密切监控，暂不需要行动
- pause_trading: 暂停新交易，保持现有持仓
- emergency_close: 紧急平仓

请严格按照 JSON Schema 要求输出结果。`;
    return prompt;
  }

  // =====================================================
  // 响应解析和验证
  // =====================================================

  private parseJSONResponse(content: string): unknown {
    try {
      return JSON.parse(content);
    } catch {
      const jsonMatch = content.match(/```(?:json)?\s*(\{[\s\S]*\}|\[[\s\S]*\])\s*```/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[1]);
      }
      const objectMatch = content.match(/\{[\s\S]*\}/);
      if (objectMatch) {
        return JSON.parse(objectMatch[0]);
      }
      const arrayMatch = content.match(/\[[\s\S]*\]/);
      if (arrayMatch) {
        return JSON.parse(arrayMatch[0]);
      }
      throw new Error('无法从响应中提取 JSON');
    }
  }

  private normalizeTrend(value: unknown): 'uptrend' | 'downtrend' | 'sideways' {
    if (typeof value !== 'string') {
      throw new Error(`trend 不是字符串`);
    }
    const v = value.toLowerCase().trim();
    if (['uptrend', 'up', '上涨', '上升'].includes(v)) return 'uptrend';
    if (['downtrend', 'down', '下跌', '下降'].includes(v)) return 'downtrend';
    if (['sideways', 'side', '横盘', '震荡'].includes(v)) return 'sideways';
    throw new Error(`trend 值无效: ${value}`);
  }

  private normalizeOpportunityType(value: unknown): 'breakout' | 'dip' | 'reversal' | 'trend_follow' {
    if (typeof value !== 'string') {
      throw new Error(`type 不是字符串`);
    }
    const v = value.toLowerCase().trim();
    if (['breakout', '突破', 'break'].includes(v)) return 'breakout';
    if (['dip', '回调', 'drop', '下跌'].includes(v)) return 'dip';
    if (['reversal', '反转', 'reverse'].includes(v)) return 'reversal';
    if (['trend_follow', 'trend', '趋势', 'follow'].includes(v)) return 'trend_follow';
    throw new Error(`type 值无效: ${value}`);
  }

  private normalizeRiskType(value: unknown): 'high_volatility' | 'downtrend' | 'liquidity_low' {
    if (typeof value !== 'string') {
      throw new Error(`type 不是字符串`);
    }
    const v = value.toLowerCase().trim();
    if (['high_volatility', 'volatility', '高波动', '波动'].includes(v)) return 'high_volatility';
    if (['downtrend', 'down', '下跌', '下降'].includes(v)) return 'downtrend';
    if (['liquidity_low', 'liquidity', '低流动性', '流动性'].includes(v)) return 'liquidity_low';
    throw new Error(`type 值无效: ${value}`);
  }

  private normalizeSeverity(value: unknown): 'low' | 'medium' | 'high' {
    if (typeof value !== 'string') {
      throw new Error(`severity 不是字符串`);
    }
    const v = value.toLowerCase().trim();
    if (['low', '低', '低风险'].includes(v)) return 'low';
    if (['medium', 'mid', '中', '中等'].includes(v)) return 'medium';
    if (['high', '高', '高风险'].includes(v)) return 'high';
    throw new Error(`severity 值无效: ${value}`);
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

    for (const coin of obj.coins) {
      if (!coin || typeof coin !== 'object') {
        throw new Error('无效的币种数据');
      }
      const c = coin as Record<string, unknown>;
      if (typeof c.coin !== 'string' || typeof c.price !== 'number' ||
          typeof c.change24h !== 'number' || typeof c.volume24h !== 'number' ||
          typeof c.volatility !== 'number') {
        throw new Error(`无效的币种数据 ${c.coin as string}`);
      }
      (c as any).trend = this.normalizeTrend(c.trend);
    }

    if (obj.opportunities) {
      if (!Array.isArray(obj.opportunities)) {
        throw new Error('无效的响应：opportunities 不是数组');
      }
      for (const opp of obj.opportunities) {
        const o = opp as Record<string, unknown>;
        if (typeof o.coin !== 'string' || typeof o.confidence !== 'number' || typeof o.reason !== 'string') {
          throw new Error(`无效的交易机会 ${o.coin as string}`);
        }
        (o as any).type = this.normalizeOpportunityType(o.type);
      }
    }

    if (obj.risks) {
      if (!Array.isArray(obj.risks)) {
        throw new Error('无效的响应：risks 不是数组');
      }
      for (const risk of obj.risks) {
        const r = risk as Record<string, unknown>;
        if (typeof r.coin !== 'string' || typeof r.description !== 'string') {
          throw new Error(`无效的市场风险 ${r.coin as string}`);
        }
        (r as any).type = this.normalizeRiskType(r.type);
        (r as any).severity = this.normalizeSeverity(r.severity);
      }
    }

    return data as MarketScanResult;
  }

  private validateTradingDecision(data: unknown): AITradingDecision {
    if (!data || typeof data !== 'object') {
      throw new Error('无效的交易决策：不是对象');
    }
    const obj = data as Record<string, unknown>;

    if (typeof obj.timestamp !== 'number' || typeof obj.coin !== 'string' ||
        !['buy', 'sell', 'hold'].includes(obj.action as string) ||
        typeof obj.confidence !== 'number' || typeof obj.reason !== 'string' ||
        typeof obj.aiScore !== 'number') {
      throw new Error(`无效的交易决策 ${obj.coin as string}`);
    }

    return data as AITradingDecision;
  }

  private validatePerformanceReport(data: unknown): PerformanceReport {
    if (!data || typeof data !== 'object') {
      throw new Error('无效的性能报告：不是对象');
    }
    const obj = data as Record<string, unknown>;

    if (typeof obj.timestamp !== 'number' || typeof obj.timeRange !== 'string' ||
        !obj.performance || typeof obj.performance !== 'object' ||
        typeof obj.aiAnalysis !== 'string' || !Array.isArray(obj.recommendations) ||
        typeof obj.shouldAdjustWeight !== 'boolean') {
      throw new Error('无效的性能报告');
    }

    return data as PerformanceReport;
  }

  private validateDeepAnalysisResult(data: unknown): DeepAnalysisResult {
    if (!data || typeof data !== 'object') {
      throw new Error('无效的深度分析：不是对象');
    }
    const obj = data as Record<string, unknown>;

    if (typeof obj.timestamp !== 'number' || typeof obj.timeRange !== 'string' ||
        !Array.isArray(obj.patterns) || !Array.isArray(obj.successCases) ||
        !Array.isArray(obj.failureCases) || !Array.isArray(obj.recommendations) ||
        typeof obj.summary !== 'string') {
      throw new Error('无效的深度分析');
    }

    return data as DeepAnalysisResult;
  }

  private validateAnomalyAnalysisResult(data: unknown): AnomalyAnalysisResult {
    if (!data || typeof data !== 'object') {
      throw new Error('无效的异常分析：不是对象');
    }
    const obj = data as Record<string, unknown>;

    if (typeof obj.timestamp !== 'number' || !obj.anomaly || typeof obj.anomaly !== 'object' ||
        !['low', 'medium', 'high', 'critical'].includes(obj.severity as string) ||
        typeof obj.rootCause !== 'string' ||
        !['ignore', 'monitor', 'pause_trading', 'emergency_close'].includes(obj.recommendedAction as string) ||
        typeof obj.analysis !== 'string') {
      throw new Error('无效的异常分析');
    }

    return data as AnomalyAnalysisResult;
  }

  // =====================================================
  // 公共 API 方法
  // =====================================================

  /**
   * 市场扫描 (90秒调用)
   */
  async scanMarket(input: {
    coins: string[];
    focus?: string;
    maxTokens?: number;
    realMarketData?: RealMarketData;
  }): Promise<AIResponse<MarketScanResult>> {
    const filteredCoins = input.coins.filter(c => this.coinWhitelist.includes(c));

    if (filteredCoins.length === 0) {
      return {
        success: false,
        error: `没有有效的币种：请求的币种 ${input.coins.join(', ')} 都不在白名单中`,
      };
    }

    const userPrompt = this.buildMarketScanPrompt(filteredCoins, input.focus, input.realMarketData);
    const response = await this.callAI(userPrompt, AITaskType.MARKET_SCAN, undefined, input.maxTokens || 102400, 0.3);

    if (!response.success || !response.data) {
      return { success: false, error: response.error };
    }

    try {
      const parsed = this.parseJSONResponse(response.data);
      const validated = this.validateMarketScanResult(parsed);
      return { success: true, data: validated, usage: response.usage };
    } catch (error) {
      const errorMsg = `解析市场扫描结果失败: ${error instanceof Error ? error.message : String(error)}`;
      logger.error('市场扫描结果解析失败', {
        error: errorMsg,
        rawResponse: response.data?.substring(0, 200),
      });
      return {
        success: false,
        error: errorMsg,
      };
    }
  }

  /**
   * 交易决策 (90秒调用)
   */
  async makeTradingDecision(input: {
    marketScan: MarketScanResult;
    currentPositions: Array<{ coin: string; amount: number; avgCost: number; positionPnL: number }>;
    recentPerformance?: { totalTrades: number; winRate: number; totalPnL: number };
    tradingFeedback?: any;
  }): Promise<AIResponse<AITradingDecision[]>> {
    const userPrompt = this.buildTradingDecisionPrompt(input);
    const response = await this.callAI(userPrompt, AITaskType.TRADING_DECISION, undefined, 1500, 0.5);

    if (!response.success || !response.data) {
      return { success: false, error: response.error };
    }

    try {
      const parsed = this.parseJSONResponse(response.data);
      const decisions = Array.isArray(parsed) ? parsed : [parsed];
      const validated = decisions.map((d: unknown) => this.validateTradingDecision(d));
      return { success: true, data: validated, usage: response.usage };
    } catch (error) {
      const errorMsg = `解析交易决策结果失败: ${error instanceof Error ? error.message : String(error)}`;
      logger.error('交易决策结果解析失败', {
        error: errorMsg,
        rawResponse: response.data?.substring(0, 200),
      });
      return {
        success: false,
        error: errorMsg,
      };
    }
  }

  /**
   * 性能报告 (6小时调用)
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
    const response = await this.callAI(userPrompt, AITaskType.PERFORMANCE_REPORT, undefined, 2000, 0.4);

    if (!response.success || !response.data) {
      return { success: false, error: response.error };
    }

    try {
      const parsed = this.parseJSONResponse(response.data);
      const validated = this.validatePerformanceReport(parsed);
      return { success: true, data: validated, usage: response.usage };
    } catch (error) {
      return {
        success: false,
        error: `解析性能报告失败: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * 深度分析 (24小时调用)
   */
  async performDeepAnalysis(input: {
    timeRange?: string;
    includeAllCoins?: boolean;
    focus?: string;
    fullHistory?: boolean;
  }): Promise<AIResponse<DeepAnalysisResult>> {
    const userPrompt = this.buildDeepAnalysisPrompt(input);
    const response = await this.callAI(userPrompt, AITaskType.DEEP_ANALYSIS, undefined, 3000, 0.6);

    if (!response.success || !response.data) {
      return { success: false, error: response.error };
    }

    try {
      const parsed = this.parseJSONResponse(response.data);
      const validated = this.validateDeepAnalysisResult(parsed);
      return { success: true, data: validated, usage: response.usage };
    } catch (error) {
      return {
        success: false,
        error: `解析深度分析失败: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * 异常分析 (按需调用)
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
    const response = await this.callAI(userPrompt, AITaskType.ANOMALY_ANALYSIS, undefined, 1500, 0.3);

    if (!response.success || !response.data) {
      return { success: false, error: response.error };
    }

    try {
      const parsed = this.parseJSONResponse(response.data);
      const validated = this.validateAnomalyAnalysisResult(parsed);
      return { success: true, data: validated, usage: response.usage };
    } catch (error) {
      return {
        success: false,
        error: `解析异常分析失败: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  // =====================================================
  // 统计和工具方法
  // =====================================================

  getStats() {
    return {
      ...this.stats,
      successRate: this.stats.totalRequests > 0
        ? this.stats.successRequests / this.stats.totalRequests
        : 0,
    };
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await this.callAI('健康检查', AITaskType.MARKET_SCAN, undefined, 10, 0.1);
      return response.success;
    } catch {
      return false;
    }
  }
}

// =====================================================
// 工厂函数
// =====================================================

/**
 * 从环境变量创建 AIClient 实例
 *
 * 环境变量：
 * - OPENAI_API_KEY: API 密钥（必需）
 * - OPENAI_URL: API 基础 URL（可选，默认为 GLM API）
 * - OPENAI_MODEL: 模型名称（可选，默认为 glm-4.7）
 * - OPENAI_TIMEOUT: 请求超时时间（可选，默认 30000ms）
 *
 * @param config 额外的配置选项
 * @returns AIClient 实例
 * @throws 如果未设置 OPENAI_API_KEY
 */
export function createAIClient(config?: Partial<AIClientConfig>): AIClient {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY 环境变量未设置');
  }

  return new AIClient({
    apiKey,
    baseURL: process.env.OPENAI_URL,
    // 使用 as any 来处理类型转换，因为环境变量是字符串
    model: process.env.OPENAI_MODEL as any,
    timeout: process.env.OPENAI_TIMEOUT ? parseInt(process.env.OPENAI_TIMEOUT) : undefined,
    ...config,
  });
}

/**
 * 从环境变量加载 AI 客户端配置
 * 如果缺少必需的环境变量，返回 null
 */
export function loadAIClientConfigFromEnv(): AIClientConfig | null {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return null;
  }

  return {
    apiKey,
    baseURL: process.env.OPENAI_URL,
    // 使用 as any 来处理类型转换，因为环境变量是字符串
    model: process.env.OPENAI_MODEL as any,
    timeout: process.env.OPENAI_TIMEOUT ? parseInt(process.env.OPENAI_TIMEOUT) : undefined,
  };
}

// =====================================================
// 类型导出
// =====================================================

export type {
  AIClientConfig,
  AIResponse,
  AITaskType,
  MarketScanResult,
  AITradingDecision,
  PerformanceReport,
  DeepAnalysisResult,
  AnomalyAnalysisResult,
  RealMarketData,
} from './types.js';
