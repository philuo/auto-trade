# auto-trade

To install dependencies:

```bash
bun install
```

To run:

```bash
bun run index.ts
```

## 说明

本项目是为了实现OkX平台的虚拟币量化交易。我是TypeScript用户，当前项目是Bun的本地项目非常安全，不要使用Python的SDK；使用自定义封装模块来实现。

### 官方文档

1. 详细介绍：https://www.okx.com/docs-v5/zh/#overview
2. 最佳实践：https://www.okx.com/docs-v5/trick_zh/#instrument-configuration
3. 更新日志：https://www.okx.com/docs-v5/log_zh/#upcoming-changes

- 文档中有依赖包，有REST接口、WebSocket接口
- 其中区分了模拟盘API和实盘API，请使用模拟盘API
- 模拟盘API所需的认证信息：

api_key(App Key): xxx
secret_key(Secret Key): xxx
passphrase: xxx
