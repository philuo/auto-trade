# OkX 量化交易系统 - 快速开始

## 项目概述

本项目支持两种交易模式：
- **现货交易（SPOT）**: 使用 `cash` 模式，无杠杆
- **永续合约（SWAP）**: 使用 `isolated` 逐仓模式，支持杠杆

### ⚠️ 业务规则限制

**重要约束**：
1. **禁止借币**: 不允许任何形式的借币操作
2. **杠杆限制**:
   - BTC 合约：最大 5x 杠杆
   - ETH 合约：最大 3x 杠杆
   - 其它币种：仅允许现货交易，不允许合约
3. **币种限制**: 仅允许交易以下 7 个币种（BTC、ETH、BNB、SOL、XRP、ADA、DOGE）

### 支持的交易币种

| 币种 | 现货 | 合约 | 最大杠杆 |
|------|:----:|:----:|:--------:|
| BTC | ✅ | ✅ | 5x |
| ETH | ✅ | ✅ | 3x |
| BNB | ✅ | ❌ | - |
| SOL | ✅ | ❌ | - |
| XRP | ✅ | ❌ | - |
| ADA | ✅ | ❌ | - |
| DOGE | ✅ | ❌ | - |

---

## 项目初始化

### 1. 环境准备
```bash
# 安装依赖
bun install

# 验证安装
bun --version
```

### 2. 配置环境变量
```bash
# 复制环境变量模板
cp .env.example .env

# 编辑 .env 文件，填入模拟盘配置
OKX_API_KEY=xxx
OKX_SECRET_KEY=xxx
OKX_PASSPHRASE=xxx
OKX_IS_DEMO=true
LOG_LEVEL=info
```

### 3. 运行项目
```bash
# 开发模式运行
bun run index.ts

# 或使用热重载
bun --hot index.ts
```

---

## 交易模式说明

### 现货交易 (SPOT)
- **交易模式**: `cash`
- **杠杆**: 无
- **持仓**: 无持仓概念，只有余额变化
- **资金占用**: 全额占用
- **适用场景**: 中长期持有、套利

### 永续合约 (SWAP)
- **交易模式**: `isolated` (逐仓)
- **杠杆**: 有（需设置）
- **持仓**: 有持仓数据，需监控强平风险
- **资金占用**: 保证金占用
- **适用场景**: 短期交易、对冲风险

---

## 开发指南

### 推荐的开发顺序

#### 第一步：核心认证模块
```typescript
// src/core/auth.ts
export class OkxAuth {
  /**
   * 生成 API 签名
   */
  static sign(timestamp: string, method: string, path: string, body: string): string {
    // 实现 HMAC-SHA256 签名
  }

  /**
   * 生成认证头
   */
  static getAuthHeaders(apiKey: string, secretKey: string, passphrase: string, method: string, path: string, body: string) {
    // 生成完整的认证头
  }
}
```

#### 第二步：REST 客户端
```typescript
// src/api/rest.ts
export class RestClient {
  private apiKey: string;
  private secretKey: string;
  private passphrase: string;

  async request<T>(method: string, path: string, params?: object): Promise<T> {
    // 实现基础的 HTTP 请求
    // 1. 生成签名
    // 2. 发送请求
    // 3. 处理响应
  }
}
```

#### 第三步：第一个 API 调用
```typescript
// src/api/account.ts
export class AccountApi extends RestClient {
  async getBalance(ccy?: string): Promise<Balance> {
    return this.request('GET', '/api/v5/account/balance', { ccy });
  }

  async getPositions(instType?: string): Promise<Position[]> {
    return this.request('GET', '/api/v5/account/positions', { instType });
  }
}
```

#### 第四步：测试连接
```typescript
// index.ts
import { AccountApi } from './src/api/account';

async function main() {
  const accountApi = new AccountApi({
    apiKey: process.env.OKX_API_KEY!,
    secretKey: process.env.OKX_SECRET_KEY!,
    passphrase: process.env.OKX_PASSPHRASE!,
    isDemo: true
  });

  // 测试获取账户余额
  const balance = await accountApi.getBalance();
  console.log('账户余额:', balance);
}

main().catch(console.error);
```

---

## 现货交易示例

