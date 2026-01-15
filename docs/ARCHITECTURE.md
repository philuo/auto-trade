# OKX 量化交易系统 - 系统架构

## 系统概览

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           OKX 量化交易系统                                │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────────┐     ┌──────────────┐     ┌─────────────────────┐    │
│  │  策略引擎    │ ←→  │  数据源管理   │ ←→  │   OKX API (REST)    │    │
│  │             │     │              │     │                     │    │
│  │  • DCA      │     │  • WebSocket  │     │  • 现货 (SPOT)     │    │
│  │  • Grid     │     │  • REST 轮询  │     │  • 合约 (SWAP)     │    │
│  │  • Risk     │     │  • 自动切换   │     │  • 订单管理         │    │
│  └──────┬──────┘     └──────┬───────┘     └─────────────────────┘    │
│         │                   │                                           │
│         │         ┌─────────▼─────────┐                             │
│         │         │  网络状态管理器    │                             │
│         │         │  • 健康监控       │                             │
│         │         │  • 静默断线检测   │                             │
│         │         └───────────────────┘                             │
│         │                                                       │
│         ▼                                                       │
│  ┌─────────────┐                                               │
│  │  日志系统    │                                               │
│  │             │                                               │
│  │  • SQLite   │ ← 决策日志、交易日志、风险日志                    │
│  │  • 文件日志  │ ← 错误日志、运行日志                            │
│  └─────────────┘                                               │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 核心组件

### 1. 数据源管理 (Dual Data Source)

```
┌──────────────────────────────────────────────────────────────┐
│                      数据获取流程                              │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────┐        ┌──────────────┐                   │
│  │  WebSocket   │        │   REST API   │                   │
│  │  (tickers)    │        │  (每2秒)     │                   │
│  └──────┬───────┘        └──────┬───────┘                   │
│         │                        │                             │
│         ▼                        ▼                             │
│  ┌─────────────────────────────────────┐                   │
│  │        数据源选择器                 │                   │
│  │                                     │                   │
│  │  if (ws_healthy && ws_data_fresh)  │                   │
│  │      → 使用 WebSocket 数据          │                   │
│  │  else                               │                   │
│  │      → 使用 REST API 数据           │                   │
│  └─────────────┬───────────────────────┘                   │
│                │                                             │
│                ▼                                             │
│         ┌─────────────────┐                                 │
│         │  策略引擎       │                                 │
│         │  (实时数据)      │                                 │
│         └─────────────────┘                                 │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

| 数据源 | 触发方式 | 延迟 | 用途 |
|--------|---------|------|------|
| **WebSocket** | 价格推送 | <100ms | 主要数据源 |
| **REST API** | 定时轮询（2秒） | ~500ms | 验证 + 降级 |

### 2. 网络状态管理

```
┌──────────────────────────────────────────────────────────────┐
│                    网络状态转换图                              │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─────────┐     连接成功     ┌──────────┐                │
│  │DISCONNECTED│ ──────────────→ │ CONNECTED│                │
│  └─────────┘                   └─────┬────┘                │
│     ▲                                  │                     │
│     │ 断开/失败                 认证成功                    │
│     │                                  ▼                     │
│     │                          ┌───────────┐                │
│     │                          │AUTHENTICATED│               │
│     │                          └─────┬─────┘                │
│     │                                │                      │
│     │                    ┌───────────┴─────────┐           │
│     │                    │     数据接收检查       │           │
│     │                    │  (每秒检查一次)        │           │
│     │                    └───────────┬─────────┘           │
│     │                                │                      │
│     │              ┌───────────────┴─────────┐           │
│     │              │  数据新鲜度评估           │           │
│     │              └───────────────┬─────────┘           │
│     │                                │                      │
│     │              数据年龄 > 5秒?    │                      │
│     │              ┌─────────────────┤                      │
│     │              │                │                       │
│     │         YES ▼              NO ▼                       │
│     │    ┌─────────┐          ┌─────────┐                  │
│     │    │DEGRADED │          │ HEALTHY  │                  │
│     │    └────┬────┘          └────┬────┘                  │
│     │         │                     │                        │
│     │    数据年龄 > 8秒?        │                        │
│     │    ┌─────────────────┐     │                        │
│     │    │                 │     │                        │
│     │ YES ▼           NO  ▼     │                        │
│     │ ┌─────────┐    ┌─────────┐ │                        │
│     │ │UNHEALTHY│    │ 保持监控 │ │                        │
│     │ └─────────┘    └─────────┘ │                        │
│     │                                │                        │
└──────────────────────────────────────────────────────────────┘
```

| 状态 | WebSocket | 数据延迟 | 行动 |
|------|-----------|---------|------|
| **HEALTHY** | ✅ 已认证 | <5秒 | 正常运行 |
| **DEGRADED** | ✅ 已认证 | 5-8秒 | 警告，准备降级 |
| **UNHEALTHY** | ❌ 未连接/静默 | >8秒 | 使用 REST API |

### 3. WebSocket 重连机制

```
┌──────────────────────────────────────────────────────────────┐
│                指数退避重连策略                                │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  重连次数   延迟时间    累计等待                              │
│  ─────────  ─────────  ─────────                              │
│    第1次     5 秒       5 秒                                   │
│    第2次     7.5 秒     12.5 秒                                │
│    第3次     11.25 秒   23.75 秒                               │
│    第4次     16.88 秒   40.63 秒                               │
│    第5次     25.31 秒   65.94 秒                               │
│    第6次+    最大60秒   持续重连                                │
│                                                              │
│  配置: baseInterval=5000, multiplier=1.5, maxInterval=60000  │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

