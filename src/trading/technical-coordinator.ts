/**
 * 技术分析交易协调器
 *
 * 纯技术分析交易系统，无需AI
 * 完全基于规则引擎和统计验证
 *
 * 流程：
 * 1. 信号生成 → 2. 统计验证 → 3. 信号聚合 → 4. 风险控制 → 5. 执行
 */

import { logger } from '../utils/logger;
import type {
  TechnicalSignal,
  TradingDecision,
  MarketContext,
  PositionInfo,
  TradingDirection,
  TradingAction,
  OrderType,
  BaseConfig,
} from '../types/index;
import { MarketDataProvider } from '../market/provider;
import { TradeApi } from '../api/trade;
import { OkxAuth } from '../core/auth;
import { AdvancedSignalGenerator } from '../signals/advanced-generator;
import { SignalDirection } from '../market/types;

// =====================================================
// 协调器配置
// =====================================================

/**
 * 技术分析协调器配置
 */
export interface TechnicalCoordinatorConfig extends BaseConfig {
  /** 交易币种 */
  coins: string[];
  /** 是否启用 */
  enabled?: boolean;
  /** OKX 认证配置 */
  auth?: {
    apiKey: string;
    secretKey: string;
    passphrase: string;
  };
  /** 是否使用模拟环境 */
  isDemo?: boolean;
  /** 信号生成器配置 */
  signalConfig?: {
    minStrength?: number;
    requireMultiTimeframeConfirmation?: boolean;
  };
  /** 验证器配置 */
  validatorConfig?: {
    minConfidence?: number;
    minWinRate?: number;
    minProfitFactor?: number;
  };
  /** 聚合器配置 */
  aggregatorConfig?: {
    minConfidence?: number;
    maxSignals?: number;
  };
  /** 风险限制 */
  riskLimits?: {
    maxSinglePosition?: number;      // 单笔最大仓位比例
    maxTotalPosition?: number;       // 总仓位最大比例
    maxStopLoss?: number;             // 最大止损比例
  };
}

// =====================================================
// 决策类型
// =====================================================

/**
 * 协调后的交易决策
 */
export interface CoordinatedDecision {
  /** 决策时间戳 */
  timestamp: number;
  /** 币种 */
  coin: string;
  /** 操作类型 */
  action: TradingAction;
  /** 置信度 */
  confidence: number;
  /** 综合分数 */
  combinedScore: number;
  /** 决策原因 */
  reason: string;
  /** 建议价格 */
  suggestedPrice?: number;
  /** 建议数量 (USDT) */
  suggestedAmount?: number;
  /** 决策来源 */
  source: 'rule';
  /** 止损价格 */
  stopLoss?: number;
  /** 止盈价格 */
  takeProfit?: number;
  /** 信号列表 */
  signals: TechnicalSignal[];
}

/**
 * 执行结果
 */
export interface ExecutionResult {
  /** 是否成功 */
  success: boolean;
  /** 相关的决策 */
  decision: CoordinatedDecision;
  /** 执行时间 */
  executedAt: number;
  /** 订单ID */
  orderId?: string;
  /** 实际成交价格 */
  actualPrice?: number;
  /** 实际成交数量 */
  actualAmount?: number;
  /** 错误信息 */
  error?: string;
}

// =====================================================
// 技术分析协调器类
// =====================================================

export class TechnicalCoordinator {
  private config: TechnicalCoordinatorConfig;
  private marketDataProvider: MarketDataProvider;
  private tradeApi?: TradeApi;
  private signalGenerator: AdvancedSignalGenerator;

  // 统计信息
  private stats = {
    totalSignalsGenerated: 0,
    totalSignalsValidated: 0,
    totalTrades: 0,
    totalPnL: 0,
    winRate: 0,
  };

