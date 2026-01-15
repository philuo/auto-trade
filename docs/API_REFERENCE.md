# OkX API 参考手册

完整 API 文档请参阅：[OKX 官方文档](https://www.okx.com/docs-v5/zh/#overview)

---

## 目录

### [账户接口](#账户接口)
- [获取账户配置](#获取账户配置)
- [获取账户余额](#获取账户余额)
- [获取持仓信息](#获取持仓信息仅合约)
- [设置杠杆倍数](#设置杠杆倍数仅合约逐仓)
- [获取最大可开仓数量](#获取最大可开仓数量仅合约)
- [获取最大可用数量](#获取最大可用数量)

### [交易接口](#交易接口)
- [下单](#下单)
- [批量下单](#批量下单)
- [修改订单](#修改订单)
- [撤销订单](#撤销订单)
- [获取未成交订单列表](#获取未成交订单列表)
- [获取历史订单记录](#获取历史订单记录)
- [获取成交明细](#获取成交明细)

### [市场数据接口](#市场数据接口)
- [获取产品信息](#获取产品信息)
- [获取行情数据](#获取行情数据)
- [获取所有产品行情](#获取所有产品行情)
- [获取 K 线数据](#获取-k-线数据)
- [获取深度数据](#获取深度数据)
- [获取成交数据](#获取成交数据)

### [公共接口](#公共接口)
- [获取系统时间](#获取系统时间)
- [获取系统状态](#获取系统状态)

### [WebSocket 接口](#websocket-接口)
- [连接地址](#连接地址)
- [登录认证](#登录认证)
- [订阅频道](#订阅频道)
- [频道列表](#频道列表)

### [数据模型](#数据模型)
- [产品类型](#产品类型)
- [交易模式](#交易模式)
- [订单状态](#订单状态)

### [错误码](#错误码)
- [通用错误码](#通用错误码)
- [交易错误码](#交易错误码)

---

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

```
公共频道: wss://wspap.okx.com:8443/ws/v5/public
私有频道: wss://wspap.okx.com:8443/ws/v5/private
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

### 频道列表

| 频道 | 描述 |
|------|------|
| account | 账户余额和配置 |
| positions | 持仓信息（仅合约） |
| orders | 订单信息 |
| tickers | 行情信息 |
| candle1m, candle3m, etc | K 线数据 |
| books, books5, books-l2-tbt | 订单簿深度 |
| trades | 市场成交 |
| status | 系统状态 |

---

## 数据模型

### 产品类型

| 类型 | 描述 |
|------|------|
| SPOT | 现货 |
| SWAP | 永续合约 |

### 交易模式 (tdMode)

| 模式 | 描述 | 适用产品 |
|------|------|----------|
| cash | 非保证金模式 | SPOT |
| isolated | 逐仓保证金模式 | SWAP |

### 订单状态

| 状态 | 描述 |
|------|------|
| live | 等待成交 |
| partially_filled | 部分成交 |
| filled | 完全成交 |
| canceled | 已撤销 |

---

## 错误码

### 通用错误码

| 错误码 | 描述 |
|--------|------|
| 50001 | IP 访问受限 |
| 50011 | 时间戳过期 |
| 50012 | 签名无效 |
| 50013 | 签名过期 |
| 50014 | API 密钥无效 |
| 50018 | API 请求频率超限 |
| 50021 | 请求参数错误 |

### 交易错误码

| 错误码 | 描述 |
|--------|------|
| 51002 | 可用余额不足 |
| 51003 | 订单数量超过限制 |
| 51023 | 杠杆倍数无效 |
| 51024 | 杠杆倍数超过限制 |

---

## 相关文档

- **[README.md](./README.md)** - 文档导航
- **[QUICK_START.md](./QUICK_START.md)** - 快速开始
- **[STRATEGIES.md](./STRATEGIES.md)** - 策略说明
- **[ARCHITECTURE.md](./ARCHITECTURE.md)** - 系统架构

业务规则限制（杠杆限制、币种白名单）请参见 [README.md](./README.md)。