---

## 策略模块架构

### Spot DCA-Grid 策略

```
┌──────────────────────────────────────────────────────────────┐
│              Spot DCA-Grid 策略架构                             │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─────────────┐     ┌──────────────┐     ┌─────────────┐  │
│  │ DCA Engine  │     │ Grid Engine   │     │Coordinator  │  │
│  │             │     │              │     │             │  │
│  │ 定投买入    │     │ 网格交易      │     │ 模式协调    │  │
│  │ 逢低加仓    │     │ 高抛低吸      │     │ 风险控制    │  │
│  └──────┬──────┘     └──────┬───────┘     └──────┬──────┘  │
│         │                   │                     │           │
│         └───────────────────┴─────────────────────┘         │
│                              │                                │
│                              ▼                                │
│                   ┌───────────────────┐                      │
│                   │  Order Management │                      │
│                   │  • Order Generator│                      │
│                   │  • Order Tracker  │                      │
│                   └───────────────────┘                      │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

| 组件 | 功能 | 触发条件 |
|------|------|---------|
| **DCA Engine** | 定投买入 | 价格下跌 3%+ |
| **Grid Engine** | 网格交易 | 价格触及网格线 |
| **Coordinator** | 协调决策 | 每次更新周期 |
| **Order Manager** | 订单管理 | 决策执行 |

### 决策流程

```
┌──────────────────────────────────────────────────────────────┐
│                   策略决策流程                                   │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─────────┐                                               │
│  │ 获取市场 │  ← 每5秒或WebSocket推送                       │
│  │   数据   │                                               │
│  └────┬────┘                                               │
│       │                                                      │
│       ▼                                                      │
│  ┌─────────┐                                               │
│  │更新仓位 │  ← 当前持仓、盈亏、成本                          │
│  │   信息   │                                               │
│  └────┬────┘                                               │
│       │                                                      │
│       ▼                                                      │
│  ┌─────────────────────────────┐                             │
│  │    Coordinator 协调决策       │                             │
│  │                              │                             │
│  │  ┌─────────┐   ┌─────────┐ │                             │
│  │  │DCA Engine│   │Grid Engine││                             │
│  │  │         │   │         │ │                             │
│  │  │价格下跌?│   │触及网格?│ │                             │
│  │  │ 买入?   │   │交易?   │ │                             │
│  │  └────┬────┘   └────┬────┘ │                             │
│  │       │              │       │                             │
│  │       └──────┬───────┘       │                             │
│  │              │                │                             │
│  │              ▼                │                             │
│  │      ┌────────────────┐       │                             │
│  │      │ 综合决策输出     │       │                             │
│  │      │ buy/sell/hold   │       │                             │
│  │      └────────┬────────┘       │                             │
│  └───────────────┼─────────────────                             │
│                  │                                             │
│                  ▼                                             │
│         ┌────────────────┐                                    │
│         │  执行交易      │                                    │
│         │  下单/取消      │                                    │
│         └────────────────┘                                    │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

---

## 日志系统架构