  constructor(
    config: TechnicalCoordinatorConfig,
    marketDataProvider: MarketDataProvider
  ) {
    this.config = {
      ...config,
      enabled: config.enabled ?? true,
      isDemo: config.isDemo ?? true,
      riskLimits: config.riskLimits ?? {
        maxSinglePosition: 0.05,   // 5%
        maxTotalPosition: 0.20,    // 20%
        maxStopLoss: 0.02,         // 2%
      },
    };

    this.marketDataProvider = marketDataProvider;

    // 初始化高级信号生成器（核心模块）
    this.signalGenerator = new AdvancedSignalGenerator({
      minStrength: config.signalConfig?.minStrength ?? 0.5,
      enableADXFilter: true,
      minADX: 20,
      enablePriceConfirmation: config.signalConfig?.requireMultiTimeframeConfirmation ? 2 : 1,
      enableVolumeConfirmation: true,
      enableMultiTimeframeConfirmation: config.signalConfig?.requireMultiTimeframeConfirmation ?? true,
      maxSignals: 10,
      enableSafeMode: true,
    });

    // 初始化 Trade API（如果提供了 auth）
    if (this.config.auth) {
      const auth = new OkxAuth({
        apiKey: this.config.auth.apiKey,
        secretKey: this.config.auth.secretKey,
        passphrase: this.config.auth.passphrase,
        isDemo: this.config.isDemo,
      });
      this.tradeApi = new TradeApi(auth, this.config.isDemo);
    }

    logger.info('技术分析协调器初始化', {
      coins: this.config.coins,
      enabled: this.config.enabled,
      hasTradeApi: !!this.tradeApi,
      signalGeneratorConfig: this.signalGenerator.getConfig(),
    });
  }

  /**
   * 执行交易流程
   */
  async execute(
    coins: string[],
    positions: Map<string, PositionInfo>,
    availableBalance: number
  ): Promise<CoordinatedDecision[]> {
    if (!this.config.enabled) {
      logger.debug('协调器已禁用');
      return [];
    }

    logger.info('开始技术分析交易流程', {
      coins,
      balance: availableBalance,
    });

    const decisions: CoordinatedDecision[] = [];

    // 批量获取所有币种的市场数据
    const marketDataPackage = await this.marketDataProvider.fetchMarketContext(
      coins,
      {
        includeKLines: true,
        klineInterval: '15m',
        klineLimit: 100,
        includeIndicators: true,
      }
    );

    // 为每个币种生成决策
    for (const coin of coins) {
      try {
        // 从批量数据中提取该币种的数据
        const priceData = marketDataPackage.prices.get(coin);
        const klines = marketDataPackage.klines.get(coin);
        const indicators = marketDataPackage.indicators.get(coin);

        if (!priceData) {
          logger.debug(`缺少 ${coin} 价格数据，跳过`);
          continue;
        }

        // 构建市场上下文
        const marketContext: MarketContext = {
          symbol: `${coin}-USDT`,
          currentPrice: priceData.price,
          ticker: {
            instId: `${coin}-USDT`,
            last: priceData.price,
            open24h: priceData.price * 0.98,
            high24h: priceData.price * 1.02,
            low24h: priceData.price * 0.97,
            volume24h: priceData.volume24h,
            volumeCcy24h: priceData.volumeCcy24h || priceData.volume24h * priceData.price,
            changePercent24h: priceData.change24h,
          },
          klines: klines ? new Map(Object.entries({ '15m': klines })) : new Map(),
          indicators: indicators ? new Map(Object.entries(indicators)) : new Map(),
          marketState: {
            trend: 'sideways',
            volatility: 'normal',
            strength: 'weak',
          },
        };

        // 生成交易决策
        const coinDecisions = await this.generateDecisionsForCoin(
          coin,
          marketContext,
          positions.get(coin),
          availableBalance
        );

        // 过滤和验证决策
        for (const decision of coinDecisions) {
          const validation = this.validateDecision(decision, marketContext);
          if (!validation.isValid) {
            logger.debug('决策未通过验证', {
              coin: decision.coin,
              action: decision.action,
              reason: validation.reason,
            });
            continue;
          }

          decisions.push(decision);
        }
      } catch (error) {
        logger.error(`处理 ${coin} 失败:`, error as Error | Record<string, unknown>);
      }
    }

    logger.info('技术分析交易流程完成', {
      totalGenerated: this.stats.totalSignalsGenerated,
      validDecisions: decisions.length,
    });

    return decisions;
  }

