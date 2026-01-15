# OKX 模拟盘 API 申请指南

## 一、申请步骤

### 方式一：网页端申请

1. **登录 OKX 账户**
   - 访问 [www.okx.com](https://www.okx.com)
   - 使用您的 OKX 账号登录

2. **进入模拟交易**
   - 点击顶部导航栏的「交易」
   - 选择「模拟交易」

3. **进入个人中心**
   - 在模拟交易页面，点击「个人中心」

4. **创建 API Key**
   - 点击「创建模拟盘 API Key」
   - 设置 API Key 名称
   - 设置 Passphrase（密码短语，请务必记住！）
   - 选择权限：读取、交易（至少需要这两个权限）
   - （可选）绑定 IP 地址以提高安全性
   - 确认创建

5. **保存凭证信息**
   创建后您将获得以下信息（**请妥善保存**）：
   - `API Key`: 类似 `1b081289-13b1-4e1b-8e84-7dbdbe6ebed6`
   - `Secret Key`: 类似 `81DE99445CA878661656201660791062`
   - `Passphrase`: 您自己设置的密码

### 方式二：APP 端申请

1. **打开 OKX APP**
2. **点击首页左上角【全功能中心】**
3. **选择【模拟交易】**
4. **点击右上角【个人中心】**
5. **选择【API 管理】**
6. **点击【创建 API Key】**
7. **按提示完成创建**

---

## 二、配置环境变量

申请成功后，将以下内容添加到 `.env` 文件中：

```bash
# OKX API 配置
OKX_API_KEY=your_api_key_here
OKX_SECRET_KEY=your_secret_key_here
OKX_PASSPHRASE=your_passphrase_here
OKX_IS_DEMO=true

# 代理配置（如果需要）
HTTP_PROXY=http://127.0.0.1:7890
HTTPS_PROXY=http://127.0.0.1:7890
```

---

## 三、测试 API 是否生效

运行以下命令测试：

```bash
# 设置环境变量
export OKX_API_KEY="your_api_key"
export OKX_SECRET_KEY="your_secret_key"
export OKX_PASSPHRASE="your_passphrase"
export HTTP_PROXY="http://127.0.0.1:7890"
export HTTPS_PROXY="http://127.0.0.1:7890"

# 运行测试
bun run test-all-apis.mjs
```

**预期结果**：
- Account API 测试应该全部通过（不再是跳过）
- Trade API 测试应该全部通过（不再是跳过）

---

## 四、重要注意事项

### ⚠️ 必须添加的请求头

模拟盘的所有请求都必须包含以下请求头：

```
x-simulated-trading: 1
```

我们的 `RestClient` 已经自动添加了这个请求头（见 `src/api/rest.ts:128`）：

```typescript
if (this.isDemo) {
  headers = { ...headers, 'x-simulated-trading': '1' };
}
```

### 🔐 安全提示

1. **Passphrase 一旦忘记无法找回**，只能重新创建 API Key
2. **模拟盘 API Key 不会被自动删除**（实盘的 API Key 在闲置 14 天后会自动删除）
3. **建议绑定 IP 地址**以提高安全性
4. **不要将凭证提交到 Git 仓库**

---

## 五、API 地址

### 模拟盘地址
- REST: `https://www.okx.com`
- WebSocket 公共频道: `wss://wspap.okx.com:8443/ws/v5/public`
- WebSocket 私有频道: `wss://wspap.okx.com:8443/ws/v5/private`
- WebSocket 业务频道: `wss://wspap.okx.com:8443/ws/v5/business`

### 实盘地址（参考）
- REST: `https://www.okx.com`
- WebSocket 公共频道: `wss://ws.okx.com:8443/ws/v5/public`
- WebSocket 私有频道: `wss://ws.okx.com:8443/ws/v5/private`
- WebSocket 业务频道: `wss://ws.okx.com:8443/ws/v5/business`

---

## 六、模拟盘功能限制

模拟盘不支持以下功能：
- 提币
- 充值
- 申购赎回

其他功能与实盘相同。

---

## 七、常见问题

### Q1: 申请后仍然返回 401 Unauthorized？
**A**: 请检查：
1. API Key、Secret Key、Passphrase 是否正确复制
2. 是否在模拟盘环境下创建的 API Key
3. 环境变量是否正确设置
4. 是否添加了 `x-simulated-trading: 1` 请求头

### Q2: 如何知道我的 API Key 是否有效？
**A**: 运行测试脚本，如果 Account API 和 Trade API 测试通过，说明凭证有效

### Q3: 模拟盘有初始资金吗？
**A**: 有，模拟盘中包含 BTC、ETH 等多个币种的初始模拟资金

---

## 八、相关链接

- [OKX API 文档](https://www.okx.com/docs-v5/zh/)
- [模拟交易介绍](https://www.okx.com/zh-hans/help/how-to-use-demo-trading)
- [API 常见问题](https://www.okx.com/zh-hans/help/api-faq)