```
┌──────────────────────────────────────────────────────────────┐
│                    日志数据流                                   │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────┐     ┌──────────────┐                     │
│  │  策略引擎     │     │  风险管理     │                     │
│  │  • DCA决策   │     │  • 止损       │                     │
│  │  • Grid决策  │     │  • 回撤       │                     │
│  └──────┬───────┘     └──────┬───────┘                     │
│         │                      │                             │
│         └──────────┬───────────┘                             │
│                    │                                         │
│                    ▼                                         │
│         ┌─────────────────────┐                              │
│         │      Logger          │                              │
│         │                      │                              │
│         │  ┌─────────────┐    │                              │
│         │  │decision()   │    │                              │
│         │  │trade()      │    │                              │
│         │  │risk()       │    │                              │
│         │  └──────┬──────┘    │                              │
│         │         │             │                              │
│         └─────────┼─────────────┘                              │
│                   │                                             │
│         ┌─────────┴──────────┐                               │
│         │                      │                               │
│         ▼                      ▼                               │
│  ┌────────────────┐     ┌───────────────┐                   │
│  │   SQLite       │     │  文件日志       │                   │
│  │                │     │                │                   │
│  │  • 决策日志    │     │  • 错误日志    │                   │
│  │  • 交易日志    │     │  • 运行日志    │                   │
│  │  • 风险日志    │     │  • YYYY-MM-DD  │                   │
│  │  • 查询分析    │     │    hh:mm:ss    │                   │
│  └────────────────┘     └───────────────┘                   │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### 日志类型与格式

| 日志类型 | SQLite 表 | 文件名 | 时间格式 |
|---------|----------|--------|---------|
| **决策日志** | decision_logs | decision_YYYY-MM-DD.log | 时间戳 (数字) |
| **交易日志** | trade_logs | trade_YYYY-MM-DD.log | 时间戳 (数字) |
| **风险日志** | risk_logs | risk_warning_YYYY-MM-DD.log | 时间戳 (数字) |
| **错误日志** | - | error_YYYY-MM-DD.log | YYYY-MM-DD hh:mm:ss |

### SQLite 数据结构

```sql
-- 决策日志
CREATE TABLE decision_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp INTEGER NOT NULL,        -- 毫秒时间戳
  coin TEXT NOT NULL,
  strategy TEXT NOT NULL,            -- 'dca' | 'grid' | 'risk'
  action TEXT NOT NULL,              -- 'buy' | 'sell' | 'hold' | ...
  reason TEXT NOT NULL,
  market_data TEXT,                  -- JSON
  decision_factors TEXT,             -- JSON
  metadata TEXT,                    -- JSON
  created_at INTEGER DEFAULT (strftime('%s', 'now'))
);

-- 交易日志
CREATE TABLE trade_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp INTEGER NOT NULL,        -- 毫秒时间戳
  order_id TEXT NOT NULL,
  client_order_id TEXT NOT NULL,
  coin TEXT NOT NULL,
  side TEXT NOT NULL,                -- 'buy' | 'sell'
  price REAL,
  size REAL,
  value REAL,
  fee REAL,
  status TEXT NOT NULL,              -- 'live' | 'filled' | 'cancelled' | 'failed'
  error TEXT,
  metadata TEXT,                    -- JSON
  created_at INTEGER DEFAULT (strftime('%s', 'now'))
);

-- 风险日志
CREATE TABLE risk_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp INTEGER NOT NULL,        -- 毫秒时间戳
  coin TEXT NOT NULL,
  event_type TEXT NOT NULL,          -- 'stop_loss' | 'drawdown_warning' | ...
  level TEXT NOT NULL,               -- 'info' | 'warning' | 'danger' | 'critical'
  message TEXT NOT NULL,
  trigger_value TEXT,                -- JSON
  threshold TEXT,                    -- JSON
  action_taken TEXT,
  metadata TEXT,                    -- JSON
  created_at INTEGER DEFAULT (strftime('%s', 'now'))
);
```

---

## 业务规则与限制

### 交易模式对比

| 特性 | 现货 SPOT | 合约 SWAP |
|------|----------|----------|
| **交易模式** | cash（现金） | isolated（逐仓） |
| **杠杆** | 无 | BTC ≤ 5x, ETH ≤ 3x |
| **强平风险** | 无 | 有 |
| **资金费率** | 无 | 有 |
| **支持币种** | 7 个 | 仅 BTC、ETH |

### 允许交易的币种

| 币种 | 现货 | 合约 | 最大杠杆 |
|------|:----:|:----:|:--------:|
| **BTC** | ✅ | ✅ | 5x |
| **ETH** | ✅ | ✅ | 3x |
| **BNB** | ✅ | ❌ | - |
| **SOL** | ✅ | ❌ | - |
| **XRP** | ✅ | ❌ | - |
| **ADA** | ✅ | ❌ | - |
| **DOGE** | ✅ | ❌ | - |

### 杠杆限制（整数倍）

| 币种 | 最小杠杆 | 最大杠杆 | 可用倍数 |
|------|---------|---------|---------|
| **BTC** | 1x | 5x | 1, 2, 3, 4, 5 |
| **ETH** | 1x | 3x | 1, 2, 3 |

⚠️ **重要**：OKX 平台仅允许整数倍杠杆，不能使用 1.5x、2.5x 等非整数倍数。

---

## 配置参数

### 策略默认配置

| 参数类别 | 参数名 | 默认值 | 说明 |
|---------|-------|-------|------|
| **资金** | totalCapital | 10000 USDT | 总资金 |
| | emergencyReserve | 5% | 应急储备金比例 |
| | maxCapitalPerCoin | 30% | 单币种最大资金占比 |
| **DCA** | baseOrderSize | 100 USDT | 每次 DCA 金额 |
| | frequency | 24h | 常规 DCA 间隔 |
| | reverseDCA.triggerThreshold | 3% | 触发逆向 DCA 的跌幅 |
| **网格** | gridCount | 20 | 网格数量 |
| | spacing | geometric | 网格间距方式 |
| | orderSize | 50 USDT | 单个网格订单金额 |
| **风险** | stopLoss.percentage | 15% | 止损百分比 |
| | drawdown.pauseLevel | 20% | 暂停新开仓的回撤 |
| **数据源** | restPollInterval | 2000ms | REST 轮询间隔 |

### 动态区间配置

| 配置项 | 默认值 | 说明 |
|-------|-------|------|
| websocketStaleThreshold | 5000ms | WebSocket 数据过期阈值 |
| restStaleThreshold | 10000ms | REST 数据过期阈值 |
| silentDisconnectThreshold | 8000ms | 静默断线检测阈值 |

---

## 运行流程

### 系统启动流程

```
1. 初始化 Logger（SQLite + 文件日志）
         │
         ▼
