/**
 * 测试环境设置
 *
 * 此文件通过 --preload 标志加载，在所有测试运行前执行
 * 用于确保环境变量正确加载
 */

import { file } from 'bun';

async function loadEnvFile() {
  const envPath = import.meta.dir + '/../.env';

  try {
    const envFile = file(envPath);
    const envContent = await envFile.text();

    // 解析 .env 文件内容
    for (const line of envContent.split('\n')) {
      const trimmedLine = line.trim();
      // 跳过注释和空行
      if (!trimmedLine || trimmedLine.startsWith('#')) {
        continue;
      }

      // 解析 KEY=VALUE 格式
      const [key, ...valueParts] = trimmedLine.split('=');
      if (key && valueParts.length > 0) {
        const value = valueParts.join('=').trim();
        // 设置环境变量（如果尚未设置）
        if (!process.env[key]) {
          process.env[key] = value;
        }
      }
    }
  } catch (error) {
    console.warn('[测试环境] 警告: 无法加载 .env 文件:', error);
  }
}

// 加载环境变量
await loadEnvFile();

// 输出环境变量状态（只在 preload 时输出一次）
console.log('[测试环境] 环境变量加载完成');
console.log('[测试环境] OPENAI_API_KEY:', process.env.OPENAI_API_KEY ? '已设置' : '未设置');
console.log('[测试环境] OPENAI_URL:', process.env.OPENAI_URL || '未设置');
