# AI量化交易系统架构设计

## 核心原则

1. **AI不是决策者，是副驾驶**
2. **一切可解释、可审计、可回滚**
3. **规则引擎 > AI建议 > 人类设定**
4. **AI只能在护栏内行动**

---

## 一、AI数据输入规范

### 1.1 数据分层架构

```
┌─────────────────────────────────────────────────────────────┐
│                    AI数据输入层级                             │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  L1: 原始数据层 (Raw Data)                                   │
│  ├─ 实时行情 (WebSocket)    → 100ms更新                      │
│  ├─ K线数据 (历史)          → 1m/5m/15m/1H/4H/1D            │
│  ├─ 订单簿深度              → 实时                           │
│  ├─ 成交记录                → 实时                           │
│  └─ 资金费率                → 8小时                          │
│                                                              │
│  L2: 特征数据层 (Feature Data)                               │
│  ├─ 技术指标                  → 实时计算                      │
│  │  ├─ 趋势: SMA, EMA, MACD                               │
│  │  ├─ 动量: RSI, CCI                                     │
│  │  ├─ 波动: ATR, Bollinger Bands                         │
│  │  └─ 成交量: OBV, Volume MA                             │
│  ├─ 市场结构                  → 实时识别                      │
│  │  ├─ 支撑/阻力位                                        │
│  │  ├─ 趋势方向                                          │
│  │  └─ 关键价格点位                                       │
│  └─ 统计特征                  → 滚动计算                      │
│     ├─ 收益率分布                                         │
│     ├─ 波动率变化                                         │
│     └─ 相关性分析                                         │
│                                                              │
│  L3: 状态数据层 (State Data)                                 │
│  ├─ 账户状态                  → 实时                          │
│  │  ├─ 余额: 可用/冻结/总计                               │
│  │  ├─ 持仓: 数量/均价/未实现盈亏                          │
│  │  ├─ 订单: 挂单/历史订单                                │
│  │  └─ 杠杆: 当前杠杆/可用杠杆                            │
│  ├─ 策略状态                  → 实时                          │
│  │  ├─ 当前模式: DCA/Grid/暂停                           │
│  │  ├─ 网格位置: 当前价位在网格中的位置                   │
│  │  ├─ DCA进度: 距离上次买入时间/跌幅                     │
│  │  └─ 风险等级: low/medium/high/critical                │
│  └─ 系统状态                  → 实时                          │
│     ├─ 数据源健康度                                       │
│     ├─ 网络延迟                                           │
│     └─ 执行成功率                                         │
│                                                              │
│  L4: 历史数据层 (Historical Data)                            │
│  ├─ 决策历史                  → 完整记录                      │
│  │  ├─ 过去100条决策                                     │
│  │  ├─ 决策依据和理由                                     │
│  │  └─ 决策结果                                           │
│  ├─ 交易历史                  → 完整记录                      │
│  │  ├─ 成交记录                                           │
│  │  ├─ 滑点分析                                           │
│  │  └─ 手续费统计                                         │
│  └─ 性能历史                  → 聚合统计                      │
│     ├─ 胜率/盈亏比/夏普比率                               │
│     ├─ 最大回撤/平均回撤                                  │
│     └─ 月度/周度/日度表现                                 │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 1.2 AI输入数据格式规范

```typescript
// ========== AI输入主结构 ==========
interface AIInputData {
  version: string;              // 数据格式版本
  timestamp: number;            // 数据时间戳
  source: 'websocket' | 'rest'; // 数据来源

  // L1: 原始市场数据
  raw: RawMarketData;

  // L2: 特征数据
  features: FeatureData;

  // L3: 状态数据
  state: StateData;

  // L4: 历史数据
  history: HistoricalData;

  // 环境上下文
  context: SystemContext;
}

// ========== L1: 原始数据 ==========
interface RawMarketData {
  // 基础行情
  tickers: Map<Coin, TickerData>;

  // K线数据 (多时间周期)
  candles: {
    '1m': CandleData[];   // 最近100根
    '5m': CandleData[];   // 最近100根
    '15m': CandleData[];  // 最近100根
    '1H': CandleData[];   // 最近200根
    '4H': CandleData[];   // 最近100根
    '1D': CandleData[];   // 最近100根
  };

  // 订单簿
  orderBooks: Map<Coin, OrderBookData>;

  // 资金费率 (仅合约)
  fundingRates: Map<Coin, FundingRateData>;
}

interface TickerData {
  instId: string;
  last: number;           // 最新成交价
  lastSz: number;         // 最新成交量
  askPx: number;          // 卖一价
  bidPx: number;          // 买一价
  open24h: number;        // 24h开盘价
  high24h: number;        // 24h最高价
  low24h: number;         // 24h最低价
  vol24h: number;         // 24h成交量
  volCcy24h: number;      // 24h成交额
  ts: number;             // 数据时间戳
}

interface CandleData {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  volumeCcy: number;
  confirm: boolean;       // 是否已确认
}

interface OrderBookData {
  instId: string;
  bids: [number, number][];  // [价格, 数量]
  asks: [number, number][];
  ts: number;
}

interface FundingRateData {
  instId: string;
  fundingRate: string;     // 资金费率
  nextSettleTime: string;  // 下次结算时间
  fundingTime: string;     // 费率时间
}

// ========== L2: 特征数据 ==========
interface FeatureData {
  // 技术指标 (每个币种)
  technical: Map<Coin, TechnicalIndicators>;

  // 市场结构
  structure: MarketStructure;

  // 统计特征
  statistics: StatisticalFeatures;
}

