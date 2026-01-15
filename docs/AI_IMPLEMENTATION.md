# AI量化交易系统实现方案

## 一、当前项目与AI架构的集成

### 1.1 现有代码映射

当前项目已有完善的组件，AI架构需要与这些组件协作：

```
现有组件                          AI架构角色
├─ src/api/rest.ts           →  数据源提供者
├─ src/websocket/            →  实时数据源
├─ src/core/network-state-manager.ts    →  系统健康监控
├─ src/core/dual-data-source-manager.ts →  数据源管理
├─ src/utils/logger.ts       →  AI交互日志
├─ src/strategies/*/         →  规则引擎(保持不变)
├─ src/strategies/common/risk-manager.ts →  风险验证器
└─ data/logs.db              →  AI学习数据存储
```

### 1.2 需要新增的AI组件

```
新增组件
├─ src/ai/
│   ├── core/
│   │   ├── ai-engine.ts           # AI推理引擎
│   │   ├── input-builder.ts       # 输入数据构建器
│   │   ├── output-validator.ts    # 输出验证器
│   │   └── feedback-loop.ts       # 学习反馈循环
│   ├── types/
│   │   └── ai-types.ts            # AI类型定义
│   ├── prompts/
│   │   ├── analysis.ts            # 分析提示词
│   │   ├── constraints.ts         # 约束提示词
│   │   └── self-correction.ts     # 自我纠正提示词
│   └── learning/
│       ├── lesson-learner.ts      # 经验学习器
│       └── performance-tracker.ts # 性能追踪器
└─ src/ai-integration/
    ├── ai-coordinator.ts          # AI协调器
    └── rule-bridge.ts             # 规则引擎桥接
```

---

## 二、Phase 1: 数据收集层实现

### 2.1 输入数据构建器

