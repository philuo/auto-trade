# OKX API 网络连接问题说明

## 问题描述

在当前环境中运行测试时，出现以下错误：
```
error: Was there a typo in the url or port?
  path: "https://www.okx.com/api/v5/market/ticker?instId=BTC-USDT",
 errno: 0,
  code: "FailedToOpenSocket"
```

## 原因分析

经过测试确认：
1. **网络不可达**：当前环境无法访问 `www.okx.com` 域名
2. **Ping 测试失败**：100% 丢包
3. **curl 超时**：连接请求完全超时

这是环境的网络/防火墙限制，不是代码问题。

## 已修复的问题

### 1. 添加模拟盘交易所需的请求头

根据 [OKX 官方文档](https://www.okx.com/docs-v5/en/)，模拟盘交易需要在请求中添加特殊请求头：

```typescript
// 在 src/api/rest.ts 中添加
if (this.isDemo) {
  headers = { ...headers, 'x-simulated-trading': '1' };
}
```

### 2. 修复 TypeScript 类型错误

将 `requestWithRetry` 方法的 `headers` 参数类型从 `Record<string, string>` 改为 `RequestHeaders`，解决类型不兼容问题。

## 测试结果

- ✅ **22 个单元测试通过**（不依赖网络）
- ⏭️ **3 个测试跳过**（缺少 API 凭证）
- ❌ **9 个集成测试失败**（网络不可达）

## 如何在可联网环境中测试

1. **设置环境变量**：
   ```bash
   export OKX_API_KEY="your_api_key"
   export OKX_SECRET_KEY="your_secret_key"
   export OKX_PASSPHRASE="your_passphrase"
   ```

2. **创建模拟盘 API 密钥**：
   - 登录 OKX 网站
   - 进入模拟盘交易环境
   - 在设置中创建 API 密钥
   - 使用模拟盘 API 凭证进行测试

3. **运行测试**：
   ```bash
   bun test tests/api/rest-api.test.ts
   bun test tests/websocket/websocket.test.ts
   ```

## 参考资料

- [OKX API 指南](https://www.okx.com/docs-v5/en/)
- [OKX Demo Trading](https://www.okx.com/help/what-is-demo-trading)
- [模拟盘交易 API 说明](https://www.okx.com/docs-v5/en/#rest-api-demo-trading)