interface TechnicalIndicators {
  // 趋势指标
  trend: {
    sma20: number;
    sma50: number;
    ema12: number;
    ema26: number;
    macd: {
      value: number;
      signal: number;
      histogram: number;
    };
    adx: number;           // 趋势强度
  };

  // 动量指标
  momentum: {
    rsi: number;           // RSI(14)
    cci: number;           // CCI(20)
    stoch: {
      k: number;
      d: number;
    };
  };

  // 波动指标
  volatility: {
    atr: number;           // ATR(14)
    atrPercent: number;    // ATR/当前价
    bb: {
      upper: number;
      middle: number;
      lower: number;
      width: number;       // 带宽
    };
  };

  // 成交量指标
  volume: {
    obv: number;
    volumeMA: {
      ma5: number;
      ma20: number;
    };
    volumeRatio: number;   // 量比
  };
}

interface MarketStructure {
  // 支撑/阻力位
  levels: Map<Coin, {
    support: number[];     // 支撑位
    resistance: number[];  // 阻力位
  }>;

  // 趋势分析
  trends: Map<Coin, {
    direction: 'uptrend' | 'downtrend' | 'sideways';
    strength: number;      // 0-100
    duration: number;      // 持续时间(分钟)
  }>;

  // 关键点位
  keyLevels: Map<Coin, {
    pivot: number;         // 中枢点
    high: number;
    low: number;
  }>;
}

interface StatisticalFeatures {
  // 收益率分布
  returns: {
    mean: number;
    std: number;
    skew: number;          // 偏度
    kurt: number;          // 峰度
  };

  // 波动率
  volatility: {
    current: number;       // 当前波动率
    ma5: number;
    ma20: number;
    regime: 'low' | 'normal' | 'high' | 'extreme';
  };

  // 相关性
  correlations: Map<Coin, Map<Coin, number>>;
}

// ========== L3: 状态数据 ==========
interface StateData {
  // 账户状态
  account: AccountState;

  // 策略状态
  strategies: Map<StrategyId, StrategyState>;

  // 风险状态
  risk: RiskState;

  // 系统状态
  system: SystemState;
}

interface AccountState {
  // 总览
  totalEquity: number;       // 总权益
  availableBalance: number;  // 可用余额
  frozenBalance: number;     // 冻结余额

  // 分币种
  coins: Map<Coin, CoinAccountState>;
}

interface CoinAccountState {
  coin: Coin;
  balance: number;
  available: number;
  frozen: number;

  // 持仓
  positions: {
    spot: SpotPosition | null;
    swap: SwapPosition | null;
  };

  // 挂单
  pendingOrders: Order[];

  // P&L
  realizedPnL: number;       // 已实现盈亏
  unrealizedPnL: number;     // 未实现盈亏
  totalPnL: number;          // 总盈亏
  totalPnLPercent: number;   // 总盈亏百分比
}

interface SpotPosition {
  instId: string;
  holding: number;           // 持有数量
  avgCost: number;           // 平均成本
  lastPrice: number;         // 最新价格
  value: number;             // 当前价值
  unrealizedPnL: number;
  unrealizedPnLPercent: number;
}

interface SwapPosition {
  instId: string;
  posSide: 'long' | 'short';
  position: number;          // 持仓数量
  avgPx: number;             // 开仓均价
  lever: string;             // 杠杆倍数
  markPx: number;            // 标记价格
  liqPx: number;             // 强平价格
  upl: number;               // 未实现盈亏
  uplRatio: number;          // 未实现盈亏率
  mgnRatio: number;          // 保证金率
  liquidationPrice: number;  // 爆仓价格
  distanceToLiquidation: number;  // 距离爆仓百分比
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
  type: 'spot-dca-grid' | 'neutral-grid';
  status: 'active' | 'paused' | 'emergency';

  // 配置
  config: {
    capital: number;
    leverage: number;
    gridCount: number;
    gridSpacing: number;
    dcaBaseAmount: number;
  };

  // 当前状态
  current: {
    mode: 'dca' | 'grid' | 'risk_avoid';
    lastAction: string;
    lastActionTime: number;
  };

  // 持仓详情
  positions: Map<Coin, StrategyPositionState>;
}

interface StrategyPositionState {
  coin: Coin;
  capital: number;
  amount: number;
  avgPrice: number;
  currentValue: number;
  unrealizedPnL: number;

  // 网格状态
  grid: {
    gridLines: number[];
    currentGridIndex: number;
    buyOrders: number[];
    sellOrders: number[];
  } | null;

  // DCA状态
  dca: {
    lastBuyPrice: number;
    lastBuyTime: number;
    buyCount: number;
    avgPrice: number;
  } | null;
}

interface RiskState {
  // 风险等级
  level: 'low' | 'medium' | 'high' | 'critical';

  // 回撤
  drawdown: {
    current: number;          // 当前回撤
    max: number;              // 最大回撤
    maxTimestamp: number;     // 最大回撤时间
  };

  // 风险指标
  metrics: {
    positionRisk: number;     // 仓位风险
    leverageRisk: number;     // 杠杆风险
    concentrationRisk: number;// 集中度风险
    liquidityRisk: number;    // 流动性风险
  };

  // 熔断状态
  circuitBreaker: {
    triggered: boolean;
    reason: string | null;
    triggeredAt: number | null;
    estimatedResume: number | null;
  };

  // 预警
  alerts: RiskAlert[];
}

interface RiskAlert {
  id: string;
  level: 'info' | 'warning' | 'danger';
  type: string;
  message: string;
  timestamp: number;
  resolved: boolean;
}