```typescript
// src/ai/core/input-builder.ts

import type { AIInputData } from '../types/ai-types.js';
import type { MarketData, CoinState, StrategyState } from '../types/ai-types.js';

/**
 * AI输入数据构建器
 * 负责从项目各组件收集数据，构建标准化的AI输入
 */
export class AIInputBuilder {
  private restClient;
  private wsClient;
  private strategyEngine;
  private riskManager;
  private logger;

  constructor(config: AIInputBuilderConfig) {
    this.restClient = config.restClient;
    this.wsClient = config.wsClient;
    this.strategyEngine = config.strategyEngine;
    this.riskManager = config.riskManager;
    this.logger = config.logger;
  }

  /**
   * 构建完整的AI输入数据
   * @param coins 需要分析的币种
   * @param timeRanges 需要的K线时间范围
   */
  async build(
    coins: Coin[],
    timeRanges: string[] = ['1m', '5m', '15m', '1H', '4H', '1D']
  ): Promise<AIInputData> {
    const timestamp = Date.now();

    // L1: 原始市场数据
    const raw = await this.buildRawData(coins, timeRanges);

    // L2: 特征数据
    const features = await this.buildFeatureData(coins, raw);

    // L3: 状态数据
    const state = await this.buildStateData(coins);

    // L4: 历史数据
    const history = await this.buildHistoricalData(coins);

    // 环境上下文
    const context = await this.buildContext();

    return {
      version: '1.0.0',
      timestamp,
      source: this.wsClient.isConnected() ? 'websocket' : 'rest',
      raw,
      features,
      state,
      history,
      context
    };
  }

  /**
   * L1: 构建原始市场数据
   */
  private async buildRawData(
    coins: Coin[],
    timeRanges: string[]
  ): Promise<AIInputData['raw']> {
    const result = {
      tickers: new Map(),
      candles: {},
      orderBooks: new Map(),
      fundingRates: new Map()
    };

    // 并行收集各币种数据
    await Promise.all(coins.map(async (coin) => {
      const instId = `${coin}-USDT`;

      // 获取ticker
      const ticker = await this.getTicker(instId);
      result.tickers.set(coin, ticker);

      // 获取K线数据 (多个时间周期)
      result.candles[coin] = {};
      await Promise.all(timeRanges.map(async (bar) => {
        result.candles[coin][bar] = await this.getCandles(instId, bar);
      }));

      // 获取订单簿
      result.orderBooks.set(coin, await this.getOrderBook(instId));

      // 获取资金费率 (仅合约)
      if (coin === 'BTC' || coin === 'ETH') {
        result.fundingRates.set(coin, await this.getFundingRate(instId));
      }
    }));

    return result;
  }

  /**
   * L2: 构建特征数据
   */
  private async buildFeatureData(
    coins: Coin[],
    rawData: AIInputData['raw']
  ): Promise<AIInputData['features']> {
    const technical = new Map();
    const structure = {
      levels: new Map(),
      trends: new Map(),
      keyLevels: new Map()
    };
    const statistics = await this.calculateStatistics(coins, rawData);

    // 计算技术指标
    for (const coin of coins) {
      technical.set(coin, this.calculateTechnicalIndicators(coin, rawData));

      // 识别市场结构
      structure.levels.set(coin, this.identifyLevels(coin, rawData));
      structure.trends.set(coin, this.analyzeTrend(coin, rawData));
      structure.keyLevels.set(coin, this.calculateKeyLevels(coin, rawData));
    }

    return {
      technical,
      structure,
      statistics
    };
  }

  /**
   * L3: 构建状态数据
   */
  private async buildStateData(coins: Coin[]): Promise<AIInputData['state']> {
    // 账户状态
    const account = await this.getAccountState(coins);

    // 策略状态
    const strategies = await this.getStrategyStates(coins);

    // 风险状态
    const risk = await this.getRiskState();

    // 系统状态
    const system = await this.getSystemState();

    return {
      account,
      strategies,
      risk,
      system
    };
  }

  /**
   * L4: 构建历史数据
   */
  private async buildHistoricalData(
    coins: Coin[]
  ): Promise<AIInputData['history']> {
    // 从SQLite获取决策历史
    const decisions = await this.getDecisionHistory(100);

    // 从SQLite获取交易历史
    const trades = await this.getTradeHistory(100);

    // 计算性能统计
    const performance = await this.calculatePerformance(coins, trades);

    // 获取AI学习历史
    const aiLearning = await this.getAILearningHistory();

    return {
      decisions,
      trades,
      performance,
      aiLearning
    };
  }

  /**
   * 构建环境上下文
   */
  private async buildContext(): Promise<AIInputData['context']> {
    return {
      currentTime: {
        timestamp: Date.now(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        marketOpen: true,  // 加密货币24/7
        tradingHours: '24/7'
      },
      marketState: await this.analyzeMarketState(),
      externalFactors: {
        news: [],  // TODO: 集成新闻API
        macro: []  // TODO: 集成宏观经济API
      }
    };
  }

  // ============ 辅助方法 ============

  private async getTicker(instId: string): Promise<TickerData> {
    // 优先从WebSocket缓存获取
    const wsData = this.wsClient.getTicker(instId);
    if (wsData && Date.now() - wsData.ts < 1000) {
      return wsData;
    }

    // 否则从REST API获取
    const restData = await this.restClient.getTicker(instId);
    return restData;
  }

  private async getCandles(instId: string, bar: string): Promise<CandleData[]> {
    // 从REST API获取历史K线
    const limit = bar === '1m' || bar === '5m' ? 100 : 200;
    const candles = await this.restClient.getCandles({
      instId,
      bar,
      limit
    });

    // 补充WebSocket实时数据
    const wsCandle = this.wsClient.getLatestCandle(instId, bar);
    if (wsCandle && candles.length > 0) {
      // 更新最后一根K线
      const last = candles[candles.length - 1];
      if (last.timestamp === wsCandle.timestamp) {
        candles[candles.length - 1] = wsCandle;
      } else if (wsCandle.timestamp > last.timestamp) {
        candles.push(wsCandle);
      }
    }

    return candles;
  }

  private async getOrderBook(instId: string): Promise<OrderBookData> {
    // 优先从WebSocket获取
    const wsData = this.wsClient.getOrderBook(instId);
    if (wsData && Date.now() - wsData.ts < 1000) {
      return wsData;
    }

    // 否则从REST API获取
    return await this.restClient.getOrderBook({ instId });
  }

  private async getFundingRate(instId: string): Promise<FundingRateData> {
    return await this.restClient.getFundingRate(instId);
  }

  /**
   * 计算技术指标
   */
  private calculateTechnicalIndicators(
    coin: Coin,
    rawData: AIInputData['raw']
  ): TechnicalIndicators {
    const candles1H = rawData.candles[coin]?.['1H'] || [];

    if (candles1H.length < 50) {
      // 数据不足，返回空指标
      return this.emptyIndicators();
    }

    const closes = candles1H.map(c => c.close);
    const highs = candles1H.map(c => c.high);
    const lows = candles1H.map(c => c.low);
    const volumes = candles1H.map(c => c.volume);

    return {
      trend: {
        sma20: this.calculateSMA(closes, 20),
        sma50: this.calculateSMA(closes, 50),
        ema12: this.calculateEMA(closes, 12),
        ema26: this.calculateEMA(closes, 26),
        macd: this.calculateMACD(closes),
        adx: this.calculateADX(candles1H)
      },
      momentum: {
        rsi: this.calculateRSI(closes, 14),
        cci: this.calculateCCI(candles1H, 20),
        stoch: this.calculateStochastic(candles1H)
      },
      volatility: {
        atr: this.calculateATR(candles1H, 14),
        atrPercent: this.calculateATR(candles1H, 14) / closes[closes.length - 1],
        bb: this.calculateBollingerBands(closes, 20)
      },
      volume: {
        obv: this.calculateOBV(closes, volumes),
        volumeMA: {
          ma5: this.calculateSMA(volumes, 5),
          ma20: this.calculateSMA(volumes, 20)
        },
        volumeRatio: volumes[volumes.length - 1] / this.calculateSMA(volumes, 20)
      }
    };
  }

  /**
   * 识别支撑/阻力位
   */
  private identifyLevels(
    coin: Coin,
    rawData: AIInputData['raw']
  ): { support: number[]; resistance: number[] } {
    const candles1H = rawData.candles[coin]?.['1H'] || [];
    const candles4H = rawData.candles[coin]?.['4H'] || [];

    if (candles1H.length < 50) {
      return { support: [], resistance: [] };
    }

    // 使用4H K线识别关键点位（更可靠）
    const highs = candles4H.map(c => c.high);
    const lows = candles4H.map(c => c.low);
    const closes = candles4H.map(c => c.close);
    const currentPrice = closes[closes.length - 1];

    // 找阻力位（局部高点）
    const resistance = this.findPeaks(highs, 5, 20)
      .filter(p => p > currentPrice)
      .sort((a, b) => a - b)
      .slice(0, 5);

    // 找支撑位（局部低点）
    const support = this.findValleys(lows, 5, 20)
      .filter(p => p < currentPrice)
      .sort((a, b) => b - a)
      .slice(0, 5);

    return { support, resistance };
  }

  /**
   * 分析趋势
   */
  private analyzeTrend(
    coin: Coin,
    rawData: AIInputData['raw']
  ): { direction: string; strength: number; duration: number } {
    const candles1H = rawData.candles[coin]?.['1H'] || [];
    if (candles1H.length < 50) {
      return { direction: 'sideways', strength: 0, duration: 0 };
    }

    const closes = candles1H.map(c => c.close);
    const sma20 = this.calculateSMA(closes, 20);
    const sma50 = this.calculateSMA(closes, 50);
    const currentPrice = closes[closes.length - 1];

    // 判断趋势方向
    let direction: string;
    if (currentPrice > sma20 && sma20 > sma50) {
      direction = 'uptrend';
    } else if (currentPrice < sma20 && sma20 < sma50) {
      direction = 'downtrend';
    } else {
      direction = 'sideways';
    }

    // 计算趋势强度 (使用ADX)
    const adx = this.calculateADX(candles1H);
    const strength = Math.min(100, adx);

    // 计算趋势持续时间
    const duration = this.calculateTrendDuration(candles1H);

    return { direction, strength, duration };
  }

  /**
   * 计算关键点位
   */
  private calculateKeyLevels(
    coin: Coin,
    rawData: AIInputData['raw']
  ): { pivot: number; high: number; low: number } {
    const candles1D = rawData.candles[coin]?.['1D'] || [];
    if (candles1D.length < 3) {
      const candles1H = rawData.candles[coin]?.['1H'] || [];
      if (candles1H.length < 3) {
        return { pivot: 0, high: 0, low: 0 };
      }

      const last = candles1H[candles1H.length - 1];
      return {
        pivot: last.close,
        high: last.high,
        low: last.low
      };
    }

    // 使用昨日的数据计算pivot点
    const yesterday = candles1D[candles1D.length - 2];
    const pivot = (yesterday.high + yesterday.low + yesterday.close) / 3;

    return {
      pivot,
      high: yesterday.high,
      low: yesterday.low
    };
  }

  /**
   * 计算统计特征
   */
  private async calculateStatistics(
    coins: Coin[],
    rawData: AIInputData['raw']
  ): Promise<StatisticalFeatures> {
    const candles1H = rawData.candles[coins[0]]?.['1H'] || [];
    if (candles1H.length < 50) {
      return this.emptyStatistics();
    }

    const closes = candles1H.map(c => c.close);

    // 计算收益率
    const returns = [];
    for (let i = 1; i < closes.length; i++) {
      returns.push((closes[i] - closes[i - 1]) / closes[i - 1]);
    }

    // 计算统计量
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / returns.length;
    const std = Math.sqrt(variance);
    const skew = this.calculateSkew(returns, mean, std);
    const kurt = this.calculateKurtosis(returns, mean, std);

    // 波动率
    const atr = this.calculateATR(candles1H, 14);
    const currentVolatility = (atr / closes[closes.length - 1]) * 100;

    return {
      returns: { mean, std, skew, kurt },
      volatility: {
        current: currentVolatility,
        ma5: 0,  // TODO: 滚动计算
        ma20: 0,
        regime: this.classifyVolatility(currentVolatility)
      },
      correlations: new Map()  // TODO: 计算相关性
    };
  }

  /**
   * 获取账户状态
   */
  private async getAccountState(coins: Coin[]): Promise<AccountState> {
    const balanceInfo = await this.restClient.getBalance();

    const totalEquity = parseFloat(balanceInfo.totalEq);
    const availableBalance = await this.calculateAvailableBalance(coins);
    const frozenBalance = totalEquity - availableBalance;

    const coinStates = new Map<Coin, CoinAccountState>();

    for (const coin of coins) {
      const state = await this.getCoinAccountState(coin);
      coinStates.set(coin, state);
    }

    return {
      totalEquity,
      availableBalance,
      frozenBalance,
      coins: coinStates
    };
  }

  /**
   * 获取单币种账户状态
   */
  private async getCoinAccountState(coin: Coin): Promise<CoinAccountState> {
    const instIdSpot = `${coin}-USDT`;
    const balance = await this.restClient.getBalance(coin);
    const positions = await this.restClient.getPositions('SWAP', `${coin}-USDT-SWAP`);

    const spotPosition = balance && parseFloat(balance.availBal) > 0
      ? {
          instId: instIdSpot,
          holding: parseFloat(balance.bal),
          avgCost: parseFloat(balance.avgPx || '0'),
          lastPrice: 0,  // 从ticker获取
          value: parseFloat(balance.eq),
          unrealizedPnL: parseFloat(balance.upl || '0'),
          unrealizedPnLPercent: 0
        }
      : null;

    const swapPosition = positions.length > 0 && parseFloat(positions[0].pos) !== 0
      ? {
          instId: positions[0].instId,
          posSide: positions[0].posSide,
          position: parseFloat(positions[0].pos),
          avgPx: parseFloat(positions[0].avgPx),
          lever: positions[0].lever,
          markPx: parseFloat(positions[0].markPx),
          liqPx: parseFloat(positions[0].liqPx),
          upl: parseFloat(positions[0].upl),
          uplRatio: parseFloat(positions[0].uplRatio || '0'),
          mgnRatio: parseFloat(positions[0].mgnRatio || '0'),
          liquidationPrice: parseFloat(positions[0].liqPx),
          distanceToLiquidation: this.calculateDistanceToLiquidation(positions[0])
        }
      : null;

    // 获取挂单
    const pendingOrders = await this.restClient.getPendingOrders('SPOT', instIdSpot);

    return {
      coin,
      balance: parseFloat(balance?.bal || '0'),
      available: parseFloat(balance?.availBal || '0'),
      frozen: parseFloat(balance?.frozenBal || '0'),
      positions: { spot: spotPosition, swap: swapPosition },
      pendingOrders,
      realizedPnL: 0,  // TODO: 从历史计算
      unrealizedPnL: 0,
      totalPnL: 0,
      totalPnLPercent: 0
    };
  }

  /**
   * 获取策略状态
   */
  private async getStrategyStates(coins: Coin[]): Promise<Map<StrategyId, StrategyState>> {
    const strategies = new Map();

    // 获取现货DCA-Grid策略状态
    const spotStrategy = await this.strategyEngine?.getStrategyState();
    if (spotStrategy) {
      strategies.set('spot-dca-grid', spotStrategy);
    }

    // TODO: 获取其他策略状态

    return strategies;
  }

  /**
   * 获取风险状态
   */
  private async getRiskState(): Promise<RiskState> {
    const riskMetrics = await this.riskManager?.assessRisk();

    return {
      level: riskMetrics?.level || 'low',
      drawdown: riskMetrics?.drawdown || {
        current: 0,
        max: 0,
        maxTimestamp: 0
      },
      metrics: riskMetrics?.metrics || {
        positionRisk: 0,
        leverageRisk: 0,
        concentrationRisk: 0,
        liquidityRisk: 0
      },
      circuitBreaker: {
        triggered: false,
        reason: null,
        triggeredAt: null,
        estimatedResume: null
      },
      alerts: riskMetrics?.alerts || []
    };
  }

  /**
   * 获取系统状态
   */
  private async getSystemState(): Promise<SystemState> {
    const networkState = this.wsClient?.getNetworkState();

    return {
      dataSource: {
        primary: networkState?.primarySource || 'rest',
        wsConnected: this.wsClient?.isConnected() || false,
        wsLastUpdate: networkState?.lastWsUpdate || 0,
        restLastUpdate: networkState?.lastRestUpdate || 0,
        healthStatus: networkState?.currentStatus || 'unhealthy'
      },
      network: {
        latency: networkState?.latency || 0,
        errorRate: networkState?.errorRate || 0,
        lastError: networkState?.lastError || null
      },
      execution: {
        ordersPlaced: 0,  // TODO: 从数据库获取
        ordersFilled: 0,
        ordersFailed: 0,
        avgSlippage: 0
      },
      resources: {
        cpu: 0,  // TODO: 获取系统资源使用
        memory: 0,
        disk: 0
      }
    };
  }

  /**
   * 从SQLite获取决策历史
   */
  private async getDecisionHistory(limit: number): Promise<DecisionLog[]> {
    const db = this.logger?.getDatabase();
    if (!db) return [];

    const rows = db.query(`
      SELECT
        timestamp, coin, action, type, reason,
        market_snapshot, execution, outcome
      FROM decision_logs
      ORDER BY timestamp DESC
      LIMIT ?
    `, [limit]);

    return rows.map(row => ({
      id: row.id,
      timestamp: row.timestamp,
      coin: row.coin,
      action: row.action,
      type: row.type,
      reason: row.reason,
      marketSnapshot: JSON.parse(row.market_snapshot || '{}'),
      basis: JSON.parse(row.basis || '{}'),
      execution: JSON.parse(row.execution || '{}'),
      outcome: JSON.parse(row.outcome || 'null')
    }));
  }

  /**
   * 从SQLite获取交易历史
   */
  private async getTradeHistory(limit: number): Promise<TradeLog[]> {
    const db = this.logger?.getDatabase();
    if (!db) return [];

    const rows = db.query(`
      SELECT
        timestamp, coin, side, size, price, fee, order_id, trade_id
      FROM trade_logs
      ORDER BY timestamp DESC
      LIMIT ?
    `, [limit]);

    return rows.map(row => ({
      id: row.id,
      timestamp: row.timestamp,
      coin: row.coin,
      side: row.side,
      size: row.size,
      price: row.price,
      fee: row.fee,
      orderId: row.order_id,
      tradeId: row.trade_id
    }));
  }

  /**
   * 计算性能指标
   */
  private async calculatePerformance(
    coins: Coin[],
    trades: TradeLog[]
  ): Promise<PerformanceMetrics> {
    // TODO: 实现详细的性能计算
    return {
      overall: {
        totalReturn: 0,
        totalReturnPercent: 0,
        sharpeRatio: 0,
        sortinoRatio: 0,
        maxDrawdown: 0,
        maxDrawdownDuration: 0
      },
      trading: {
        totalTrades: trades.length,
        winningTrades: 0,
        losingTrades: 0,
        winRate: 0,
        avgWin: 0,
        avgLoss: 0,
        profitFactor: 0,
        expectancy: 0
      },
      byCoin: new Map()
    };
  }

  /**
   * 获取AI学习历史
   */
  private async getAILearningHistory(): Promise<AILearningHistory> {
    const db = this.logger?.getDatabase();
    if (!db) {
      return { suggestions: [], feedback: [], parameterAdjustments: [] };
    }

    // 获取AI建议历史
    const suggestions = db.query(`
      SELECT * FROM ai_suggestion_logs
      ORDER BY timestamp DESC
      LIMIT 100
    `).map(row => ({
      id: row.id,
      timestamp: row.timestamp,
      coin: row.coin,
      type: row.type,
      suggestion: JSON.parse(row.suggestion),
      confidence: row.confidence,
      reasoning: row.reasoning,
      adopted: row.adopted === 1,
      rejectionReason: row.rejection_reason,
      outcome: row.outcome ? JSON.parse(row.outcome) : undefined
    }));

    return {
      suggestions,
      feedback: [],
      parameterAdjustments: []
    };
  }

  /**
   * 分析市场整体状态
   */
  private async analyzeMarketState(): Promise<{
    regime: string;
    volatilityRegime: string;
    sentiment: string;
  }> {
    // TODO: 实现更复杂的市场状态分析
    return {
      regime: 'sideways',
      volatilityRegime: 'normal',
      sentiment: 'neutral'
    };
  }

  // ============ 技术指标计算方法 ============

  private calculateSMA(data: number[], period: number): number {
    if (data.length < period) return 0;
    const slice = data.slice(-period);
    return slice.reduce((a, b) => a + b, 0) / period;
  }

  private calculateEMA(data: number[], period: number): number {
    if (data.length < period) return 0;
    const k = 2 / (period + 1);
    let ema = data[0];
    for (let i = 1; i < data.length; i++) {
      ema = data[i] * k + ema * (1 - k);
    }
    return ema;
  }

  private calculateMACD(closes: number[]): {
    value: number;
    signal: number;
    histogram: number;
  } {
    const ema12 = this.calculateEMA(closes, 12);
    const ema26 = this.calculateEMA(closes, 26);
    const macdLine = ema12 - ema26;

    // 简化：信号线使用MACD的9期EMA
    // 实际应该保存历史MACD值计算
    const signal = macdLine * 0.9;  // 简化

    return {
      value: macdLine,
      signal,
      histogram: macdLine - signal
    };
  }

  private calculateRSI(closes: number[], period: number): number {
    if (closes.length < period + 1) return 50;

    let gains = 0;
    let losses = 0;

    for (let i = closes.length - period; i < closes.length; i++) {
      const change = closes[i] - closes[i - 1];
      if (change > 0) {
        gains += change;
      } else {
        losses -= change;
      }
    }

    const avgGain = gains / period;
    const avgLoss = losses / period;

    if (avgLoss === 0) return 100;

    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
  }

  private calculateATR(candles: CandleData[], period: number): number {
    if (candles.length < period + 1) return 0;

    let trSum = 0;
    for (let i = candles.length - period; i < candles.length; i++) {
      const high = candles[i].high;
      const low = candles[i].low;
      const prevClose = candles[i - 1].close;

      const tr = Math.max(
        high - low,
        Math.abs(high - prevClose),
        Math.abs(low - prevClose)
      );
      trSum += tr;
    }

    return trSum / period;
  }

  private calculateBollingerBands(closes: number[], period: number): {
    upper: number;
    middle: number;
    lower: number;
    width: number;
  } {
    if (closes.length < period) {
      return { upper: 0, middle: 0, lower: 0, width: 0 };
    }

    const middle = this.calculateSMA(closes, period);
    const slice = closes.slice(-period);
    const variance = slice.reduce((a, b) => a + Math.pow(b - middle, 2), 0) / period;
    const std = Math.sqrt(variance);

    return {
      upper: middle + 2 * std,
      middle,
      lower: middle - 2 * std,
      width: (4 * std) / middle
    };
  }

  private findPeaks(data: number[], lookaround: number, minDistance: number): number[] {
    const peaks: number[] = [];

    for (let i = lookaround; i < data.length - lookaround; i++) {
      const current = data[i];

      // 检查是否是局部最大值
      let isPeak = true;
      for (let j = i - lookaround; j <= i + lookaround; j++) {
        if (j !== i && data[j] >= current) {
          isPeak = false;
          break;
        }
      }

      if (isPeak) {
        // 检查与已发现峰值的距离
        const tooClose = peaks.some(p => Math.abs(p - current) < minDistance);
        if (!tooClose) {
          peaks.push(current);
        }
      }
    }

    return peaks;
  }

  private findValleys(data: number[], lookaround: number, minDistance: number): number[] {
    const valleys: number[] = [];

    for (let i = lookaround; i < data.length - lookaround; i++) {
      const current = data[i];

      // 检查是否是局部最小值
      let isValley = true;
      for (let j = i - lookaround; j <= i + lookaround; j++) {
        if (j !== i && data[j] <= current) {
          isValley = false;
          break;
        }
      }

      if (isValley) {
        // 检查与已发现谷值的距离
        const tooClose = valleys.some(v => Math.abs(v - current) < minDistance);
        if (!tooClose) {
          valleys.push(current);
        }
      }
    }

    return valleys;
  }

  private calculateTrendDuration(candles: CandleData[]): number {
    // TODO: 实现更精确的趋势持续时间计算
    return 60;  // 简化：返回分钟数
  }

  private classifyVolatility(volatility: number): 'low' | 'normal' | 'high' | 'extreme' {
    if (volatility < 2) return 'low';
    if (volatility < 5) return 'normal';
    if (volatility < 10) return 'high';
    return 'extreme';
  }

  private calculateSkew(returns: number[], mean: number, std: number): number {
    const n = returns.length;
    const sum = returns.reduce((a, b) => a + Math.pow((b - mean) / std, 3), 0);
    return (n / ((n - 1) * (n - 2))) * sum;
  }

  private calculateKurtosis(returns: number[], mean: number, std: number): number {
    const n = returns.length;
    const sum = returns.reduce((a, b) => a + Math.pow((b - mean) / std, 4), 0);
    return ((n * (n + 1)) / ((n - 1) * (n - 2) * (n - 3))) * sum - (3 * Math.pow(n - 1, 2)) / ((n - 2) * (n - 3));
  }

  private calculateADX(candles: CandleData[]): number {
    // TODO: 实现完整的ADX计算
    return 25;  // 简化返回
  }

  private calculateCCI(candles: CandleData[], period: number): number {
    // TODO: 实现完整的CCI计算
    return 0;
  }

  private calculateStochastic(candles: CandleData[]): { k: number; d: number } {
    // TODO: 实现完整的随机指标计算
    return { k: 50, d: 50 };
  }

  private calculateOBV(closes: number[], volumes: number[]): number {
    let obv = 0;
    for (let i = 1; i < closes.length; i++) {
      if (closes[i] > closes[i - 1]) {
        obv += volumes[i];
      } else if (closes[i] < closes[i - 1]) {
        obv -= volumes[i];
      }
    }
    return obv;
  }

  private calculateDistanceToLiquidation(position: any): number {
    if (!position.liqPx || !position.markPx) return 100;

    const markPx = parseFloat(position.markPx);
    const liqPx = parseFloat(position.liqPx);

    if (position.posSide === 'long') {
      return ((liqPx - markPx) / markPx) * 100;
    } else {
      return ((markPx - liqPx) / markPx) * 100;
    }
  }

  private async calculateAvailableBalance(coins: Coin[]): Promise<number> {
    // TODO: 实现更精确的可用余额计算
    const balanceInfo = await this.restClient.getBalance();
    return parseFloat(balanceInfo?.details?.[0]?.availBal || '0');
  }

  private emptyIndicators(): TechnicalIndicators {
    return {
      trend: { sma20: 0, sma50: 0, ema12: 0, ema26: 0, macd: { value: 0, signal: 0, histogram: 0 }, adx: 0 },
      momentum: { rsi: 50, cci: 0, stoch: { k: 50, d: 50 } },
      volatility: { atr: 0, atrPercent: 0, bb: { upper: 0, middle: 0, lower: 0, width: 0 } },
      volume: { obv: 0, volumeMA: { ma5: 0, ma20: 0 }, volumeRatio: 1 }
    };
  }

  private emptyStatistics(): StatisticalFeatures {
    return {
      returns: { mean: 0, std: 0, skew: 0, kurt: 0 },
      volatility: { current: 0, ma5: 0, ma20: 0, regime: 'normal' },
      correlations: new Map()
    };
  }
}

// 类型定义
interface AIInputBuilderConfig {
  restClient: any;
  wsClient: any;
  strategyEngine?: any;
  riskManager?: any;
  logger?: any;
}

type Coin = 'BTC' | 'ETH' | 'BNB' | 'SOL' | 'XRP' | 'ADA' | 'DOGE';
type StrategyId = string;

interface TickerData {
  instId: string;
  last: number;
  lastSz: number;
  askPx: number;
  bidPx: number;
  open24h: number;
  high24h: number;
  low24h: number;
  vol24h: number;
  volCcy24h: number;
  ts: number;
}

interface CandleData {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  volumeCcy: number;
  confirm: boolean;
}

interface OrderBookData {
  instId: string;
  bids: [number, number][];
  asks: [number, number][];
  ts: number;
}

interface FundingRateData {
  instId: string;
  fundingRate: string;
  nextSettleTime: string;
  fundingTime: string;
}

interface TechnicalIndicators {
  trend: {
    sma20: number;
    sma50: number;
    ema12: number;
    ema26: number;
    macd: { value: number; signal: number; histogram: number };
    adx: number;
  };
  momentum: {
    rsi: number;
    cci: number;
    stoch: { k: number; d: number };
  };
  volatility: {
    atr: number;
    atrPercent: number;
    bb: { upper: number; middle: number; lower: number; width: number };
  };
  volume: {
    obv: number;
    volumeMA: { ma5: number; ma20: number };
    volumeRatio: number;
  };
}

interface StatisticalFeatures {
  returns: { mean: number; std: number; skew: number; kurt: number };
  volatility: {
    current: number;
    ma5: number;
    ma20: number;
    regime: 'low' | 'normal' | 'high' | 'extreme';
  };
  correlations: Map<Coin, Map<Coin, number>>;
}

interface AccountState {
  totalEquity: number;
  availableBalance: number;
  frozenBalance: number;
  coins: Map<Coin, CoinAccountState>;
}

interface CoinAccountState {
  coin: Coin;
  balance: number;
  available: number;
  frozen: number;
  positions: {
    spot: {
      instId: string;
      holding: number;
      avgCost: number;
      lastPrice: number;
      value: number;
      unrealizedPnL: number;
      unrealizedPnLPercent: number;
    } | null;
    swap: {
      instId: string;
      posSide: 'long' | 'short';
      position: number;
      avgPx: number;
      lever: string;
      markPx: number;
      liqPx: number;
      upl: number;
      uplRatio: number;
      mgnRatio: number;
      liquidationPrice: number;
      distanceToLiquidation: number;
    } | null;
  };
  pendingOrders: Order[];
  realizedPnL: number;
  unrealizedPnL: number;
  totalPnL: number;
  totalPnLPercent: number;
}

interface Order {
  ordId: string;
  instId: string;
  side: 'buy' | 'sell';
  ordType: 'market' | 'limit' | 'post_only';
  sz: number;
  px: number;
  fillSz: number;
  avgPx: number;
  state: 'live' | 'partially_filled' | 'filled' | 'canceled';
  cTime: number;
}

interface StrategyState {
  id: StrategyId;
  name: string;
  type: string;
  status: string;
  config: any;
  current: any;
  positions: Map<Coin, any>;
}

interface RiskState {
  level: string;
  drawdown: any;
  metrics: any;
  circuitBreaker: any;
  alerts: any[];
}

interface SystemState {
  dataSource: any;
  network: any;
  execution: any;
  resources: any;
}

interface DecisionLog {
  id: string;
  timestamp: number;
  coin: Coin;
  action: string;
  type: string;
  reason: string;
  marketSnapshot: any;
  basis: any;
  execution: any;
  outcome: any;
}

interface TradeLog {
  id: string;
  timestamp: number;
  coin: Coin;
  side: 'buy' | 'sell';
  size: number;
  price: number;
  fee: number;
  orderId: string;
  tradeId: string;
}

interface PerformanceMetrics {
  overall: any;
  trading: any;
  byCoin: Map<Coin, any>;
}

interface AILearningHistory {
  suggestions: any[];
  feedback: any[];
  parameterAdjustments: any[];
}
```

