# AI量化交易系统实现方案 V2 - 成本优化版

## 核心设计理念

### 资金分配策略

| 资金类型 | 比例 | 策略主导 | AI角色 | 理由 |
|---------|------|---------|--------|------|
| **现货交易** | 40% | **AI主导+规则辅助** | 决策者 | 无爆仓风险，AI可安全决策 |
| **合约交易** | 60% | **规则主导** | 监控者 | 爆仓风险高，规则更可靠 |

### AI调用策略

```
┌─────────────────────────────────────────────────────────────────┐
│                    AI调用触发机制                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  现货交易 (40%资金) - AI主导70% + 规则辅助30%                    │
│  ├─ 市场扫描         → 每90秒 (960次/天)   ← 快速响应市场变化    │
│  ├─ 交易决策         → 每90秒 (960次/天)   ← 基于扫描做决策      │
│  ├─ 性能报告         → 每6小时 (4次/天)    ← 评估策略表现        │
│  ├─ 深度分析         → 每天1次 (1次/天)    ← 全面复盘            │
│  └─ 异常分析         → 按需触发 (不限次数)  ← 紧急情况            │
│                                                                  │
│  合约交易 (60%资金) - 规则主导100%                               │
│  ├─ 规则引擎运行      → 实时 (持续运行)                          │
│  ├─ 性能报告         → 每天1次 (1次/天)                          │
│  └─ 异常分析         → 按需触发 (不限次数)                        │
│                                                                  │
│  禁止触发                                                          │
│  ├─ 合约策略实时决策 → 规则引擎更快更可靠                        │
│  └─ 合约参数自动修改 → 爆仓风险，禁止AI直接干预                 │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**设计理念**：
- 参数是策略的核心，应该**稳定不变**
- AI不应该频繁建议修改参数，而是用固定的参数适应市场
- 删除"参数建议"和"参数优化"，改为"性能报告"和"深度分析"

### AI调用统计（使用GLM-4.7）

| 策略 | 调用频率 | 次数/天 | 次数/月 | 说明 |
|------|---------|---------|---------|------|
| **现货市场扫描** | 每90秒 | 960 | 28,800 | 快速响应市场 |
| **现货交易决策** | 每90秒 | 960 | 28,800 | 基于扫描做决策 |
| **现货性能报告** | 每6小时 | 4 | 120 | 评估策略表现 |
| **现货深度分析** | 每天1次 | 1 | 30 | 全面复盘 |
| **现货异常分析** | 按需 | ~10 | ~300 | 紧急情况 |
| **合约性能报告** | 每天1次 | 1 | 30 | 监控规则策略 |
| **合约异常分析** | 按需 | ~5 | ~150 | 紧急情况 |
| **总计** | - | **~1,941** | **~58,230** |

**模型**：GLM-4.7（无需计算具体金额，按实际使用付费）

**结论**：现货高频响应，合约纯规则安全

---

## 一、现货AI+规则策略（40%资金）

### 1.1 策略架构

```
┌─────────────────────────────────────────────────────────────────┐
│                    现货AI+规则混合策略                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  AI决策层 (主导70%，多频率调用)                                  │
│  ├─ 市场扫描(90秒)    → 快速扫描市场，识别机会                   │
│  ├─ 交易决策(90秒)    → 基于扫描结果做交易决策                   │
│  ├─ 性能报告(6小时)   → 评估策略表现，调整权重                   │
│  ├─ 深度分析(每天)    → 全面复盘，总结经验                       │
│  └─ 异常分析(按需)    → 市场异常情况分析                         │
│                                                                  │
│  规则引擎层 (辅助30%，持续运行)                                  │
│  ├─ DCA规则           → 价格跌幅>3%自动买入                      │
│  ├─ 网格规则           → 价格触及网格线自动交易                   │
│  ├─ 风险控制          → 实时监控回撤、仓位                        │
│  └─ 安全熔断          → 触发条件时强制暂停                       │
│                                                                  │
│  协调层 (AI与规则协作)                                           │
│  ├─ AI建议权重       → 70% (AI主导)                             │
│  ├─ 规则建议权重      → 30% (规则辅助)                           │
│  ├─ 规则否决权         → 规则检测到危险时可否决AI                 │
│  ├─ 冲突解决           → 规则优先于安全，AI优先于优化             │
│  └─ 最终决策           → AI×0.7 + 规则×0.3 → 协调器 → 执行        │
│                                                                  │
│  安全验证层 (硬性限制)                                            │
│  ├─ 资金限制          → 单币种≤30%                               │
│  ├─ 交易限制          → 单笔≤$500，日交易≤20笔                   │
│  ├─ 冷却期            → 同一币种间隔≥30分钟                      │
│  └─ 熔断机制          → 日亏损>5%暂停                             │
│                                                                  │
│  执行层                                                           │
│  ├─ 订单执行          → 自动下单到OKX                            │
│  ├─ 状态跟踪          → 订单状态、持仓更新                       │
│  └─ 日志记录          → 完整的决策和执行日志                     │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 1.2 AI与规则协作流程