interface SystemState {
  // 数据源健康
  dataSource: {
    primary: 'websocket' | 'rest';
    wsConnected: boolean;
    wsLastUpdate: number;
    restLastUpdate: number;
    healthStatus: 'healthy' | 'degraded' | 'unhealthy';
  };

  // 网络状态
  network: {
    latency: number;
    errorRate: number;
    lastError: string | null;
  };

  // 执行状态
  execution: {
    ordersPlaced: number;
    ordersFilled: number;
    ordersFailed: number;
    avgSlippage: number;
  };

  // 系统资源
  resources: {
    cpu: number;
    memory: number;
    disk: number;
  };
}

// ========== L4: 历史数据 ==========
interface HistoricalData {
  // 决策历史 (最近100条)
  decisions: DecisionLog[];

  // 交易历史 (最近100条)
  trades: TradeLog[];

  // 性能统计
  performance: PerformanceMetrics;

  // AI学习历史
  aiLearning: AILearningHistory;
}

interface DecisionLog {
  id: string;
  timestamp: number;
  coin: Coin;
  action: 'buy' | 'sell' | 'hold' | 'pause';
  type: 'dca' | 'grid' | 'risk' | 'manual';
  reason: string;

  // 决策时的市场状态
  marketSnapshot: {
    price: number;
    volume: number;
    volatility: number;
    trend: string;
  };

  // 决策依据
  basis: {
    signals: string[];
    indicators: Record<string, number>;
    confidence: number;
  };

  // 执行结果
  execution: {
    status: 'pending' | 'filled' | 'failed';
    actualPrice?: number;
    actualSize?: number;
    slippage?: number;
    fee?: number;
  };

  // 后续结果 (如果已执行)
  outcome?: {
    timestamp: number;
    pnl: number;
    priceChange: number;
    duration: number;
  };
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
  // 总体表现
  overall: {
    totalReturn: number;
    totalReturnPercent: number;
    sharpeRatio: number;
    sortinoRatio: number;
    maxDrawdown: number;
    maxDrawdownDuration: number;
  };

  // 交易统计
  trading: {
    totalTrades: number;
    winningTrades: number;
    losingTrades: number;
    winRate: number;
    avgWin: number;
    avgLoss: number;
    profitFactor: number;
    expectancy: number;
  };

  // 分币种
  byCoin: Map<Coin, CoinPerformance>;
}

interface CoinPerformance {
  totalReturn: number;
  totalReturnPercent: number;
  winRate: number;
  sharpeRatio: number;
  maxDrawdown: number;
  trades: number;
}

interface AILearningHistory {
  // AI建议历史
  suggestions: AISuggestionLog[];

  // AI建议的反馈
  feedback: AISuggestionFeedback[];

  // AI参数调整历史
  parameterAdjustments: AIParameterAdjustment[];
}

interface AISuggestionLog {
  id: string;
  timestamp: number;
  coin: Coin;
  type: 'parameter' | 'action' | 'risk';
  suggestion: any;

  // AI置信度
  confidence: number;

  // AI依据
  reasoning: string;

  // 是否被采纳
  adopted: boolean;

  // 如果未被采纳，原因
  rejectionReason?: string;

  // 如果被采纳，结果
  outcome?: {
    timestamp: number;
    result: 'success' | 'failure' | 'neutral';
    actualOutcome: string;
  };
}

interface AISuggestionFeedback {
  suggestionId: string;
  timestamp: number;
  feedback: 'positive' | 'negative' | 'neutral';
  actualOutcome: number;
  expectedOutcome: number;
  error: number;
}

interface AIParameterAdjustment {
  timestamp: number;
  strategy: StrategyId;
  coin: Coin;

  // 调整前
  before: Record<string, number>;

  // 调整后
  after: Record<string, number>;

  // 调整原因
  reason: string;

  // AI建议的参数
  aiSuggested: Record<string, number>;

  // 最终采用的参数 (可能被人类修改)
  final: Record<string, number>;

  // 调整后的性能变化
  performanceChange: {
    before: number;
    after: number;
    delta: number;
  };
}

// ========== 环境上下文 ==========
interface SystemContext {
  // 当前时间
  currentTime: {
    timestamp: number;
    timezone: string;
    marketOpen: boolean;
    tradingHours: string;
  };

  // 市场状态
  marketState: {
    regime: 'bull' | 'bear' | 'sideways' | 'volatile';
    volatilityRegime: 'low' | 'normal' | 'high' | 'extreme';
    sentiment: 'fear' | 'neutral' | 'greed';
  };

  // 外部因素
  externalFactors: {
    news: NewsEvent[];
    macro: MacroEvent[];
  };
}

interface NewsEvent {
  timestamp: number;
  title: string;
  impact: 'positive' | 'negative' | 'neutral';
  relevance: number;  // 0-1
}

interface MacroEvent {
  timestamp: number;
  event: string;
  expected: string;
  actual: string;
  impact: 'positive' | 'negative' | 'neutral';
}
```

### 1.3 数据更新频率规范

| 数据层级 | 数据类型 | 更新频率 | 数据保留 |
|---------|---------|---------|---------|
| L1-原始 | ticker | 100ms | 实时 |
| L1-原始 | candles | 按K线周期 | 100-200根 |
| L1-原始 | orderBooks | 100ms | 实时 |
| L2-特征 | 技术指标 | 每次K线更新 | 实时计算 |
| L2-特征 | 市场结构 | 5分钟 | 滚动24小时 |
| L3-状态 | 账户状态 | 实时 | 实时 |
| L3-状态 | 策略状态 | 实时 | 实时 |
| L3-状态 | 风险状态 | 每分钟 | 滚动7天 |
| L4-历史 | 决策历史 | 每次决策 | 最近100条 |
| L4-历史 | 交易历史 | 每次交易 | 最近100条 |
| L4-历史 | 性能统计 | 每小时 | 滚动90天 |

---

## 二、AI输出规范

### 2.1 AI输出类型

AI只能输出以下类型的结果：

```typescript
// ========== AI输出主结构 ==========
interface AIOutput {
  version: string;
  timestamp: number;

