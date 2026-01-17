#!/usr/bin/env bun
/**
 * OKX 量化交易系统 - 主入口
 *
 * 无人值守交易系统，24/7自动运行
 *
 * 使用方法:
 *   bun run start
 */

import { logger } from './src/utils/logger.js';
import { UnattendedTradingSystem } from './src/main/unattended-trading.js';
import type { UnattendedTradingConfig } from './src/main/unattended-trading.js';

// =====================================================
// 配置检测
// =====================================================

interface ConfigCheckResult {
  success: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * 检查环境变量配置
 */
function checkEnvVariables(): ConfigCheckResult {
  const result: ConfigCheckResult = { success: true, errors: [], warnings: [] };
  const requiredVars = ['OKX_API_KEY', 'OKX_SECRET_KEY', 'OKX_PASSPHRASE'];

  for (const varName of requiredVars) {
    if (!process.env[varName]) {
      result.errors.push(`缺少必需的环境变量: ${varName}`);
      result.success = false;
    }
  }

  // 检查可选配置
  if (!process.env.HTTP_PROXY && !process.env.HTTPS_PROXY) {
    result.warnings.push('未设置代理，如果网络连接OKX API有问题，请配置HTTP_PROXY');
  }

  return result;
}

/**
 * 检查PM2是否安装
 */
function checkPM2(): ConfigCheckResult {
  const result: ConfigCheckResult = { success: true, errors: [], warnings: [] };

  try {
    const { spawnSync } = require('child_process');
    const pm2Check = spawnSync('pm2', ['--version'], { stdio: 'pipe' });

    if (pm2Check.error || pm2Check.status !== 0) {
      result.errors.push('PM2未安装，请运行: npm install -g pm2');
      result.success = false;
    }
  } catch (error) {
    result.errors.push('PM2未安装，请运行: npm install -g pm2');
    result.success = false;
  }

  return result;
}

/**
 * 运行所有配置检测
 */
async function runAllChecks(): Promise<ConfigCheckResult> {
  const finalResult: ConfigCheckResult = { success: true, errors: [], warnings: [] };

  logger.info('==========================================');
  logger.info('配置检测中...');
  logger.info('==========================================');

  // 1. 环境变量检测
  logger.info('1. 环境变量检测...');
  const envCheck = checkEnvVariables();
  finalResult.errors.push(...envCheck.errors);
  finalResult.warnings.push(...envCheck.warnings);
  if (envCheck.errors.length > 0) {
    logger.error('✗ 环境变量检测失败');
    envCheck.errors.forEach(e => logger.error(`  - ${e}`));
  } else {
    logger.info('✓ 环境变量检测通过');
  }
  if (envCheck.warnings.length > 0) {
    envCheck.warnings.forEach(w => logger.warn(`  - ${w}`));
  }

  // 2. PM2检测
  logger.info('2. PM2检测...');
  const pm2Check = checkPM2();
  finalResult.errors.push(...pm2Check.errors);
  finalResult.warnings.push(...pm2Check.warnings);
  if (pm2Check.errors.length > 0) {
    logger.error('✗ PM2检测失败');
    pm2Check.errors.forEach(e => logger.error(`  - ${e}`));
  } else {
    logger.info('✓ PM2检测通过');
  }

  // 3. API连通性检测
  logger.info('3. API连通性检测...');
  try {
    const { loadAuthFromEnv, OkxAuth } = await import('./src/core/auth.js');
    const authConfig = loadAuthFromEnv();

    if (!authConfig) {
      finalResult.errors.push('无法加载认证配置');
      logger.error('✗ API连通性检测失败: 无法加载认证配置');
    } else {
      const auth = new OkxAuth(authConfig);
      const { AccountApi } = await import('./src/api/account.js');
      const accountApi = new AccountApi(auth, true, undefined);

      // 测试API连接
      await accountApi.getBalance();
      logger.info('✓ API连通性检测通过');
    }
  } catch (error: any) {
    finalResult.errors.push(`API连通性检测失败: ${error.message}`);
    logger.error('✗ API连通性检测失败');
    logger.error(`  错误: ${error.message}`);

    // 提供常见错误提示
    if (error.message.includes('ECONNREFUSED') || error.message.includes('ETIMEDOUT')) {
      finalResult.errors.push('网络连接失败，请检查网络或配置代理');
    } else if (error.message.includes('401') || error.message.includes('403')) {
      finalResult.errors.push('API认证失败，请检查API Key配置');
    } else if (error.message.includes('50001')) {
      finalResult.errors.push('API签名错误，请检查API Key、Secret、Passphrase是否正确');
    }
  }

  // 4. 数据访问检测
  logger.info('4. 数据访问检测...');
  try {
    const { loadAuthFromEnv, OkxAuth } = await import('./src/core/auth.js');
    const authConfig = loadAuthFromEnv();

    if (authConfig) {
      const auth = new OkxAuth(authConfig);
      const { MarketApi } = await import('./src/api/market.js');
      const marketApi = new MarketApi(auth, true, undefined);

      // 测试获取市场数据
      const ticker = await marketApi.getTicker('BTC-USDT');
      if (ticker && ticker.length > 0 && ticker[0]?.instId) {
        logger.info('✓ 数据访问检测通过');
      } else {
        throw new Error('返回数据格式异常');
      }
    }
  } catch (error: any) {
    finalResult.errors.push(`数据访问检测失败: ${error.message}`);
    logger.error('✗ 数据访问检测失败');
    logger.error(`  错误: ${error.message}`);
  }

  // 汇总结果
  logger.info('==========================================');
  if (finalResult.success && finalResult.errors.length === 0) {
    logger.info('✓ 所有检测通过');
    if (finalResult.warnings.length > 0) {
      logger.info(`提示: ${finalResult.warnings.length} 个警告`);
    }
    logger.info('==========================================');
  } else {
    logger.error('✗ 配置检测失败');
    logger.error(`错误: ${finalResult.errors.length} 个`);
    logger.error('==========================================');
    finalResult.success = false;
  }

  return finalResult;
}

// =====================================================
// 主函数
// =====================================================

export async function main(): Promise<void> {
  // 显示欢迎信息
  logger.info('');
  logger.info('╔════════════════════════════════════════════════╗');
  logger.info('║     OKX 量化交易系统 - 无人值守交易系统           ║');
  logger.info('║     24/7 自动运行 | 现货 + 合约双策略            ║');
  logger.info('╚════════════════════════════════════════════════╝');
  logger.info('');

  // 运行配置检测
  const checkResult = await runAllChecks();

  // 如果检测失败，立即中断
  if (!checkResult.success) {
    logger.error('');
    logger.error('==========================================');
    logger.error('配置检测失败，系统无法启动');
    logger.error('请解决以上错误后重试');
    logger.error('==========================================');
    logger.error('');
    process.exit(1);
  }

  // 显示警告
  if (checkResult.warnings.length > 0) {
    logger.warn('');
    logger.warn('==========================================');
    logger.warn('警告信息:');
    checkResult.warnings.forEach(w => logger.warn(`  ⚠️  ${w}`));
    logger.warn('==========================================');
    logger.warn('');
  }

  // 检测是否使用PM2
  const usePM2 = process.env.NO_PM2 !== '1';

  if (usePM2) {
    logger.info('检测通过，系统将在PM2中启动...');
    logger.info('');

    // 使用PM2启动
    const { spawn } = require('child_process');

    const pm2 = spawn('pm2', [
      'start',
      'index.ts',
      '--name', 'okx-trading',
      '--time',
      '--no-daemon',  // 开发模式不使用daemon，生产环境可以去掉
    ], {
      stdio: 'inherit',
      env: { ...process.env },
    });

    pm2.on('error', (error: Error) => {
      logger.error('PM2启动失败:', error);
      logger.error('请手动运行: pm2 start index.ts --name okx-trading --time');
      process.exit(1);
    });

    pm2.on('exit', (code: number) => {
      logger.info(`PM2进程退出，代码: ${code}`);
      process.exit(code);
    });

  } else {
    // 不使用PM2，直接运行
    logger.info('检测通过，系统启动中...');

    // 创建系统实例
    const config: Partial<UnattendedTradingConfig> = {
      system: {
        isDemo: process.env.NODE_ENV !== 'production',
        healthCheckInterval: 30,
        restartDelay: 5,
        maxRestartAttempts: 3,
      },
    };

    const system = new UnattendedTradingSystem(config);

    // 优雅关闭处理
    const shutdown = async (signal: string) => {
      logger.info(`\n收到 ${signal} 信号，正在关闭系统...`);
      await system.stop();
      process.exit(0);
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));

    try {
      await system.start();

      // 保持运行
      process.stdin.resume();

    } catch (error) {
      logger.error('系统启动失败:', error as Error | Record<string, unknown>);
      process.exit(1);
    }
  }
}

// 直接运行此脚本时执行main
if (import.meta.main) {
  main().catch((error) => {
    logger.error('系统运行失败:', error as Error | Record<string, unknown>);
    process.exit(1);
  });
}
