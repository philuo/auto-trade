# OKX 量化交易系统 - 文档

## 项目范围

支持**现货交易（SPOT）**和**永续合约（SWAP）**两种交易模式。

### 业务规则限制

| 规则 | 说明 |
|------|------|
| 禁止借币 | 不允许任何形式的借币操作 |
| 杠杆限制 | BTC ≤ 5x，ETH ≤ 3x，其它币种仅现货 |
| 币种限制 | 仅 BTC、ETH、BNB、SOL、XRP、ADA、DOGE |

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

## 文档导航

### 核心文档

| 文档 | 说明 | 适合人群 |
|------|------|---------|
| **[QUICK_START.md](./QUICK_START.md)** | 快速开始指南 | 所有用户 |
| **[ARCHITECTURE.md](./ARCHITECTURE.md)** | 系统架构详解 | 开发者 |
| **[STRATEGIES.md](./STRATEGIES.md)** | 策略详细说明 | 交易者 |
| **[API_REFERENCE.md](./api-reference.md)** | API 接口文档 | 开发者 |

### 专题文档

| 文档 | 说明 |
|------|------|
| **[SAFETY_GUIDE.md](./safety-guide.md)** | 安全风险指南 |
| **[STRATEGY_TESTING.md](./STRATEGY_TESTING.md)** | 策略测试文档 |

---

## 快速开始

### 1. 安装依赖
```bash
bun install
```

### 2. 配置环境变量
```bash
cp .env.example .env
# 编辑 .env 文件，填入 OKX API 配置
```

### 3. 申请模拟盘 API
1. 登录 [www.okx.com](https://www.okx.com)
2. 进入「模拟交易」→「个人中心」
3. 创建 API Key（选择读取 + 交易权限）

### 4. 运行测试
```bash
bun test
```

### 5. 启动项目
```bash
bun run index.ts
```

---

## 项目结构

```
okx-trade/
├── src/
│   ├── api/                  # REST API 封装
│   ├── websocket/            # WebSocket 客户端
│   ├── core/                 # 核心模块
│   │   ├── network-state-manager.ts     # 网络状态管理
│   │   └── dual-data-source-manager.ts   # 双数据源管理
│   ├── strategies/           # 交易策略
│   │   └── spot-dca-grid/    # DCA-网格策略
│   └── utils/                # 工具模块
├── tests/                    # 测试文件
├── docs/                     # 文档目录
├── data/                     # 生产数据库
└── logs/                     # 生产日志
```

---

## 外部资源

- [OKX API 官方文档](https://www.okx.com/docs-v5/zh/#overview)
- [Bun 官方文档](https://bun.sh/docs)
- [TypeScript 官方文档](https://www.typescriptlang.org/docs)

---

## 安全提示

⚠️ **重要提醒**：
1. 不要将 API Key 提交到版本控制
2. 先在模拟盘充分测试
3. 设置合理的风险控制参数
4. 严格遵守业务规则限制