```
┌─────────────┐      每90秒       ┌─────────────┐
│  AI市场扫描  │  ──────────────> │  规则引擎   │
│ (快速扫描)    │                  │ (实时监控)   │
└──────┬──────┘                  └──────┬──────┘
       │                                │
       │ 市场数据                       │ 规则信号
       ▼                                ▼
┌─────────────┐                  ┌─────────────┐
│ AI交易决策  │ <─────────────> │  协调器     │
│ (综合判断)    │                  │  (权重融合)  │
└─────────────┘                  └──────┬──────┘
                                          │
                          ┌───────────────┼───────────────┐
                          │               │               │
                          ▼               ▼               ▼
                    ┌──────────┐   ┌──────────┐   ┌──────────┐
                    │  执行层   │   │ 安全验证 │   │ 日志记录 │
                    │ 下单OKX  │   │ 硬限制   │   │ 完整追踪 │
                    └──────────┘   └──────────┘   └──────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                    定期AI任务                                      │
├─────────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐               │
│  │ 性能报告     │    │ 深度分析     │    │ 异常分析     │               │
│  │ (6小时)      │    │ (每天)       │    │ (按需)       │               │
│  │ 评估表现     │    │ 全面复盘     │    │ 紧急情况     │               │
│  └─────────────┘    └─────────────┘    └─────────────┘               │
└─────────────────────────────────────────────────────────────────────┘
```

**关键区别**：
- **市场扫描** (90秒)：只看数据，不做决策，轻量级
- **交易决策** (90秒)：基于扫描+规则，做实际交易决策
- **性能报告** (6小时)：评估策略效果，调整AI/规则权重
- **深度分析** (每天)：全面复盘，识别模式，总结经验

### 1.3 协调器实现

