# OkX 量化交易系统实现计划

## 项目概述

### 目标
实现一个基于 OkX 平台的虚拟币量化交易系统，支持**现货交易（SPOT）**和**永续合约（SWAP）**，使用 TypeScript 和 Bun 运行时，通过自定义封装模块对接 OkX API。

### 支持的交易模式
- **现货交易（SPOT）**: 使用 `cash` 模式，无杠杆
- **永续合约（SWAP）**: 使用 `isolated` 逐仓模式

### 业务规则限制
⚠️ **重要约束**：
1. **禁止借币**: 不允许任何形式的借币操作
2. **杠杆限制**:
   - BTC 合约：最大 5x 杠杆
   - ETH 合约：最大 3x 杠杆
   - 其它币种：仅允许现货交易，不允许合约
3. **币种限制**: 仅允许交易以下 7 个币种（BTC、ETH、BNB、SOL、XRP、ADA、DOGE）

### 支持的交易币种（按市值排名）
| 排名 | 币种 | 现货 | 合约 | 最大杠杆 |
|------|------|------|------|----------|
| 1 | BTC (Bitcoin) | ✅ | ✅ | 5x |
| 2 | ETH (Ethereum) | ✅ | ✅ | 3x |
| 3 | BNB (Binance Coin) | ✅ | ❌ | - |
| 4 | SOL (Solana) | ✅ | ❌ | - |
| 5 | XRP (Ripple) | ✅ | ❌ | - |
| 6 | ADA (Cardano) | ✅ | ❌ | - |
| 7 | DOGE (Dogecoin) | ✅ | ❌ | - |

### 技术栈
- **运行时**: Bun (替代 Node.js)
- **语言**: TypeScript
- **API**: OkX V5 API (模拟盘)
- **通信协议**: REST API + WebSocket

### 模拟盘配置
```
API Key: xxx
Secret Key: xxx
Passphrase: xxx
```

---

## 系统架构

### 目录结构
```
okx-trade/
├── src/
│   ├── core/              # 核心模块
│   │   ├── auth.ts        # 认证模块
│   │   ├── config.ts      # 配置管理
│   │   └── constants.ts   # 常量定义
│   ├── api/               # REST API 封装
│   │   ├── rest.ts        # REST 请求基础类
│   │   ├── account.ts     # 账户相关接口
│   │   ├── trade.ts       # 交易相关接口
│   │   ├── market.ts      # 市场数据接口
│   │   └── public.ts      # 公共数据接口
│   ├── websocket/         # WebSocket 模块
│   │   ├── client.ts      # WebSocket 客户端
│   │   ├── channels/      # 频道订阅
│   │   │   ├── account.ts      # 账户频道
│   │   │   ├── orders.ts       # 订单频道
│   │   │   ├── tickers.ts      # 行情频道
│   │   │   ├── candle.ts       # K线频道
│   │   │   └── books.ts        # 深度频道
│   │   └── handlers.ts    # 消息处理器
│   ├── models/            # 数据模型
│   │   ├── account.ts     # 账户模型
│   │   ├── order.ts       # 订单模型
│   │   ├── position.ts    # 持仓模型（仅合约）
│   │   └── market.ts      # 市场模型
│   ├── strategies/        # 交易策略
│   │   ├── base.ts        # 策略基类
│   │   └── examples/      # 示例策略
│   ├── utils/             # 工具函数
│   │   ├── logger.ts      # 日志工具
│   │   ├── sign.ts        # 签名工具
│   │   └── helpers.ts     # 辅助函数
│   └── index.ts           # 入口文件
├── config/                # 配置文件
│   ├── default.json       # 默认配置
│   └── .env.example       # 环境变量示例
├── docs/                  # 文档目录
├── tests/                 # 测试文件
└── package.json
```

---

## 实现阶段

### 第一阶段：基础架构搭建

#### 1.1 项目配置
- [ ] 配置 TypeScript 编译选项
- [ ] 设置 Bun 运行环境
- [ ] 配置环境变量管理
- [ ] 创建配置文件结构

#### 1.2 核心模块实现

**认证模块 (`src/core/auth.ts`)**
- [ ] 实现 API 签名算法 (HMAC-SHA256)
- [ ] 生成时间戳
- [ ] 构建 Authorization 头
- [ ] WebSocket 登录认证

**配置管理 (`src/core/config.ts`)**
- [ ] 配置加载与验证
- [ ] 环境变量解析
- [ ] API 端点配置（区分模拟盘/实盘）
- [ ] 运行时配置更新