### 2.2 AI数据类型定义

```typescript
// src/ai/types/ai-types.ts

/**
 * AI输入数据类型
 * 完整定义见 AI_ARCHITECTURE.md
 */
export type { AIInputData } from './ai-input-types.js';
export type { AIOutput } from './ai-output-types.js';
export type { AIAnalysis, AISuggestions, AIAlerts } from './ai-output-types.js';

/**
 * AI约束类型
 */
export type {
  AIConstraints,
  HardConstraints,
  AIBehaviorProtocol
} from './ai-constraints.js';

/**
 * AI学习类型
 */
export type {
  AILearning,
  LearningConstraints,
  LearningFeedback,
  LearningEvaluation
} from './ai-learning.js';
```

---

## 三、Phase 2: AI分析引擎实现

### 3.1 AI引擎核心

```typescript
// src/ai/core/ai-engine.ts

import type { AIInputData, AIOutput, AIAnalysis } from '../types/ai-types.js';
import type { AIConstraints } from '../types/ai-constraints.js';
import { OutputValidator } from './output-validator.js';

/**
 * AI分析引擎
 *
 * 核心原则:
 * 1. AI只做分析，不做决策
 * 2. 所有输出必须可解释
 * 3. 必须标注不确定性
 * 4. 必须经过验证
 */
export class AIEngine {
  private constraints: AIConstraints;
  private validator: OutputValidator;
  private promptBuilder: AIPromptBuilder;
  private llmClient: LLMClient;

  constructor(config: AIEngineConfig) {
    this.constraints = config.constraints;
    this.validator = config.validator;
    this.promptBuilder = new AIPromptBuilder(config.constraints);
    this.llmClient = config.llmClient;
  }

  /**
   * 分析市场数据
   * @param input 标准化的AI输入
   * @returns AI分析结果
   */
  async analyze(input: AIInputData): Promise<AIOutput> {
    // 1. 构建提示词
    const prompt = this.promptBuilder.buildAnalysisPrompt(input);

    // 2. 调用LLM
    const rawResponse = await this.llmClient.complete(prompt);

    // 3. 解析响应
    let analysis: AIAnalysis;
    try {
      analysis = this.parseAnalysis(rawResponse);
    } catch (error) {
      // 解析失败，返回安全默认值
      analysis = this.getDefaultAnalysis(input);
    }

    // 4. 自我纠正
    analysis = await this.selfCorrect(analysis, input);

    // 5. 构建输出
    const output: AIOutput = {
      version: '1.0.0',
      timestamp: Date.now(),
      analysis
    };

    return output;
  }

  /**
   * AI自我纠正
   */
  private async selfCorrect(
    analysis: AIAnalysis,
    input: AIInputData
  ): Promise<AIAnalysis> {
    // 1. 检查输出格式
    if (!this.validateAnalysisFormat(analysis)) {
      return this.getDefaultAnalysis(input);
    }

    // 2. 检查置信度是否合理
    if (analysis.confidence.overall > 0.95) {
      // 置信度过高，降低
      analysis.confidence.overall = 0.85;
      analysis.uncertainties.push({
        type: 'model',
        description: '置信度可能被高估',
        impact: 'medium',
        mitigation: '已调整置信度'
      });
    }

    // 3. 检查是否有明显的逻辑矛盾
    if (this.hasLogicalContradictions(analysis)) {
      analysis.uncertainties.push({
        type: 'model',
        description: '检测到潜在逻辑矛盾',
        impact: 'high',
        mitigation: '建议人工审核'
      });
    }

    // 4. 添加标准的不确定性说明
    analysis = this.addStandardUncertainties(analysis, input);

    return analysis;
  }

  /**
   * 解析AI响应
   */
  private parseAnalysis(response: string): AIAnalysis {
    // 尝试从响应中提取JSON
    const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[1]);
    }

    // 尝试直接解析
    try {
      return JSON.parse(response);
    } catch {
      // 如果都不是JSON格式，尝试从文本提取
      return this.extractAnalysisFromText(response);
    }
  }

  /**
   * 从文本提取分析结果
   */
  private extractAnalysisFromText(text: string): AIAnalysis {
    // TODO: 实现更智能的文本解析
    throw new Error('无法解析AI响应，请使用结构化输出');
  }

  /**
   * 获取默认分析结果
   */
  private getDefaultAnalysis(input: AIInputData): AIAnalysis {
    return {
      market: {
        trend: {
          direction: 'sideways',
          strength: 50,
          timeframe: '1H',
          confidence: 0.5,
          reasoning: '数据不足，无法做出明确判断'
        },
        volatility: {
          level: 'normal',
          current: 3,
          expected: 3,
          confidence: 0.5,
          reasoning: '使用历史平均值'
        },
        keyLevels: {
          support: [],
          resistance: [],
          pivot: input.raw.tickers.get(input.state.account.coins.keys().next().value)?.last || 0
        },
        sentiment: {
          direction: 'neutral',
          strength: 50,
          reasoning: '无明显情绪信号'
        }
      },
      strategy: {
        currentStatus: {
          strategyId: 'unknown',
          status: 'acceptable',
          reasoning: '保持当前策略'
        },
        applicability: new Map(),
        parameterSuggestions: new Map()
      },
      risk: {
        overallRisk: 'medium',
        riskFactors: {
          marketRisk: { level: 50, factors: [], mitigation: [] },
          positionRisk: { level: 50, factors: [], mitigation: [] },
          leverageRisk: { level: 50, factors: [], mitigation: [] },
          liquidityRisk: { level: 50, factors: [], mitigation: [] }
        },
        liquidationRisk: {
          probability: 0.01,
          timeframe: '24h',
          scenarios: []
        },
        stopLoss: {
          recommended: 0,
          current: 0,
          reasoning: '使用当前止损设置'
        }
      },
      performance: {
        current: input.history.performance.overall,
        evaluation: {
          rating: 'acceptable',
          comparison: {
            vsBenchmark: 0,
            vsPrevious: 0
          },
          reasoning: '表现符合预期'
        },
        improvements: []
      },
      confidence: {
        overall: 0.5,
        market: 0.5,
        strategy: 0.5,
        risk: 0.5
      },
      uncertainties: [{
        type: 'data',
        description: '使用默认分析，数据可能不足',
        impact: 'medium',
        mitigation: '等待更多数据'
      }]
    };
  }

  /**
   * 验证分析格式
   */
  private validateAnalysisFormat(analysis: AIAnalysis): boolean {
    // 检查必需字段
    if (!analysis.market || !analysis.strategy || !analysis.risk) {
      return false;
    }

    // 检查置信度范围
    if (analysis.confidence.overall < 0 || analysis.confidence.overall > 1) {
      return false;
    }

    return true;
  }

  /**
   * 检查逻辑矛盾
   */
  private hasLogicalContradictions(analysis: AIAnalysis): boolean {
    // 示例：检查趋势和情绪是否矛盾
    if (analysis.market.trend.direction === 'uptrend' &&
        analysis.market.sentiment.direction === 'bearish' &&
        analysis.market.trend.strength > 70 &&
        analysis.market.sentiment.strength > 70) {
      return true;
    }

    return false;
  }

  /**
   * 添加标准不确定性
   */
  private addStandardUncertainties(
    analysis: AIAnalysis,
    input: AIInputData
  ): AIAnalysis {
    // 检查数据时效性
    const dataAge = Date.now() - input.timestamp;
    if (dataAge > 10000) {  // 10秒
      analysis.uncertainties.push({
        type: 'data',
        description: `数据年龄 ${dataAge}ms，可能不是最新的`,
        impact: dataAge > 60000 ? 'high' : 'low',
        mitigation: '检查数据源连接'
      });
    }

    // 检查数据源健康度
    if (input.state.system.dataSource.healthStatus !== 'healthy') {
      analysis.uncertainties.push({
        type: 'data',
        description: '数据源不健康',
        impact: 'medium',
        mitigation: '使用备用数据源'
      });
    }

    // 添加市场固有的不确定性
    analysis.uncertainties.push({
      type: 'market',
      description: '加密货币市场具有高度不可预测性',
      impact: 'high',
      mitigation: '设置合理的止损和仓位管理'
    });

    return analysis;
  }
}

// ============ AI提示词构建器 ============

class AIPromptBuilder {
  private constraints: AIConstraints;

  constructor(constraints: AIConstraints) {
    this.constraints = constraints;
  }

  /**
   * 构建分析提示词
   */
  buildAnalysisPrompt(input: AIInputData): string {
    return `
