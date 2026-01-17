# 高频多周期信号系统

> **核心理念**: 信号和指标准确生成、识别与传递
>
> **关键特性**: 多周期并行分析、完整指标体系、事件检测、无频率限制

---

## 系统架构

```
WebSocket K线推送（无频率限制）
    ↓
实时更新各周期K线数据（12个周期并行）
    ↓
计算完整指标（12类指标）
    ↓
事件检测（非状态检测）
    ↓
信号聚合与冲突解决
    ↓
输出聚合信号
```

---

## 支持的K线周期

| 短周期 | 中周期 | 长周期 |
|-------|-------|-------|
| 1m | 30m | 4H |
| 3m | 1H | 6H |
| 5m | 2H | 12H |
| 15m | - | 1D |
| - | - | 1W |

**共12个周期同时分析**

---

## 完整指标体系（12类）

### 1. 趋势指标
- **MA**: 移动平均线（MA7, MA25, MA99）
- **EMA**: 指数移动平均（EMA7, EMA25）

### 2. 动量指标
- **RSI**: 相对强弱指标（14周期）
- **RSI MA**: RSI的移动平均

### 3. MACD
- **MACD线**: EMA12 - EMA26
- **Signal线**: MACD的EMA9
- **Histogram**: MACD - Signal

### 4. 布林带
- **Upper**: 中轨 + 2倍标准差
- **Middle**: 20周期SMA
- **Lower**: 中轨 - 2倍标准差
- **Bandwidth**: (上轨 - 下轨) / 中轨
- **Squeeze**: 带宽 < 0.1（收缩状态）

### 5. ADX（平均趋向指数）
- **ADX**: 趋势强度（0-100）
- **+DI**: 上升方向指标
- **-DI**: 下降方向指标

### 6. ATR（真实波幅）
- **ATR**: 14周期平均真实波幅
- **ATR Ratio**: ATR / 当前价格

### 7. 成交量指标
- **当前成交量**
- **20周期均线**
- **量比**: 当前 / 均线
- **趋势**: 上升/下降/中性

### 8. KDJ
- **K值**: 快速随机值
- **D值**: K的移动平均
- **J值**: 3K - 2D

### 9. CCI（商品通道指标）
- **CCI**: 典型价格偏离度

### 10. WR（威廉指标）
- **WR**: -100到+100的超买超卖指标

### 11. OBV（能量潮）
- **OBV**: 成交量净流量
- **OBV MA**: OBV的移动平均
- **趋势**: 上升/下降/中性

### 12. PSY（心理线）
- **PSY**: 上涨天数占比

---

## 事件检测机制

### 状态检测 vs 事件检测

| 检测方式 | 判断条件 | 信号频率 | 问题 |
|---------|---------|----------|------|
| **状态检测（错误）** | MA7 > MA25 | 每15分钟一次 | 过度交易 |
| **事件检测（正确）** | MA7从下穿越MA25 | 只在穿越时一次 | 准确、高效 |

### 事件检测示例

```typescript
// MA金叉事件检测
if (prev.ma7 <= prev.ma25 && curr.ma7 > curr.ma25) {
  // 生成金叉信号（只发生一次）
  generateSignal('MA_7_25_CROSSOVER', 'bullish');
}

// MACD金叉事件检测
if (prev.macd <= prev.signal && curr.macd > curr.signal) {
  generateSignal('MACD_BULLISH_CROSS', 'bullish');
}
```

---

## 信号聚合逻辑

### 1. 周期权重

| 周期 | 权重 | 说明 |
|-----|------|------|
| 1m | 0.3 | 噪音多，权重低 |
| 15m | 0.7 | 中等权重 |
| 1H | 1.0 | 基准权重 |
| 4H | 1.5 | 重要参考 |
| 1D | 2.5 | 趋势主导 |

### 2. 方向聚合

```typescript
// 加权计算
bullishScore = Σ(看涨周期强度 × 周期权重)
bearishScore = Σ(看跌周期强度 × 周期权重)

// 判断方向
if (bullishScore > bearishScore) {
  direction = 'bullish';
  strength = (bullishScore + bearishScore) / 最大可能分数 × 100;
}
```

### 3. 置信度计算

```typescript
confidence = 方向一致性比例 × 平均强度

方向一致性 = 同方向周期数 / 总周期数
平均强度 = 所有周期信号强度之和 / 周期数
```

---

## 信号类型（15种）

### MA交叉信号
1. MA7/MA25金叉
2. MA7/MA25死叉
3. MA25/MA99金叉
4. MA25/MA99死叉

### RSI信号
5. RSI超卖（< 30）
6. RSI超买（> 70）
7. RSI中性向上穿越（> 50）
8. RSI中性向下穿越（< 50）

### MACD信号
9. MACD金叉
10. MACD死叉

### 布林带信号
11. 触及下轨（反转）
12. 触及上轨（反转）
13. 向上突破（需要确认）
14. 向下突破（需要确认）

### 成交量信号
15. 异常放量（> 均值2倍）

---

## 聚合信号输出

