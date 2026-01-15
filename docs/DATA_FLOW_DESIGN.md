# 数据流架构设计文档

## 1. 完整数据流架构

### 1.1 整体架构图

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          现货交易系统数据流                              │
└─────────────────────────────────────────────────────────────────────────┘

┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   OKX API    │────▶│  MarketData  │────▶│  Indicator  │
│              │     │   Provider   │     │  Calculator  │
└──────────────┘     └──────────────┘     └──────────────┘
                           │                      │
                           ▼                      ▼
                    ┌──────────────┐     ┌──────────────┐
                    │  PriceCache  │────▶│  TechCache   │
                    └──────────────┘     └──────────────┘
                           │                      │
                           └──────────┬───────────┘
                                      ▼
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│ TradeHistory │◀────│  Coordinator │────▶│  GLM Client  │
│              │     │              │     │              │
└──────────────┘     └──────────────┘     └──────────────┘
       ▲                    │                     │
       │                    ▼                     ▼
       │             ┌──────────────┐     ┌──────────────┐
       │             │ Rule Engine  │     │   Safety     │
       │             │              │     │  Validator   │
       │             └──────────────┘     └──────────────┘
       │                    │                     │
       │                    └──────────┬──────────┘
       │                               ▼
       │                      ┌──────────────┐
       │                      │  Execution   │
       │                      │   Service    │
       │                      └──────────────┘
       │                               │
       └───────────────────────────────┘
                    (记录交易结果)
```

### 1.2 数据流时序图

```
时间线  数据层              决策层              执行层              反馈层
  │
  ├─► MarketDataProvider.fetchPrices()
  │       └─▶ 从 OKX API 获取实时价格
  │       └─▶ 缓存到 PriceCache
  │
  ├─► MarketDataProvider.fetchKLines()
  │       └─▶ 从 OKX API 获取K线数据
  │       └─▶ IndicatorCalculator 计算指标
  │       └─▶ 缓存到 TechCache
  │
  ├─► Coordinator.execute()
  │       └─▶ 构建完整的 MarketContext
  │           ├─ prices: Map<Coin, PriceData>
  │           ├─ klines: Map<Coin, CandleData[]>
  │           └─ indicators: Map<Coin, TechIndicators>
  │
  ├─► aiClient.scanMarket()
  │       └─▶ 构建包含真实数据的 prompt
  │       └─▶ AI 分析并返回 MarketScanResult
  │
  ├─► aiClient.makeTradingDecision()
  │       └─▶ 传入真实的市场扫描结果
  │       └─▶ 传入历史交易表现
  │       └─▶ AI 返回交易决策
  │
  ├─► ruleEngine.execute()
  │       └─▶ 使用真实价格和技术指标
  │       └─▶ 返回规则信号
  │
  ├─► coordinator.coordinateDecisions()
  │       └─▶ 合并 AI 和规则决策
  │       └─▶ 加权计算 (70% AI, 30% Rules)
  │
  ├─► safetyValidator.validateTrade()
  │       └─▶ 8 项安全检查
  │       └─▶ 返回验证结果
  │
  ├─► executionService.executeTrade()
  │       └─▶ 调用 OKX API 下单
  │       └─▶ 返回 ExecutionResult
  │
  └─► tradeHistory.record()
          └─▶ 记录完整交易信息
          └─▶ 更新性能统计
          └─▶ 用于下次决策参考
```

### 1.3 数据结构流转

#### 阶段 1: 原始数据获取

```typescript
// OKX API 返回的原始数据
interface OKXPriceResponse {
  code: string;
  data: [{
    instId: string;  // "BTC-USDT"
    last: string;    // "43500.5"
    open24h: string;
    high24h: string;
    low24h: string;
    vol24h: string;
    volCcy24h: string;
    ts: string;
  }];
}

interface OKXKLineResponse {
  code: string;
  data: [[
    string,  // timestamp
    string,  // open
    string,  // high
    string,  // low
    string,  // close
    string,  // volume
    string,  // volumeCcy
  ]];
}
```

#### 阶段 2: 标准化处理

```typescript
// 标准化后的价格数据
interface PriceData {
  coin: string;
  price: number;
  change24h: number;
  high24h: number;
  low24h: number;
  volume24h: number;
  timestamp: number;
}