你是加密货币量化交易系统的AI分析助手。你的职责是分析市场数据，提供客观的分析报告。

## 重要约束

1. 你只能做分析，不能建议具体的交易操作
2. 必须客观地报告不确定性
3. 置信度不应超过 0.85（市场本质上是不可预测的）
4. 必须提供清晰的推理过程

## 市场数据

### 当前价格
${this.formatTickers(input.raw.tickers)}

### K线数据 (最近)
${this.formatRecentCandles(input.raw.candles)}

### 技术指标
${this.formatTechnicalIndicators(input.features.technical)}

### 账户状态
${this.formatAccountState(input.state.account)}

### 策略状态
${this.formatStrategyStates(input.state.strategies)}

### 风险状态
${this.formatRiskState(input.state.risk)}

### 历史表现
${this.formatPerformance(input.history.performance)}

## 分析任务

请提供以下分析（以JSON格式输出）:

\`\`\`json
{
  "analysis": {
    "market": {
      "trend": {
        "direction": "uptrend/downtrend/sideways",
        "strength": 0-100,
        "timeframe": "判断基于的时间周期",
        "confidence": 0-1,
        "reasoning": "判断依据"
      },
      "volatility": {
        "level": "low/normal/high/extreme",
        "current": 当前波动率,
        "expected": 预期波动率,
        "confidence": 0-1,
        "reasoning": "判断依据"
      },
      "keyLevels": {
        "support": [支撑位列表],
        "resistance": [阻力位列表],
        "pivot": 枢轴点
      },
      "sentiment": {
        "direction": "bullish/bearish/neutral",
        "strength": 0-100,
        "reasoning": "判断依据"
      }
    },
    "strategy": {
      "currentStatus": {
        "strategyId": "当前策略ID",
        "status": "optimal/good/acceptable/poor/dangerous",
        "reasoning": "评估理由"
      },
      "applicability": [
        {
          "strategyId": "策略ID",
          "score": 0-100,
          "reasoning": "适用性分析"
        }
      ]
    },
    "risk": {
      "overallRisk": "low/medium/high/critical",
      "riskFactors": {
        "marketRisk": {
          "level": 0-100,
          "factors": ["风险因素列表"],
          "mitigation": ["缓解措施列表"]
        },
        "positionRisk": { ... },
        "leverageRisk": { ... },
        "liquidityRisk": { ... }
      },
      "liquidationRisk": {
        "probability": 0-1,
        "timeframe": "评估时间范围",
        "scenarios": [
          {
            "priceDrop": 百分比,
            "liquidation": true/false,
            "affectedCoins": ["币种列表"]
          }
        ]
      }
    },
    "performance": {
      "current": {
        "totalReturn": 总回报,
        "winRate": 胜率,
        "sharpeRatio": 夏普比率,
        "maxDrawdown": 最大回撤
      },
      "evaluation": {
        "rating": "excellent/good/acceptable/poor",
        "comparison": {
          "vsBenchmark": 相对基准,
          "vsPrevious": 相对上期
        },
        "reasoning": "评估理由"
      },
      "improvements": [
        {
          "area": "改进领域",
          "suggestion": "建议",
          "expectedImpact": 预期影响,
          "difficulty": "easy/medium/hard"
        }
      ]
    },
    "confidence": {
      "overall": 0-1,
      "market": 0-1,
      "strategy": 0-1,
      "risk": 0-1
    },
    "uncertainties": [
      {
        "type": "data/model/market",
        "description": "不确定性描述",
        "impact": "low/medium/high",
        "mitigation": "缓解措施"
      }
    ]
  }
}
\`\`\`

## 注意事项

1. 置信度应该反映真实的不确定性，不要过度自信
2. 必须明确指出数据不足或不确定的情况
3. 风险分析应该保守估计
4. 不要忽视极端情况的可能性
`;
  }

  private formatTickers(tickers: Map<string, any>): string {
    let result = '';
    for (const [coin, ticker] of tickers) {
      result += `- ${coin}: $${ticker.last} (${ticker.changePercent24h}%)\n`;
    }
    return result || '无数据';
  }

  private formatRecentCandles(candles: any): string {
    // 简化格式化
    return 'K线数据已加载';
  }

  private formatTechnicalIndicators(indicators: Map<string, any>): string {
    let result = '';
    for (const [coin, ind] of indicators) {
      result += `
${coin}:
  趋势: SMA20=${ind.trend.sma20.toFixed(2)}, RSI=${ind.momentum.rsi.toFixed(1)}
  波动: ATR%=${(ind.volatility.atrPercent * 100).toFixed(2)}%
`;
    }
    return result || '无指标数据';
  }

  private formatAccountState(account: any): string {
    return `
总权益: $${account.totalEquity.toFixed(2)}
可用余额: $${account.availableBalance.toFixed(2)}
`;
  }

  private formatStrategyStates(strategies: Map<string, any>): string {
    let result = '';
    for (const [id, strategy] of strategies) {
      result += `- ${strategy.name}: ${strategy.status}\n`;
    }
    return result || '无策略数据';
  }

  private formatRiskState(risk: any): string {
    return `风险等级: ${risk.level}\n当前回撤: ${risk.drawdown.current.toFixed(2)}%`;
  }

  private formatPerformance(performance: any): string {
    return `
总回报: ${(performance.overall.totalReturnPercent * 100).toFixed(2)}%
夏普比率: ${performance.overall.sharpeRatio.toFixed(2)}
最大回撤: ${(performance.overall.maxDrawdown * 100).toFixed(2)}%
胜率: ${(performance.trading.winRate * 100).toFixed(1)}%
`;
  }
}

