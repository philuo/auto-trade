#!/usr/bin/env bun
/**
 * OKX 合约高频量化交易系统 - 主入口
 *
 * 高频量化合约交易系统，秒级别触发
 * 纯技术分析，无需AI
 *
 * 使用方法:
 *   bun run start
 *   bun run index.ts
 */

import { logger } from './src/utils/logger';
import { FuturesTradingSystem } from './src/main/futures-trading-system';
import type { FuturesTradingConfig } from './src/main/futures-trading-system';

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

  // 2. API连通性检测
  logger.info('2. API连通性检测...');
  try {
    const { loadAuthFromEnv, OkxAuth } = await import('./src/core/auth');
    const authConfig = loadAuthFromEnv();

    if (!authConfig) {
      finalResult.errors.push('无法加载认证配置');
      logger.error('✗ API连通性检测失败: 无法加载认证配置');
    } else {
      const auth = new OkxAuth(authConfig);
      const { AccountApi } = await import('./src/api/account');
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

  // 3. 数据访问检测
  logger.info('3. 数据访问检测...');
  try {
    const { loadAuthFromEnv, OkxAuth } = await import('./src/core/auth');
    const authConfig = loadAuthFromEnv();

    if (authConfig) {
      const auth = new OkxAuth(authConfig);
      const { MarketApi } = await import('./src/api/market');
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
  logger.info('║     OKX 合约高频量化交易系统                     ║');
  logger.info('║     秒级触发 | 纯技术分析 | 无AI                ║');
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

  // 启动系统
  logger.info('检测通过，系统启动中...');

  // 默认配置
  const config: Partial<FuturesTradingConfig> = {
    coins: ['BTC', 'ETH'],
    timeframes: ['1m', '5m', '15m'],
    trading: {
      enableTrading: process.env.NODE_ENV === 'production',
      basePositionSize: 100,  // 100 USDT
      maxPositionSize: 500,   // 500 USDT
      leverage: 2,            // 2倍杠杆
    },
    safety: {
      maxPositions: 3,
      maxExposure: 30,
      consecutiveLossLimit: 3,
      dailyLossLimit: 5,
    },
    signals: {
      minStrength: 0.6,
      minConfidence: 0.5,
      enableMicrostructure: true,
      enableEventDriven: true,
    },
    system: {
      klineUpdateInterval: 1000,    // 1秒
      orderCheckInterval: 5000,     // 5秒
      logCleanupInterval: 3600000,  // 1小时
      healthCheckInterval: 30000,   // 30秒
    },
  };

  const system = new FuturesTradingSystem(config);

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

// 直接运行此脚本时执行main
if (import.meta.main) {
  main().catch((error) => {
    logger.error('系统运行失败:', error as Error | Record<string, unknown>);
    process.exit(1);
  });
}