### 获取现货账户余额
```typescript
const balance = await accountApi.getBalance('BTC');
console.log('BTC 可用余额:', balance.availBal);
console.log('BTC 总权益:', balance.eq);
```

### 现货下单（买入 BTC）
```typescript
const tradeApi = new TradeApi(config);

// 买入 BTC（使用 USDT）
const order = await tradeApi.placeOrder({
  instId: 'BTC-USDT',          // 现货交易对
  tdMode: 'cash',               // 现货模式
  side: 'buy',                  // 买入
  ordType: 'limit',             // 限价单
  px: '50000',                  // 价格：50000 USDT
  sz: '0.001',                  // 数量：0.001 BTC
  clOrdId: `spot-${Date.now()}` // 客户自定义 ID
});

console.log('订单已提交:', order.ordId);
```

### 现货卖出
```typescript
// 卖出 BTC（获得 USDT）
const order = await tradeApi.placeOrder({
  instId: 'BTC-USDT',
  tdMode: 'cash',               // 现货模式
  side: 'sell',                 // 卖出
  ordType: 'limit',
  px: '51000',                  // 卖出价格
  sz: '0.001',                  // 卖出数量
  clOrdId: `spot-${Date.now()}`
});
```

### 获取现货行情
```typescript
const marketApi = new MarketApi(config);

// 获取 BTC-USDT 行情
const ticker = await marketApi.getTicker('BTC-USDT');
console.log('最新价格:', ticker.last);
console.log('24h最高:', ticker.high24h);
console.log('24h最低:', ticker.low24h);
console.log('24h成交量:', ticker.vol24h);
```

---

## 永续合约交易示例

### 获取合约账户余额
```typescript
// 合约账户余额（以 USDT 计价）
const balance = await accountApi.getBalance('USDT');
console.log('可用余额:', balance.availBal);
console.log('保证金余额:', balance.eq);
```

### 设置合约杠杆
```typescript
// BTC 合约 - 最大 5x 杠杆
await accountApi.setLeverage({
  instId: 'BTC-USDT-SWAP',      // 产品 ID
  lever: '5',                   // 5倍杠杆（BTC 上限）
  mgnMode: 'isolated'           // 逐仓模式
});

console.log('BTC 杠杆设置成功');

// ETH 合约 - 最大 3x 杠杆
await accountApi.setLeverage({
  instId: 'ETH-USDT-SWAP',      // 产品 ID
  lever: '3',                   // 3倍杠杆（ETH 上限）
  mgnMode: 'isolated'           // 逐仓模式
});

console.log('ETH 杠杆设置成功');
```

### 合约开多仓
```typescript
// 开 BTC 多仓（看涨）
const order = await tradeApi.placeOrder({
  instId: 'BTC-USDT-SWAP',      // 永续合约
  tdMode: 'isolated',            // 逐仓模式
  side: 'buy',                  // 开多
  ordType: 'limit',
  px: '50000',                  // 开仓价格
  sz: '1',                      // 张数
  clOrdId: `swap-${Date.now()}`
});

console.log('开多订单已提交:', order.ordId);
```

### 合约平仓
```typescript
// 平多仓（卖出）
const order = await tradeApi.placeOrder({
  instId: 'BTC-USDT-SWAP',
  tdMode: 'isolated',
  side: 'sell',                 // 平多
  ordType: 'limit',
  px: '51000',                  // 平仓价格
  sz: '1',                      // 平仓张数
  reduceOnly: true              // 只减仓
});
```

### 获取合约持仓
```typescript
// 查询 SWAP 类型的持仓
const positions = await accountApi.getPositions('SWAP');

positions.forEach(pos => {
  console.log('产品ID:', pos.instId);
  console.log('持仓数量:', pos.pos);
  console.log('开仓均价:', pos.avgPx);
  console.log('未实现盈亏:', pos.upl);
  console.log('强平价格:', pos.liqPx);
});
```

### 获取合约行情
```typescript
const ticker = await marketApi.getTicker('BTC-USDT-SWAP');
console.log('最新价格:', ticker.last);
console.log('24h成交量:', ticker.vol24h);
console.log('资金费率:', ticker.fundingRate); // 合约特有
```

---

## 常用操作对比