// ============ LLM客户端接口 ============

interface LLMClient {
  complete(prompt: string): Promise<string>;
}

interface AIEngineConfig {
  constraints: AIConstraints;
  validator: OutputValidator;
  llmClient: LLMClient;
}
```

### 3.2 输出验证器

```typescript
// src/ai/core/output-validator.ts

import type { AIOutput, AIInputData } from '../types/ai-types.js';

/**
 * 输出验证器
 * 对AI输出进行多层验证
 */
export class OutputValidator {
  /**
   * 综合验证
   */
  async validateAll(
    output: AIOutput,
    input: AIInputData
  ): Promise<ValidationResult> {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    // 1. 格式验证
    const formatResult = this.validateFormat(output);
    errors.push(...formatResult.errors);
    warnings.push(...formatResult.warnings);

    // 2. 逻辑验证
    const logicResult = this.validateLogic(output, input);
    errors.push(...logicResult.errors);
    warnings.push(...logicResult.warnings);

    // 3. 风险验证
    const riskResult = this.validateRisk(output);
    errors.push(...riskResult.errors);
    warnings.push(...riskResult.warnings);

    // 4. 规则验证
    const rulesResult = this.validateRules(output);
    errors.push(...rulesResult.errors);
    warnings.push(...rulesResult.warnings);

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * 格式验证
   */
  validateFormat(output: AIOutput): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    // 检查必需字段
    if (!output.analysis) {
      errors.push({
        field: 'analysis',
        message: '缺少分析结果',
        severity: 'critical'
      });
    }

    // 检查置信度范围
    const conf = output.analysis?.confidence;
    if (conf) {
      if (conf.overall < 0 || conf.overall > 1) {
        errors.push({
          field: 'confidence.overall',
          message: '置信度必须在0-1之间',
          severity: 'high'
        });
      }

      if (conf.overall > 0.9) {
        warnings.push({
          field: 'confidence.overall',
          message: '置信度过高，可能不可靠',
          impact: '可能导致过度自信的决策'
        });
      }
    }

    return { valid: errors.length === 0, errors, warnings };
  }