2. 创建 NetworkStateManager
         │
         ▼
3. 创建 DualDataSourceManager
         │  • 连接 WebSocket（可选）
         │  • 启动 REST 轮询（2秒）
         │
         ▼
4. 初始化策略引擎
         │  • 加载配置
         │  • 初始化 DCA、Grid、Coordinator
         │
         ▼
5. 启动主循环（5秒）
         │  • 获取市场数据
         │  • 更新仓位信息
         │  • 执行决策
         │  • 下单/取消订单
         │
         ▼
6. 监控与日志
         • 网络状态监控
         • 数据源自动切换
         • 决策/交易/风险日志记录
```

### 数据更新循环

```
┌──────────────────────────────────────────────────────────────┐
│                    主更新循环 (5秒)                              │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  while (running) {                                          │
│                                                              │
│    // 1. 获取最新市场数据                                    │
│    marketData = dataSource.getMarketData(coin);             │
│                                                              │
│    // 2. 更新持仓信息                                        │
│    position = updatePosition(coin, marketData);              │
│                                                              │
│    // 3. 自动调整策略模式                                    │
│    coordinator.autoAdjustMode(coin, position);               │
│                                                              │
│    // 4. 生成交易决策                                        │
│    decision = coordinator.makeDecision(coin, marketData,     │
│                                         position);              │
│                                                              │
│    // 5. 执行决策                                            │
│    if (decision.action !== 'hold') {                         │
│      executeDecision(decision);                               │
│    }                                                         │
│                                                              │
│    // 6. 更新权益和回撤                                      │
│    updateEquity();                                           │
│                                                              │
│    await sleep(5000);  // 等待5秒                           │
│  }                                                          │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

---

## 错误处理与恢复

### 网络错误处理

| 错误类型 | 检测方式 | 恢复策略 |
|---------|---------|---------|
| **WebSocket 断开** | pong 超时 / onclose | 指数退避重连 |
| **静默断线** | 8秒无数据推送 | 降级到 REST API |
| **REST API 失败** | 请求错误 | 重试（最多3次） |
| **数据过期** | 时间戳检测 | 触发数据更新 |

### 紧急情况处理

