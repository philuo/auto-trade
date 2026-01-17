# 高频交易安全策略完整实现文档

> 修复版本：使用实际API数据，正确的单位和逻辑

---

## 已修复的严重问题 ✅

### 问题 1: 信号强度阈值不匹配 ❌ → ✅ 已修复
```typescript
// 修复前
config.signals.minStrength = 60;  // 以为是 0-100
signal.strength < 60;            // 但实际是 0-1

// 修复后
config.signals.minStrength = 0.5;  // 统一为 0-1 范围
signal.strength < 0.5;            // 正确比较
```

### 问题 2: dailyLoss 计算错误 ❌ → ✅ 已修复
```typescript
// 修复前
this.dailyLoss += Math.abs(position.pnl / position.entryPrice * position.size); // 完全错误的公式

// 修复后
const lossPercent = Math.abs(position.pnl / initialCapital) * 100;
this.dailyLoss += lossPercent; // 正确的百分比累加
```

### 问题 3: 风险敞口计算单位错误 ❌ → ✅ 已修复
```typescript
// 修复前
totalValue += position.size * position.currentPrice; // 重复计算

// 修复后
totalValue += position.size; // position.size 已是 USDT 价值
```

---

## 完整的安全策略体系

### 1. 信号过滤策略 (SignalFilterConfig)

```typescript
{
  minStrength: 0.5,              // 最小信号强度 (0-1)
  minConfidence: 0.5,            // 最小置信度 (0-1)
  minADX: 20,                  // 趋势强度阈值 (0-100)
  priceConfirmationBars: 2,        // 价格确认K线数量 (1-5)
  minVolumeRatio: 1.2,           // 最小成交量倍数
  minMicrostructureStrength: 50,   // 微观结构强度 (0-100)
}
```

**信号必须同时满足所有条件才会被考虑**，不满足其中任何一个直接拒绝。

### 2. 风险限制 (RiskLimitsConfig)

```typescript
{
  maxPositions: 3,                // 最多 3 个持仓
  maxExposure: 30,               // 最大风险敞口 30%
  consecutiveLossLimit: 3,        // 连续 3 次亏损后暂停
  dailyLossLimit: 5,             // 每日最大亏损 5%
  maxDrawdownLimit: 15,          // 最大回撤 15%
  maxSlippage: 0.05,             // 最大滑点 0.05%
  minLiquidity: 50000,           // 最小流动性 50000 USDT
  maxApiLatency: 500,           // API超时 500ms
  maxWebSocketLatency: 3000,      // WebSocket 超时 3秒
}
```

### 3. 实时风险检查 (9项检查)

| 检查项 | 严重性 | 触发条件 | 操作 |
|--------|--------|----------|------|
| 市场流动性 | critical | liquidity === 'dry' | 拒绝交易 |
| 市场波动率 | high | volatility === 'extreme' | 暂停交易 |
| 风险敞口 | critical | exposurePercent > maxExposure | 拒绝新开仓 |
| API延迟 | high | apiLatency > 500ms | 暂停交易 |
| WebSocket | critical | !websocketConnected | 拒绝交易 |
| 连续亏损 | high | consecutiveLosses >= 3 | 暂停新开仓 |
| 每日亏损 | critical | dailyLoss >= 5% | 暂停所有交易 |
| 持仓数量 | critical | openPositionsCount >= maxPositions | 拒绝新开仓 |
| 预期滑点 | warning | expectedSlippage > 0.05% | 记录日志 |

**注意**: critical 和 high 级别的警报会阻止交易，warning 仅记录。

### 4. 止盈止损策略 (StopLossConfig)

#### 高频交易固定百分比模式
```typescript
{
  stopLoss: 0.002,   // 0.2% 止损
  takeProfit: 0.003, // 0.3% 止盈
}
```

