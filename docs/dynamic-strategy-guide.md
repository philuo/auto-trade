# 动态自适应策略指南

## 核心理念

**策略不是一层不变的，而是根据市场智能调整。**

## 不同市场状况下的配置

### BTC 动态配置表

| 市场状况 | 波动率 | 趋势 | 杠杆 | 仓位 | 网格数 | 模式 |
|---------|-------|------|------|------|--------|------|
| **极佳** | 低 | 上涨 | **3x** | 30% | 12 | 激进 |
| **良好** | 低 | 震荡 | **2x** | 40% | 16 | 正常 |
| **一般** | 中 | 任意 | **2x** | 25% | 10 | 正常 |
| **较差** | 高 | 任意 | **1.5x** | 15% | 6 | 保守 |
| **危险** | 极高 | 任意 | **1x** | 5% | 4 | 暂停 |

### ETH 动态配置表（更保守）

| 市场状况 | 波动率 | 趋势 | 杠杆 | 仓位 | 网格数 | 模式 |
|---------|-------|------|------|------|--------|------|
| **良好** | 低 | 上涨 | **2x** | 25% | 12 | 正常 |
| **一般** | 低 | 震荡 | **2x** | 35% | 16 | 正常 |
| **较差** | 中 | 任意 | **1.5x** | 20% | 10 | 保守 |
| **危险** | 高 | 任意 | **1x** | 10% | 6 | 保守 |
| **极端** | 极高 | 任意 | **1x** | 0% | 0 | 暂停 |

## 实际资金分配示例

### 10,000 USDT 本金

```
┌─────────────────────────────────────────────────────┐
│              基础分配（固定）                        │
├─────────────────────────────────────────────────────┤
│ 现货（40%）:  4,000 USDT                            │
│   ├─ BNB:  800 USDT                                 │
│   ├─ SOL:  800 USDT                                 │
│   ├─ XRP:  800 USDT                                 │
│   ├─ ADA:  800 USDT                                 │
│   └─ DOGE: 800 USDT                                 │
│                                                     │
│ 合约（40%）:  4,000 USDT（动态调整）                 │
│   ├─ BTC:   2,000 USDT 基础资金                     │
│   │   ├─ 好市场: 3x杠杆, 30%仓位 = 600本金          │
│   │   ├─ 正常:   2x杠杆, 25%仓位 = 500本金          │
│   │   ├─ 差市场: 1.5x杠杆, 15%仓位 = 300本金        │
│   │   └─ 危险:   1x杠杆, 5%仓位  = 100本金          │
│   │                                                │
│   └─ ETH:   2,000 USDT 基础资金                     │
│       ├─ 好市场: 2x杠杆, 25%仓位 = 500本金          │
│       ├─ 正常:   2x杠杆, 20%仓位 = 400本金          │
│       ├─ 差市场: 1x杠杆, 10%仓位 = 200本金          │
│       └─ 危险:   1x杠杆, 0%仓位  = 0本金（暂停）     │
│                                                     │
│ 应急（20%）:  2,000 USDT                            │
└─────────────────────────────────────────────────────┘
```

## 自动调整机制

### 1. 波动率检测（每5分钟）

```typescript
// 计算ATR (Average True Range)
const atr = calculateATR(candles, 14);
const atrPercent = (atr / currentPrice) * 100;

if (atrPercent > 15) {
  // 极端波动 → 降到1x杠杆，极小仓位
  adjustTo('extreme');
} else if (atrPercent > 8) {
  // 高波动 → 降到1.5x杠杆
  adjustTo('high');
} else if (atrPercent > 4) {
  // 中等波动 → 2x杠杆
  adjustTo('medium');
} else {
  // 低波动 → 可以用更高杠杆
  adjustTo('low');
}
```

### 2. 趋势检测

```typescript
// SMA + RSI 判断趋势
const sma20 = calculateSMA(candles, 20);
const sma50 = calculateSMA(candles, 50);
const rsi = calculateRSI(candles, 14);

if (sma20 > sma50 && rsi > 50 && rsi < 70) {
  // 上升趋势 → 可以激进一点
  adjustTo('uptrend');
} else if (sma20 < sma50 && rsi < 50) {
  // 下降趋势 → 保守一点
  adjustTo('downtrend');
} else {
  // 震荡 → 正常模式
  adjustTo('sideways');
}
```

