# auto-trade

首先确保电脑上已安装了 `bun@1.3.6` 版本或更新的版本。

1. 安装依赖

```bash
bun install
```

2. 配置 `.env` 文件

- API所需的认证信息请补充 `.env` 文件，请参考 `.env.example` 中的说明。

3. 运行软件

```bash
bun run index.ts
```

## 说明

本项目是为了实现OKX平台的虚拟币量化交易。使用 `TypeScript + Bun` 实现。

- 本项目包含OKX模拟盘API和实盘API；现货交易、合约交易两种方式。
- 本项目仅用于个人学习金融知识，无其他任何用途！不收取任何费用！
- **实盘API会对资产造成实际影响！请务必小心！！如果您不懂代码切记不可使用！！！**

### 官方文档

- 文档中有依赖包，有REST接口、WebSocket接口、最佳实践、错误码介绍

1. 详细介绍：https://www.okx.com/docs-v5/zh/#overview
2. 最佳实践：https://www.okx.com/docs-v5/trick_zh/#instrument-configuration
3. 更新日志：https://www.okx.com/docs-v5/log_zh/#upcoming-changes