// 标准化后的K线数据
interface CandleData {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}
```

#### 阶段 3: 技术指标计算

```typescript
// 技术指标
interface TechnicalIndicators {
  // 移动平均线
  ma: {
    ma7: number;    // 7周期均线
    ma25: number;   // 25周期均线
    ma99: number;   // 99周期均线
  };
  // 相对强弱指标
  rsi: number;      // RSI(14)
  // MACD
  macd: {
    macd: number;       // MACD线
    signal: number;     // 信号线
    histogram: number;  // 柱状图
  };
  // 布林带
  bollinger: {
    upper: number;      // 上轨
    middle: number;     // 中轨
    lower: number;      // 下轨
  };
}
```

#### 阶段 4: 市场上下文

```typescript
// 完整市场上下文（传入 AI 和规则引擎）
interface MarketContext {
  // 实时价格
  prices: Map<string, PriceData>;

  // K线数据（最近N根）
  klines: Map<string, CandleData[]>;

  // 技术指标
  indicators: Map<string, TechnicalIndicators>;

  // 市场状态
  isMarketNormal: boolean;

  // 时间戳
  timestamp: number;
}
```

#### 阶段 5: AI 决策输入

```typescript
// AI 收到的完整数据
interface TradingDecisionInput {
  // 市场扫描结果（包含真实数据！）
  marketScan: MarketScanResult;

  // 当前持仓
  currentPositions: Position[];

  // 历史交易表现
  recentPerformance: {
    totalTrades: number;
    winRate: number;
    totalPnL: number;
    avgWinAmount: number;
    avgLossAmount: number;
    profitFactor: number;
    maxDrawdown: number;
  };

  // 最近交易历史（用于学习）
  recentTrades: TradeRecord[];
}
```

---

## 2. 市场数据获取模块设计

### 2.1 模块结构

```
src/market/
├── index.ts              # 模块入口
├── provider.ts           # OKX API 数据提供者
├── cache.ts              # 数据缓存管理
├── indicators.ts         # 技术指标计算
├── types.ts              # 类型定义
└── utils.ts              # 工具函数
```

### 2.2 MarketDataProvider 类设计

```typescript
/**
 * 市场数据提供者
 *
 * 职责：
 * 1. 从 OKX API 获取实时价格
 * 2. 从 OKX API 获取K线数据
 * 3. 管理数据更新频率
 * 4. 处理 API 错误和重试
 */
export class MarketDataProvider {
  private config: MarketDataConfig;
  private priceCache: PriceCache;
  private klineCache: KLineCache;
  private indicatorCalculator: IndicatorCalculator;

  /**
   * 获取多个币种的实时价格
   */
  async fetchPrices(coins: string[]): Promise<Map<string, PriceData>>;

  /**
   * 获取K线数据
   * @param coin 币种
   * @param interval K线周期 (1m, 5m, 15m, 1H, 4H, 1D)
   * @param limit 数量 (最多300)
   */
  async fetchKLines(
    coin: string,
    interval: KLineInterval,
    limit: number
  ): Promise<CandleData[]>;

  /**
   * 获取技术指标
   * 会自动从缓存获取或计算
   */
  async fetchIndicators(
    coin: string,
    interval: KLineInterval
  ): Promise<TechnicalIndicators>;

  /**
   * 获取完整市场上下文
   */
  async fetchMarketContext(
    coins: string[],
    options: MarketContextOptions
  ): Promise<MarketContext>;
}
```

### 2.3 OKX API 接口设计

```typescript
/**
 * OKX API 交互封装
 */
class OKXAPI {
  private baseURL = 'https://www.okx.com';
  private apiKey: string;
  private secretKey: string;
  private passphrase: string;

  /**
   * 获取现货行情
   * GET /api/v5/market/tickers?instType=SPOT
   */
  async getTickers(instType: 'SPOT'): Promise<OKXPriceResponse>;

  /**
   * 获取单个币种行情
   * GET /api/v5/market/ticker?instId=BTC-USDT
   */
  async getTicker(instId: string): Promise<OKXTickerResponse>;

  /**
   * 获取K线数据
   * GET /api/v5/market/candles?instId=BTC-USDT&bar=1H&limit=100
   */
  async getCandles(
    instId: string,
    bar: KLineInterval,
    limit: number
  ): Promise<OKXKLineResponse>;

  /**
   * 获取批量K线数据
   */
  async getBatchCandles(
    instIds: string[],
    bar: KLineInterval,
    limit: number
  ): Promise<Map<string, CandleData[]>>;
}
```

### 2.4 缓存策略设计

```typescript
/**
 * 价格缓存
 * - 更新频率: 5秒
 * - 保留时间: 60秒
 * - 失效策略: TTL
 */
class PriceCache {
  private cache: Map<string, { data: PriceData; expireAt: number }>;