```typescript
// src/ai/spot-strategy/spot-coordinator.ts

/**
 * 现货AI+规则协调器
 * 市场90秒扫描 + 90秒交易决策，实现快速响应
 */
export class SpotCoordinator {
  private aiClient: AIClient;
  private ruleEngine: SpotRuleEngine;
  private safetyValidator: SpotSafetyValidator;
  private logger;

  // 配置
  private config = {
    aiWeight: 0.7,              // AI权重70%
    ruleWeight: 0.3,            // 规则权重30%
    scanInterval: 90000,        // 90秒市场扫描
    decisionInterval: 90000,    // 90秒交易决策
    reportInterval: 21600000,   // 6小时性能报告
    deepAnalysisInterval: 86400000, // 24小时深度分析
    maxDailyTrades: 20,         // 每日最大20笔
    cooldownPeriod: 1800000     // 30分钟冷却
  };

  // 状态
  private isRunning = false;
  private tradeHistory = new Map<string, number>();
  private latestMarketData: MarketScanResult | null = null;

  constructor(config: SpotCoordinatorConfig) {
    this.aiClient = config.aiClient;
    this.ruleEngine = new SpotRuleEngine({
      dcaThreshold: 3,          // 跌幅3%触发DCA
      gridSpacing: 2,           // 网格间距2%
      gridCount: 15             // 15个网格
    });
    this.safetyValidator = new SpotSafetyValidator({
      maxCoinPosition: 30,
      maxOrderSize: 500,
      maxDailyTrades: 20,
      cooldownPeriod: 1800000,
      dailyLossLimit: 5
    });
    this.logger = config.logger;
  }

  /**
   * 启动协调器
   */
  async start(): Promise<void> {
    this.logger.info('启动现货AI+规则协调器');
    this.isRunning = true;

    // 立即执行一次扫描
    await this.runMarketScan();

    // 每90秒执行市场扫描（轻量级）
    setInterval(async () => {
      if (this.isRunning) {
        await this.runMarketScan();
      }
    }, this.config.scanInterval);

    // 每90秒执行交易决策（基于扫描数据）
    setInterval(async () => {
      if (this.isRunning) {
        await this.runTradingDecision();
      }
    }, this.config.decisionInterval);

    // 每6小时生成性能报告
    setInterval(async () => {
      if (this.isRunning) {
        await this.runPerformanceReport();
      }
    }, this.config.reportInterval);

    // 每24小时执行深度分析
    setInterval(async () => {
      if (this.isRunning) {
        await this.runDeepAnalysis();
      }
    }, this.config.deepAnalysisInterval);

    this.logger.info('协调器已启动', {
      marketScan: '90秒',
      tradingDecision: '90秒',
      performanceReport: '6小时',
      deepAnalysis: '24小时',
      aiWeight: '70%',
      ruleWeight: '30%'
    });
  }

  /**
   * 市场扫描（90秒，轻量级）
   * 只收集数据，不做决策
   */
  private async runMarketScan(): Promise<void> {
    const startTime = Date.now();

    try {
      const scanResult = await this.aiClient.scanMarket({
        coins: ['BNB', 'SOL', 'XRP', 'ADA', 'DOGE'],
        focus: 'price_action',  // 只看价格行为，不分析
        maxTokens: 1000  // 限制token使用
      });

      this.latestMarketData = scanResult;

      const duration = Date.now() - startTime;
      this.logger.debug('市场扫描完成', {
        duration: `${duration}ms`,
        opportunities: scanResult.opportunities?.length || 0
      });

    } catch (error) {
      this.logger.error('市场扫描失败', error);
    }
  }

  /**
   * 交易决策（90秒，基于扫描数据）
   * 使用扫描数据 + 规则引擎做决策
   */
  private async runTradingDecision(): Promise<void> {
    const startTime = Date.now();

    try {
      // 1. 如果没有扫描数据，先扫描
      if (!this.latestMarketData) {
        await this.runMarketScan();
      }

      // 2. AI基于扫描数据做决策
      const aiDecision = await this.aiClient.makeTradingDecision({
        marketScan: this.latestMarketData,
        currentPositions: await this.getCurrentPositions(),
        recentPerformance: await this.getRecentPerformance()
      });

      // 3. 规则引擎分析
      const ruleSignals = await this.ruleEngine.analyze();

      // 4. 协调决策
      const finalDecision = await this.coordinate(aiDecision, ruleSignals);

      // 5. 执行决策
      if (finalDecision.shouldTrade) {
        await this.executeDecision(finalDecision);
      }

      const duration = Date.now() - startTime;
      this.logger.info('交易决策周期完成', {
        duration: `${duration}ms`,
        decision: finalDecision.action,
        confidence: finalDecision.confidence
      });

    } catch (error) {
      this.logger.error('交易决策周期失败', error);
    }
  }

  /**
   * 性能报告（6小时）
   * 评估策略表现，可选调整权重
   */
  private async runPerformanceReport(): Promise<void> {
    try {
      const performance = await this.getPerformanceData();
      const report = await this.aiClient.generatePerformanceReport(performance);

      this.logger.info('性能报告', report);

      // 根据表现可选调整AI/规则权重
      if (report.aiWinRate > 0.6 && report.aiProfitFactor > 1.5) {
        this.config.aiWeight = Math.min(0.8, this.config.aiWeight + 0.05);
        this.config.ruleWeight = 1 - this.config.aiWeight;
        this.logger.info('提高AI权重', { newWeight: this.config.aiWeight });
      } else if (report.aiWinRate < 0.4) {
        this.config.aiWeight = Math.max(0.6, this.config.aiWeight - 0.05);
        this.config.ruleWeight = 1 - this.config.aiWeight;
        this.logger.info('降低AI权重', { newWeight: this.config.aiWeight });
      }

      await this.saveReport(report);
    } catch (error) {
      this.logger.error('性能报告失败', error);
    }
  }

  /**
   * 深度分析（24小时）
   * 全面复盘，识别模式，总结经验
   */
  private async runDeepAnalysis(): Promise<void> {
    try {
      const analysis = await this.aiClient.performDeepAnalysis({
        timeRange: '24h',
        includeAllCoins: true,
        focus: 'pattern_recognition',
        fullHistory: true
      });

      this.logger.info('深度分析完成', {
        patternsFound: analysis.patterns?.length || 0,
        recommendations: analysis.recommendations?.length || 0
      });

      // 保存分析结果供学习
      await this.saveAnalysis(analysis);

    } catch (error) {
      this.logger.error('深度分析失败', error);
    }
  }

  /**
   * 异常分析（按需触发）
   */
  async runAnomalyAnalysis(anomaly: AnomalyEvent): Promise<void> {
    this.logger.warn('检测到异常，触发分析', anomaly);

    try {
      const analysis = await this.aiClient.analyzeAnomaly({
        anomaly,
        marketState: await this.collectMarketData(),
        positions: await this.getCurrentPositions()
      });

      this.logger.info('异常分析结果', {
        severity: analysis.severity,
        action: analysis.recommendedAction
      });

      if (analysis.severity === 'critical') {
        this.logger.error('严重异常，需要人工介入', analysis);
      }
    } catch (error) {
      this.logger.error('异常分析失败', error);
    }
  }

  /**
   * 收集市场数据（精简版，控制token）
   */
  private async collectMarketData(): Promise<SpotMarketData> {
    const coins = ['BNB', 'SOL', 'XRP', 'ADA', 'DOGE'];
    const result = { timestamp: Date.now(), coins: [] };

    for (const coin of coins) {
      const summary = await this.getCoinSummary(coin);
      result.coins.push(summary);
    }

    return result;
  }

  /**
   * 获取币种摘要
   */
  private async getCoinSummary(coin: string): Promise<any> {
    const instId = `${coin}-USDT`;
    const ticker = await this.restClient.getTicker(instId);
    const candles = await this.restClient.getCandles({
      instId,
      bar: '1H',
      limit: 24
    });

    const closes = candles.map(c => c.close);
    const currentPrice = parseFloat(ticker.last);

    // 简化计算
    const change24h = parseFloat(ticker.changePercent24h);
    const volatility = this.calculateVolatility(candles);
    const trend = this.classifyTrend(closes);

    // 获取持仓
    const balance = await this.restClient.getBalance(coin);
    const position = balance ? parseFloat(balance.bal) : 0;
    const avgCost = balance ? parseFloat(balance.avgPx || '0') : 0;

    return {
      coin,
      price: currentPrice,
      change24h,
      volatility,
      trend,
      position,
      avgCost,
      unrealizedPnL: position > 0 ? (currentPrice - avgCost) * position : 0
    };
  }

  /**
   * 协调AI和规则的决策
   */
  private async coordinate(
    aiRec: AIRecommendation,
    ruleSignals: RuleSignals
  ): Promise<FinalDecision> {
    // 1. 检查规则否决条件
    const veto = await this.checkRuleVeto(ruleSignals);
    if (veto.shouldVeto) {
      this.logger.info('规则否决AI建议', { reason: veto.reason });
      return {
        shouldTrade: false,
        action: 'hold',
        reason: veto.reason,
        confidence: 0.9,
        source: 'rule_veto'
      };
    }

    // 2. 计算综合得分
    const scores = this.calculateScores(aiRec, ruleSignals);

    // 3. 选择最佳行动
    const decision = this.selectBestAction(scores);

    // 4. 应用安全验证
    const safetyCheck = await this.safetyValidator.validate(decision);
    if (!safetyCheck.safe) {
      this.logger.warn('决策未通过安全验证', {
        reasons: safetyCheck.reasons
      });
      return {
        shouldTrade: false,
        action: 'hold',
        reason: '安全验证失败',
        confidence: 1.0,
        source: 'safety'
      };
    }

    return decision;
  }

  /**
   * 检查规则否决条件
   */
  private async checkRuleVeto(signals: RuleSignals): Promise<{
    shouldVeto: boolean;
    reason?: string;
  }> {
    // 1. 回撤检查
    if (signals.currentDrawdown > 5) {
      return {
        shouldVeto: true,
        reason: `回撤${signals.currentDrawdown.toFixed(1)}%超过5%阈值`
      };
    }

    // 2. 仓位检查
    if (signals.totalPositionPercent > 90) {
      return {
        shouldVeto: true,
        reason: `总仓位${signals.totalPositionPercent}%接近上限`
      };
    }

    // 3. 冷却期检查
    for (const [coin, lastTime] of this.tradeHistory) {
      if (Date.now() - lastTime < this.config.cooldownPeriod) {
        const coinSignals = signals.coinSignals.get(coin);
        if (coinSignals && coinSignals.wantTrade) {
          return {
            shouldVeto: true,
            reason: `${coin}在冷却期内`
          };
        }
      }
    }

    return { shouldVeto: false };
  }

  /**
   * 计算综合得分
   */
  private calculateScores(
    aiRec: AIRecommendation,
    ruleSignals: RuleSignals
  ): Map<string, ActionScore> {
    const scores = new Map();

    for (const coinData of aiRec.marketAnalysis.coins) {
      const coin = coinData.coin;

      // AI得分
      const aiScore = this.calculateAIScore(coinData, aiRec);

      // 规则得分
      const ruleScore = this.calculateRuleScore(coin, ruleSignals);

      // 综合得分
      const combinedScore = aiScore * this.config.aiWeight +
                          ruleScore * this.config.ruleWeight;

      scores.set(coin, {
        coin,
        aiScore,
        ruleScore,
        combinedScore,
        action: this.selectActionForScore(combinedScore),
        confidence: Math.abs(combinedScore)
      });
    }

    return scores;
  }

  /**
   * 计算AI得分
   */
  private calculateAIScore(coinData: any, aiRec: AIRecommendation): number {
    let score = 0;

    // 1. 趋势得分
    if (coinData.trend === 'uptrend') score += 0.3;
    else if (coinData.trend === 'downtrend') score -= 0.3;

    // 2. 变化得分
    if (coinData.change24h > 5) score += 0.2;
    else if (coinData.change24h < -5) score -= 0.2;
    else if (coinData.change24h < -3) score += 0.1;  // DCA机会

    // 3. AI建议
    const aiSuggestion = aiRec.suggestedActions.find(a => a.coin === coinData.coin);
    if (aiSuggestion) {
      if (aiSuggestion.action === 'buy') score += 0.3;
      else if (aiSuggestion.action === 'sell') score -= 0.3;
    }

    // 归一化到[-1, 1]
    return Math.max(-1, Math.min(1, score));
  }

  /**
   * 计算规则得分
   */
  private calculateRuleScore(coin: string, signals: RuleSignals): number {
    const coinSignals = signals.coinSignals.get(coin);
    if (!coinSignals) return 0;

    let score = 0;

    // 1. DCA信号（强买入）
    if (coinSignals.dcaTrigger) score += 0.4;

    // 2. 网格信号
    if (coinSignals.gridBuy) score += 0.2;
    if (coinSignals.gridSell) score -= 0.2;

    // 3. 趋势信号
    if (coinSignals.trend === 'uptrend') score += 0.2;
    else if (coinSignals.trend === 'downtrend') score -= 0.2;

    // 归一化到[-1, 1]
    return Math.max(-1, Math.min(1, score));
  }

  /**
   * 选择最佳行动
   */
  private selectBestAction(scores: Map<string, ActionScore>): FinalDecision {
    let bestScore: ActionScore | null = null;

    for (const score of scores.values()) {
      if (!bestScore || score.combinedScore > bestScore.combinedScore) {
        bestScore = score;
      }
    }

    if (!bestScore || Math.abs(bestScore.combinedScore) < 0.3) {
      return {
        shouldTrade: false,
        action: 'hold',
        reason: '市场信号不强',
        confidence: 0.7,
        source: 'coordinator'
      };
    }

    const action: 'buy' | 'sell' = bestScore.combinedScore > 0 ? 'buy' : 'sell';
    const size = action === 'buy' ? 50 : 50;  // 固定大小，简化

    return {
      shouldTrade: true,
      action,
      coin: bestScore.coin,
      size,
      price: 0,  // 市价单
      confidence: Math.abs(bestScore.combinedScore),
      reason: `AI+规则综合${action === 'buy' ? '买入' : '卖出'}信号 (${bestScore.coin})`,
      source: 'coordinator',
      aiScore: bestScore.aiScore,
      ruleScore: bestScore.ruleScore
    };
  }

  /**
   * 执行决策
   */
  private async executeDecision(decision: FinalDecision): Promise<void> {
    this.logger.info('执行交易', {
      action: decision.action,
      coin: decision.coin,
      size: decision.size,
      confidence: decision.confidence
    });

    try {
      const instId = `${decision.coin}-USDT`;

      const result = await this.restClient.placeOrder({
        instId,
        tdMode: 'cash',
        side: decision.action,
        ordType: 'market',
        sz: decision.size.toString()
      });

      this.tradeHistory.set(decision.coin, Date.now());

      this.logger.info('订单已执行', {
        orderId: result.ordId,
        action: decision.action,
        coin: decision.coin
      });

    } catch (error) {
      this.logger.error('订单执行失败', error);
    }
  }

  /**
   * 辅助方法
   */
  private calculateVolatility(candles: any[]): number {
    if (candles.length < 2) return 0;
    const returns = [];
    for (let i = 1; i < candles.length; i++) {
      returns.push((candles[i].close - candles[i - 1].close) / candles[i - 1].close);
    }
    const std = Math.sqrt(returns.reduce((a, b) => a + b * b, 0) / returns.length);
    return std * 100;
  }

  private classifyTrend(candles: any[]): string {
    const closes = candles.map(c => c.close);
    const avg = closes.reduce((a, b) => a + b, 0) / closes.length;
    const current = closes[closes.length - 1];

    if (current > avg * 1.02) return 'uptrend';
    if (current < avg * 0.98) return 'downtrend';
    return 'sideways';
  }

  private selectActionForScore(score: number): 'buy' | 'sell' | 'hold' {
    if (score > 0.3) return 'buy';
    if (score < -0.3) return 'sell';
    return 'hold';
  }

  async stop(): Promise<void> {
    this.isRunning = false;
    this.logger.info('协调器已停止');
  }

  // ============ 辅助方法 ============

  private async collectMarketData(): Promise<any> {
    // 收集市场数据（供异常分析等使用）
    return {};
  }

  private async getCurrentPositions(): Promise<any> {
    // 获取当前持仓
    return {};
  }

  private async getRecentPerformance(): Promise<any> {
    // 获取最近表现
    return {};
  }

  private async getPerformanceData(): Promise<any> {
    // 从数据库获取性能数据
    return {};
  }

  private async saveReport(report: any): Promise<void> {
    // 保存报告到数据库
  }

  private async saveAnalysis(analysis: any): Promise<void> {
    // 保存分析结果到数据库
  }
}

// ============ 规则引擎 ============

class SpotRuleEngine {
  private config: any;

  constructor(config: any) {
    this.config = config;
  }

  async analyze(): Promise<RuleSignals> {
    const coinSignals = new Map();

    for (const coin of ['BNB', 'SOL', 'XRP', 'ADA', 'DOGE']) {
      const signal = await this.analyzeCoin(coin);
      coinSignals.set(coin, signal);
    }

    return {
      coinSignals,
      currentDrawdown: await this.calculateDrawdown(),
      totalPositionPercent: await this.calculateTotalPosition()
    };
  }

  private async analyzeCoin(coin: string): Promise<CoinRuleSignals> {
    const instId = `${coin}-USDT`;
    const candles = await this.restClient.getCandles({
      instId,
      bar: '1H',
      limit: 24
    });

    const closes = candles.map(c => c.close);
    const current = closes[closes.length - 1];
    const avg = closes.reduce((a, b) => a + b, 0) / closes.length;

    // DCA触发
    const change = (current - avg) / avg * 100;
    const dcaTrigger = change < -this.config.dcaThreshold;

    // 网格触发
    const gridBuy = change < -this.config.gridSpacing;
    const gridSell = change > this.config.gridSpacing;

    // 趋势
    let trend = 'sideways';
    if (current > avg * 1.02) trend = 'uptrend';
    else if (current < avg * 0.98) trend = 'downtrend';

    return {
      dcaTrigger,
      gridBuy,
      gridSell,
      trend,
      wantTrade: dcaTrigger || gridBuy || gridSell
    };
  }

  private async calculateDrawdown(): Promise<number> {
    // TODO: 从数据库计算
    return 0;
  }

  private async calculateTotalPosition(): Promise<number> {
    // TODO: 计算总仓位百分比
    return 0;
  }
}

// ============ 安全验证器 ============

class SpotSafetyValidator {
  private limits: any;

  constructor(limits: any) {
    this.limits = limits;
  }

  async validate(decision: FinalDecision): Promise<{
    safe: boolean;
    reasons: string[];
  }> {
    const reasons: string[] = [];

    if (decision.size > this.limits.maxOrderSize) {
      reasons.push(`订单大小$${decision.size}超过限制$${this.limits.maxOrderSize}`);
    }

    return {
      safe: reasons.length === 0,
      reasons
    };
  }
}

// ============ 类型定义 ============

interface SpotCoordinatorConfig {
  aiClient: AIClient;
  restClient: any;
  logger: any;
}

interface AIRecommendation {
  marketAnalysis: any;
  coinScores: Map<string, number>;
  suggestedActions: any[];
  confidence: number;
  reasoning: string;
}

interface RuleSignals {
  coinSignals: Map<string, CoinRuleSignals>;
  currentDrawdown: number;
  totalPositionPercent: number;
}

interface CoinRuleSignals {
  dcaTrigger: boolean;
  gridBuy: boolean;
  gridSell: boolean;
  trend: string;
  wantTrade: boolean;
}

interface ActionScore {
  coin: string;
  aiScore: number;
  ruleScore: number;
  combinedScore: number;
  action: 'buy' | 'sell' | 'hold';
  confidence: number;
}

interface FinalDecision {
  shouldTrade: boolean;
  action: 'buy' | 'sell' | 'hold';
  coin?: string;
  size?: number;
  price?: number;
  confidence: number;
  reason: string;
  source: 'coordinator' | 'rule_veto' | 'safety';
  aiScore?: number;
  ruleScore?: number;
}

interface SpotMarketData {
  timestamp: number;
  coins: any[];
}
```