  // 分析结果 (必须)
  analysis: AIAnalysis;

  // 建议 (可选，需要验证)
  suggestions?: AISuggestions;

  // 预警 (可选)
  alerts?: AIAlerts;

  // ❌ AI不能直接输出决策
  // decisions?: never;
}

// ========== 分析结果 ==========
interface AIAnalysis {
  // 市场分析
  market: MarketAnalysis;

  // 策略分析
  strategy: StrategyAnalysis;

  // 风险分析
  risk: RiskAnalysis;

  // 性能分析
  performance: PerformanceAnalysis;

  // AI置信度
  confidence: {
    overall: number;           // 总体置信度 0-1
    market: number;           // 市场分析置信度
    strategy: number;         // 策略分析置信度
    risk: number;             // 风险分析置信度
  };

  // AI不确定性说明
  uncertainties: Uncertainty[];
}

interface MarketAnalysis {
  // 趋势判断
  trend: {
    direction: 'uptrend' | 'downtrend' | 'sideways';
    strength: number;         // 0-100
    timeframe: string;        // 判断基于的时间周期
    confidence: number;       // 0-1
    reasoning: string;        // 判断依据
  };

  // 波动率判断
  volatility: {
    level: 'low' | 'normal' | 'high' | 'extreme';
    current: number;
    expected: number;         // 预期未来波动率
    confidence: number;
    reasoning: string;
  };

  // 关键点位
  keyLevels: {
    support: number[];
    resistance: number[];
    pivot: number;
  };

  // 市场情绪
  sentiment: {
    direction: 'bullish' | 'bearish' | 'neutral';
    strength: number;         // 0-100
    reasoning: string;
  };
}

interface StrategyAnalysis {
  // 当前策略状态评估
  currentStatus: {
    strategyId: StrategyId;
    status: 'optimal' | 'good' | 'acceptable' | 'poor' | 'dangerous';
    reasoning: string;
  };

  // 策略适用性
  applicability: Map<StrategyId, {
    score: number;            // 0-100
    reasoning: string;
  }>;

  // 参数调整建议 (仅参数，不是交易决策)
  parameterSuggestions: Map<StrategyId, {
    parameter: string;
    currentValue: number;
    suggestedValue: number;
    changePercent: number;
    reasoning: string;
    confidence: number;
    riskLevel: 'low' | 'medium' | 'high';
  }>;
}

interface RiskAnalysis {
  // 当前风险等级
  overallRisk: 'low' | 'medium' | 'high' | 'critical';

  // 风险因素分析
  riskFactors: {
    marketRisk: {
      level: number;          // 0-100
      factors: string[];
      mitigation: string[];
    };
    positionRisk: {
      level: number;
      factors: string[];
      mitigation: string[];
    };
    leverageRisk: {
      level: number;
      factors: string[];
      mitigation: string[];
    };
    liquidityRisk: {
      level: number;
      factors: string[];
      mitigation: string[];
    };
  };

  // 爆仓风险评估
  liquidationRisk: {
    probability: number;      // 0-1
    timeframe: string;        // 评估的时间范围
    scenarios: {
      priceDrop: number;      // 价格下跌多少%
      liquidation: boolean;   // 是否会爆仓
      affectedCoins: Coin[];
    }[];
  };

  // 止损建议
  stopLoss: {
    recommended: number;      // 建议止损位
    current: number;          // 当前止损位
    reasoning: string;
  };
}

interface PerformanceAnalysis {
  // 当前表现
  current: {
    totalReturn: number;
    winRate: number;
    sharpeRatio: number;
    maxDrawdown: number;
  };

  // 表现评估
  evaluation: {
    rating: 'excellent' | 'good' | 'acceptable' | 'poor';
    comparison: {
      vsBenchmark: number;    // vs基准
      vsPrevious: number;     // vs上期
    };
    reasoning: string;
  };

  // 改进建议
  improvements: {
    area: string;
    suggestion: string;
    expectedImpact: number;
    difficulty: 'easy' | 'medium' | 'hard';
  }[];
}

interface Uncertainty {
  type: 'data' | 'model' | 'market';
  description: string;
  impact: 'low' | 'medium' | 'high';
  mitigation: string;
}

// ========== AI建议 (需要验证) ==========
interface AISuggestions {
  // 参数调整建议
  parameters: {
    strategyId: StrategyId;
    coin: Coin;
    parameter: string;
    currentValue: number;
    suggestedValue: number;
    reasoning: string;
    confidence: number;
    expectedImpact: string;
    riskLevel: 'low' | 'medium' | 'high';
  }[];

  // 策略切换建议 (仅建议，不执行)
  strategySwitch: {
    from: StrategyId;
    to: StrategyId;
    reasoning: string;
    confidence: number;
    timing: string;           // 什么时候切换
  }[];

  // ❌ 禁止的建议
  // tradingDecisions?: never;    // AI不能直接建议交易
  // leverageChanges?: never;     // AI不能建议修改杠杆
  // stopLossChanges?: never;     // AI不能建议修改止损
}