  /**
   * 逻辑验证
   */
  validateLogic(output: AIOutput, input: AIInputData): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    const analysis = output.analysis;

    // 检查趋势判断是否与价格数据一致
    const firstCoin = input.state.account.coins.keys().next().value;
    if (firstCoin && analysis.market) {
      const ticker = input.raw.tickers.get(firstCoin);
      const trend = analysis.market.trend;

      if (ticker && trend) {
        // 如果价格上涨但判断为下降趋势，发出警告
        if (ticker.changePercent24h > 5 && trend.direction === 'downtrend') {
          warnings.push({
            field: 'market.trend.direction',
            message: '趋势判断与24小时价格变化不一致',
            impact: '可能存在误判'
          });
        }
      }
    }

    return { valid: errors.length === 0, errors, warnings };
  }

  /**
   * 风险验证
   */
  validateRisk(output: AIOutput): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    const risk = output.analysis?.risk;
    if (!risk) {
      errors.push({
        field: 'analysis.risk',
        message: '缺少风险分析',
        severity: 'high'
      });
      return { valid: false, errors, warnings };
    }

    // 检查爆仓概率
    if (risk.liquidationRisk.probability > 0.1) {
      errors.push({
        field: 'risk.liquidationRisk.probability',
        message: '爆仓风险过高',
        severity: 'critical'
      });
    }

    // 检查整体风险等级
    if (risk.overallRisk === 'critical') {
      errors.push({
        field: 'risk.overallRisk',
        message: '系统处于危险状态',
        severity: 'critical'
      });
    }

    return { valid: errors.length === 0, errors, warnings };
  }

  /**
   * 规则验证
   */
  validateRules(output: AIOutput): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    // 检查AI是否超出了其权限
    if (output.suggestions?.parameters) {
      for (const suggestion of output.suggestions.parameters) {
        // 检查是否建议修改风险参数
        if (suggestion.parameter.includes('stopLoss') ||
            suggestion.parameter.includes('leverage')) {
          errors.push({
            field: 'suggestions.parameters',
            message: `AI不能建议修改${suggestion.parameter}`,
            severity: 'high'
          });
        }
      }
    }

    return { valid: errors.length === 0, errors, warnings };
  }
}

interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

interface ValidationError {
  field: string;
  message: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
}

interface ValidationWarning {
  field: string;
  message: string;
  impact: string;
}
```

---

## 四、Phase 3: AI协调器实现

### 4.1 AI协调器

```typescript
// src/ai-integration/ai-coordinator.ts

import { AIInputBuilder } from '../ai/core/input-builder.js';
import { AIEngine } from '../ai/core/ai-engine.js';
import { OutputValidator } from '../ai/core/output-validator.js';
import { RuleEngineBridge } from './rule-bridge.js';
import type { AIInputData, AIOutput } from '../ai/types/ai-types.js';

/**
 * AI协调器
 * 负责协调AI与规则引擎的交互
 */
export class AICoordinator {
  private inputBuilder: AIInputBuilder;
  private aiEngine: AIEngine;
  private validator: OutputValidator;
  private ruleBridge: RuleEngineBridge;
  private logger;

  // 配置
  private config: {
    analysisInterval: number;    // 分析间隔
    coins: string[];             // 监控的币种
    enableAutoTuning: boolean;   // 是否启用自动参数调整
    requireHumanApproval: boolean; // 是否需要人类批准
  };

  constructor(config: AICoordinatorConfig) {
    this.config = config;

    this.inputBuilder = new AIInputBuilder({
      restClient: config.restClient,
      wsClient: config.wsClient,
      strategyEngine: config.strategyEngine,
      riskManager: config.riskManager,
      logger: config.logger
    });

    this.validator = new OutputValidator();

    this.aiEngine = new AIEngine({
      constraints: config.constraints,
      validator: this.validator,
      llmClient: config.llmClient
    });

    this.ruleBridge = new RuleEngineBridge({
      strategyEngine: config.strategyEngine,
      riskManager: config.riskManager
    });

    this.logger = config.logger;
  }

  /**
   * 启动AI协调器
   */
  async start(): Promise<void> {
    this.logger.info('AI协调器启动中...');

    // 定期分析
    setInterval(async () => {
      try {
        await this.runAnalysisCycle();
      } catch (error) {
        this.logger.error('AI分析周期失败', error);
      }
    }, this.config.analysisInterval);

    this.logger.info('AI协调器已启动');
  }