**常量定义 (`src/core/constants.ts`)**
- [ ] API 端点常量
- [ ] 产品类型常量（SPOT, SWAP）
- [ ] 交易模式常量（cash, isolated）
- [ ] 订单状态常量
- [ ] 错误码映射
- [ ] **允许交易的币种列表（白名单）**
- [ ] **杠杆限制配置（BTC: 5x, ETH: 3x）**
- [ ] **禁止借币配置**

### 第二阶段：REST API 封装

#### 2.1 基础 HTTP 客户端 (`src/api/rest.ts`)
- [ ] 封装 Bun 的 fetch API
- [ ] 实现请求签名
- [ ] 错误处理与重试机制
- [ ] 速率限制控制
- [ ] 响应数据解析

#### 2.2 账户接口 (`src/api/account.ts`)
- [ ] 获取账户配置 `GET /api/v5/account/config`
- [ ] 获取账户余额 `GET /api/v5/account/balance`
- [ ] 获取持仓信息 `GET /api/v5/account/positions`（仅合约）
- [ ] 设置杠杆倍数 `POST /api/v5/account/set-leverage`（仅合约逐仓，**需验证杠杆上限**）
- [ ] 获取最大可开仓数量 `GET /api/v5/account/max-size`（仅合约）
- [ ] 获取最大可用数量 `GET /api/v5/account/max-avail-size`
- [ ] **币种白名单验证**
- [ ] **杠杆限制验证**（BTC≤5x, ETH≤3x, 其它禁止合约）

#### 2.3 交易接口 (`src/api/trade.ts`)
- [ ] 下单 `POST /api/v5/trade/order`
- [ ] 批量下单 `POST /api/v5/trade/batch-orders`
- [ ] 修改订单 `POST /api/v5/trade/amend-order`
- [ ] 撤销订单 `POST /api/v5/trade/cancel-order`
- [ ] 批量撤单 `POST /api/v5/trade/cancel-batch-orders`
- [ ] 获取订单列表 `GET /api/v5/trade/orders-pending`
- [ ] 获取历史订单 `GET /api/v5/trade/orders-history`
- [ ] 获取成交明细 `GET /api/v5/trade/fills`

#### 2.4 市场数据接口 (`src/api/market.ts`)
- [ ] 获取产品信息 `GET /api/v5/public/instruments`
- [ ] 获取行情数据 `GET /api/v5/market/ticker`
- [ ] 获取 K 线数据 `GET /api/v5/market/candlesticks`
- [ ] 获取深度数据 `GET /api/v5/market/books`
- [ ] 获取成交数据 `GET /api/v5/market/trades`
- [ ] 获取所有产品行情 `GET /api/v5/market/tickers`

#### 2.5 公共接口 (`src/api/public.ts`)
- [ ] 获取系统时间 `GET /api/v5/public/time`
- [ ] 获取系统状态 `GET /api/v5/system/status`

### 第三阶段：WebSocket 实现

#### 3.1 WebSocket 客户端 (`src/websocket/client.ts`)
- [ ] 连接管理（连接、断开、重连）
- [ ] 心跳保活机制
- [ ] 消息队列管理
- [ ] 认证登录
- [ ] 订阅/取消订阅管理

#### 3.2 频道订阅

**账户频道 (`src/websocket/channels/account.ts`)**
- [ ] 订阅账户频道
- [ ] 处理账户余额更新

**订单频道 (`src/websocket/channels/orders.ts`)**
- [ ] 订阅订单频道
- [ ] 处理订单状态更新
- [ ] 订单成交推送

**持仓频道 (`src/websocket/channels/positions.ts`)**
- [ ] 订阅持仓频道（仅合约）
- [ ] 处理持仓数量更新
- [ ] 处理持仓盈亏更新

**行情频道 (`src/websocket/channels/tickers.ts`)**
- [ ] 订阅行情频道
- [ ] 处理实时行情推送

**K线频道 (`src/websocket/channels/candle.ts`)**
- [ ] 订阅 K 线频道
- [ ] 处理 K 线数据推送

**深度频道 (`src/websocket/channels/books.ts`)**
- [ ] 订阅深度频道（增量/快照）
- [ ] 处理订单簿更新
- [ ] 本地订单簿维护

#### 3.3 消息处理器 (`src/websocket/handlers.ts`)
- [ ] 事件分发机制
- [ ] 消息类型路由
- [ ] 数据验证与解析

### 第四阶段：数据模型

#### 4.1 基础模型
- [ ] 账户模型 (`src/models/account.ts`)
- [ ] 订单模型 (`src/models/order.ts`)
- [ ] 持仓模型 (`src/models/position.ts`)（仅合约）
- [ ] 市场模型 (`src/models/market.ts`)

#### 4.2 类型定义
- [ ] API 请求/响应类型
- [ ] WebSocket 消息类型
- [ ] 配置类型

### 第五阶段：交易策略框架