  /**
   * 验证交易决策（高频交易要求严格信号质量）
   */
  private validateDecision(
    decision: CoordinatedDecision,
    marketContext: MarketContext
  ): { isValid: boolean; reason?: string } {
    // 1. 置信度阈值检查（高频交易要求高置信度）
    if (decision.confidence < 0.5) {
      return { isValid: false, reason: `置信度过低: ${decision.confidence.toFixed(3)} < 0.5` };
    }

    // 2. 必须有明确的交易方向（不能是 hold）
    if (decision.action === 'hold') {
      return { isValid: false, reason: '无明确交易方向' };
    }

    // 3. 必须有止盈止损
    if (!decision.stopLoss || !decision.takeProfit) {
      return { isValid: false, reason: '缺少止盈止损配置' };
    }

    // 4. 止盈止损价格合理性检查
    const price = decision.suggestedPrice || 0;
    if (decision.action === 'buy') {
      if (decision.stopLoss >= price) {
        return { isValid: false, reason: '买入止损价必须低于当前价格' };
      }
      if (decision.takeProfit <= price) {
        return { isValid: false, reason: '买入止盈价必须高于当前价格' };
      }
    } else if (decision.action === 'sell') {
      if (decision.stopLoss <= price) {
        return { isValid: false, reason: '卖出止损价必须高于当前价格' };
      }
      if (decision.takeProfit >= price) {
        return { isValid: false, reason: '卖出止盈价必须低于当前价格' };
      }
    }

    // 5. 市场状态检查（极端波动时禁止交易）
    const marketState = marketContext.marketState;
    if (marketState.volatility === 'extreme') {
      return { isValid: false, reason: '市场波动率过高，暂停交易' };
    }

    // 6. 价格合理性检查（止盈止损区间不能太小或太大）
    const slPercent = Math.abs((decision.stopLoss! - price) / price);
    const tpPercent = Math.abs((decision.takeProfit! - price) / price);

    if (slPercent < 0.0005 || tpPercent < 0.0005) {
      return { isValid: false, reason: '止盈止损区间过小，可能被市场噪音触发' };
    }

    if (slPercent > 0.005 || tpPercent > 0.005) {
      return { isValid: false, reason: '止盈止损区间过大，不符合高频交易策略' };
    }

    return { isValid: true };
  }

  /**
   * 为单个币种生成决策
   */
  private async generateDecisionsForCoin(
    coin: string,
    marketContext: MarketContext,
    position: PositionInfo | undefined,
    availableBalance: number
  ): Promise<CoordinatedDecision[]> {
    const decisions: CoordinatedDecision[] = [];

    // 获取K线数据
    const klines15m = marketContext.klines.get('15m');
    if (!klines15m || klines15m.length < 99) {
      logger.debug(`${coin} K线数据不足，无法生成信号`, {
        length: klines15m?.length || 0,
        required: 99
      });
      return decisions;
    }

    // 获取当前价格和成交量
    const currentPrice = marketContext.currentPrice;
    const volume24h = marketContext.ticker.volume24h || 0;
    const volumeMA = volume24h / 24; // 简单估算

    // 使用高级信号生成器生成信号
    const signals = this.signalGenerator.generateSignals(
      coin,
      klines15m,
      volume24h,
      volumeMA,
      '15m'
    );

    if (signals.length === 0) {
      logger.debug(`${coin} 未生成任何有效信号`);
      return decisions;
    }

    this.stats.totalSignalsGenerated += signals.length;

    logger.info(`${coin} 生成技术信号`, {
      signalCount: signals.length,
      signals: signals.map(s => ({ type: s.type, direction: s.direction, strength: s.strength })),
    });

    // 将技术信号转换为交易决策
    for (const signal of signals) {
      const decision = this.convertSignalToDecision(
        signal,
        coin,
        currentPrice,
        marketContext,
        availableBalance
      );

      if (decision) {
        decisions.push(decision);
      }
    }

    return decisions;
  }

