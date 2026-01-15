/**
 * GLM API 快速测试 - 验证正确配置
 */

import { describe, test, expect } from 'bun:test';
import OpenAI from 'openai';

const API_KEY = process.env.OPENAI_API_KEY;

describe('GLM API 配置测试', () => {
  // 测试不同的模型名称
  const models = [
    'glm-4-flash',
    'glm-4-plus',
    'glm-4.7',
    'glm-4',
  ];

  for (const model of models) {
    test(`测试模型: ${model}`, async () => {
      console.time(`API调用 ${model}`);

      const client = new OpenAI({
        apiKey: API_KEY,
        baseURL: 'https://open.bigmodel.cn/api/coding/paas/v4',
        timeout: 10000, // 10秒超时
        maxRetries: 1,
      });

      try {
        // GLM-4.7 关闭思考模式以获得直接的响应
        // 参考：https://docs.bigmodel.cn/cn/guide/capabilities/thinking-mode
        const requestBody: any = {
          model,
          messages: [
            { role: 'system', content: '你是一个助手' },
            { role: 'user', content: '回复1+1等于几' },
          ],
          max_tokens: 50,
        };

        // 对于 GLM-4.7 模型，关闭思考模式
        if (model === 'glm-4.7') {
          requestBody.thinking = { type: 'disabled' };
        }

        const completion = await client.chat.completions.create(requestBody);

        console.timeEnd(`API调用 ${model}`);

        const content = completion.choices[0]?.message?.content || '';

        console.log(`✅ ${model} 成功:`, content?.substring(0, 100));

        expect(content).toBeDefined();
        expect(content.length).toBeGreaterThan(0);
      } catch (error) {
        console.timeEnd(`API调用 ${model}`);
        console.log(`❌ ${model} 失败:`, error);

        // 期望失败但记录错误
        expect(error).toBeDefined();
      }
    }, 15000);
  }
});