  /**
   * 运行一次完整的分析周期
   */
  private async runAnalysisCycle(): Promise<void> {
    // 1. 收集数据
    const inputData = await this.inputBuilder.build(
      this.config.coins as any,
      ['1m', '5m', '15m', '1H', '4H', '1D']
    );

    // 2. AI分析
    const aiOutput = await this.aiEngine.analyze(inputData);

    // 3. 验证输出
    const validation = await this.validator.validateAll(aiOutput, inputData);

    if (!validation.valid) {
      this.logger.warn('AI输出验证失败', {
        errors: validation.errors,
        warnings: validation.warnings
      });
      return;
    }

    // 4. 记录分析结果
    this.logger.info('AI分析完成', {
      trend: aiOutput.analysis.market.trend,
      risk: aiOutput.analysis.risk.overallRisk,
      confidence: aiOutput.analysis.confidence.overall
    });

    // 5. 处理AI建议
    if (aiOutput.suggestions?.parameters) {
      await this.handleParameterSuggestions(aiOutput.suggestions.parameters);
    }

    // 6. 处理预警
    if (aiOutput.analysis.alerts) {
      await this.handleAlerts(aiOutput.analysis.alerts);
    }

    // 7. 生成报告
    await this.generateReport(aiOutput, inputData);
  }

  /**
   * 处理参数建议
   */
  private async handleParameterSuggestions(
    suggestions: any[]
  ): Promise<void> {
    for (const suggestion of suggestions) {
      this.logger.info('AI参数建议', {
        strategy: suggestion.strategyId,
        coin: suggestion.coin,
        parameter: suggestion.parameter,
        currentValue: suggestion.currentValue,
        suggestedValue: suggestion.suggestedValue,
        reasoning: suggestion.reasoning,
        confidence: suggestion.confidence
      });

      // 如果启用自动调整且置信度高
      if (this.config.enableAutoTuning && suggestion.confidence > 0.8) {
        // 通过规则引擎验证
        const validation = await this.ruleBridge.validateParameterChange(
          suggestion.strategyId,
          suggestion.coin,
          suggestion.parameter,
          suggestion.currentValue,
          suggestion.suggestedValue
        );

        if (validation.valid) {
          // 如果需要人类批准
          if (this.config.requireHumanApproval) {
            this.logger.warn('需要人类批准参数调整', {
              suggestion,
              validation
            });
            // TODO: 实现批准机制
          } else {
            // 应用参数调整
            await this.ruleBridge.applyParameterChange(
              suggestion.strategyId,
              suggestion.coin,
              suggestion.parameter,
              suggestion.suggestedValue
            );

            this.logger.info('参数调整已应用', {
              strategy: suggestion.strategyId,
              parameter: suggestion.parameter,
              oldValue: suggestion.currentValue,
              newValue: suggestion.suggestedValue
            });

            // 记录到学习历史
            await this.recordParameterAdjustment(suggestion, true);
          }
        } else {
          this.logger.warn('参数调整被规则引擎拒绝', {
            suggestion,
            validation
          });

          // 记录拒绝
          await this.recordParameterAdjustment(suggestion, false, validation.reason);
        }
      }
    }
  }

  /**
   * 处理预警
   */
  private async handleAlerts(alerts: any[]): Promise<void> {
    for (const alert of alerts) {
      this.logger.logAlert(alert);

      // 根据预警级别采取行动
      switch (alert.level) {
        case 'critical':
          // 立即暂停策略
          await this.ruleBridge.emergencyStop(alert.reason);
          break;

        case 'danger':
          // 暂停新开仓
          await this.ruleBridge.pauseNewOrders(alert.reason);
          break;

        case 'warning':
          // 记录日志
          this.logger.warn('AI预警', alert);
          break;

        case 'info':
          // 信息性记录
          this.logger.info('AI信息', alert);
          break;
      }
    }
  }

  /**
   * 生成报告
   */
  private async generateReport(
    aiOutput: AIOutput,
    inputData: AIInputData
  ): Promise<void> {
    const report = {
      timestamp: Date.now(),
      market: {
        trend: aiOutput.analysis.market.trend,
        volatility: aiOutput.analysis.market.volatility,
        sentiment: aiOutput.analysis.market.sentiment
      },
      risk: {
        overall: aiOutput.analysis.risk.overallRisk,
        factors: aiOutput.analysis.risk.riskFactors
      },
      performance: aiOutput.analysis.performance,
      confidence: aiOutput.analysis.confidence,
      uncertainties: aiOutput.analysis.uncertainties
    };

    this.logger.info('AI分析报告', report);

    // TODO: 保存到数据库
  }

  /**
   * 记录参数调整
   */
  private async recordParameterAdjustment(
    suggestion: any,
    adopted: boolean,
    rejectionReason?: string
  ): Promise<void> {
    // TODO: 保存到AI学习历史表
    this.logger.info('参数调整记录', {
      suggestion,
      adopted,
      rejectionReason
    });
  }

  /**
   * 停止AI协调器
   */
  async stop(): Promise<void> {
    this.logger.info('AI协调器停止中...');
    // 清理资源
    this.logger.info('AI协调器已停止');
  }
}

interface AICoordinatorConfig {
  restClient: any;
  wsClient: any;
  strategyEngine: any;
  riskManager: any;
  logger: any;
  constraints: any;
  llmClient: any;

  analysisInterval?: number;
  coins?: string[];
  enableAutoTuning?: boolean;
  requireHumanApproval?: boolean;
}
```

### 4.2 规则引擎桥接

```typescript
// src/ai-integration/rule-bridge.ts

/**
 * 规则引擎桥接
 * 处理AI与规则引擎之间的交互
 */
export class RuleEngineBridge {
  private strategyEngine;
  private riskManager;

  constructor(config: RuleEngineBridgeConfig) {
    this.strategyEngine = config.strategyEngine;
    this.riskManager = config.riskManager;
  }

  /**
   * 验证参数调整
   */
  async validateParameterChange(
    strategyId: string,
    coin: string,
    parameter: string,
    oldValue: number,
    newValue: number
  ): Promise<{ valid: boolean; reason?: string }> {
    // 1. 检查是否是允许修改的参数
    const allowedParams = [
      'gridCount',
      'gridSpacing',
      'dcaBaseAmount',
      'dcaBuyThreshold'
    ];

    if (!allowedParams.includes(parameter)) {
      return {
        valid: false,
        reason: `不允许修改参数: ${parameter}`
      };
    }

    // 2. 检查变化幅度
    const changePercent = Math.abs((newValue - oldValue) / oldValue) * 100;
    if (changePercent > 50) {
      return {
        valid: false,
        reason: `参数变化过大: ${changePercent.toFixed(1)}%`
      };
    }

    // 3. 检查参数范围
    const rangeCheck = this.checkParameterRange(parameter, newValue);
    if (!rangeCheck.valid) {
      return rangeCheck;
    }

    // 4. 检查风险影响
    const riskCheck = await this.checkRiskImpact(strategyId, coin, parameter, newValue);
    if (!riskCheck.valid) {
      return riskCheck;
    }

    return { valid: true };
  }

  /**
   * 应用参数调整
   */
  async applyParameterChange(
    strategyId: string,
    coin: string,
    parameter: string,
    value: number
  ): Promise<void> {
    // 通过策略引擎应用参数
    await this.strategyEngine.updateParameter(strategyId, coin, parameter, value);
  }

  /**
   * 紧急停止
   */
  async emergencyStop(reason: string): Promise<void> {
    await this.strategyEngine.emergencyStop(reason);
    await this.riskManager.triggerEmergencyStop(reason);
  }

  /**
   * 暂停新开仓
   */
  async pauseNewOrders(reason: string): Promise<void> {
    await this.strategyEngine.pauseNewOrders(reason);
  }

  /**
   * 检查参数范围
   */
  private checkParameterRange(
    parameter: string,
    value: number
  ): { valid: boolean; reason?: string } {
    const ranges = {
      gridCount: { min: 5, max: 50 },
      gridSpacing: { min: 0.1, max: 5 },
      dcaBaseAmount: { min: 10, max: 1000 },
      dcaBuyThreshold: { min: 1, max: 10 }
    };

    const range = ranges[parameter];
    if (!range) {
      return { valid: false, reason: `未知参数: ${parameter}` };
    }

    if (value < range.min || value > range.max) {
      return {
        valid: false,
        reason: `参数值超出范围: ${value} (允许: ${range.min}-${range.max})`
      };
    }

    return { valid: true };
  }

  /**
   * 检查风险影响
   */
  private async checkRiskImpact(
    strategyId: string,
    coin: string,
    parameter: string,
    value: number
  ): Promise<{ valid: boolean; reason?: string }> {
    // 模拟计算参数调整后的风险
    const currentRisk = await this.riskManager.assessRisk();
    const newRisk = await this.simulateRiskWithParameter(strategyId, coin, parameter, value);

    // 检查风险是否显著增加
    if (newRisk.level === 'critical' && currentRisk.level !== 'critical') {
      return {
        valid: false,
        reason: '参数调整会导致风险等级变为危险'
      };
    }

    // 检查回撤是否会增加
    if (newRisk.drawdown.current > currentRisk.drawdown.current * 1.2) {
      return {
        valid: false,
        reason: '参数调整会导致回撤显著增加'
      };
    }

    return { valid: true };
  }