// ========== AI预警 ==========
interface AIAlerts {
  alerts: {
    level: 'info' | 'warning' | 'danger' | 'critical';
    type: string;
    message: string;
    coin?: Coin;
    data?: any;
    action?: 'monitor' | 'pause' | 'emergency_stop';
    reasoning: string;
  }[];
}
```

### 2.2 AI输出限制

```typescript
// ========== AI硬性限制 ==========
interface AIConstraints {
  // 绝对禁止
  forbidden: {
    // ❌ 不能直接下单
    directTrading: false;

    // ❌ 不能建议具体交易
    tradingSuggestions: false;

    // ❌ 不能修改杠杆
    leverageChange: false;

    // ❌ 不能修改止损
    stopLossChange: false;

    // ❌ 不能覆盖风控规则
    overrideRiskRules: false;

    // ❌ 不能修改仓位限制
    overridePositionLimits: false;
  };

  // 需要验证的输出
  requiresValidation: {
    parameterSuggestions: true;    // 参数建议需要验证
    strategySwitch: true;          // 策略切换需要验证
  };

  // 允许的输出
  allowed: {
    marketAnalysis: true;          // 市场分析
    riskAssessment: true;          // 风险评估
    performanceAnalysis: true;     // 性能分析
    alerts: true;                  // 预警
    reports: true;                 // 报告
  };
}
```

### 2.3 AI输出验证流程

```
AI输出 → 格式检查 → 逻辑检查 → 风险检查 → 规则引擎验证 → 人类审核 → 执行
   ↓         ↓         ↓         ↓            ↓            ↓         ↓
 格式错误   逻辑错误  风险过高  违反规则     需要确认    驳回      执行
```

```typescript
// ========== 输出验证 ==========
interface OutputValidator {
  // 1. 格式验证
  validateFormat(output: AIOutput): ValidationResult;

  // 2. 逻辑验证
  validateLogic(output: AIOutput, input: AIInputData): ValidationResult;

  // 3. 风险验证
  validateRisk(output: AIOutput): ValidationResult;

  // 4. 规则验证
  validateRules(output: AIOutput): ValidationResult;

  // 5. 综合评分
  scoreOutput(output: AIOutput, input: AIInputData): OutputScore;
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

interface OutputScore {
  overall: number;              // 总分 0-100
  confidence: number;           // 置信度 0-1
  reliability: number;          // 可靠性 0-1
  riskLevel: 'low' | 'medium' | 'high';

  // 子评分
  breakdown: {
    analysis: number;
    reasoning: number;
    dataQuality: number;
    modelUncertainty: number;
  };

  // 建议
  recommendation: 'accept' | 'review' | 'reject';
}
```

---

## 三、AI限制协议

### 3.1 硬性边界

```typescript
// ========== 硬性边界定义 ==========
interface HardConstraints {
  // 杠杆限制
  leverage: {
    BTC: { min: 1; max: 5 };
    ETH: { min: 1; max: 3 };
    others: { min: 1; max: 1 };  // 其他币种只能现货
  };

  // 仓位限制
  position: {
    maxPerCoin: number;          // 单币种最大仓位比例
    maxTotal: number;            // 总仓位上限
    emergencyLimit: number;      // 紧急情况下仓位上限
  };

  // 风险限制
  risk: {
    maxDrawdown: number;         // 最大回撤
    stopLoss: number;            // 强制止损
    emergencyStop: number;       // 紧急停止
  };

  // 交易限制
  trading: {
    minOrderSize: number;        // 最小订单
    maxOrderSize: number;        // 最大订单
    maxOrdersPerDay: number;     // 每日最大订单数
    cooldownPeriod: number;      // 冷却期
  };

  // 币种限制
  coins: {
    allowed: Coin[];             // 允许的币种
    swapOnly: Coin[];            // 只能做现货的币种
  };
}

// ========== 边界检查器 ==========
interface ConstraintChecker {
  // 检查AI输出是否违反硬性边界
  checkConstraints(
    output: AIOutput,
    input: AIInputData
  ): ConstraintCheckResult;

  // 检查参数调整是否合法
  checkParameterChange(
    strategy: StrategyId,
    parameter: string,
    oldValue: number,
    newValue: number
  ): boolean;

  // 检查是否会爆仓
  checkLiquidationRisk(
    position: Position,
    priceChange: number
  ): LiquidationRisk;
}

interface ConstraintCheckResult {
  passed: boolean;
  violations: ConstraintViolation[];
}

interface ConstraintViolation {
  type: 'leverage' | 'position' | 'risk' | 'trading' | 'coin';
  severity: 'warning' | 'error' | 'critical';
  message: string;
  actualValue: number;
  allowedValue: number;
  action: 'modify' | 'reject' | 'emergency_stop';
}

interface LiquidationRisk {
  willLiquidate: boolean;
  priceThreshold: number;
  distance: number;              // 距离爆仓的价格变化
  timeframe: string;
  probability: number;
}
```

### 3.2 AI行为限制

```typescript
// ========== AI行为准则 ==========
interface AIBehaviorProtocol {
  // 必须遵守的原则
  principles: {
    // 1. 安全第一
    safetyFirst: boolean;

    // 2. 不做决策，只做分析
    noDirectDecisions: boolean;

    // 3. 可解释性
    explainable: boolean;

    // 4. 可审计
    auditable: boolean;

    // 5. 保守估计
    conservative: boolean;
  };