### 1.4 现货AI提示词（精简版）

```typescript
/**
 * 现货AI提示词（90秒调用，优化token）
 */
export function buildSpotPrompt(data: SpotMarketData): string {
  return `
你是现货交易的AI分析师。每90秒分析一次，提供交易建议。

## 币种数据（精简）

| 币种 | 价格 | 24h变化 | 波动率 | 趋势 | 持仓 | 盈亏 |
|------|------|---------|--------|------|------|------|
${data.coins.map(c =>
  `| ${c.coin} | $${c.price.toFixed(2)} | ${c.change24h.toFixed(1)}% | ${c.volatility.toFixed(1)}% | ${c.trend} | ${c.position.toFixed(4)} | $${c.unrealizedPnL.toFixed(2)} |`
).join('\n')}

## 你的任务

为每个币种评分（-1到1）并给出建议（JSON格式）:

\`\`\`json
{
  "coinScores": {
    "BNB": 0.5,
    "SOL": -0.2,
    "XRP": 0.3,
    "ADA": 0.1,
    "DOGE": -0.4
  },
  "actions": [
    {
      "coin": "BNB",
      "action": "buy",
      "reasoning": "趋势向上，波动率适中"
    }
  ],
  "confidence": 0.7,
  "reasoning": "整体分析"
}
\`\`\`

## 评分标准

- **+1.0**: 强买入信号（上升趋势，低波动率）
- **+0.5**: 买入信号（符合多项买入条件）
- **+0.3**: 弱买入（DCA机会）
- **0**: 中性（无明确信号）
- **-0.3**: 弱卖出（获利了结）
- **-0.5**: 卖出信号（趋势反转）
- **-1.0**: 强卖出（下降趋势）

## 约束

- 置信度不超过0.85
- 考虑当前持仓（已有持仓可加仓）
- 考虑波动率（高波动降低得分）
`;
}
```

---

## 二、合约规则策略（60%资金）

### 2.1 策略架构

```
┌─────────────────────────────────────────────────────────────────┐
│                    合约规则策略系统                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  规则引擎层 (主导，禁止AI干预)                                   │
│  ├─ 中性网格策略      → 同时做多做空，赚取波动                   │
│  ├─ 固定参数          → 预设好的参数，不轻易改变                  │
│  ├─ 动态杠杆          → 根据市场波动率自动调整                   │
│  └─ 风险控制          → 严格止损，强制平仓                       │
│                                                                  │
│  AI监控层 (只观察，不干预)                                       │
│  ├─ 性能报告          → 每周生成策略表现报告                     │
│  ├─ 异常预警          → 检测异常情况并发送警报                   │
│  └─ 参数优化建议      → 每周提供参数调整建议（人工审核）          │
│                                                                  │
│  安全层                                                           │
│  ├─ 杠杆限制          → BTC≤5x, ETH≤3x                          │
│  ├─ 仓位限制          → 总仓位≤40%                               │
│  ├─ 熔断机制          → 回撤>15%暂停                             │
│  └─ 紧急平仓          → 接近爆仓时自动平仓                       │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