  /**
   * 模拟参数调整后的风险
   */
  private async simulateRiskWithParameter(
    strategyId: string,
    coin: string,
    parameter: string,
    value: number
  ): Promise<any> {
    // TODO: 实现更精确的风险模拟
    return {
      level: 'medium',
      drawdown: { current: 5, max: 10 }
    };
  }
}

interface RuleEngineBridgeConfig {
  strategyEngine: any;
  riskManager: any;
}
```

---

## 五、使用示例

### 5.1 初始化AI系统

```typescript
// main-ai.ts

import { AICoordinator } from './src/ai-integration/ai-coordinator.js';
import { createRestClient } from './src/api/rest.js';
import { createWSClient } from './src/websocket/index.js';
import { SpotDCAGridStrategyEngine } from './src/strategies/spot-dca-grid/core/engine.js';
import { RiskManager } from './src/strategies/common/risk-manager.js';
import { Logger } from './src/utils/logger.js';

// LLM客户端 (示例，使用Claude API)
class ClaudeLLMClient {
  private apiKey: string;
  private apiUrl = 'https://api.anthropic.com/v1/messages';

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async complete(prompt: string): Promise<string> {
    const response = await fetch(this.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 4096,
        messages: [{
          role: 'user',
          content: prompt
        }]
      })
    });

    const data = await response.json();
    return data.content[0].text;
  }
}

// 主函数
async function main() {
  // 初始化客户端
  const restClient = createRestClient({
    apiKey: process.env.OKX_API_KEY!,
    secretKey: process.env.OKX_SECRET_KEY!,
    passphrase: process.env.OKX_PASSPHRASE!,
    isDemo: process.env.OKX_IS_DEMO === 'true'
  });

  const wsClient = createWSClient({
    apiKey: process.env.OKX_API_KEY!,
    secretKey: process.env.OKX_SECRET_KEY!,
    passphrase: process.env.OKX_PASSPHRASE!,
    isDemo: process.env.OKX_IS_DEMO === 'true'
  });

  // 初始化策略引擎
  const strategyEngine = new SpotDCAGridStrategyEngine(
    {
      base: { strategyName: 'Spot DCA-Grid', version: '1.0.0' },
      capital: { totalCapital: 10000, emergencyReserve: 5 },
      coins: { allowedCoins: ['BTC', 'ETH', 'BNB', 'SOL', 'XRP', 'ADA', 'DOGE'] }
    },
    {
      okxApi: restClient,
      wsClient: wsClient,
      updateInterval: 5000,
      enableAutoTrade: false,
      maxConcurrentOrders: 3
    }
  );

  // 初始化风险管理器
  const riskManager = new RiskManager({
    maxDrawdown: 20,
    stopLoss: { enabled: true, percentage: 15 }
  });

  // 初始化日志
  const logger = new Logger({
    level: 'info',
    enableSQLite: true,
    enableFileLogging: true
  });

  // 创建AI约束
  const constraints = {
    forbidden: {
      directTrading: false,
      tradingSuggestions: false,
      leverageChange: false,
      stopLossChange: false,
      overrideRiskRules: false
    },
    requiresValidation: {
      parameterSuggestions: true,
      strategySwitch: true
    },
    allowed: {
      marketAnalysis: true,
      riskAssessment: true,
      performanceAnalysis: true,
      alerts: true,
      reports: true
    }
  };

  // 创建LLM客户端
  const llmClient = new ClaudeLLMClient(process.env.CLAUDE_API_KEY!);

  // 创建AI协调器
  const aiCoordinator = new AICoordinator({
    restClient,
    wsClient,
    strategyEngine,
    riskManager,
    logger,
    constraints,
    llmClient,

    analysisInterval: 60000,      // 每分钟分析一次
    coins: ['BTC', 'ETH', 'BNB'],
    enableAutoTuning: false,      // 初期关闭自动调整
    requireHumanApproval: true    // 需要人类批准
  });

  // 启动
  await wsClient.connect();
  await strategyEngine.start();
  await aiCoordinator.start();

  console.log('AI量化交易系统已启动');
  console.log('AI分析间隔: 60秒');
  console.log('自动调整: 关闭');
  console.log('人类批准: 开启');

  // 优雅退出
  process.on('SIGINT', async () => {
    console.log('\n正在关闭系统...');
    await aiCoordinator.stop();
    await strategyEngine.stop();
    await wsClient.disconnect();
    console.log('系统已关闭');
    process.exit(0);
  });
}

main().catch(console.error);
```

### 5.2 查看AI分析结果

```typescript
// 查看最新的AI分析报告
const db = logger.getDatabase();
const reports = db.query(`
  SELECT timestamp, report
  FROM ai_analysis_reports
  ORDER BY timestamp DESC
  LIMIT 10
`);

reports.forEach(row => {
  const report = JSON.parse(row.report);
  console.log(`
时间: ${new Date(row.timestamp).toLocaleString()}
趋势: ${report.market.trend.direction} (强度: ${report.market.trend.strength})
风险: ${report.risk.overall}
置信度: ${(report.confidence.overall * 100).toFixed(1)}%
`);
});
```

---

## 六、数据库Schema

### 6.1 AI相关表

```sql
-- AI分析报告表
CREATE TABLE IF NOT EXISTS ai_analysis_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp INTEGER NOT NULL,
  report TEXT NOT NULL,  -- JSON格式的完整报告
  market_trend TEXT,
  market_volatility TEXT,
  risk_level TEXT,
  confidence REAL,
  uncertainties TEXT,
  created_at INTEGER DEFAULT (strftime('%s', 'now'))
);

-- AI建议日志表
CREATE TABLE IF NOT EXISTS ai_suggestion_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp INTEGER NOT NULL,
  coin TEXT NOT NULL,
  type TEXT NOT NULL,
  suggestion TEXT NOT NULL,  -- JSON格式
  confidence REAL NOT NULL,
  reasoning TEXT,
  adopted INTEGER DEFAULT 0,
  rejection_reason TEXT,
  outcome TEXT,  -- JSON格式，记录实际结果
  created_at INTEGER DEFAULT (strftime('%s', 'now'))
);

-- AI参数调整历史表
CREATE TABLE IF NOT EXISTS ai_parameter_adjustments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp INTEGER NOT NULL,
  strategy TEXT NOT NULL,
  coin TEXT NOT NULL,
  parameter TEXT NOT NULL,
  before_value REAL NOT NULL,
  after_value REAL NOT NULL,
  ai_suggested_value REAL NOT NULL,
  reason TEXT,
  performance_change_before REAL,
  performance_change_after REAL,
  delta REAL,
  created_at INTEGER DEFAULT (strftime('%s', 'now'))
);

-- AI学习反馈表
CREATE TABLE IF NOT EXISTS ai_learning_feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  suggestion_id INTEGER,
  timestamp INTEGER NOT NULL,
  feedback TEXT NOT NULL,  -- 'positive' | 'neutral' | 'negative'
  score REAL NOT NULL,  -- -1 到 1
  actual_outcome REAL,
  expected_outcome REAL,
  error REAL,
  lessons TEXT,  -- JSON数组
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  FOREIGN KEY (suggestion_id) REFERENCES ai_suggestion_logs(id)
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_ai_reports_timestamp ON ai_analysis_reports(timestamp);
CREATE INDEX IF NOT EXISTS idx_ai_suggestions_timestamp ON ai_suggestion_logs(timestamp);
CREATE INDEX IF NOT EXISTS idx_ai_suggestions_coin ON ai_suggestion_logs(coin);
CREATE INDEX IF NOT EXISTS idx_ai_adjustments_timestamp ON ai_parameter_adjustments(timestamp);
CREATE INDEX IF NOT EXISTS idx_ai_feedback_suggestion_id ON ai_learning_feedback(suggestion_id);
```

---

## 七、总结

这个实现方案提供了一个完整的AI量化交易系统架构：

### 核心特点

1. **数据收集完善**：从L1到L4的完整数据层次
2. **AI定位清晰**：只做分析，不做决策
3. **多层验证**：格式、逻辑、风险、规则四层验证
4. **学习反馈**：从结果中学习，持续改进
5. **安全优先**：硬性边界，可审计，可回滚

### 实施路径

| 阶段 | 任务 | 文件 |
|------|------|------|
| Phase 1 | 数据收集层 | `src/ai/core/input-builder.ts` |
| Phase 2 | AI分析引擎 | `src/ai/core/ai-engine.ts` |
| Phase 3 | 输出验证器 | `src/ai/core/output-validator.ts` |
| Phase 4 | AI协调器 | `src/ai-integration/ai-coordinator.ts` |
| Phase 5 | 学习反馈 | `src/ai/learning/` |
| Phase 6 | 自动优化 | 在严格约束下 |

### 使用建议

1. **初期**：关闭自动调整，只用于分析报告
2. **中期**：开启参数建议，需要人类批准
3. **后期**：在充分验证后，谨慎启用自动调整

**始终记住**：AI是副驾驶，不是驾驶员。规则引擎和人类监督始终是最后一道防线。