  /**
   * 将技术信号转换为交易决策
   */
  private convertSignalToDecision(
    signal: TechnicalSignal,
    coin: string,
    currentPrice: number,
    marketContext: MarketContext,
    availableBalance: number
  ): CoordinatedDecision | null {
    // 根据信号方向确定交易动作
    let action: TradingAction;
    if (signal.direction === SignalDirection.BULLISH) {
      action = 'buy';
    } else if (signal.direction === SignalDirection.BEARISH) {
      action = 'sell';
    } else {
      // NEUTRAL 信号不产生交易决策
      return null;
    }

    // 计算建议金额（基于信号强度和可用余额）
    const strengthMultiplier = 0.05 + (signal.strength * 0.1); // 5%-15%的资金
    const suggestedAmount = availableBalance * strengthMultiplier;

    // 高频交易止盈止损设置（0.1%-0.2% 区间）
    const highFreqStopLoss = 0.0015; // 0.15% 止损
    const highFreqTakeProfit = 0.0020; // 0.20% 止盈

    const decision: CoordinatedDecision = {
      timestamp: signal.timestamp,
      coin,
      action,
      confidence: signal.strength,
      combinedScore: signal.strength,
      reason: `${signal.type} - 强度: ${signal.strength.toFixed(2)}`,
      suggestedPrice: currentPrice,
      suggestedAmount,
      source: 'rule',
      stopLoss: action === 'buy'
        ? currentPrice * (1 - highFreqStopLoss)
        : currentPrice * (1 + highFreqStopLoss),
      takeProfit: action === 'buy'
        ? currentPrice * (1 + highFreqTakeProfit)
        : currentPrice * (1 - highFreqTakeProfit),
      signals: [signal],
    };

    return decision;
  }