```
┌──────────────────────────────────────────────────────────────┐
│                  紧急情况响应流程                                │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  回撤 > 30%                                                  │
│     │                                                       │
│     ▼                                                       │
│  ┌──────────────┐                                           │
│  │紧急平仓      │  → 关闭所有仓位                          │
│  │emergency_close│  → 停止所有新开仓                         │
│  └──────────────┘                                           │
│                                                              │
│  止损触发                                                     │
│     │                                                       │
│     ▼                                                       │
│  ┌──────────────┐                                           │
│  │止损平仓      │  → 平仓当前币种                           │
│  │stop_loss    │  → 记录风险日志                            │
│  └──────────────┘                                           │
│                                                              │
│  回撤 > 20%                                                  │
│     │                                                       │
│     ▼                                                       │
│  ┌──────────────┐                                           │
│  │暂停新开仓    │  → 禁止新开仓                             │
│  │pause_trading │  → 保持现有仓位                           │
│  └──────────────┘                                           │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

---

## 文件结构

```
okx-trade/
├── src/
│   ├── api/                  # API 客户端
│   │   ├── rest.ts           # REST API 封装
│   │   └── websocket.ts      # WebSocket 客户端
│   │
│   ├── core/                 # 核心模块
│   │   ├── auth.ts           # API 认证
│   │   ├── constants.ts      # 常量定义
│   │   ├── network-state-manager.ts     # 网络状态管理 ⭐新增
│   │   └── dual-data-source-manager.ts   # 双数据源管理 ⭐新增
│   │
│   ├── strategies/           # 策略模块
│   │   └── spot-dca-grid/
│   │       ├── core/
│   │       │   ├── coordinator.ts    # 策略协调器
│   │       │   ├── dca-engine.ts      # DCA 引擎
│   │       │   ├── grid-engine.ts     # 网格引擎
│   │       │   └── engine.ts          # 主引擎
│   │       ├── order-management/
│   │       ├── risk-management/
│   │       └── config/
│   │
│   └── utils/                # 工具模块
│       └── logger.ts         # 统一日志系统
│
├── tests/                     # 测试文件
│   ├── core/                 # 核心模块测试 ⭐新增
│   │   └── dual-data-source.test.ts
│   ├── strategies/           # 策略测试
│   └── utils/                # 工具测试
│
├── docs/                      # 文档
│   ├── ARCHITECTURE.md       # 系统架构 ⭐本文档
│   ├── QUICK_START.md         # 快速开始
│   ├── API_REFERENCE.md       # API 参考
│   └── SAFETY_GUIDE.md        # 安全指南
│
├── data/                      # 生产数据库
├── logs/                      # 生产日志
└── bun.lock.json
```

---

## 开发与调试

### 启用双重数据源

```typescript
import { SpotDCAGridEngine } from './src/strategies/spot-dca-grid/core/engine.js';
import { WsClient } from './src/websocket/client.js';

// 创建 WebSocket 客户端
const wsClient = new WsClient({
  apiKey: process.env.OKX_API_KEY,
  secretKey: process.env.OKX_SECRET_KEY,
  passphrase: process.env.OKX_PASSPHRASE,
  isDemo: true
});

// 创建策略引擎
const engine = new SpotDCAGridStrategyEngine(config, {
  okxApi: restClient,
  wsClient: wsClient,          // 传入 WebSocket 客户端
  updateInterval: 5000,
  enableAutoTrade: false,
  maxConcurrentOrders: 3,

  // 启用双重数据源
  enableDualDataSource: true,
  restPollInterval: 2000       // 2秒 REST 轮询
});

// 启动
await engine.start();

// 获取网络状态
const networkState = engine.getNetworkState();
console.log('数据源:', networkState.primarySource);      // 'websocket' | 'rest'
console.log('健康状态:', networkState.currentStatus);   // 'healthy' | 'degraded' | 'unhealthy'

// 获取数据源统计
const stats = engine.getDataSourceStats();
console.log('WebSocket 健康:', stats.wsHealthy);
console.log('当前数据源:', stats.currentSource);
```

### 日志查询示例

```typescript
import { Logger } from './src/utils/logger.js';

const logger = Logger.getInstance();

// 查询最近的决策
const recentDecisions = logger.getDecisions({ limit: 10 });

// 查询特定币种
const btcTrades = logger.getTrades({ coin: 'BTC' });

// 查询时间范围
const todayDecisions = logger.getDecisions({
  startTime: Date.now() - 24 * 60 * 60 * 1000
});

// 获取决策统计
const stats = logger.getDecisionStats('BTC');
console.log(stats);
// { total: 100, byAction: {...}, byStrategy: {...} }
```

---

## 性能指标

| 指标 | 数值 | 说明 |
|------|------|------|
| **WebSocket 延迟** | <100ms | 实时推送 |
| **REST API 延迟** | ~500ms | 2秒轮询一次 |
| **内存占用** | ~50MB | 基础运行 |
| **CPU 占用** | <5% | 空闲状态 |
| **数据库写入** | <1ms | SQLite 批量写入 |

---

## 相关文档

- **[QUICK_START.md](./QUICK_START.md)** - 快速开始指南
- **[API_REFERENCE.md](./API_REFERENCE.md)** - OKX API 参考
- **[SAFETY_GUIDE.md](./SAFETY_GUIDE.md)** - 安全指南