#### 5.1 策略基类 (`src/strategies/base.ts`)
- [ ] 策略生命周期管理
- [ ] 数据订阅接口
- [ ] 订单执行接口
- [ ] 风险控制接口
- [ ] 性能统计

#### 5.2 示例策略
- [ ] 网格交易策略（现货/合约）
- [ ] 均值回归策略
- [ ] 动量策略

### 第六阶段：工具函数

#### 6.1 日志工具 (`src/utils/logger.ts`)
- [ ] 分级日志
- [ ] 文件日志
- [ ] 日志轮转

#### 6.2 签名工具 (`src/utils/sign.ts`)
- [ ] HMAC-SHA256 签名
- [ ] 请求签名构建

#### 6.3 辅助函数 (`src/utils/helpers.ts`)
- [ ] 数字精度处理
- [ ] 时间格式化
- [ ] 数据验证

### 第七阶段：测试与优化

#### 7.1 单元测试
- [ ] 核心模块测试
- [ ] API 接口测试
- [ ] 工具函数测试

#### 7.2 集成测试
- [ ] 模拟盘连接测试
- [ ] 完整交易流程测试
- [ ] 异常处理测试

#### 7.3 性能优化
- [ ] 请求并发控制
- [ ] 内存使用优化
- [ ] WebSocket 消息处理优化

---

## API 实现优先级

### P0 - 核心功能（第一阶段）
1. 认证模块
2. REST 基础客户端
3. 账户余额查询
4. 基础下单/撤单
5. 订单状态查询

### P1 - 交易功能（第二阶段）
1. 持仓查询与管理（仅合约）
2. 批量订单操作
3. 杠杆设置（仅合约逐仓）
4. 历史订单/成交查询

### P2 - 市场数据（第三阶段）
1. WebSocket 基础客户端
2. 行情频道订阅
3. 订单频道订阅
4. 持仓频道订阅（仅合约）
5. 账户频道订阅

### P3 - 高级功能（第四阶段）
1. 深度数据处理
2. K 线数据获取
3. 策略框架
4. 回测系统

---

## 关键技术点

### 1. 认证与签名
```
签名算法: HMAC-SHA256
签名串: timestamp + method + requestPath + body
签名结果: base64(signature)
```

### 2. 请求限制
- REST API: 20 次/秒
- WebSocket: 订阅 240 个频道

### 3. 交易模式映射
| 产品类型 | 交易模式(tdMode) | 说明 |
|---------|-----------------|------|
| SPOT（现货） | cash | 非保证金模式 |
| SWAP（永续合约） | isolated | 逐仓保证金模式 |

### 4. 现货 vs 合约差异

| 特性 | 现货 SPOT | 永续合约 SWAP |
|------|-----------|---------------|
| 交易模式 | cash | isolated |
| 杠杆 | 无 | 有（需设置） |
| 持仓 | 无持仓概念 | 有持仓数据 |
| 订单方向 | buy/sell | buy/sell |
| 计价 | baseCcy/quoteCcy | 以结算币计价 |
| 资金占用 | 全额占用 | 保证金占用 |

### 5. 订单状态机
```
live (等待成交)
  ↓
partially_filled (部分成交) → filled (完全成交)
  ↓                           ↓
canceled (已撤销)        canceled (已撤销)

特殊流程:
- IOC/FOK订单: live → canceled
- 系统取消: live/partially_filled → canceled
```

### 6. WebSocket 数据对账
- 使用 `tradeId` 进行订单与持仓对账（仅合约）
- 持仓的 `tradeId` 为最新成交 ID
- 强平/ADL 不更新 `tradeId`

---

## 配置管理

### 环境变量
```bash
# API 配置
OKX_API_KEY=your_api_key
OKX_SECRET_KEY=your_secret_key
OKX_PASSPHRASE=your_passphrase
OKX_IS_DEMO=true

# 项目配置
LOG_LEVEL=info
LOG_FILE_PATH=./logs
```

### API 端点
```typescript
const API_ENDPOINTS = {
  DEMO_REST: 'https://www.okx.com',
  DEMO_WS_PUBLIC: 'wss://wspap.okx.com:8443/ws/v5/public',
  DEMO_WS_PRIVATE: 'wss://wspap.okx.com:8443/ws/v5/private',
}
```

### 业务规则配置
```typescript
// 允许交易的币种（7个）
const ALLOWED_COINS = [
  'BTC', 'ETH', 'BNB', 'SOL',
  'XRP', 'ADA', 'DOGE'
];

// 合约杠杆限制
const LEVERAGE_LIMITS = {
  'BTC': 5,
  'ETH': 3,
  // 其它币种不允许合约
};

// 仅允许合约的币种
const SWAP_ALLOWED_COINS = ['BTC', 'ETH'];
```

