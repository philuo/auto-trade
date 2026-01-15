# OKX 量化交易策略系统

## 策略概述

本系统提供两个主要策略，针对不同市场环境和币种特性优化：

### 1. 现货 DCA-网格混合策略

**适用币种：** BNB, SOL, XRP, ADA, DOGE

**策略特点：**
- DCA 定投：长期持有，降低平均成本
- 网格交易：在震荡区间内高抛低吸
- 自动切换：根据市场状况自动调整模式

**优势：**
- 无爆仓风险
- 适合长期投资
- 震荡市收益稳定

**手续费：**
- Maker（挂单）：0.08%
- Taker（吃单）：0.10%

### 2. 中性合约网格策略

**适用币种：** BTC（5x杠杆）, ETH（3x杠杆）

**策略特点：**
- 多空双向：同时持有做多和做空仓位
- 对冲风险：单边波动风险相互抵消
- 赚取波动：从价格波动中获利

**优势：**
- 手续费更低（仅为现货的39%）
- 资金费率对冲
- 适合震荡行情

**手续费：**
- Maker（挂单）：0.02%
- Taker（吃单）：0.05%
- 资金费率：每8小时收取（多空对冲可抵消）

## 快速开始

### 1. 配置环境变量

```bash
OKX_API_KEY=your_api_key
OKX_SECRET_KEY=your_secret_key
OKX_PASSPHRASE=your_passphrase
OKX_IS_DEMO=true
```

### 2. 运行策略

```typescript
import { StrategyManager } from './strategies/manager/strategy-manager';
import { DEFAULT_CONFIG } from './strategies/spot-dca-grid/config/default-params';
import { DEFAULT_NEUTRAL_GRID_CONFIG } from './strategies/neutral-grid/config/default-params';

const manager = new StrategyManager({
  capital: {
    totalCapital: 10000,    // 10,000 USDT
    spotPercentage: 50,      // 50% 现货
    swapPercentage: 50,      // 50% 合约
    reserve: 500
  },
  spot: {
    enabled: true,
    config: DEFAULT_CONFIG,
    coins: ['BNB', 'SOL', 'XRP', 'ADA', 'DOGE']
  },
  swap: {
    enabled: true,
    config: DEFAULT_NEUTRAL_GRID_CONFIG,
    coins: ['BTC', 'ETH']
  },
  risk: {
    maxTotalDrawdown: 20,
    autoPauseOnDrawdown: true,
    rebalanceInterval: 24
  }
}, okxApi);

await manager.start();
```

### 3. 查看报告

```typescript
// 生成综合报告
console.log(manager.generateReport());

// 获取当前状态
const state = manager.getOverallState();
console.log('总权益:', state.totalEquity);
console.log('总盈亏:', state.totalPnL);
```

## 手续费优化

### Maker vs Taker

| 类型 | 现货 | 合约 | 说明 |
|------|------|------|------|
| **Maker** | 0.08% | 0.02% | 挂单，提供流动性 |
| **Taker** | 0.10% | 0.05% | 吃单，消耗流动性 |

**优化建议：**
1. 优先使用限价单（Maker）
2. 避免使用市价单（Taker）
3. 设置合理价格，让订单在订单簿上等待成交

### 资金费率

永续合约每8小时收取一次资金费率：
- **正费率**：多头付费，空头收费
- **负费率**：空头付费，多头收费
- **中性策略**：多空对冲，资金费率相互抵消

## 风险管理

### 回撤控制

| 回撤水平 | 操作 |
|---------|------|
| < 10% | 正常运行 |
| 10-20% | 警告，暂停新开仓 |
| > 20% | 危险，执行止损 |
| > 30% | 紧急平仓 |

### 止损设置

- **单币种止损**：15%
- **最大回撤**：20%
- **杠杆限制**：BTC 5x, ETH 3x

### 紧急平仓

当触发以下条件时自动平仓：
1. 回撤超过30%
2. 接近强平价格（距离<10%）
3. 系统检测到异常

## 策略参数调优

### 保守型配置

```typescript
import { CONSERVATIVE_NEUTRAL_GRID_CONFIG } from './strategies/neutral-grid/config/default-params';
import { CONSERVATIVE_CONFIG } from './strategies/spot-dca-grid/config/default-params';
```

- 更宽的价格区间
- 更少的网格数量
- 更小的单笔订单

### 激进型配置

```typescript
import { AGGRESSIVE_NEUTRAL_GRID_CONFIG } from './strategies/neutral-grid/config/default-params';
import { AGGRESSIVE_CONFIG } from './strategies/spot-dca-grid/config/default-params';
```

- 更窄的价格区间
- 更多的网格数量
- 更大的单笔订单

## 趋势识别

系统自动识别市场趋势并调整策略：

| 趋势 | 建议模式 | 操作 |
|------|---------|------|
| 上涨 | 激进 | 增加仓位 |
| 下跌 | 保守 | 减少仓位 |
| 震荡 | 正常 | 网格交易 |
| 不明 | 正常 | 保持观察 |

## 最佳实践

### 1. 资金分配

```
总资金: 10,000 USDT
├── 现货策略: 5,000 USDT (50%)
│   ├── BNB: 1,000 USDT
│   ├── SOL: 1,000 USDT
│   ├── XRP: 1,000 USDT
│   ├── ADA: 1,000 USDT
│   └── DOGE: 1,000 USDT
├── 合约策略: 4,500 USDT (45%)
│   ├── BTC: 2,250 USDT (5x杠杆 = 11,250 USDT 仓位)
│   └── ETH: 2,250 USDT (3x杠杆 = 6,750 USDT 仓位)
└── 应急储备: 500 USDT (5%)
```

### 2. 监控要点

- 每天检查总权益变化
- 监控回撤水平
- 关注资金费率方向
- 检查订单成交情况

### 3. 定期维护

- 每周查看策略报告
- 根据市场调整参数
- 检查手续费支出
- 评估策略表现

## 常见问题

### Q: 为什么推荐合约用于网格交易？

A: 合约手续费仅为现货的39%（Maker 0.02% vs 0.08%），对于频繁交易的网格策略，手续费差异会显著影响收益。

### Q: 中性网格策略的风险是什么？

A: 主要风险是单边大行情突破网格区间。系统会自动调整区间或跟踪趋势。

### Q: 资金费率对收益影响多大？

A: 中性策略多空对冲，资金费率基本抵消。正费率时多头付费，负费率时空头付费，净影响很小。

### Q: 如何选择合适的配置？

A:
- **新手**：使用默认配置或保守配置
- **有经验**：激进配置
- **大资金**：保守配置，降低风险

### Q: 什么时候应该暂停策略？

A:
- 回撤超过20%
- 市场出现极端波动
- 系统检测到风险信号

## 文件结构

```
src/strategies/
├── spot-dca-grid/           # 现货DCA-网格策略
│   ├── core/               # 核心引擎
│   ├── config/             # 配置文件
│   └── index.ts            # 模块导出
├── neutral-grid/           # 中性合约网格策略
│   ├── core/               # 核心引擎
│   ├── config/             # 配置文件
│   └── index.ts            # 模块导出
├── common/                 # 通用模块
│   ├── trend-analyzer.ts   # 趋势分析
│   └── risk-manager.ts     # 风险管理
├── manager/                # 策略管理器
│   └── strategy-manager.ts # 统一管理
└── examples/               # 示例代码
    └── run-strategies.ts   # 运行示例
```

## 免责声明

本系统仅供学习研究使用。量化交易存在风险，过去的业绩不代表未来表现。请在充分了解风险的情况下使用，并仅使用可承受损失的资金进行交易。