  get(coin: string): PriceData | null;
  set(coin: string, data: PriceData): void;
  clear(): void;
  getExpired(): string[];
}

/**
 * K线缓存
 * - 更新频率: 根据周期 (1m: 10s, 5m: 30s, 1H: 5min)
 * - 保留数量: 300根K线
 * - 失效策略: 时间窗口检查
 */
class KLineCache {
  private cache: Map<string, { data: CandleData[]; lastUpdate: number }>;

  get(coin: string, interval: KLineInterval): CandleData[] | null;
  set(coin: string, interval: KLineInterval, data: CandleData[]): void;
  needsUpdate(coin: string, interval: KLineInterval): boolean;
}

/**
 * 技术指标缓存
 * - 更新频率: 随K线更新
 * - 计算开销: 中等
 * - 失效策略: 依赖K线缓存
 */
class IndicatorCache {
  private cache: Map<string, { data: TechnicalIndicators; klineTimestamp: number }>;

  get(coin: string, interval: KLineInterval): TechnicalIndicators | null;
  set(coin: string, interval: KLineInterval, data: TechnicalIndicators): void;
  invalidate(coin: string): void;
}
```

---

## 3. 技术指标计算模块设计

### 3.1 指标计算器

```typescript
/**
 * 技术指标计算器
 *
 * 职责：
 * 1. 计算移动平均线 (SMA/EMA)
 * 2. 计算相对强弱指标 (RSI)
 * 3. 计算MACD
 * 4. 计算布林带 (Bollinger Bands)
 */
export class IndicatorCalculator {
  /**
   * 计算所有指标
   */
  calculateAll(klines: CandleData[]): TechnicalIndicators {
    return {
      ma: this.calculateMA(klines),
      rsi: this.calculateRSI(klines),
      macd: this.calculateMACD(klines),
      bollinger: this.calculateBollinger(klines),
    };
  }

  /**
   * 计算移动平均线
   */
  calculateMA(klines: CandleData[]): {
    ma7: number;
    ma25: number;
    ma99: number;
  };

  /**
   * 计算RSI
   * @param period 周期，默认14
   */
  calculateRSI(klines: CandleData[], period: number = 14): number;

  /**
   * 计算MACD
   * @param fastPeriod 快线周期，默认12
   * @param slowPeriod 慢线周期，默认26
   * @param signalPeriod 信号线周期，默认9
   */
  calculateMACD(
    klines: CandleData[],
    fastPeriod: number = 12,
    slowPeriod: number = 26,
    signalPeriod: number = 9
  ): {
    macd: number;
    signal: number;
    histogram: number;
  };

  /**
   * 计算布林带
   * @param period 周期，默认20
   * @param stdDev 标准差倍数，默认2
   */
  calculateBollinger(
    klines: CandleData[],
    period: number = 20,
    stdDev: number = 2
  ): {
    upper: number;
    middle: number;
    lower: number;
  };
}
```

### 3.2 计算公式

#### SMA (简单移动平均)

```
SMA(n) = (P1 + P2 + ... + Pn) / n
```

#### RSI (相对强弱指标)

```
RSI = 100 - (100 / (1 + RS))

其中:
RS = 平均涨幅 / 平均跌幅
平均涨幅 = 过去14天涨幅之和 / 14
平均跌幅 = 过去14天跌幅之和 / 14
```

#### MACD (指数平滑异同移动平均线)

```
EMA(n) = (当前价格 - 前一日EMA) × (2 / (n + 1)) + 前一日EMA

MACD = EMA(12) - EMA(26)
Signal = EMA(MACD, 9)
Histogram = MACD - Signal
```

#### Bollinger Bands (布林带)

```
中轨 = SMA(20)
上轨 = 中轨 + 2 × 标准差(20)
下轨 = 中轨 - 2 × 标准差(20)
```

---

## 4. AI Prompt 修复设计

### 4.1 当前问题

```typescript
// ❌ 错误的 prompt（让 AI 编造数据）
private buildMarketScanPrompt(coins: string[], focus?: string): string {
  return `
  请提供每个币种的：
  - 当前价格（模拟数据即可）  // ← 问题所在！
  - 24小时变化百分比
  - ...
  `;
}
```

### 4.2 正确的 Prompt 设计

```typescript
// ✅ 正确的 prompt（传入真实数据）
private buildMarketScanPrompt(
  coins: string[],
  marketData: MarketData,  // ← 新增参数
  focus?: string
): string {
  // 构建真实数据摘要
  const dataSummary = this.buildMarketDataSummary(marketData);

  return `
你是一位专业的加密货币市场分析师。请基于以下真实市场数据进行分析：

${dataSummary}

${focus ? `特别关注：${focus}` : ''}

请对每个币种进行分析：
1. 当前价格位置（相对高低点）
2. 短期趋势（基于MA7、MA25）
3. 动能分析（基于RSI、MACD）
4. 波动性评估（基于布林带）
5. 成交量分析

返回格式要求：
- 提供 JSON 格式的分析结果
- 包含每个币种的评分 (-1 到 +1)
- 明确的买入/卖出/持有建议
- 置信度 (0-1)
- 详细的分析理由
`;
}