| 操作 | 现货 SPOT | 永续合约 SWAP |
|------|-----------|---------------|
| 交易模式 | `cash` | `isolated` |
| 买入 | `tdMode: 'cash'` | `tdMode: 'isolated'` + `side: 'buy'` |
| 卖出 | `tdMode: 'cash'` + `side: 'sell'` | `tdMode: 'isolated'` + `side: 'sell'` |
| 杠杆设置 | 不需要 | `setLeverage()` |
| 持仓查询 | 不适用 | `getPositions('SWAP')` |
| 资金费率 | 无 | 有 |

---

## WebSocket 使用示例

### 建立连接
```typescript
import { WsClient } from './src/websocket/client';

const ws = new WsClient({
  apiKey: process.env.OKX_API_KEY!,
  secretKey: process.env.OKX_SECRET_KEY!,
  passphrase: process.env.OKX_PASSPHRASE!,
  isDemo: true
});

// 连接并登录
await ws.connect();
await ws.login();
```

### 订阅账户频道
```typescript
ws.subscribe({
  channel: 'account',
  ccy: 'USDT'
}, (data) => {
  console.log('账户更新:', data);
});
```

### 订阅订单频道（现货）
```typescript
ws.subscribe({
  channel: 'orders',
  instType: 'SPOT',
  instId: 'BTC-USDT'
}, (data) => {
  console.log('现货订单更新:', data);
});
```

### 订阅订单频道（合约）
```typescript
ws.subscribe({
  channel: 'orders',
  instType: 'SWAP',
  instId: 'BTC-USDT-SWAP'
}, (data) => {
  console.log('合约订单更新:', data);
});
```

### 订阅持仓频道（仅合约）
```typescript
ws.subscribe({
  channel: 'positions',
  instType: 'SWAP',
  instId: 'BTC-USDT-SWAP'
}, (data) => {
  console.log('持仓更新:', data);
  console.log('持仓数量:', data.pos);
  console.log('未实现盈亏:', data.upl);
});
```

### 订阅行情频道
```typescript
// 现货行情
ws.subscribe({
  channel: 'tickers',
  instId: 'BTC-USDT'
}, (data) => {
  console.log('现货行情:', data);
});

// 合约行情
ws.subscribe({
  channel: 'tickers',
  instId: 'BTC-USDT-SWAP'
}, (data) => {
  console.log('合约行情:', data);
});
```

---

## 完整交易流程示例

### 现货交易流程
```typescript
async function spotTradingExample() {
  const accountApi = new AccountApi(config);
  const tradeApi = new TradeApi(config);
  const marketApi = new MarketApi(config);

  // 1. 查询账户余额
  const usdtBalance = await accountApi.getBalance('USDT');
  console.log('USDT 可用余额:', usdtBalance.availBal);

  // 2. 查询当前行情
  const ticker = await marketApi.getTicker('BTC-USDT');
  const currentPrice = parseFloat(ticker.last);
  console.log('BTC 当前价格:', currentPrice);

  // 3. 下市价单买入
  const buyPrice = (currentPrice * 0.99).toFixed(2); // 略低于市价
  const order = await tradeApi.placeOrder({
    instId: 'BTC-USDT',
    tdMode: 'cash',
    side: 'buy',
    ordType: 'limit',
    px: buyPrice,
    sz: '0.001',
    clOrdId: `spot-buy-${Date.now()}`
  });
  console.log('买入订单已提交:', order.ordId);

  // 4. 等待成交后查询余额
  const btcBalance = await accountApi.getBalance('BTC');
  console.log('BTC 余额:', btcBalance.availBal);
}
```

### 合约交易流程
```typescript
async function swapTradingExample() {
  const accountApi = new AccountApi(config);
  const tradeApi = new TradeApi(config);
  const marketApi = new MarketApi(config);

  // 1. 查询账户余额
  const balance = await accountApi.getBalance('USDT');
  console.log('可用余额:', balance.availBal);

  // 2. 设置杠杆（BTC 最大 5x）
  await accountApi.setLeverage({
    instId: 'BTC-USDT-SWAP',
    lever: '5',                   // BTC 最大 5x 杠杆
    mgnMode: 'isolated'
  });

  // 3. 查询当前行情
  const ticker = await marketApi.getTicker('BTC-USDT-SWAP');
  const currentPrice = parseFloat(ticker.last);
  console.log('BTC 当前价格:', currentPrice);

  // 4. 开多仓
  const order = await tradeApi.placeOrder({
    instId: 'BTC-USDT-SWAP',
    tdMode: 'isolated',
    side: 'buy',
    ordType: 'limit',
    px: (currentPrice * 0.99).toFixed(1),
    sz: '1',
    clOrdId: `swap-open-${Date.now()}`
  });
  console.log('开仓订单已提交:', order.ordId);

  // 5. 查询持仓
  const positions = await accountApi.getPositions('SWAP', 'BTC-USDT-SWAP');
  if (positions.length > 0) {
    const pos = positions[0];
    console.log('持仓数量:', pos.pos);
    console.log('强平价格:', pos.liqPx);
    console.log('未实现盈亏:', pos.upl);
  }
}
```

