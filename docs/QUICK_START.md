# OKX 量化交易系统 - 快速开始

## 项目概述

支持现货（SPOT）和永续合约（SWAP）两种交易模式的量化交易系统。

### 交易模式对比

| 特性 | 现货 SPOT | 永续合约 SWAP |
|------|-----------|---------------|
| **交易模式** | cash | isolated |
| **杠杆** | 无 | BTC ≤ 5x, ETH ≤ 3x |
| **强平风险** | 无 | 有 |
| **资金费率** | 无 | 有 |

### 允许交易的币种

| 币种 | 现货 | 合约 | 最大杠杆 |
|------|:----:|:----:|:--------:|
| BTC | ✅ | ✅ | 5x |
| ETH | ✅ | ✅ | 3x |
| BNB | ✅ | ❌ | - |
| SOL | ✅ | ❌ | - |
| XRP | ✅ | ❌ | - |
| ADA | ✅ | ❌ | - |
| DOGE | ✅ | ❌ | - |

⚠️ **重要约束**：
1. 禁止借币
2. 合约杠杆必须是整数倍（OKX 要求）
3. 仅 BTC、ETH 可做合约

---

## 项目初始化

```bash
# 安装依赖
bun install

# 复制环境变量模板
cp .env.example .env

# 编辑 .env 文件
```

### 环境变量配置

```bash
# OKX API 配置
OKX_API_KEY=your_api_key
OKX_SECRET_KEY=your_secret_key
OKX_PASSPHRASE=your_passphrase
OKX_IS_DEMO=true

# 项目配置
LOG_LEVEL=info
```

---

## 申请模拟盘 API

### 网页端申请