/**
 * 构建市场数据摘要
 */
private buildMarketDataSummary(data: MarketData): string {
  const lines: string[] = [];

  for (const [coin, priceData] of data.prices) {
    const klines = data.klines.get(coin) || [];
    const indicators = data.indicators.get(coin);

    lines.push(`\n## ${coin}`);
    lines.push(`价格: ${priceData.price} USDT`);
    lines.push(`24h涨跌: ${priceData.change24h.toFixed(2)}%`);
    lines.push(`24h高低: ${priceData.low24h} - ${priceData.high24h}`);
    lines.push(`成交量: ${priceData.volume24h.toLocaleString()} USDT`);

    if (indicators) {
      lines.push(`\n技术指标:`);
      lines.push(`- MA7: ${indicators.ma.ma7.toFixed(2)}`);
      lines.push(`- MA25: ${indicators.ma.ma25.toFixed(2)}`);
      lines.push(`- RSI: ${indicators.rsi.toFixed(2)}`);
      lines.push(`- MACD: ${indicators.macd.macd.toFixed(4)} (信号: ${indicators.macd.signal.toFixed(4)})`);
      lines.push(`- 布林带: [${indicators.bollinger.lower.toFixed(2)}, ${indicators.bollinger.upper.toFixed(2)}]`);
    }

    // K线摘要
    if (klines.length > 0) {
      const recent = klines.slice(-5);
      lines.push(`\n最近5根K线:`);
      for (const k of recent) {
        lines.push(`  ${new Date(k.timestamp).toLocaleTimeString()}: O:${k.open.toFixed(2)} H:${k.high.toFixed(2)} L:${k.low.toFixed(2)} C:${k.close.toFixed(2)}`);
      }
    }
  }

  return lines.join('\n');
}
```

### 4.3 Trading Decision Prompt 修复

```typescript
private buildTradingDecisionPrompt(input: TradingDecisionInput): string {
  // 1. 市场数据摘要
  const marketSummary = this.buildMarketDataSummary({
    prices: new Map(
      input.marketScan.coins.map(c => [c.coin, {
        coin: c.coin,
        price: c.price,
        change24h: c.change24h,
        high24h: c.price * (1 + Math.abs(c.change24h) / 100),
        low24h: c.price * (1 - Math.abs(c.change24h) / 100),
        volume24h: c.volume24h || 1000000,
        timestamp: input.marketScan.timestamp,
      }])
    ),
    klines: new Map(),
    indicators: new Map(),
  });

  // 2. 持仓摘要
  const positionSummary = input.currentPositions.map(p => `
${p.coin}: ${p.amount.toFixed(6)} (成本 ${p.avgCost.toFixed(2)}, 盈亏 ${p.unrealizedPnL.toFixed(2)} USDT, ${(p.pnlPercent || 0).toFixed(2)}%)`).join('');

  // 3. 历史表现摘要
  const performanceSummary = `
总交易: ${input.recentPerformance.totalTrades}
胜率: ${(input.recentPerformance.winRate * 100).toFixed(2)}%
总盈亏: ${input.recentPerformance.totalPnL.toFixed(2)} USDT
盈亏比: ${input.recentPerformance.profitFactor.toFixed(2)}
最大回撤: ${(input.recentPerformance.maxDrawdown * 100).toFixed(2)}%
`;

  // 4. 最近交易摘要
  const recentTradesSummary = input.recentTrades.map(t =>
    `[${new Date(t.timestamp).toLocaleString()}] ${t.coin} ${t.action} ${t.amount} @ ${t.price} -> 结果: ${t.pnl?.toFixed(2) || '进行中'}`
  ).join('\n');

  return `
你是一位经验丰富的量化交易策略师。请基于以下真实数据做出交易决策：

# 市场数据
${marketSummary}

# 当前持仓
${positionSummary || '无持仓'}

# 历史表现
${performanceSummary}

# 最近交易记录（最近10笔）
${recentTradesSummary || '无交易记录'}

# 决策要求
1. 分析每个币种的多空信号强度
2. 考虑当前持仓的风险敞口
3. 参考历史交易的成功/失败模式
4. 给出明确的买入/卖出/持有建议
5. 建议合理的交易金额（基于可用资金）

返回 JSON 格式，包含：
- coin: 币种
- action: 'buy' | 'sell' | 'hold'
- confidence: 0-1 置信度
- aiScore: -1 到 +1 的评分
- reason: 详细决策理由
- suggestedSize: 建议交易金额（USDT）
`;
}
```

---

## 5. 交易历史和学习闭环设计

### 5.1 TradeHistory 模块

```typescript
/**
 * 交易历史记录和追踪
 */