  // 禁止的行为
  prohibited: {
    // 不能隐瞒不确定性
    hideUncertainty: false;

    // 不能过度自信
    overconfident: false;

    // 不能忽略风险
    ignoreRisk: false;

    // 不能编造数据
    fabricateData: false;

    // 不能修改历史
    modifyHistory: false;
  };

  // 必须提供的信息
  required: {
    // 置信度
    confidence: true;

    // 不确定性说明
    uncertainties: true;

    // 推理过程
    reasoning: true;

    // 风险提示
    riskWarnings: true;

    // 替代方案
    alternatives: true;
  };
}
```

### 3.3 AI自我纠正机制

```typescript
// ========== AI自我纠正 ==========
interface AISelfCorrection {
  // 1. 输出检查
  selfCheck: {
    // 检查输出格式
    checkFormat: () => boolean;

    // 检查逻辑一致性
    checkConsistency: () => boolean;

    // 检查数据有效性
    checkDataValidity: () => boolean;

    // 检查是否超出边界
    checkBounds: () => boolean;
  };

  // 2. 纠正措施
  corrections: {
    // 修正明显错误
    fixErrors: () => void;

    // 标记不确定性
    flagUncertainty: () => void;

    // 降低过度自信
    adjustConfidence: () => void;

    // 添加风险提示
    addWarnings: () => void;
  };

  // 3. 纠正日志
  correctionLog: {
    timestamp: number;
    issue: string;
    correction: string;
    before: any;
    after: any;
  }[];
}

// ========== 纠正流程 ==========
interface SelfCorrectionProcess {
  // 步骤1: 生成输出
  generate: (input: AIInputData) => AIOutput;

  // 步骤2: 自我检查
  selfCheck: (output: AIOutput) => SelfCheckResult;

  // 步骤3: 修正问题
  correct: (output: AIOutput, issues: Issue[]) => AIOutput;

  // 步骤4: 标记不确定性
  flagUncertainty: (output: AIOutput) => AIOutput;

  // 步骤5: 最终验证
  finalValidation: (output: AIOutput) => ValidationResult;
}

interface SelfCheckResult {
  passed: boolean;
  issues: Issue[];
  confidence: number;
}

interface Issue {
  type: 'format' | 'logic' | 'data' | 'uncertainty' | 'risk';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  location: string;
  autoCorrectable: boolean;
}
```

---

## 四、AI学习协议

### 4.1 学习类型

```typescript
// ========== AI学习类型 ==========
interface AILearning {
  // 1. 监督学习 (从结果中学习)
  supervised: {
    // 从AI建议的结果中学习
    fromSuggestions: () => void;

    // 从市场反应中学习
    fromMarketReaction: () => void;

    // 从风险事件中学习
    fromRiskEvents: () => void;
  };

  // 2. 强化学习 (通过反馈学习)
  reinforcement: {
    // 正反馈强化
    positiveReinforcement: () => void;

    // 负反馈调整
    negativeAdjustment: () => void;

    // 奖励函数
    rewardFunction: (outcome: Outcome) => number;
  };

  // 3. 在线学习 (实时调整)
  online: {
    // 实时参数调整
    adjustParameters: () => void;

    // 实时模型更新
    updateModel: () => void;

    // 实时置信度校准
    calibrateConfidence: () => void;
  };
}
```

### 4.2 学习限制

```typescript
// ========== 学习限制 ==========
interface LearningConstraints {
  // 学习速率限制
  learningRate: {
    min: number;
    max: number;
    current: number;
  };

  // 学习范围限制
  learningScope: {
    // 可以学习的
    allowed: [
      'parameter_tuning',      // 参数调整
      'confidence_calibration', // 置信度校准
      'pattern_recognition',    // 模式识别
    ];

    // 不能学习的
    forbidden: [
      'risk_parameters',        // 风险参数
      'safety_limits',          // 安全限制
      'hard_constraints',       // 硬性边界
    ];
  };

  // 学习验证
  validation: {
    // A/B测试
    abTesting: boolean;

    // 回测验证
    backtestValidation: boolean;

    // 纸面交易
    paperTrading: boolean;
  };
}
```

### 4.3 学习反馈机制

```typescript
// ========== 学习反馈 ==========
interface LearningFeedback {
  // 反馈循环
  feedbackLoop: {
    // 1. AI做出建议
    makeSuggestion: () => AISuggestion;

    // 2. 规则引擎验证
    validate: (suggestion: AISuggestion) => ValidationResult;

    // 3. 人类审核 (可选)
    humanReview: (suggestion: AISuggestion) => ReviewResult;

    // 4. 执行或拒绝
    executeOrReject: (suggestion: AISuggestion) => ExecutionResult;

    // 5. 跟踪结果
    trackOutcome: (execution: ExecutionResult) => Outcome;

    // 6. 反馈给AI
    feedback: (outcome: Outcome) => Feedback;

    // 7. AI学习
    learn: (feedback: Feedback) => void;
  };

