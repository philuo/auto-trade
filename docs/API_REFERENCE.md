# OKX API 参考手册

> 最后更新: 2025-01-18
> 完整 API 文档请参阅: [OKX 官方文档](https://www.okx.com/docs-v5/zh/#overview)

## 目录

### [快速导航](#快速导航)
- [API 端点](#api-端点)
- [模拟盘 vs 实盘](#模拟盘-vs-实盘)
- [市场区域说明](#市场区域说明)

### [接口说明](#接口说明)
- [账户接口](#账户接口)
- [交易接口](#交易接口)
- [市场数据接口](#市场数据接口)
- [公共接口](#公共接口)
- [WebSocket 接口](#websocket-接口)

### [参考信息](#参考信息)
- [数据模型](#数据模型)
- [错误码](#错误码)
- [请求示例](#请求示例)
- [重要提示](#重要提示)

---

## 快速导航

### API 端点

#### 实盘环境

```
REST API: https://www.okx.com/api/v5
WebSocket Public: wss://ws.okx.com:8443/ws/v5/public
WebSocket Private: wss://ws.okx.com:8443/ws/v5/private
WebSocket Business: wss://ws.okx.com:8443/ws/v5/business
```

#### 模拟盘环境

```
REST API: https://www.okx.com/api/v5
WebSocket Public: wss://wspap.okx.com:8443/ws/v5/public
WebSocket Private: wss://wspap.okx.com:8443/ws/v5/private
WebSocket Business: wss://wspap.okx.com:8443/ws/v5/business
```

**注意**: 模拟盘和实盘的 REST API 端点相同，但 WebSocket 端点不同。区分方式是通过 API Key 的类型：
- **模拟盘 API Key**: 在 OKX 模拟盘环境中创建
- **实盘 API Key**: 在 OKX 实盘环境中创建

### 模拟盘 vs 实盘

| 特性 | 模拟盘 | 实盘 |
|------|--------|------|
| REST API 端点 | 相同 | 相同 |
| WebSocket 端点 | 不同 (`wspap.okx.com`) | 不同 (`ws.okx.com`) |
| API Key 创建环境 | 模拟盘 | 实盘 |
| 真实资金交易 | ❌ 否 | ✅ 是 |
| 数据真实性 | 模拟数据 | 真实市场数据 |
| 支持功能 | 交易功能完整，不支持提币充值 | 全部功能 |

**模拟盘 API Key 创建流程**:
登录欧易账户 —> 交易 —> 模拟交易 —> 个人中心 —> 创建模拟盘 API Key —> 开始模拟交易

**模拟盘请求 header**:
需要在 REST API 请求中添加 `x-simulated-trading: 1` header。

### 市场区域说明

OKX 针对不同地区有不同的域名，但 WebSocket 端点保持一致：

#### 全球市场 (GLOBAL)

```
域名: www.okx.com
REST: https://www.okx.com/api/v5
WS:   wss://ws.okx.com:8443/ws/v5/public
```

#### EEA 市场 (欧洲经济区)

```
域名: my.okx.com
REST: https://my.okx.com/api/v5
WS:   wss://wseeapap.okx.com:8443/ws/v5/public (模拟盘)
```

#### US 市场 (美国)

```
域名: app.okx.com
REST: https://app.okx.com/api/v5
```

---

## 接口说明

## 账户接口

### 获取账户配置

```typescript
GET /api/v5/account/config
```

**响应字段**:
| 字段 | 类型 | 描述 |
|------|------|------|
| acctLv | string | 账户等级 |
| posMode | string | 持仓模式 |
| autoLoan | boolean | 是否自动借币 |

---

### 获取账户余额

```typescript
GET /api/v5/account/balance?ccy={ccy}
```

**请求参数**:
| 参数 | 类型 | 必须 | 描述 |
|------|------|------|------|
| ccy | string | 否 | 币种，如 BTC,USDT,ETH |

**响应字段**:
| 字段 | 类型 | 描述 |
|------|------|------|
| totalEq | string | 美元化权益总额 |
| details | array | 币种余额详情 |
| details[].ccy | string | 币种 |
| details[].availBal | string | 可用余额 |
| details[].bal | string | 余额 |
| details[].frozenBal | string | 冻结余额 |

---

### 获取持仓信息（仅合约）

```typescript
GET /api/v5/account/positions?instType={instType}&instId={instId}
```

**请求参数**:
| 参数 | 类型 | 必须 | 描述 |
|------|------|------|------|
| instType | string | 否 | 产品类型：SWAP |
| instId | string | 否 | 产品 ID |

**响应字段**:
| 字段 | 类型 | 描述 |
|------|------|------|
| instId | string | 产品 ID |
| pos | string | 持仓数量 |
| avgPx | string | 开仓平均价 |
| upl | string | 未实现盈亏 |
| uplRatio | string | 未实现盈亏率 |
| lever | string | 杠杆倍数 |
| liqPx | string | 强平价格 |
| mgnMode | string | 保证金模式 |

---

### 设置杠杆倍数（仅合约逐仓）

```typescript
POST /api/v5/account/set-leverage
```

**请求参数**:
| 参数 | 类型 | 必须 | 描述 |
|------|------|------|------|
| instId | string | 是 | 产品 ID，如 BTC-USDT-SWAP |
| lever | string | 是 | 杠杆倍数 |
| mgnMode | string | 是 | 保证金模式：isolated |
| posSide | string | 否 | 持仓方向：long, short, net |

---

### 获取最大可开仓数量（仅合约）

```typescript
GET /api/v5/account/max-size?instId={instId}&tdMode={tdMode}
```

**请求参数**:
| 参数 | 类型 | 必须 | 描述 |
|------|------|------|------|
| instId | string | 是 | 产品 ID |
| tdMode | string | 是 | 交易模式：isolated |
| ccy | string | 否 | 币种 |
| px | string | 否 | 开仓价格 |

---

### 获取最大可用数量

```typescript
GET /api/v5/account/max-avail-size?instId={instId}&tdMode={tdMode}
```

**响应字段**:
| 字段 | 类型 | 描述 |
|------|------|------|
| availBuy | string | 最大买入可用数量 |
| availSell | string | 最大卖出可用数量 |

---

## 交易接口

### 下单

```typescript
POST /api/v5/trade/order
```

**请求参数**:
| 参数 | 类型 | 必须 | 描述 |
|------|------|------|------|
| instId | string | 是 | 产品 ID |
| tdMode | string | 是 | 现货：cash，合约：isolated |
| ccy | string | 否 | 币种 |
| clOrdId | string | 否 | 客户自定义订单 ID |
| side | string | 是 | 订单方向：buy, sell |
| ordType | string | 是 | 订单类型 |
| sz | string | 是 | 委托数量 |
| px | string | 否* | 委托价格 |
| reduceOnly | boolean | 否 | 是否只减仓（仅合约） |

*注：限价单必须填写价格*

**订单类型 (ordType)**:
| 类型 | 描述 |
|------|------|
| market | 市价单 |
| limit | 限价单 |
| post_only | 只挂单 |
| fok | 全部成交或立即取消 |
| ioc | 立即成交并取消剩余 |

**响应字段**:
| 字段 | 类型 | 描述 |
|------|------|------|
| ordId | string | 订单 ID |
| clOrdId | string | 客户自定义订单 ID |
| sCode | string | 事件执行结果的code |
| sMsg | string | 事件执行结果的msg |

---

### 批量下单

```typescript
POST /api/v5/trade/batch-orders
```

**请求参数**: 数组，最多 20 个订单对象，参数同单个下单

---

### 修改订单

```typescript
POST /api/v5/trade/amend-order
```

**请求参数**:
| 参数 | 类型 | 必须 | 描述 |
|------|------|------|------|
| instId | string | 是 | 产品 ID |
| ordId | string | 否* | 订单 ID |
| clOrdId | string | 否* | 客户自定义订单 ID |
| newSz | string | 否 | 修改的新数量 |
| newPx | string | 否 | 修改的新价格 |

*注：ordId 和 clOrdId 必须填写其中一个*

---

### 撤销订单

```typescript
POST /api/v5/trade/cancel-order
```

**请求参数**:
| 参数 | 类型 | 必须 | 描述 |
|------|------|------|------|
| instId | string | 是 | 产品 ID |
| ordId | string | 否* | 订单 ID |
| clOrdId | string | 否* | 客户自定义订单 ID |

---

### 获取未成交订单列表

```typescript
GET /api/v5/trade/orders-pending?instType={instType}
```

**请求参数**:
| 参数 | 类型 | 必须 | 描述 |
|------|------|------|------|
| instType | string | 否 | 产品类型：SPOT, SWAP |
| instId | string | 否 | 产品 ID |
| ordType | string | 否 | 订单类型 |
| limit | string | 否 | 返回结果数量，最大 100 |

---

### 获取历史订单记录

```typescript
GET /api/v5/trade/orders-history?instType={instType}
```

**请求参数**:
| 参数 | 类型 | 必须 | 描述 |
|------|------|------|------|
| instType | string | 否 | 产品类型：SPOT, SWAP |
| instId | string | 否 | 产品 ID |
| ordType | string | 否 | 订单类型 |
| state | string | 否 | 订单状态 |
| begin | string | 否 | 筛选的开始时间戳 |
| end | string | 否 | 筛选的结束时间戳 |
| limit | string | 否 | 返回结果数量 |

---

### 获取成交明细

```typescript
GET /api/v5/trade/fills?instType={instType}
```

**请求参数**:
| 参数 | 类型 | 必须 | 描述 |
|------|------|------|------|
| instType | string | 否 | 产品类型：SPOT, SWAP |
| instId | string | 否 | 产品 ID |
| ordId | string | 否 | 订单 ID |
| begin | string | 否 | 筛选的开始时间戳 |
| end | string | 否 | 筛选的结束时间戳 |
| limit | string | 否 | 返回结果数量 |

---

## 市场数据接口

### 获取产品信息

```typescript
GET /api/v5/public/instruments?instType={instType}
```

**请求参数**:
| 参数 | 类型 | 必须 | 描述 |
|------|------|------|------|
| instType | string | 是 | 产品类型：SPOT, SWAP |
| instId | string | 否 | 产品 ID |
| uly | string | 否 | 标的指数 |

**响应字段**:
| 字段 | 类型 | 描述 |
|------|------|------|
| instId | string | 产品 ID |
| instType | string | 产品类型 |
| baseCcy | string | 交易货币币种 |
| quoteCcy | string | 计价货币币种 |
| settleCcy | string | 盈亏结算和保证金币种 |
| tickSz | string | 下单价格精度 |
| lotSz | string | 下单数量精度 |
| minSz | string | 最小下单数量 |

---

### 获取行情数据

```typescript
GET /api/v5/market/ticker?instId={instId}
```

**请求参数**:
| 参数 | 类型 | 必须 | 描述 |
|------|------|------|------|
| instId | string | 是 | 产品 ID |

---

### 获取所有产品行情

```typescript
GET /api/v5/market/tickers?instType={instType}
```

**请求参数**:
| 参数 | 类型 | 必须 | 描述 |
|------|------|------|------|
| instType | string | 是 | 产品类型：SPOT, SWAP |

---

### 获取 K 线数据

```typescript
GET /api/v5/market/candlesticks?instId={instId}&bar={bar}
```

**请求参数**:
| 参数 | 类型 | 必须 | 描述 |
|------|------|------|------|
| instId | string | 是 | 产品 ID |
| bar | string | 否 | 时间粒度 |
| after | string | 否 | 请求此时间戳之前的数据 |
| before | string | 否 | 请求此时间戳之后的数据 |
| limit | string | 否 | 返回数量，最大 300 |

**时间粒度**: 1m, 3m, 5m, 15m, 30m, 1H, 2H, 4H, 6H, 12H, 1D, 1W, 1M

---

### 获取深度数据

```typescript
GET /api/v5/market/books?instId={instId}
```

**请求参数**:
| 参数 | 类型 | 必须 | 描述 |
|------|------|------|------|
| instId | string | 是 | 产品 ID |
| sz | string | 否 | 返回深度档位数量，最大 400 |

---

### 获取成交数据

```typescript
GET /api/v5/market/trades?instId={instId}
```

**请求参数**:
| 参数 | 类型 | 必须 | 描述 |
|------|------|------|------|
| instId | string | 是 | 产品 ID |
| limit | string | 否 | 返回数量，最大 500 |

---

## 公共接口

### 获取系统时间

```typescript
GET /api/v5/public/time
```

---

### 获取系统状态

```typescript
GET /api/v5/system/status
```

---

## WebSocket 接口

### 连接地址

#### 实盘环境
```
公共频道: wss://ws.okx.com:8443/ws/v5/public
私有频道: wss://ws.okx.com:8443/ws/v5/private
业务频道: wss://ws.okx.com:8443/ws/v5/business
```

#### 模拟盘环境
```
公共频道: wss://wspap.okx.com:8443/ws/v5/public
私有频道: wss://wspap.okx.com:8443/ws/v5/private
业务频道: wss://wspap.okx.com:8443/ws/v5/business
```

### 登录认证

```typescript
{
  "op": "login",
  "args": [{
    "apiKey": "your_api_key",
    "passphrase": "your_passphrase",
    "timestamp": "timestamp",
    "sign": "signature"
  }]
}
```

**注意**:
- timestamp 使用秒级时间戳（不是毫秒）
- sign 是通过 HMAC-SHA256 签名生成的

### 频道列表

#### 公共频道

| 频道 | 描述 |
|------|------|
| tickers | 行情推送 |
| candle1m, candle3m, ... | K 线数据 (1m, 3m, 5m, 15m, 30m, 1H, 2H, 4H, 6H, 12H, 1D, 1W, 1M) |
| books, books5 | 订单簿深度 |
| books-l2-tbt | 产品深度 L2 TBT |
| trades | 市场成交 |
| status | 系统状态 |
| funding-rate | 资金费率（仅合约） |
| index-tickers | 指数行情（仅合约） |
| mark-price | 标记价格（仅合约） |

#### 私有频道

| 频道 | 描述 |
|------|------|
| account | 账户余额和配置 |
| positions | 持仓信息 |
| orders | 订单信息 |
| orders-algo | 策略订单 |
| balance_and_position | 账户持仓频道 |
| liquidation-warning | 强平风险频道 |

#### 业务频道操作

| 操作 | 描述 |
|------|------|
| place-order | 下单 |
| multiple-orders | 批量下单 |
| cancel-order | 撤单 |
| cancel-multiple-orders | 批量撤单 |
| amend-order | 修改订单 |
| close-position | 市价全平仓 |

### 订阅格式

```typescript
// 订阅公共频道
{
  "op": "subscribe",
  "args": [{
    "channel": "tickers",
    "instId": "BTC-USDT"
  }]
}

// 订阅私有频道
{
  "op": "subscribe",
  "args": [{
    "channel": "account"
  }]
}
```

### 心跳保活

OKX WebSocket 使用纯文本心跳：

```typescript
// 客户端发送
ws.send("ping");

// 服务器响应
"pong"
```

**注意**: 不要使用 JSON 格式 `{"op":"ping"}`，这会导致错误。

---

## 数据模型

### 产品类型 (instType)

| 类型 | 描述 |
|------|------|
| SPOT | 现货 |
| SWAP | 永续合约 |
| MARGIN | 杠杆 |
| OPTIONS | 期权 |

### 交易模式 (tdMode)

| 模式 | 描述 | 适用产品 |
|------|------|----------|
| cash | 非保证金模式 | SPOT |
| isolated | 逐仓保证金模式 | SWAP |
| cross | 全仓保证金模式 | SWAP (本系统禁用) |

### 订单类型 (ordType)

| 类型 | 描述 |
|------|------|
| market | 市价单 |
| limit | 限价单 |
| post_only | 只挂单 |
| fok | 全部成交或立即取消 (Fill-Or-Kill) |
| ioc | 立即成交并取消剩余 (Immediate-Or-Cancel) |

### 订单状态

| 状态 | 描述 |
|------|------|
| live | 等待成交 |
| partially_filled | 部分成交 |
| filled | 完全成交 |
| canceled | 已撤销 |

### 订单方向

| 方向 | 描述 |
|------|------|
| buy | 买入 |
| sell | 卖出 |

---

## 错误码

### 通用错误码

| 错误码 | 描述 |
|--------|------|
| 0 | 成功 |
| 50001 | IP 访问受限 |
| 50004 | API 密钥过期 |
| 50011 | 时间戳过期 |
| 50012 | 签名无效 |
| 50013 | 签名过期 |
| 50014 | API 密钥无效 |
| 50015 | API 密钥权限不足 |
| 50016 | 用户被冻结 |
| 50017 | 用户被禁用 |
| 50018 | API 请求频率超限 |
| 50019 | 服务端无响应 |
| 50020 | 客户端请求频率超限 |
| 50021 | 请求参数错误 |
| 50022 | 时间戳格式错误 |
| 50023 | 签名格式错误 |
| 50024 | API 密钥 IP 受限 |
| 50101 | API Key 不匹配当前环境 |

### 交易错误码

| 错误码 | 描述 |
|--------|------|
| 51001 | 订单不存在 |
| 51002 | 可用余额不足 |
| 51003 | 订单数量超过限制 |
| 51004 | 订单价格超过限制 |
| 51005 | 产品未开放交易 |
| 51006 | 产品暂停交易 |
| 51007 | 产品已下线 |
| 51008 | 用户被禁止交易 |
| 51023 | 杠杆倍数无效 |
| 51024 | 杠杆倍数超过限制 |
| 51025 | 客户自定义订单 ID 重复 |
| 51026 | 客户自定义订单 ID 无效 |
| 51027 | 订单已撤销 |
| 51028 | 订单已完全成交 |
| 51029 | 订单不可修改 |
| 51030 | 订单不可撤销 |

### WebSocket 错误码

| 错误码 | 描述 |
|--------|------|
| 60008 | 当前 WebSocket 端点不支持订阅私有频道 |
| 60012 | 非法请求 |
| 60032 | API Key 不存在 |

---

## 请求示例

### REST API - 获取行情

```typescript
// 获取单个币种行情
const response = await fetch('https://www.okx.com/api/v5/market/ticker?instId=BTC-USDT');
const data = await response.json();

console.log(data.data[0]);
// {
//   instId: 'BTC-USDT',
//   last: '95000',
//   lastSz: '0.01',
//   askPx: '95001',
//   bidPx: '94999',
//   ...
// }

// 获取 K 线数据
const candlesResponse = await fetch('https://www.okx.com/api/v5/market/candlesticks?instId=BTC-USDT&bar=1H&limit=10');
const candlesData = await candlesResponse.json();
console.log(candlesData.data);
```

### WebSocket - 公共频道订阅

```typescript
import { createWsClientFromEnv } from './src/websocket/index.js';

const wsClient = createWsClientFromEnv();

// 连接公共频道
await wsClient.connectPublic();

// 订阅 BTC-USDT 行情
wsClient.subscribe(
  {
    channel: 'tickers',
    instId: 'BTC-USDT',
  },
  (data) => {
    console.log('Ticker update:', data);
  }
);
```

### WebSocket - 私有频道订阅

```typescript
const wsClient = createWsClientFromEnv();

// 连接私有频道（自动登录）
await wsClient.connectPrivate();

// 订阅账户频道
wsClient.subscribe(
  {
    channel: 'account',
  },
  (data) => {
    console.log('Account update:', data);
  }
);
```

### WebSocket - 订阅 K 线

```typescript
// 订阅 1 分钟 K 线
wsClient.subscribe(
  {
    channel: 'candle1m',
    instId: 'BTC-USDT',
  },
  (data) => {
    console.log('1M Candle update:', data);
  }
);

// 订阅 1 小时 K 线
wsClient.subscribe(
  {
    channel: 'candle1H',
    instId: 'BTC-USDT',
  },
  (data) => {
    console.log('1H Candle update:', data);
  }
);
```

---

## 重要提示

### 1. 模拟盘注意事项

- 模拟盘环境主要用于测试交易策略
- 模拟盘公共市场数据推送可能受限
- 需要在模拟盘环境中创建专用的 API Key
- REST API 请求需要添加 `x-simulated-trading: 1` header

### 2. WebSocket 连接稳定性

WebSocket 连接可能因为以下原因断开:
- 网络不稳定
- 长时间无数据传输
- 服务器端维护

建议实现:
- 心跳保活 (ping/pong)
- 自动重连机制
- 订阅状态恢复

### 3. 认证方式

私有频道需要使用 API Key 进行认证:
- `apiKey`: API Key
- `secretKey`: Secret Key
- `passphrase`: 口令短语

认证信息通过 WebSocket 登录消息发送:
```json
{
  "op": "login",
  "args": [{
    "apiKey": "your-api-key",
    "passphrase": "your-passphrase",
    "timestamp": "1234567890",
    "sign": "signature-string"
  }]
}
```

**注意**:
- timestamp 必须使用秒级时间戳
- sign 通过 HMAC-SHA256 签名生成

### 4. 代理支持

本项目已支持通过 Clash 代理访问 OKX API：

**HTTP 代理** (自动检测):
```bash
export HTTP_PROXY=http://127.0.0.1:7890
export HTTPS_PROXY=http://127.0.0.1:7890
```

**SOCKS5 代理** (自动转换):
```bash
export ALL_PROXY=socks5://127.0.0.1:7890
```

WebSocket 使用 Bun 1.3.6+ 原生代理支持，无需额外配置。

---

## 相关文档

- **[README.md](./README.md)** - 文档导航
- **[QUICK_START.md](./QUICK_START.md)** - 快速开始
- **[STRATEGIES.md](./STRATEGIES.md)** - 策略说明
- **[SAFETY_GUIDE.md](./SAFETY_GUIDE.md)** - 安全指南
- **[TECHNICAL_ANALYSIS.md](./TECHNICAL_ANALYSIS.md)** - 技术分析

业务规则限制（杠杆限制、币种白名单）请参见 [README.md](./README.md)。

---

## 参考资料

- [OKX 官方 API 文档](https://www.okx.com/docs-v5/zh/)
- [OKX WebSocket 指南](https://www.okx.com/docs-v5/zh/#websocket-api)
- [OKX 更新日志](https://www.okx.com/docs-v5/log_zh/)