---

## 风险控制

### 系统级风险控制
1. **速率限制**: 严格遵守 API 调用频率限制
2. **资金安全**:
   - 初始使用小额资金测试
   - 设置单笔/单日最大交易限额
   - 异常情况自动停止交易
3. **错误处理**:
   - 网络异常重试机制
   - API 错误码处理
   - 订单状态异常告警

### 业务规则控制 ⚠️
1. **币种白名单**:
   - 交易前验证币种是否在白名单中
   - 禁止任何白名单外的币种交易
2. **杠杆限制**:
   - BTC 合约最大 5x 杠杆
   - ETH 合约最大 3x 杠杆
   - 设置杠杆时强制验证上限
   - 其它币种禁止合约交易
3. **禁止借币**:
   - 禁止自动借币功能
   - 禁止跨币种保证金模式
   - 仅使用 `cash` 和 `isolated` 模式

### 交易级风险控制
1. **仓位控制**:
   - 现货：最大持仓比例限制
   - 合约：单品种持仓限制 + 杠杆控制
2. **止损机制**:
   - 单笔止损设置
   - 整体止损设置
3. **异常监控**:
   - 价格异常检测
   - 成交异常检测
   - 合约强平风险监控

---

## 测试计划

### 单元测试覆盖
- [ ] 签名算法测试
- [ ] 数据模型验证
- [ ] 工具函数测试

### 集成测试场景
- [ ] 现货完整下单流程
- [ ] 合约完整下单流程
- [ ] 订单状态变更
- [ ] WebSocket 订阅与推送
- [ ] 异常场景处理

### 测试策略
1. 先在模拟盘充分测试
2. 使用小额资金验证
3. 逐步增加交易规模
4. 监控系统稳定性

---

## 部署与监控

### 部署准备
- [ ] Docker 容器化
- [ ] 环境配置管理
- [ ] 日志收集配置

### 监控指标
- [ ] API 调用成功率
- [ ] 订单执行延迟
- [ ] WebSocket 连接稳定性
- [ ] 系统资源使用

### 告警机制
- [ ] 连接异常告警
- [ ] 订单异常告警
- [ ] 资金异常告警
- [ ] 合约强平风险告警

---

## 参考文档

### 官方文档
- [OkX API 文档](https://www.okx.com/docs-v5/zh/#overview)
- [最佳实践](https://www.okx.com/docs-v5/trick_zh/#instrument-configuration)
- [更新日志](https://www.okx.com/docs-v5/log_zh/#upcoming-changes)

### 技术文档
- [Bun 文档](https://bun.sh/docs)
- [TypeScript 文档](https://www.typescriptlang.org/docs)

---

## 时间规划

### 第一周
- 完成项目架构搭建
- 实现核心认证模块
- 完成基础 REST 客户端

### 第二周
- 完成账户相关接口
- 完成交易相关接口
- 完成市场数据接口

### 第三周
- 实现 WebSocket 客户端
- 实现核心频道订阅
- 完成消息处理机制

### 第四周
- 实现数据模型
- 完成工具函数
- 编写单元测试

### 第五周及以后
- 实现策略框架
- 编写示例策略
- 系统测试与优化

---

## 注意事项

1. **模拟盘使用**:
   - 模拟盘 API 使用与实盘相同的端点
   - 通过 API Key 区分模拟盘/实盘

2. **时间戳同步**:
   - 需要与服务器时间保持同步
   - 使用 `GET /api/v5/public/time` 校准

3. **WebSocket 重连**:
   - 实现自动重连机制
   - 重连后重新订阅频道

4. **数据精度**:
   - 价格和数量精度需符合交易规则
   - 使用产品信息中的 `tickSz` 和 `lotSz`

5. **订单ID管理**:
   - 建议使用 `clOrdId` 便于订单追踪
   - 保证 `clOrdId` 唯一性

6. **业务规则限制** ⚠️:
   - **严格禁止借币**: 确保不启用任何借币功能
   - **币种白名单**: 交易前必须验证币种是否在允许列表中
   - **杠杆限制**: BTC 合约 ≤ 5x，ETH 合约 ≤ 3x，其它币种禁止合约
   - **逐仓模式**: 合约必须使用 `isolated` 模式，禁止 `cross` 模式

7. **合约特殊注意**:
   - 永续合约有资金费率
   - 注意强平价格监控
   - 杠杆设置在逐仓模式下按产品设置

8. **现货 vs 合约**:
   - 现货 tdMode 固定为 `cash`
   - 合约 tdMode 固定为 `isolated`
   - 现货无持仓概念，只有余额变化
   - 合约有持仓数据，需要对账