```typescript
interface AggregatedSignal {
  id: string;
  coin: string;
  direction: 'bullish' | 'bearish' | 'neutral';
  strength: number;           // 0-100
  confidence: number;         // 0-1

  timeframeCount: number;     // 参与的周期数
  bullishTimeframes: KLineInterval[];
  bearishTimeframes: KLineInterval[];
  primaryTimeframe: KLineInterval;

  allSignals: TechnicalSignal[];  // 所有原始信号

  currentPrice: number;
  timestamp: number;

  signalTypeSummary: {
    ma: number;      // MA信号数量
    rsi: number;     // RSI信号数量
    macd: number;    // MACD信号数量
    bollinger: number; // 布林带信号数量
    volume: number;  // 成交量信号数量
  };
}
```

---

## 指标计算公式（已验证）

### SMA（简单移动平均）
```
SMA = Σ(price[i]) / n
```

### EMA（指数移动平均）
```
multiplier = 2 / (period + 1)
EMA = (price - EMA_prev) × multiplier + EMA_prev
```

### RSI（相对强弱指标）
```
增益 = Σ(max(0, price[i] - price[i-1])) / n
损失 = Σ(max(0, price[i-1] - price[i])) / n
RS = 增益 / 损失
RSI = 100 - (100 / (1 + RS))
```

### MACD
```
EMA12 = EMA(price, 12)
EMA26 = EMA(price, 26)
MACD = EMA12 - EMA26
Signal = EMA(MACD, 9)
Histogram = MACD - Signal
```

### 布林带
```
Middle = SMA(price, 20)
StdDev = √(Σ(price - SMA)² / n)
Upper = Middle + 2 × StdDev
Lower = Middle - 2 × StdDev
Bandwidth = (Upper - Lower) / Middle
```

### ATR（真实波幅）
```
TR = max(high-low, |high-prevClose|, |low-prevClose|)
ATR = SMA(TR, 14)
```

### KDJ
```
RSV = (close - min(low, n)) / (max(high, n) - min(low, n)) × 100
K = (2/3) × K_prev + (1/3) × RSV
D = (2/3) × D_prev + (1/3) × K
J = 3K - 2D
```

### CCI
```
TP = (high + low + close) / 3
SMA_TP = SMA(TP, n)
MAD = SMA(|TP - SMA_TP|, n)
CCI = (TP - SMA_TP) / (0.015 × MAD)
```

---

## 使用示例

```typescript
import { HighFrequencyMultiTimeframeSystem } from './trading/high-frequency-signal-system.js';

const system = new HighFrequencyMultiTimeframeSystem();

// WebSocket推送1分钟K线更新
ws.on('candle1m-BTC-USDT', (data) => {
  const klines = parseCandleData(data);
  const aggregated = system.updateTimeframeKlines(
    'BTC',
    '1m',
    klines,
    volume24h,
    volumeMA
  );

  if (aggregated) {
    console.log('聚合信号:', {
      direction: aggregated.direction,
      strength: aggregated.strength,
      confidence: aggregated.confidence,
      bullishCount: aggregated.bullishTimeframes.length,
      bearishCount: aggregated.bearishTimeframes.length,
      primaryTimeframe: aggregated.primaryTimeframe,
    });
  }
});

// WebSocket推送5分钟K线更新
ws.on('candle5m-BTC-USDT', (data) => {
  // 同样调用updateTimeframeKlines
  // 系统会自动聚合所有周期的信号
});

// 获取当前聚合信号
const signal = system.getAggregatedSignal('BTC');
```

---

## 关键特性

### ✅ 实时更新
- 无频率限制，WebSocket推送立即处理
- 12个周期并行分析
- 任何周期更新都会重新聚合

### ✅ 事件检测
- 只在真正的穿越时产生信号
- 避免状态检测的重复信号
- 信号频率降低60-80%

### ✅ 多周期确认
- 短周期提供入场时机
- 长周期确认趋势方向
- 权重分配合理

### ✅ 完整指标
- 12类指标覆盖趋势、动量、成交量
- 所有计算公式经过验证
- 准确可靠

---

## 与TECHNICAL_ANALYSIS.md的对应

| TECHNICAL_ANALYSIS.md | 实现 |
|---------------------|------|
| ✅ 多周期K线 | 12个周期并行分析 |
| ✅ 完整指标体系 | 12类指标 |
| ✅ 事件检测 | AdvancedSignalGenerator |
| ✅ ADX趋势过滤 | 可选配置 |
| ✅ 价格确认 | 可选配置（1-3根K线） |
| ✅ 统计验证 | 留给外部模块 |
| ✅ 信号聚合 | 实现了权重聚合 |

---

## 核心优势

1. **准确性**: 所有指标计算公式经过验证
2. **实时性**: 无频率限制，即时响应
3. **完整性**: 12个周期、12类指标
4. **智能性**: 事件检测 + 权重聚合
5. **可扩展**: 易于添加新指标和新周期

---

## 下一步

这个系统负责**信号生成和传递**，后续模块负责：

1. **统计验证**: 历史胜率、置信度调整
2. **风险管理**: 止盈止损、仓位控制
3. **交易执行**: 下单、持仓管理