  /**
   * 执行交易决策
   *
   * 关键安全特性：
   * 1. 合约交易必须带有止盈止损（通过 attachAlgoOrds）
   * 2. 使用 cross 模式进行合约交易（全仓保证金）
   * 3. 小止盈止损区间（0.1%-0.2%）用于高频交易
   * 4. 止盈止损必须同时存在才能执行合约交易
   */
  async executeDecision(decision: CoordinatedDecision): Promise<ExecutionResult> {
    const result: ExecutionResult = {
      success: false,
      decision,
      executedAt: Date.now(),
    };

    try {
      // 如果没有配置 Trade API，模拟执行
      if (!this.tradeApi) {
        logger.warn('Trade API 未配置，模拟执行交易', {
          coin: decision.coin,
          action: decision.action,
        });
        result.success = true;
        result.orderId = `sim-order-${decision.coin}-${Date.now()}`;
        result.actualPrice = decision.suggestedPrice || 0;
        result.actualAmount = decision.suggestedAmount || 0;
        this.stats.totalTrades++;
        return result;
      }

      // 计算交易数量（从 USDT 转换为币种数量）
      const price = decision.suggestedPrice || 0;
      const amount = decision.suggestedAmount || 0;
      const coinAmount = (amount / price).toFixed(8);

      const instId = `${decision.coin}-USDT-SWAP`; // 合约交易使用 SWAP 后缀
      const tdMode: 'cash' | 'cross' | 'isolated' = 'cross'; // 合约使用全仓模式

      // 安全检查：合约交易必须有止盈止损
      const hasStopLoss = decision.stopLoss !== undefined && decision.stopLoss > 0;
      const hasTakeProfit = decision.takeProfit !== undefined && decision.takeProfit > 0;

      if (!hasStopLoss || !hasTakeProfit) {
        result.error = `合约交易缺少止盈止损配置: SL=${hasStopLoss}, TP=${hasTakeProfit}`;
        logger.error('合约交易安全检查失败', {
          coin: decision.coin,
          stopLoss: decision.stopLoss,
          takeProfit: decision.takeProfit,
          error: result.error,
        });
        return result;
      }

      // 止盈止损区间检查（高频交易要求：单次盈亏控制在 0.1%-0.2%）
      const priceChangeSL = Math.abs((decision.stopLoss! - price) / price);
      const priceChangeTP = Math.abs((decision.takeProfit! - price) / price);

      if (priceChangeSL > 0.003 || priceChangeTP > 0.003) {
        logger.warn('止盈止损区间过大，不符合高频交易策略', {
          coin: decision.coin,
          stopLoss: decision.stopLoss,
          takeProfit: decision.takeProfit,
          currentPrice: price,
          slPercent: (priceChangeSL * 100).toFixed(3) + '%',
          tpPercent: (priceChangeTP * 100).toFixed(3) + '%',
          recommendedMax: '0.3%',
        });
      }

      // 构建附加策略订单（止盈止损）
      const attachAlgoOrds = [
        {
          tpTriggerPx: String(decision.takeProfit),
          tpOrdPx: String(decision.takeProfit),
          slTriggerPx: String(decision.stopLoss),
          slOrdPx: String(decision.stopLoss),
        },
      ];

      // 合约交易必须指定 posSide（持仓方向）
      // buy 开多仓 = 'long', sell 开空仓 = 'short'
      const posSide: 'long' | 'short' = decision.action === 'buy' ? 'long' : 'short';

      // 调用 OKX API 执行交易（使用 placeOrder 而非 marketBuy/marketSell 以支持 attachAlgoOrds）
      if (decision.action === 'buy') {
        const orderResult = await this.tradeApi.placeOrder({
          instId,
          tdMode,
          side: 'buy',
          ordType: 'market',
          sz: coinAmount,
          posSide,  // 持仓方向：long (多头)
          ccy: 'USDT',  // 保证金币种（全仓模式需要）
          attachAlgoOrds,
        });

        result.success = orderResult.sCode === '0';
        result.orderId = orderResult.ordId;

        if (result.success) {
          logger.info('合约买单已执行（带止盈止损）', {
            coin: decision.coin,
            amount: coinAmount,
            stopLoss: decision.stopLoss,
            takeProfit: decision.takeProfit,
            orderId: orderResult.ordId,
            sCode: orderResult.sCode,
          });
        } else {
          result.error = `OKX API 错误: ${orderResult.sMsg}`;
          logger.error('合约买单执行失败', {
            coin: decision.coin,
            error: result.error,
            sCode: orderResult.sCode,
            sMsg: orderResult.sMsg,
          });
        }
      } else if (decision.action === 'sell') {
        const orderResult = await this.tradeApi.placeOrder({
          instId,
          tdMode,
          side: 'sell',
          ordType: 'market',
          sz: coinAmount,
          posSide,  // 持仓方向：short (空头)
          ccy: 'USDT',  // 保证金币种（全仓模式需要）
          attachAlgoOrds,
        });

        result.success = orderResult.sCode === '0';
        result.orderId = orderResult.ordId;

        if (result.success) {
          logger.info('合约卖单已执行（带止盈止损）', {
            coin: decision.coin,
            amount: coinAmount,
            stopLoss: decision.stopLoss,
            takeProfit: decision.takeProfit,
            orderId: orderResult.ordId,
            sCode: orderResult.sCode,
          });
        } else {
          result.error = `OKX API 错误: ${orderResult.sMsg}`;
          logger.error('合约卖单执行失败', {
            coin: decision.coin,
            error: result.error,
            sCode: orderResult.sCode,
            sMsg: orderResult.sMsg,
          });
        }
      } else {
        result.error = `不支持的交易动作: ${decision.action}`;
        logger.warn('交易执行失败', {
          coin: decision.coin,
          action: decision.action,
          error: result.error,
        });
        return result;
      }

      result.actualPrice = price;
      result.actualAmount = amount;
      this.stats.totalTrades++;

      return result;
    } catch (error) {
      result.error = error instanceof Error ? error.message : String(error);
      logger.error('交易执行失败', {
        coin: decision.coin,
        error: result.error,
      });
      return result;
    }
  }

  /**
   * 更新交易结果（用于学习闭环）
   */
  updateTradeResult(
    signalType: string,
    coin: string,
    timeframe: string,
    pnl: number,
    holdingTime: number
  ): void {
    // TODO: 更新统计数据库
    this.stats.totalTrades++;
    this.stats.totalPnL += pnl;

    logger.debug('更新交易结果', {
      signalType,
      coin,
      pnl,
      holdingTime,
    });
  }

  /**
   * 获取统计信息
   */
  getStats() {
    return {
      ...this.stats,
    };
  }

  /**
   * 获取配置
   */
  getConfig(): Readonly<TechnicalCoordinatorConfig> {
    return { ...this.config };
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<TechnicalCoordinatorConfig>): void {
    this.config = { ...this.config, ...config };
    logger.info('协调器配置已更新');
  }
}