合约规则引擎代码保持不变（见V1版本），AI只做监控，不干预交易。

---

## 三、使用示例

```typescript
// main-v2.ts

async function main() {
  // 现货AI+规则协调器（40%资金）
  // - 市场扫描: 每90秒
  // - 交易决策: 每90秒
  // - 性能报告: 每6小时
  // - 深度分析: 每24小时
  const spotCoordinator = new SpotCoordinator({
    aiClient: new GLMClient(process.env.OPENAI_API_KEY),
    restClient,
    logger
  });
  await spotCoordinator.start();

  // 合约规则引擎（60%资金，纯规则）
  // - 规则引擎: 实时运行
  // - 性能报告: 每天1次
  const swapEngine = new NeutralGridEngine({
    totalCapital: 6000,
    maxDrawdown: 15
  });
  await swapEngine.start();

  console.log('系统已启动');
  console.log('现货: AI(70%) + 规则(30%)，90秒响应');
  console.log('合约: 纯规则，实时运行');
  console.log('模型: GLM-4.7');
}
```

---

## 四、总结

### 4.1 设计理念

**核心思想**：参数稳定，快速响应

```
传统方案问题:
├─ 频繁调整参数 → 策略不稳定
├─ 响应太慢 → 错过机会
└─ AI过度干预 → 破坏策略逻辑

V2优化方案:
├─ 参数固定不变 → 保持策略一致性
├─ 90秒快速扫描+决策 → 及时响应市场
├─ AI只做分析和建议 → 不直接修改参数
└─ 规则引擎保障安全 → 硬性限制
```