export class TradeHistory {
  private storage: TradeStorage;
  private performanceTracker: PerformanceTracker;

  /**
   * 记录交易决策
   */
  recordDecision(decision: CoordinatedDecision): void;

  /**
   * 记录交易执行
   */
  recordExecution(result: ExecutionResult): void;

  /**
   * 记录交易结果（平仓时）
   */
  recordTradeResult(trade: TradeResult): void;

  /**
   * 获取最近交易记录
   */
  getRecentTrades(limit?: number): TradeRecord[];

  /**
   * 获取交易表现统计
   */
  getPerformanceStats(): PerformanceStats;

  /**
   * 获取某个币种的历史表现
   */
  getCoinPerformance(coin: string): CoinPerformance;

  /**
   * 分析决策模式
   */
  analyzeDecisionPatterns(): DecisionPatternAnalysis;
}
```

### 5.2 数据结构

```typescript
/**
 * 交易记录
 */
interface TradeRecord {
  id: string;
  timestamp: number;
  coin: string;
  action: 'buy' | 'sell';
  price: number;
  amount: number;
  value: number;

  // 决策信息
  decision: {
    source: 'ai' | 'rule' | 'coordinated';
    aiScore?: number;
    ruleScore?: number;
    combinedScore: number;
    confidence: number;
    reason: string;
  };

  // 市场快照（决策时的市场状态）
  marketSnapshot: {
    price: number;
    change24h: number;
    rsi: number;
    macd: number;
    position: number;
  };

  // 执行信息
  execution?: {
    orderId: string;
    actualPrice: number;
    actualAmount: number;
    fee: number;
  };

  // 结果（平仓后填充）
  result?: {
    closePrice: number;
    closeTimestamp: number;
    pnl: number;
    pnlPercent: number;
    holdDuration: number;
  };
}

/**
 * 表现统计
 */
interface PerformanceStats {
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;

  totalPnL: number;
  avgWin: number;
  avgLoss: number;
  profitFactor: number;

  maxDrawdown: number;
  maxWinStreak: number;
  maxLossStreak: number;

  avgHoldDuration: number;
  sharpeRatio?: number;
}

/**
 * 决策模式分析
 */
interface DecisionPatternAnalysis {
  bySource: {
    ai: PerformanceStats;
    rule: PerformanceStats;
    coordinated: PerformanceStats;
  };

  byCoin: Map<string, PerformanceStats>;

  byMarketCondition: {
    uptrend: PerformanceStats;
    downtrend: PerformanceStats;
    sideways: PerformanceStats;
  };

  byRSI: {
    overbought: PerformanceStats;  // RSI > 70
    neutral: PerformanceStats;     // 30 <= RSI <= 70
    oversold: PerformanceStats;    // RSI < 30
  };
}
```

### 5.3 学习闭环流程

```
决策阶段                    执行阶段                    结果阶段                    学习阶段
    │                          │                          │                          │
    ▼                          ▼                          ▼                          ▼
┌────────────┐           ┌────────────┐           ┌────────────┐           ┌────────────┐
│ AI 决策    │           │ 下单执行   │           │ 获取结果   │           │ 分析学习   │
│ - 记录     │──────────▶│ - 记录     │──────────▶│ - 记录     │──────────▶│ - 更新     │
│   决策理由 │           │   订单信息 │           │   平仓价格 │           │   统计     │
│ - 记录     │           │ - 记录     │           │ - 计算盈亏 │           │ - 分析     │
│   市场状态 │           │   实际价格 │           │ - 持有时长 │           │   模式     │
└────────────┘           └────────────┘           └────────────┘           └────────────┘
    │                                                                              │
    └──────────────────────────────────────────────────────────────────────────────┘
                                   下次决策参考
```

### 5.4 反馈到 AI 的数据

```typescript
/**
 * 构建历史交易反馈给 AI
 */