  // 反馈数据
  feedbackData: {
    suggestionId: string;
    timestamp: number;
    suggestion: AISuggestion;
    validation: ValidationResult;
    humanReview?: ReviewResult;
    execution: ExecutionResult;
    outcome: Outcome;
    feedback: Feedback;
  }[];
}

interface AISuggestion {
  id: string;
  type: 'parameter' | 'strategy' | 'alert';
  content: any;
  confidence: number;
  reasoning: string;
  uncertainties: string[];
}

interface ReviewResult {
  approved: boolean;
  reviewer: 'human' | 'auto';
  comments?: string;
  modifications?: any;
}

interface ExecutionResult {
  executed: boolean;
  timestamp: number;
  actualChanges?: any;
  rejectionReason?: string;
}

interface Outcome {
  success: boolean;
  timestamp: number;
  result: {
    performance: number;
    risk: number;
    stability: number;
  };
  unexpectedEvents?: string[];
}

interface Feedback {
  rating: 'positive' | 'neutral' | 'negative';
  score: number;              // -1 到 1
  lessons: string[];
  confidenceAdjustment: number;
}
```

### 4.4 学习效果评估

```typescript
// ========== 学习效果评估 ==========
interface LearningEvaluation {
  // 评估指标
  metrics: {
    // AI建议准确性
    suggestionAccuracy: {
      total: number;
      adopted: number;
      successful: number;
      accuracy: number;
    };

    // AI置信度校准
    confidenceCalibration: {
      expectedAccuracy: Map<number, number>;  // 置信度 -> 实际准确率
      calibrationError: number;
      wellCalibrated: boolean;
    };

    // 学习效果
    learningProgress: {
      overTime: {
        timestamp: number;
        accuracy: number;
        confidence: number;
      }[];
      trend: 'improving' | 'stable' | 'degrading';
    };
  };

  // 定期评估
  periodicEvaluation: {
    daily: EvaluationResult;
    weekly: EvaluationResult;
    monthly: EvaluationResult;
  };

  // 学习报告
  generateReport: () => LearningReport;
}

interface EvaluationResult {
  period: string;
  startTime: number;
  endTime: number;

  // 建议统计
  suggestions: {
    total: number;
    adopted: number;
    rejected: number;
    successRate: number;
  };

  // 性能对比
  performance: {
    withAI: number;
    withoutAI: number;
    improvement: number;
  };

  // 风险对比
  risk: {
    withAI: number;
    withoutAI: number;
    change: number;
  };

