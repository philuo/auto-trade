# OkX API 参考手册 (SPOT + SWAP)

## ⚠️ 业务规则限制

**重要约束**：
1. **禁止借币**: 不允许任何形式的借币操作
2. **杠杆限制**:
   - BTC 合约：最大 5x 杠杆
   - ETH 合约：最大 3x 杠杆
   - 其它币种：仅允许现货交易，不允许合约
3. **币种限制**: 仅允许交易以下 7 个币种（BTC、ETH、BNB、SOL、XRP、ADA、DOGE）

---

## 目录
- [账户接口](#账户接口)
- [交易接口](#交易接口)
- [市场数据接口](#市场数据接口)
- [公共接口](#公共接口)
- [WebSocket 接口](#websocket-接口)
- [数据模型](#数据模型)

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

**注意**:
- 逐仓模式下杠杆按产品设置
- ⚠️ **杠杆限制**:
  - BTC-USDT-SWAP 最大 5x
  - ETH-USDT-SWAP 最大 3x
  - 其它币种不允许设置合约杠杆

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

### 批量下单
```typescript
POST /api/v5/trade/batch-orders
```

**请求参数**:
数组，最多 20 个订单对象，参数同单个下单

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
| ctVal | string | 合约面值 |
| ctMult | string | 合约乘数 |
| tickSz | string | 下单价格精度 |
| lotSz | string | 下单数量精度 |
| minSz | string | 最小下单数量 |

### 获取行情数据
```typescript
GET /api/v5/market/ticker?instId={instId}
```

**请求参数**:
| 参数 | 类型 | 必须 | 描述 |
|------|------|------|------|
| instId | string | 是 | 产品 ID |

**响应字段**:
| 字段 | 类型 | 描述 |
|------|------|------|
| instId | string | 产品 ID |
| instType | string | 产品类型 |
| last | string | 最新成交价 |
| lastSz | string | 最新成交数量 |
| askPx | string | 卖一价 |
| bidPx | string | 买一价 |
| open24h | string | 24小时开盘价 |
| high24h | string | 24小时最高价 |
| low24h | string | 24小时最低价 |
| vol24h | string | 24小时成交量 |
| volCcy24h | string | 24小时成交额 |

### 获取所有产品行情
```typescript
GET /api/v5/market/tickers?instType={instType}
```

**请求参数**:
| 参数 | 类型 | 必须 | 描述 |
|------|------|------|------|
| instType | string | 是 | 产品类型：SPOT, SWAP |
| uly | string | 否 | 标的指数 |

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

**时间粒度 (bar)**:
1m, 3m, 5m, 15m, 30m, 1H, 2H, 4H, 6H, 12H, 1D, 1W, 1M

**响应数据**: 按时间顺序排列的数组，每个元素为 `[时间戳, 开盘价, 最高价, 最低价, 收盘价, 成交量, 成交额]`

### 获取深度数据
```typescript
GET /api/v5/market/books?instId={instId}
```

**请求参数**:
| 参数 | 类型 | 必须 | 描述 |
|------|------|------|------|
| instId | string | 是 | 产品 ID |
| sz | string | 否 | 返回深度档位数量，最大 400 |

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

**响应字段**:
| 字段 | 类型 | 描述 |
|------|------|------|
| ts | string | 服务器时间戳，毫秒 |

### 获取系统状态
```typescript
GET /api/v5/system/status
```

**响应字段**:
| 字段 | 类型 | 描述 |
|------|------|------|
| status | string | 系统状态：scheduled, maintenance |
| msg | string | 状态消息 |
| title | string | 标题 |

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

### 订阅频道
```typescript
{
  "op": "subscribe",
  "args": [{
    "channel": "channel_name",
    "instType": "SPOT/SWAP",
    "instId": "BTC-USDT/BTC-USDT-SWAP"
  }]
}
```

### 频道列表

#### 1. 账户频道 (account)
订阅账户余额和配置信息的更新

**订阅参数**:
| 参数 | 类型 | 必须 | 描述 |
|------|------|------|------|
| channel | string | 是 | 固定值：account |
| ccy | string | 否 | 币种 |

#### 2. 持仓频道 (positions) - 仅合约
订阅持仓信息更新

**订阅参数**:
| 参数 | 类型 | 必须 | 描述 |
|------|------|------|------|
| channel | string | 是 | 固定值：positions |
| instType | string | 否 | 产品类型：SWAP |
| instId | string | 否 | 产品 ID |
| instFamily | string | 否 | 交易品种 |

#### 3. 订单频道 (orders)
订阅订单信息更新

**订阅参数**:
| 参数 | 类型 | 必须 | 描述 |
|------|------|------|------|
| channel | string | 是 | 固定值：orders |
| instType | string | 否 | 产品类型：SPOT, SWAP |
| instId | string | 否 | 产品 ID |
| instFamily | string | 否 | 交易品种 |

#### 4. 策略订单频道 (orders-algo)
订阅策略订单信息更新

#### 5. 行情频道 (tickers)
订阅产品行情信息更新

**订阅参数**:
| 参数 | 类型 | 必须 | 描述 |
|------|------|------|------|
| channel | string | 是 | 固定值：tickers |
| instId | string | 是 | 产品 ID |

#### 6. K 线频道 (candle1m, candle3m, etc)
订阅 K 线数据更新

**订阅参数**:
| 参数 | 类型 | 必须 | 描述 |
|------|------|------|------|
| channel | string | 是 | K 线频道名 |
| instId | string | 是 | 产品 ID |

#### 7. 深度频道 (books, books5, books-l2-tbt)
订阅订单簿深度数据更新

**订阅参数**:
| 参数 | 类型 | 必须 | 描述 |
|------|------|------|------|
| channel | string | 是 | 深度频道名 |
| instId | string | 是 | 产品 ID |

#### 8. 交易频道 (trades)
订阅市场成交数据更新

#### 9. 状态频道 (status)
订阅系统状态更新

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

### 订单方向 (side)
| 方向 | 描述 |
|------|------|
| buy | 买 |
| sell | 卖 |

### 持仓方向 (posSide) - 仅合约
| 方向 | 描述 |
|------|------|
| long | 开多 |
| short | 开空 |
| net | 双向持仓模式下的净持仓 |

### 现货 vs 合约差异
| 特性 | 现货 SPOT | 永续合约 SWAP |
|------|-----------|---------------|
| 交易模式 | cash | isolated |
| 杠杆 | 无 | 有 |
| 持仓 | 无 | 有 |
| 资金费率 | 无 | 有 |
| 强平风险 | 无 | 有 |

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
| 51009 | 订单数量必须是整数倍 |
| 51010 | 订单价格必须是 tick 的整数倍 |
| 51011 | 订单数量超过最大可开仓数量 |
| 51012 | 订单数量超过最大可用数量 |
| 51013 | 订单价格超过涨跌停限制 |
| 51014 | 订单价格偏离市价过多 |
| 51015 | 订单数量过小 |
| 51016 | 订单价格无效 |
| 51017 | 订单数量无效 |
| 51018 | 订单类型无效 |
| 51019 | 订单方向无效 |
| 51020 | 交易模式无效 |
| 51021 | 保证金模式无效 |
| 51022 | 持仓方向无效 |
| 51023 | 杠杆倍数无效 |
| 51024 | 杠杆倍数超过限制 |
| 51025 | 客户自定义订单 ID 已存在 |
| 51026 | 客户自定义订单 ID 无效 |
| 51027 | 订单已撤销 |
| 51028 | 订单已完成 |
| 51029 | 订单不可修改 |
| 51030 | 订单不可撤销 |
| 51031 | 订单数量超过持仓数量 |
| 51032 | 只减仓订单数量超过持仓数量 |
| 51033 | 订单数量超过产品限制 |
| 51034 | 订单价格超过产品限制 |

---

## 最佳实践

### 1. 签名生成
```typescript
import { createHmac } from 'node:crypto';

function sign(timestamp: string, method: string, path: string, body: string, secretKey: string): string {
  const message = timestamp + method + path + body;
  const hmac = createHmac('sha256', secretKey);
  hmac.update(message);
  return hmac.digest('base64');
}
```

### 2. 时间戳处理
```typescript
// 使用 ISO 格式时间戳
const timestamp = new Date().toISOString();

// 或使用 Unix 毫秒时间戳
const timestamp = Date.now().toString();
```

### 3. 现货下单
```typescript
const order = await tradeApi.placeOrder({
  instId: 'BTC-USDT',
  tdMode: 'cash',        // 现货模式
  side: 'buy',
  ordType: 'limit',
  px: '50000',
  sz: '0.001'
});
```

### 4. 合约下单
```typescript
// 先设置杠杆（注意杠杆限制）
await accountApi.setLeverage({
  instId: 'BTC-USDT-SWAP',
  lever: '5',             // BTC 最大 5x 杠杆
  mgnMode: 'isolated'
});

// 再下单
const order = await tradeApi.placeOrder({
  instId: 'BTC-USDT-SWAP',
  tdMode: 'isolated',     // 逐仓模式
  side: 'buy',
  ordType: 'limit',
  px: '50000',
  sz: '1'
});
```

### 5. 业务规则验证
```typescript
// 允许交易的币种白名单（7个）
const ALLOWED_COINS = [
  'BTC', 'ETH', 'BNB', 'SOL',
  'XRP', 'ADA', 'DOGE'
];

// 合约杠杆限制
const LEVERAGE_LIMITS = {
  'BTC': 5,
  'ETH': 3
};

// 仅允许合约的币种
const SWAP_ALLOWED_COINS = ['BTC', 'ETH'];

// 验证币种是否允许交易
function validateCoin(coin: string): boolean {
  return ALLOWED_COINS.includes(coin);
}

// 验证杠杆是否在限制内
function validateLeverage(coin: string, leverage: number): boolean {
  if (!SWAP_ALLOWED_COINS.includes(coin)) {
    return false; // 非白名单币种不允许合约
  }
  return leverage <= LEVERAGE_LIMITS[coin];
}

// 使用示例
if (!validateCoin('BTC')) {
  throw new Error('币种不在允许列表中');
}

if (!validateLeverage('BTC', 5)) {
  throw new Error('杠杆超过限制');
}
```

### 6. 错误重试
```typescript
async function requestWithRetry(fn: () => Promise, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
    }
  }
}
```

### 7. 速率限制
```typescript
class RateLimiter {
  private requests: number[] = [];
  private maxRequests: number;
  private windowMs: number;

  constructor(maxRequests: number, windowMs: number) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
  }

  async waitIfNeeded() {
    const now = Date.now();
    this.requests = this.requests.filter(t => now - t < this.windowMs);

    if (this.requests.length >= this.maxRequests) {
      const oldest = this.requests[0];
      const waitTime = this.windowMs - (now - oldest);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }

    this.requests.push(now);
  }
}
```

### 8. 数据精度处理
```typescript
// 获取产品精度
const instruments = await publicApi.getInstruments('SPOT', 'BTC-USDT');
const { tickSz, lotSz } = instruments[0];

// 计算符合精度的价格
function adjustPrice(price: number, tickSz: string): string {
  const tick = parseFloat(tickSz);
  const adjusted = Math.floor(price / tick) * tick;
  return adjusted.toFixed(tickSz.split('.')[1]?.length || 2);
}

// 计算符合精度的数量
function adjustSize(size: number, lotSz: string): string {
  const lot = parseFloat(lotSz);
  const adjusted = Math.floor(size / lot) * lot;
  return adjusted.toFixed(lotSz.split('.')[1]?.length || 4);
}
```