interface TradingFeedback {
  // 总体表现
  overall: {
    totalTrades: number;
    winRate: number;
    avgWin: number;
    avgLoss: number;
    profitFactor: number;
    maxDrawdown: number;
  };

  // 最近10笔交易
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
    uptrend: { trades: number; winRate: number; avgPnL: number; };
    downtrend: { trades: number; winRate: number; avgPnL: number; };
    sideways: { trades: number; winRate: number; avgPnL: number; };
  };

  // 按决策源表现
  bySource: {
    ai: { trades: number; winRate: number; avgPnL: number; };
    rule: { trades: number; winRate: number; avgPnL: number; };
    coordinated: { trades: number; winRate: number; avgPnL: number; };
  };

  // 失败案例（避免重复错误）
  failures: Array<{
    coin: string;
    action: string;
    reason: string;
    marketCondition: string;
    loss: number;
  }>;

  // 成功案例（学习成功模式）
  successes: Array<{
    coin: string;
    action: string;
    reason: string;
    marketCondition: string;
    profit: number;
  }>;
}
```

---

## 6. 增强日志系统设计

### 6.1 结构化日志

```typescript
/**
 * 决策过程日志
 */
interface DecisionLog {
  timestamp: number;
  logType: 'decision_process';

  // 输入数据
  input: {
    marketData: MarketDataSummary;
    positions: PositionSummary[];
    historicalPerformance: PerformanceSummary;
  };

  // AI 分析过程
  aiAnalysis: {
    rawPrompt: string;
    rawResponse: string;
    parsedDecisions: AITradingDecision[];
    confidence: number;
  };

  // 规则分析过程
  ruleAnalysis: {
    enabledRules: string[];
    ruleSignals: RuleSignal[];
    filteredSignals: RuleSignal[];
  };

  // 协调过程
  coordination: {
    aiWeight: number;
    ruleWeight: number;
    conflicts: Array<{
      coin: string;
      aiDecision: string;
      ruleSignal: string;
      resolution: string;
    }>;
    finalDecisions: CoordinatedDecision[];
  };

  // 安全验证过程
  safetyValidation: {
    checks: SafetyCheck[];
    warnings: SafetyCheck[];
    blocked: SafetyCheck[];
    adjustments: TradeAdjustment[];
  };

  // 最终决策
  finalDecision: {
    decision: CoordinatedDecision;
    validationPassed: boolean;
    executionReady: boolean;
  };
}
```

### 6.2 日志等级

```typescript
enum LogLevel {
  DEBUG = 'debug',    // 详细调试信息（价格、指标、中间计算）
  INFO = 'info',      // 一般信息（交易决策、执行结果）
  WARN = 'warn',      // 警告（安全检查警告、异常情况）
  ERROR = 'error',    // 错误（API 失败、执行失败）
  CRITICAL = 'critical', // 严重错误（可能导致资金损失）
}

// 使用示例
logger.debug('市场数据获取成功', {
  coins: ['BTC', 'ETH'],
  prices: { BTC: 43500, ETH: 2300 },
  indicators: { BTC: { rsi: 55, macd: 0.5 } },
});

logger.info('AI 决策生成', {
  coin: 'BTC',
  action: 'buy',
  confidence: 0.8,
  reason: 'RSI超卖反弹',
});

logger.warn('安全检查警告', {
  coin: 'BTC',
  check: 'frequency_limit',
  reason: '接近交易频率限制',
});

logger.error('API 调用失败', {
  endpoint: '/api/v5/market/tickers',
  error: 'Connection timeout',
  retry: 3,
});
```

### 6.3 关键决策点日志

```typescript
// 1. 市场数据获取
logger.info('市场数据获取开始', { coins, interval });
// → 原始 API 响应
// → 处理后数据
// → 缓存状态

// 2. 技术指标计算
logger.debug('技术指标计算', { coin, indicators });
// → 输入K线数据
// → 计算过程
// → 输出结果

// 3. AI 决策
logger.info('AI 决策开始', {
  marketDataSize: JSON.stringify(marketData).length,
  recentTradesCount: recentTrades.length,
});
// → 完整 prompt（debug 级别）
// → AI 原始响应（debug 级别）
// → 解析后决策

// 4. 规则执行
logger.debug('规则执行', {
  enabledRules,
  inputSize,
});
// → 每个规则的输入输出
// → 最终信号列表

// 5. 决策协调
logger.info('决策协调', {
  aiDecisions: aiDecisions.length,
  ruleSignals: ruleSignals.length,
  conflicts: conflicts.length,
});
// → 协调过程详情
// → 冲突解决详情