### 4.2 频率对比

| 任务 | 频率 | 说明 |
|------|------|------|
| **市场扫描** | 90秒 | 轻量级，只看数据 |
| **交易决策** | 90秒 | 基于扫描+规则做决策 |
| **性能报告** | 6小时 | 评估表现，可选调权重 |
| **深度分析** | 24小时 | 全面复盘，总结经验 |

### 4.3 AI任务类型说明

```
┌─────────────────────────────────────────────────────────────────┐
│  市场扫描 (90秒) - 轻量级                                       │
├─────────────────────────────────────────────────────────────────┤
│  • 只收集价格数据，不分析                                        │
│  • 识别价格异常、突破、反转等信号                                 │
│  • 快速返回，供决策使用                                          │
│  • Token消耗少                                                   │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  交易决策 (90秒) - 综合判断                                      │
├─────────────────────────────────────────────────────────────────┤
│  • 基于扫描数据 + 规则引擎信号                                   │
│  • AI给出买入/卖出/持有建议                                      │
│  • 协调器融合AI(70%)和规则(30%)                                  │
│  • 安全验证后执行                                                │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  性能报告 (6小时) - 策略评估                                     │
├─────────────────────────────────────────────────────────────────┤
│  • AI分析最近交易表现                                            │
│  • 评估AI vs 规则的胜率                                          │
│  • 可选调整AI/规则权重                                           │
│  • 不修改策略参数                                                │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  深度分析 (24小时) - 全面复盘                                    │
├─────────────────────────────────────────────────────────────────┤
│  • 回顾全天交易                                                  │
│  • 识别市场模式                                                  │
│  • 总结成功/失败案例                                             │
│  • 生成学习资料                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 4.4 为什么不调整参数？

```
参数调整的风险:
├─ 频繁调整 → 策略失去一致性
├─ 过度优化 → 适配历史数据，未来失效
├─ 错误调整 → 可能破坏策略逻辑
└─ 难以验证 → 不知道新参数是否更好