  // 建议
  recommendation: 'continue' | 'pause' | 'rollback' | 'retrain';
}

interface LearningReport {
  summary: string;
  metrics: LearningEvaluation['metrics'];
  recommendations: string[];
  concerns: string[];
  nextSteps: string[];
}
```

---

## 五、完整AI交互流程

### 5.1 交互流程图

```
┌─────────────────────────────────────────────────────────────────┐
│                    AI交互完整流程                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐                                                │
│  │  数据收集层   │                                                │
│  │              │   L1: 原始数据 (实时)                           │
│  │              │   L2: 特征数据 (实时计算)                       │
│  │              │   L3: 状态数据 (实时)                           │
│  │              │   L4: 历史数据 (聚合)                           │
│  └──────┬───────┘                                                │
│         │                                                        │
│         ▼                                                        │
│  ┌──────────────┐                                                │
│  │  数据预处理   │   - 数据清洗                                   │
│  │              │   - 特征工程                                   │
│  │              │   - 格式转换                                   │
│  └──────┬───────┘                                                │
│         │                                                        │
│         ▼                                                        │
│  ┌──────────────┐                                                │
│  │  AI推理引擎  │   - 接收标准化输入                              │
│  │              │   - 执行分析                                   │
│  │              │   - 生成输出                                   │
│  └──────┬───────┘                                                │
│         │                                                        │
│         ▼                                                        │
│  ┌──────────────┐                                                │
│  │  AI自我纠正  │   - 格式检查                                   │
│  │              │   - 逻辑检查                                   │
│  │              │   - 标记不确定性                               │
│  └──────┬───────┘                                                │
│         │                                                        │
│         ▼                                                        │
│  ┌──────────────┐                                                │
│  │  输出验证器   │   - 格式验证                                   │
│  │              │   - 逻辑验证                                   │
│  │              │   - 风险验证                                   │
│  │              │   - 规则验证                                   │
│  └──────┬───────┘                                                │
│         │                                                        │
│         ├─────────────┐                                          │
│         │             │                                          │
│         ▼             ▼                                          │
│  ┌───────────┐  ┌─────────────┐                                  │
│  │  通过验证  │  │  验证失败    │                                  │
│  └─────┬─────┘  └──────┬──────┘                                  │
│        │               │                                         │
│        ▼               ▼                                         │
│  ┌───────────┐  ┌─────────────┐                                  │
│  │ 规则引擎   │  │  记录错误    │                                  │
│  │ 处理建议   │  │  请求修正    │                                  │
│  └─────┬─────┘  └─────────────┘                                  │
│        │                                                         │
│        ├─────────────┐                                           │
│        │             │                                           │
│        ▼             ▼                                           │
│  ┌───────────┐  ┌─────────────┐                                  │
│  │ 参数调整   │  │  仅分析报告  │                                  │
│  │ (需验证)   │  │  (直接使用)   │                                  │
│  └─────┬─────┘  └──────┬──────┘                                  │
│        │               │                                         │
│        ▼               │                                         │
│  ┌───────────┐          │                                         │
│  │ 人类审核   │          │                                         │
│  │ (可选)    │          │                                         │
│  └─────┬─────┘          │                                         │
│        │               │                                         │
│        ├───────────────┤                                         │
│        │               │                                         │
│        ▼               ▼                                         │
│  ┌─────────────────────────────┐                                 │
│  │          执行层              │                                 │
│  │  - 应用参数调整              │                                 │
│  │  - 记录决策日志              │                                 │
│  │  - 更新策略状态              │                                 │
│  └──────────┬──────────────────┘                                 │
│             │                                                    │
│             ▼                                                    │
│  ┌─────────────────────────────┐                                 │
│  │          反馈循环            │                                 │
│  │  - 跟踪执行结果              │                                 │
│  │  - 评估AI建议准确性          │                                 │
│  │  - 更新学习历史              │                                 │
│  │  - 调整AI模型                │                                 │
│  └─────────────────────────────┘                                 │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 5.2 代码示例

```typescript
// ========== AI交互主控制器 ==========
class AIInteractionController {
  private aiEngine: AIEngine;
  private validator: OutputValidator;
  private ruleEngine: RuleEngine;
  private feedbackLoop: LearningFeedback;

  // 主循环
  async process(input: AIInputData): Promise<ProcessingResult> {
    // 1. 数据预处理
    const processed = this.preprocess(input);

    // 2. AI推理
    let aiOutput = await this.aiEngine.analyze(processed);

    // 3. AI自我纠正
    aiOutput = await this.aiEngine.selfCorrect(aiOutput);

    // 4. 输出验证
    const validation = await this.validator.validateAll(aiOutput, processed);

    if (!validation.passed) {
      // 验证失败，请求修正
      return {
        status: 'validation_failed',
        errors: validation.errors,
        requiresCorrection: true
      };
    }

    // 5. 规则引擎处理
    const ruleResult = await this.ruleEngine.process(aiOutput);

    // 6. 人类审核 (如果需要)
    if (ruleResult.requiresHumanReview) {
      const review = await this.requestHumanReview(ruleResult);
      if (!review.approved) {
        return { status: 'rejected', reason: review.reason };
      }
    }

    // 7. 执行
    const execution = await this.execute(ruleResult);

    // 8. 反馈
    await this.feedbackLoop.record({
      input: processed,
      aiOutput,
      validation,
      ruleResult,
      execution
    });

    return {
      status: 'success',
      execution,
      aiOutput
    };
  }

  // 反馈循环
  async feedbackLoop(
    suggestionId: string,
    outcome: Outcome
  ): Promise<void> {
    const feedback = this.generateFeedback(outcome);
    await this.aiEngine.learn(feedback);
    await this.evaluateLearning();
  }

  // 学习评估
  async evaluateLearning(): Promise<LearningReport> {
    const metrics = await this.collectLearningMetrics();
    return this.generateLearningReport(metrics);
  }
}

// ========== 使用示例 ==========
// 初始化
const controller = new AIInteractionController({
  aiEngine: new AIEngine(),
  validator: new OutputValidator(),
  ruleEngine: new RuleEngine(),
  feedbackLoop: new LearningFeedback()
});

// 每次市场更新时
setInterval(async () => {
  // 收集数据
  const inputData = await collectMarketData();

  // AI处理
  const result = await controller.process(inputData);

  if (result.status === 'success') {
    console.log('AI分析完成:', result.aiOutput.analysis);

    // 如果有参数建议
    if (result.aiOutput.suggestions?.parameters) {
      console.log('参数建议:', result.aiOutput.suggestions.parameters);
    }
  }
}, 60000); // 每分钟
```

---

## 六、实施建议

### 6.1 分阶段实施

| 阶段 | 目标 | 功能 | 风险 |
|------|------|------|------|
| **Phase 1** | 数据收集 | 实现完整的数据输入规范 | 低 |
| **Phase 2** | AI分析 | 实现AI分析功能，仅输出 | 低 |
| **Phase 3** | 输出验证 | 实现多层验证机制 | 中 |
| **Phase 4** | 参数建议 | 实现参数调整建议，需验证 | 中 |
| **Phase 5** | 学习反馈 | 实现反馈循环 | 高 |
| **Phase 6** | 自动优化 | 在严格约束下自动优化 | 极高 |

### 6.2 安全措施

1. **多层验证**
   - AI自我纠正
   - 输出验证器
   - 规则引擎
   - 人类审核

2. **硬性边界**
   - 杠杆上限
   - 仓位限制
   - 风险限制
   - 熔断机制

3. **可审计性**
   - 完整日志
   - 决策追溯
   - 性能评估
   - 学习报告

4. **回滚机制**
   - 参数版本控制
   - 快速回滚
   - A/B测试
   - 纸面交易

### 6.3 监控指标

```typescript
// ========== 关键监控指标 ==========
interface MonitoringMetrics {
  // AI性能
  ai: {
    suggestionAccuracy: number;      // 建议准确率
    confidenceCalibration: number;    // 置信度校准
    learningProgress: number;         // 学习进度
  };

  // 系统性能
  system: {
    processingLatency: number;        // 处理延迟
    validationPassRate: number;       // 验证通过率
    errorRate: number;                // 错误率
  };

  // 交易性能
  trading: {
    totalReturn: number;              // 总收益
    sharpeRatio: number;              // 夏普比率
    maxDrawdown: number;              // 最大回撤
    winRate: number;                  // 胜率
  };

  // 风险指标
  risk: {
    currentRiskLevel: number;         // 当前风险等级
    liquidationRisk: number;          // 爆仓风险
    drawdown: number;                 // 当前回撤
  };
}
```

---

## 七、总结

这个AI架构设计遵循以下原则：

1. **安全第一**：多层验证，硬性边界
2. **AI定位清晰**：副驾驶，不是驾驶员
3. **可解释性**：所有输出都有推理过程
4. **可审计性**：完整的日志和追溯
5. **持续学习**：从反馈中学习，但有严格限制
6. **渐进实施**：分阶段，每阶段可独立验证

**关键点**：
- AI不能直接下单
- AI只能建议参数调整，需要验证
- 所有AI输出都必须经过多层验证
- 学习必须在严格约束下进行
- 保留人类最终决策权