1. 登录 [www.okx.com](https://www.okx.com)
2. 点击「交易」→「模拟交易」
3. 进入「个人中心」→「创建模拟盘 API Key」
4. 设置名称和 Passphrase（务必记住！）
5. 选择权限：读取 + 交易

### APP 端申请

1. 打开 OKX APP
2. 左上角【全功能中心】→【模拟交易】
3. 右上角【个人中心】→【API 管理】
4. 点击【创建 API Key】

### 测试连接

```bash
# 设置环境变量
export OKX_API_KEY="your_api_key"
export OKX_SECRET_KEY="your_secret_key"
export OKX_PASSPHRASE="your_passphrase"

# 运行测试
bun test tests/api/
```

⚠️ **模拟盘必须添加请求头**：`x-simulated-trading: 1`（代码已自动添加）

---

## 运行项目

```bash
# 开发模式运行
bun run index.ts

# 或使用热重载
bun --hot index.ts

# 运行测试
bun test

# 查看测试覆盖率
bun test --coverage
```

---

## 测试与验证

### 运行测试

```bash
# 运行所有测试
bun test

# 运行特定测试
bun test tests/utils/logger.test.ts
bun test tests/strategies/
bun test tests/core/

# 检查类型
bun tsc --noEmit
```

### 日志验证

**检查数据库文件**：
```bash
ls -lh ./data/logs.db
```

**验证表结构**：
```bash
# 使用 sqlite3 检查
sqlite3 ./data/logs.db "SELECT name FROM sqlite_master WHERE type='table';"
# 预期: decision_logs, trade_logs, risk_logs
```

**查看最新日志**：
```bash
# 决策日志
sqlite3 ./data/logs.db "SELECT coin, strategy, action, reason FROM decision_logs ORDER BY timestamp DESC LIMIT 5;"

# 交易日志
sqlite3 ./data/logs.db "SELECT coin, side, status, value FROM trade_logs ORDER BY timestamp DESC LIMIT 5;"

# 风险日志
sqlite3 ./data/logs.db "SELECT event_type, level, message FROM risk_logs ORDER BY timestamp DESC LIMIT 5;"
```

### 查看文件日志

```bash
# 查看今天的日志
tail -f ./logs/decision_$(date +%Y-%m-%d).log
tail -f ./logs/trade_$(date +%Y-%m-%d).log
tail -f ./logs/error_$(date +%Y-%m-%d).log
```

---

## 故障排查

### 日志未写入 SQLite

**症状**: `decision_logs` 表为空

**排查**:
1. 检查日志是否启用：
   ```typescript
   logger.setSQLiteEnabled(true);
   ```

2. 检查数据库目录权限：
   ```bash
   ls -ld ./data/
   ```

3. 查看错误日志：
   ```bash
   tail -50 ./logs/error_*.log
   ```

### 签名验证失败

**症状**: API 返回 401 Unauthorized

**解决**:
```typescript
// 同步服务器时间
const serverTime = await publicApi.getServerTime();
const localTime = Date.now();
const timeDiff = serverTime.ts - localTime;
const timestamp = (Date.now() + timeDiff).toString();
```

### 网络连接失败

**症状**: `FailedToOpenSocket` 错误

**排查**:
1. 检查网络/防火墙设置
2. 确认可以访问 `www.okx.com`
3. 如需代理，设置环境变量：
   ```bash
   export HTTP_PROXY=http://127.0.0.1:7890
   export HTTPS_PROXY=http://127.0.0.1:7890
   ```

### WebSocket 连接问题

**症状**: WebSocket 频繁断开或无法连接

**排查**:
```typescript
// 查看网络状态
const networkState = engine.getNetworkState();
console.log('数据源:', networkState.primarySource);
console.log('WebSocket 状态:', networkState.wsState);
console.log('健康状态:', networkState.currentStatus);
```

---

## 策略使用

### 现货 DCA-Grid 策略

```typescript
import { SpotDCAGridStrategyEngine } from './src/strategies/spot-dca-grid/core/engine.js';

const config = {
  base: {
    strategyName: 'Spot DCA-Grid',
    version: '1.0.0'
  },
  capital: {
    totalCapital: 10000,
    emergencyReserve: 5
  },
  coins: {
    allowedCoins: ['BTC', 'ETH', 'BNB', 'SOL', 'XRP', 'ADA', 'DOGE'],
    activeCoinLimit: 3
  },
  // ... 更多配置
};

const engine = new SpotDCAGridStrategyEngine(config, {
  okxApi: restClient,
  wsClient: wsClient,
  updateInterval: 5000,
  enableAutoTrade: false,
  maxConcurrentOrders: 3,
  enableDualDataSource: true,
  restPollInterval: 2000
});

await engine.start();

// 查看报告
console.log(engine.generateReport());
```

### 启用双重数据源

```typescript
// 双重数据源配置
{
  enableDualDataSource: true,    // 启用 WebSocket + REST 混合
  restPollInterval: 2000,         // REST 每 2 秒验证一次
}

// 获取网络状态
const networkState = engine.getNetworkState();
console.log('数据源:', networkState.primarySource);      // 'websocket' | 'rest'
console.log('健康状态:', networkState.currentStatus);   // 'healthy' | 'degraded' | 'unhealthy'
```

---

## 常见问题

### Q: 模拟盘 API 请求失败？
**A**: 确认：
1. 使用模拟盘创建的 API Key
2. 环境变量正确设置
3. 请求头包含 `x-simulated-trading: 1`

### Q: 订单精度错误？
**A**: 获取产品信息确定精度：
```typescript
const instruments = await publicApi.getInstruments('SPOT', 'BTC-USDT');
const { tickSz, lotSz } = instruments[0];
```

### Q: 策略不执行交易？
**A**: 检查：
1. `enableAutoTrade` 是否设置为 `true`
2. 市场数据是否正常更新
3. 查看决策日志了解策略判断

---

## 文档导航

- **[ARCHITECTURE.md](./ARCHITECTURE.md)** - 系统架构详解
- **[STRATEGIES.md](./STRATEGIES.md)** - 策略详细说明
- **[API_REFERENCE.md](./api-reference.md)** - API 接口文档
- **[SAFETY_GUIDE.md](./safety-guide.md)** - 安全风险指南

---

## 安全提示

⚠️ **重要提醒**：
1. 不要将 API Key 提交到版本控制
2. 先在模拟盘充分测试
3. 设置合理的风险控制参数
4. 严格遵守业务规则：
   - 禁止借币
   - 币种白名单
   - 杠杆限制（BTC ≤ 5x，ETH ≤ 3x）