V2的替代方案:
├─ 固定参数 → 经过充分测试的参数
├─ 快速响应 → 通过更频繁的扫描和决策适应市场
├─ 权重调整 → 微调AI/规则权重，而非核心参数
└─ 深度分析 → 长期学习，不影响实时交易
```

### 4.5 调用统计（GLM-4.7）

| 任务 | 频率 | 调用/天 | 调用/月 |
|------|------|--------|---------|
| 市场扫描 | 90秒 | 960 | 28,800 |
| 交易决策 | 90秒 | 960 | 28,800 |
| 性能报告 | 6小时 | 4 | 120 |
| 深度分析 | 24小时 | 1 | 30 |
| 异常分析 | 按需 | ~10 | ~300 |
| **总计** | - | **~1,935** | **~58,050** |

**模型**: GLM-4.7（按实际使用付费）

### 4.6 安全保障

**现货安全限制**:
- 单币种≤30%
- 单笔≤$500
- 每日≤20笔
- 冷却期30分钟
- 回撤>5%暂停

**合约安全限制**:
- 固定杠杆 (BTC 2x, ETH 2x)
- 总仓位≤40%
- 回撤>15%暂停
- 接近爆仓自动平仓

**核心思想**：参数稳定不变，通过90秒快速扫描和决策响应市场变化，AI(70%) + 规则(30%)协作保障安全。