// 6. 安全验证
logger.info('安全验证', {
  decision: decision.coin,
  checks: validation.checks.length,
  passed: validation.passed,
});
// → 每个检查的结果
// → 调整建议

// 7. 交易执行
logger.info('交易执行', {
  decision: decision.coin,
  action: decision.action,
  amount: decision.suggestedAmount,
});
// → API 请求详情
// → 执行结果
// → 订单 ID

// 8. 结果记录
logger.info('交易结果', {
  tradeId,
  pnl,
  pnlPercent,
  holdDuration,
});
// → 完整交易记录
```

---

## 7. 测试策略设计

### 7.1 测试金字塔

```
           ┌─────────────┐
           │  端到端测试  │  5%  - 真实场景验证
           │   (E2E)     │
           ├─────────────┤
           │  集成测试    │  15% - 模块间交互
           └─────────────┘
          ┌───────────────┐
          │   单元测试     │  80% - 函数级别
          └───────────────┘
```

### 7.2 单元测试

```typescript
// tests/market/provider.test.ts
describe('MarketDataProvider', () => {
  test('应该正确解析 OKX API 价格响应', () => {
    const mockResponse = {
      code: '0',
      data: [{
        instId: 'BTC-USDT',
        last: '43500.5',
        open24h: '42000',
        high24h: '44000',
        low24h: '41500',
        vol24h: '10000',
        volCcy24h: '100000000',
      }],
    };
    const result = parsePriceResponse(mockResponse, 'BTC');
    expect(result.price).toBe(43500.5);
    expect(result.change24h).toBeCloseTo(3.57, 1);
  });

  test('应该正确计算 RSI', () => {
    const calculator = new IndicatorCalculator();
    const klines = generateTestKLines(50);
    const rsi = calculator.calculateRSI(klines);
    expect(rsi).toBeGreaterThanOrEqual(0);
    expect(rsi).toBeLessThanOrEqual(100);
  });

  test('应该正确计算 MACD', () => {
    const calculator = new IndicatorCalculator();
    const klines = generateTestKLines(100);
    const macd = calculator.calculateMACD(klines);
    expect(macd.histogram).toBeCloseTo(macd.macd - macd.signal, 4);
  });
});
```

### 7.3 集成测试

```typescript
// tests/integration/data-flow.test.ts
describe('数据流集成测试', () => {
  test('完整的数据流：从 API 到 AI 决策', async () => {
    // 1. Mock OKX API
    mockOKXAPI({
      tickers: { 'BTC-USDT': { last: '43500', ... } },
      candles: { 'BTC-USDT': generateKLines(100) },
    });

    // 2. 创建真实实例
    const provider = new MarketDataProvider(config);
    const aiClient = new GLMClient({ apiKey: 'test-key' });
    const coordinator = new SpotCoordinator(config, aiClient, ...);

    // 3. 执行数据流
    const marketData = await provider.fetchMarketContext(['BTC', 'ETH'], {
      includeKLines: true,
      includeIndicators: true,
    });

    // 4. 验证数据完整性
    expect(marketData.prices.get('BTC')).toBeDefined();
    expect(marketData.klines.get('BTC')).toHaveLength(100);
    expect(marketData.indicators.get('BTC')?.rsi).toBeGreaterThanOrEqual(0);

    // 5. 验证 AI 收到正确的数据
    const promptSpy = spyOn(aiClient, 'callGLM');
    await coordinator.execute(marketData, [], 10000);

    const sentPrompt = promptSpy.calls[0].args[0].userPrompt;
    expect(sentPrompt).toContain('43500');  // 真实价格
    expect(sentPrompt).toContain('RSI:');   // 技术指标
    expect(sentPrompt).not.toContain('模拟数据');  // 不包含模拟数据
  });

  test('学习闭环：交易记录反馈到下次决策', async () => {
    const tradeHistory = new TradeHistory();

    // 1. 记录一些历史交易
    tradeHistory.recordTradeResult({
      id: '1',
      coin: 'BTC',
      action: 'buy',
      price: 42000,
      result: { pnl: 500, win: true },
      marketCondition: 'uptrend',
    });

    // 2. 获取反馈数据
    const feedback = tradeHistory.getTradingFeedback();

    // 3. 验证反馈包含在 AI 调用中
    const coordinator = new SpotCoordinator(...);
    const promptSpy = spyOn(aiClient, 'callGLM');

    await coordinator.execute(marketContext, [], 10000);

    const sentPrompt = promptSpy.calls[0].args[0].userPrompt;
    expect(sentPrompt).toContain('历史表现');
    expect(sentPrompt).toContain('胜率');
  });
});
```

### 7.4 验证测试

```typescript
// tests/validation/data-accuracy.test.ts
describe('数据准确性验证', () => {
  test('AI prompt 必须包含真实数据', async () => {
    const provider = new MarketDataProvider(config);
    const aiClient = new GLMClient({ apiKey: 'test-key' });

    // 获取真实市场数据
    const marketData = await provider.fetchMarketContext(['BTC'], {
      includeKLines: true,
      includeIndicators: true,
    });

    // 拦截 AI 调用
    let actualPrompt = '';
    spyOn(aiClient, 'callGLM').and.callFake((args) => {
      actualPrompt = args.userPrompt;
      return mockAIResponse;
    });

    // 执行决策
    await aiClient.makeTradingDecision({
      marketScan: { /* from marketData */ },
      ...
    });

    // 验证 prompt 包含真实数据
    const btcPrice = marketData.prices.get('BTC')!.price;
    const btcRSI = marketData.indicators.get('BTC')!.rsi;

    expect(actualPrompt).toContain(btcPrice.toString());
    expect(actualPrompt).toContain(`RSI: ${btcRSI.toFixed(2)}`);
    expect(actualPrompt).not.toMatch(/模拟|mock|fake/i);
  });

  test('技术指标计算正确性', () => {
    // 使用已知数据验证计算结果
    const klines = [
      { close: 100, timestamp: 1 },
      { close: 102, timestamp: 2 },
      { close: 101, timestamp: 3 },
      { close: 103, timestamp: 4 },
      { close: 105, timestamp: 5 },
    ];

    const calculator = new IndicatorCalculator();
    const ma5 = calculator.calculateMA(klines, 5);

    // MA(5) = (100 + 102 + 101 + 103 + 105) / 5 = 102.2
    expect(ma5).toBeCloseTo(102.2, 1);
  });
});
```

---

## 8. 实施计划

### 阶段 1: 市场数据模块（优先级：高）

1. ✅ 创建 `src/market/` 目录结构
2. ✅ 实现 `OKXAPI` 类
3. ✅ 实现 `MarketDataProvider` 类
4. ✅ 实现 `PriceCache`, `KLineCache`, `IndicatorCache`
5. ✅ 实现技术指标计算
6. ✅ 编写单元测试

### 阶段 2: Prompt 修复（优先级：高）

1. ✅ 修改 `buildMarketScanPrompt` 接收真实数据
2. ✅ 修改 `buildTradingDecisionPrompt` 接收历史数据
3. ✅ 移除所有 "模拟数据即可" 的提示
4. ✅ 添加数据验证确保传入真实数据
5. ✅ 编写 prompt 验证测试

### 阶段 3: 交易历史模块（优先级：中）

1. ✅ 实现 `TradeHistory` 类
2. ✅ 实现数据持久化（SQLite）
3. ✅ 实现 `PerformanceTracker`
4. ✅ 实现决策模式分析
5. ✅ 编写单元测试

### 阶段 4: Coordinator 集成（优先级：高）

1. ✅ 修改 `coordinator.ts` 使用新的数据提供者
2. ✅ 集成交易历史记录
3. ✅ 实现学习闭环
4. ✅ 增强日志输出
5. ✅ 编写集成测试

### 阶段 5: 测试和验证（优先级：高）

1. ✅ 编写端到端测试
2. ✅ 验证数据流完整性
3. ✅ 压力测试
4. ✅ 性能优化
5. ✅ 文档完善

---

## 9. 风险和注意事项

### 9.1 技术风险

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| OKX API 限流 | 数据获取失败 | 实现请求队列和缓存 |
| API 数据错误 | 错误决策 | 多层验证和异常检测 |
| 计算精度问题 | 指标不准确 | 使用 Decimal.js 处理精度 |
| 并发问题 | 数据竞争 | 使用锁和事务 |

### 9.2 业务风险

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| AI 决策错误 | 资金损失 | 严格安全验证 + 人工审核 |
| 过度交易 | 手续费损耗 | 交易频率限制 |
| 市场异常 | 系统失灵 | 异常检测 + 熔断机制 |
| 数据泄露 | 安全问题 | 加密存储 + 访问控制 |

### 9.3 测试要求

1. **所有市场数据必须真实**：不能使用模拟数据
2. **AI prompt 可验证**：能够验证 AI 收到的数据
3. **决策可追溯**：每笔决策都有完整日志
4. **失败可分析**：记录所有失败案例
5. **性能可监控**：关键指标实时监控