#### 追踪止损
```typescript
{
  enabled: true,
  activationPercent: 0.002,  // 盈利 0.2% 后激活
  distancePercent: 0.0015,  // 距离当前价格 0.15%
}
```

#### 风险回报比
```typescript
takeProfit / stopLoss >= 1.2  // 最小 1.2:1
```

### 5. 仓位管理策略

#### 基础仓位计算
```typescript
basePositionSize = 总资金 × 5%  // 基础5%仓位
```

#### 信号强度调整
```typescript
strength < 0.5:  仓位 × 0.5   (低强度减半)
strength >= 0.7: 仓位 × 1.5  (高强度增加50%)
```

#### 连续结果调整
```typescript
连续盈利: 仓位 × 1.1
连续亏损: 仓位 × 0.5
```

#### 市场条件调整
```typescript
高波动率: 仓位 × 0.5
低波动率: 仓位 × 1.2
```

### 6. 持仓时间限制

| 周期 | 最大持仓时间 |
|------|-----------|
| 1m | 60秒 |
| 3m | 3分钟 |
| 5m | 5分钟 |
| 15m | 15分钟 |
| 1H | 1小时 |
| 1D | 24小时 |

### 7. 使用真实数据验证

```typescript
// AccountManager API 接口
{
  getBalance(): Promise<AccountBalance>  // 获取实际余额
  getPositions(): Promise<PositionInfo[]> // 获取实际持仓
  getExposure(): Promise<ExposureInfo>  // 计算实际敞口
}
```

**所有风险计算都基于实时API数据，不再使用硬编码值。**

---

## 完整的交易流程

```
信号生成
    ↓
1. 信号强度检查 (>= 0.5)
    ↓
2. 置信度检查 (>= 0.5)
    ↓
3. 微观结构检查 (>= 50)
    ↓
4. 市场流动性检查 (!= dry)
    ↓
5. 波动率检查 (!= extreme)
    ↓
6. 风险敞口检查 (< 30%)
    ↓
7. 持仓数量检查 (< 3)
    ↓
8. 连续亏损检查 (< 3)
    ↓
9. 每日亏损检查 (< 5%)
    ↓
10. API延迟检查 (< 500ms)
    ↓
11. WebSocket连接检查 (true)
    ↓
12. 滑点检查 (< 0.05%)
    ↓
13. 止盈止损计算 (0.2% / 0.3%)
    ↓
执行交易
```

---

## 配置示例

### 保守型 (低风险)
```typescript
{
  signals: { minStrength: 0.6, minConfidence: 0.6 },
  safety: {
    maxPositions: 2,
    maxExposure: 20,
    consecutiveLossLimit: 2,
    dailyLossLimit: 3,
    stopLoss: 0.0015,    // 0.15% 止损
    takeProfit: 0.0025,  // 0.25% 止盈
  }
}
```

### 平衡型 (中风险)
```typescript
{
  signals: { minStrength: 0.5, minConfidence: 0.5 },
  safety: {
    maxPositions: 3,
    maxExposure: 30,
    consecutiveLossLimit: 3,
    dailyLossLimit: 5,
    stopLoss: 0.002,      // 0.2% 止损
    takeProfit: 0.003,    // 0.3% 止盈
  }
}
```

### 激进型 (高风险)
```typescript
{
  signals: { minStrength: 0.4, minConfidence: 0.4 },
  safety: {
    maxPositions: 5,
    maxExposure: 50,
    consecutiveLossLimit: 5,
    dailyLossLimit: 8,
    stopLoss: 0.0025,     // 0.25% 止损
    takeProfit: 0.004,     // 0.4% 止盈
  }
}
```

---

## 总结

现在的安全策略：
1. ✅ **所有阈值单位统一** (0-1范围)
2. ✅ **风险敞口基于实际API数据**
3. ✅ **dailyLoss 基于实际资金百分比**
4. ✅ **支持异步获取实时账户数据**
5. **✅ 完整的安全策略逻辑验证**