---

## 常见问题

### Q1: 支持哪些币种交易？
仅支持以下 7 个币种：BTC、ETH、BNB、SOL、XRP、ADA、DOGE

### Q2: 哪些币种可以做合约？
只有 BTC 和 ETH 可以做合约交易，其它币种仅支持现货。

### Q3: 合约杠杆有限制吗？
有：
- BTC 合约最大 5x 杠杆
- ETH 合约最大 3x 杠杆
- 其它币种不允许合约交易

### Q4: 现货和合约如何选择？
- **现货**: 适合中长期持有，无爆仓风险，资金全额占用
- **合约**: 适合短期交易（仅 BTC/ETH），可使用杠杆放大收益，但有爆仓风险

### Q5: 可以借币交易吗？
**不可以**。系统严格禁止任何形式的借币操作。

### Q6: 签名验证失败
**原因**: 时间戳偏差过大
**解决**: 使用 `GET /api/v5/public/time` 同步服务器时间

```typescript
const serverTime = await publicApi.getServerTime();
const localTime = Date.now();
const timeDiff = serverTime.ts - localTime;
const timestamp = (Date.now() + timeDiff).toString();
```

### Q7: 现货和合约的产品ID区别
- **现货**: `BTC-USDT`、`ETH-USDT` 等
- **合约**: `BTC-USDT-SWAP`、`ETH-USDT-SWAP` 等

### Q8: 合约逐仓模式注意事项
- 杠杆按产品设置，不同产品可以不同杠杆
- 需要监控强平价格
- 注意资金费率

### Q9: 现货为什么没有持仓？
现货交易无持仓概念，买入后直接增加币种余额，卖出后减少余额。

### Q10: 订单精度错误
**解决**: 获取产品信息确定精度

```typescript
// 现货精度
const spotInstruments = await publicApi.getInstruments('SPOT', 'BTC-USDT');
const { tickSz, lotSz } = spotInstruments[0];

// 合约精度
const swapInstruments = await publicApi.getInstruments('SWAP', 'BTC-USDT-SWAP');
const { tickSz: swapTickSz, lotSz: swapLotSz } = swapInstruments[0];
```

---

## 调试技巧

### 开启详细日志
```typescript
process.env.LOG_LEVEL = 'debug';
```

### 查看请求详情
```typescript
console.log('请求:', {
  method,
  path,
  headers: this.getAuthHeaders(...),
  body
});
```

### WebSocket 消息追踪
```typescript
ws.on('message', (msg) => {
  console.log('收到消息:', JSON.stringify(msg, null, 2));
});
```

---

## 下一步

1. 阅读 [implementation-plan.md](./implementation-plan.md) 了解完整实现计划
2. 参考 OkX 官方文档: https://www.okx.com/docs-v5/zh/#overview
3. 从核心模块开始实现
4. 编写测试用例验证功能
5. 在模拟盘充分测试后再考虑实盘

---

## 安全提示

⚠️ **重要提醒**:
1. 不要将 API Key 提交到版本控制
2. 使用 `.gitignore` 忽略 `.env` 文件
3. 先在模拟盘充分测试
4. 设置合理的风险控制参数
5. **严格遵守业务规则**:
   - **禁止借币**: 不使用任何借币功能
   - **币种限制**: 仅交易白名单内的币种
   - **杠杆限制**: BTC ≤ 5x，ETH ≤ 3x
6. **合约交易特别注意**:
   - 监控强平价格
   - 设置止损止盈
   - 控制杠杆倍数
   - 仅 BTC 和 ETH 可做合约
   - 避免满仓操作