### 3. 流动性检测

```typescript
const currentVolume = getCurrentVolume();
const avgVolume = getAverageVolume(candles);
const volumeRatio = currentVolume / avgVolume;

if (volumeRatio < 0.3) {
  // 成交量异常低 → 流动性差，降低仓位
  reducePosition();
}
```

### 4. 综合风险评分

```typescript
const riskScore = (
  volatilityImpact * 0.4 +
  trendImpact * 0.3 +
  liquidityImpact * 0.3
);

if (riskScore > 70) {
  // 暂停所有新开仓
  pauseNewOrders();
}
```

## 动态调整的优势

### ✅ 相比固定策略

| 场景 | 固定2x策略 | 动态策略 | 优势 |
|------|-----------|----------|------|
| **平静市场** | 2x，收益一般 | **3x**，收益更高 | +50%收益 |
| **震荡市场** | 2x，可能止损 | 动态调整仓位 | 降低回撤 |
| **暴涨** | 2x，踏空 | **3x**，跟上趋势 | 利润最大化 |
| **暴跌** | 2x，可能爆仓 | **1x**，安全度过 | 避免爆仓 |
| **极端波动** | 2x，**爆仓** | **1x**，观察 | 保住本金 |

### 📊 收益对比（模拟）

```
场景：BTC从100,000涨到110,000（10%涨幅）

固定2x杠杆策略:
- 收益: 10% × 2 = 20%
- 手续费: ~2%
- 净收益: ~18%

动态策略（低波动+上升趋势→3x）:
- 收益: 10% × 3 = 30%
- 手续费: ~3%
- 净收益: ~27%

动态策略多赚: 9%
```

```
场景：BTC从100,000跌到85,000（-15%跌幅）

固定2x杠杆策略:
- 亏损: -15% × 2 = -30%
- 可能接近爆仓

动态策略（高波动→1.5x杠杆）:
- 亏损: -15% × 1.5 = -22.5%
- 仍有充足保证金

动态策略少亏: 7.5%
```

## 实际使用建议

### 1. 初始化

```typescript
import { DynamicStrategyRunner } from './adaptive-dynamic/dynamic-config-example';

const runner = new DynamicStrategyRunner();

// 每5分钟运行一次
setInterval(async () => {
  const candles = await getCandles('BTC-USDT-SWAP', '1H', 50);
  const ticker = await getTicker('BTC-USDT-SWAP');

  await runner.runStrategy(
    candles,
    ethCandles,
    parseFloat(ticker.last),
    parseFloat(ethTicker.last),
    parseFloat(ticker.vol24h),
    parseFloat(ethTicker.vol24h)
  );
}, 5 * 60 * 1000);
```

### 2. 监控要点

```typescript
// 每天检查一次
setInterval(() => {
  console.log(runner.generateReport());

  // 检查是否需要手动干预
  if (runner.getCurrentRiskScore() > 60) {
    sendAlert('风险较高，请人工评估');
  }
}, 24 * 60 * 60 * 1000);
```

### 3. 紧急情况

```typescript
// 如果市场发生极端情况
if (extremeEvent) {
  // 立即暂停
  await runner.emergencyPause();

  // 降到1x杠杆
  await runner.reduceLeverageTo1x();

  // 通知用户
  sendAlert('极端行情，策略已暂停');
}
```

## 风险提示

即使使用动态策略，仍需注意：

1. ⚠️ **极端行情可能来得太快**，系统来不及调整
2. ⚠️ **流动性可能在需要时枯竭**，无法及时平仓
3. ⚠️ **网络延迟可能导致调整失败**
4. ⚠️ **黑天鹅事件无法预测**

### 永远记住：

```
🚫 不要在睡觉时持有高杠杆合约
🚫 不要认为动态策略就能避免所有风险
🚫 不要忽视手动监控的重要性
🚫 不要投入超过承受能力的资金
```

## 总结

动态自适应策略相比固定策略的优势：

1. ✅ **市场好时更激进** - 不错过机会
2. ✅ **市场差时更保守** - 保住本金
3. ✅ **自动适应变化** - 无需手动调整
4. ✅ **收益风险比更优** - 长期表现更好

但它不是万能的，**仍需谨慎**。

**建议：先用小资金测试，确认稳定后再放大资金。**
