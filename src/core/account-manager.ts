/**
 * 账户管理器
 *
 * 负责从OKX API获取实时账户信息：
 * - 账户余额（可用资金、冻结资金）
 * - 当前持仓（合约仓位）
 * - 风险敞口计算
 * - 持仓盈亏计算
 */

import { logger } from '../utils';
import { AccountApi } from '../api/account';
import { OkxAuth } from './auth';

// =====================================================
// 账户信息类型
// =====================================================

/**
 * 账户余额信息
 */
export interface AccountBalance {
  // 可用余额（USDT）
  available: number;

  // 冻结余额（USDT）
  frozen: number;

  // 总余额（USDT）
  total: number;

  // 权益（USDT）
  equity: number;

  // 未实现盈亏（USDT）
  unrealizedPnl: number;

  // 保证金余额（USDT）
  margin: number;
}

/**
 * 持仓信息
 */
export interface PositionInfo {
  // 持仓ID
  positionId: string;

  // 币种
  coin: string;

  // 持仓方向
  side: 'long' | 'short' | 'net';

  // 持仓数量
  size: number;

  // 入场均价
  avgPrice: number;

  // 当前价格
  lastPrice: number;

  // 未实现盈亏
  unrealizedPnl: number;

  // 未实现盈亏率
  unrealizedPnlRatio: string;

  // 保证金
  margin: number;

  // 已实现盈亏
  realizedPnl: number;

  // 强平价格
  liquidationPrice: number;

  // 标记价格
  markPrice: number;

  // 按金模式
  leverage: string;

  // 时间戳
  timestamp: number;
}

/**
 * 风险敞口信息
 */
export interface ExposureInfo {
  // 总风险敞口（USDT）
  totalExposure: number;

  // 风险敞口占总资金百分比
  exposurePercent: number;

  // 多头敞口（USDT）
  longExposure: number;

  // 空头敞口（USDT）
  shortExposure: number;

  // 净敞口（USDT）
  netExposure: number;

  // 持仓数量
  positionCount: number;

  // 持仓币种列表
  coins: string[];
}

// =====================================================
// 账户管理器
// =====================================================

export class AccountManager {
  private accountApi: AccountApi;
  private balanceCache: AccountBalance | null = null;
  private positionsCache: PositionInfo[] | null = null;
  private cacheExpiry: number = 0;
  private cacheDuration = 2000; // 缓存2秒

  constructor(auth: OkxAuth, isDemo: boolean = true) {
    this.accountApi = new AccountApi(auth, isDemo, undefined);
  }

  // =====================================================
  // 账户余额
  // // =====================================================

  /**
   * 获取账户余额（带缓存）
   */
  async getBalance(refresh = false): Promise<AccountBalance> {
    const now = Date.now();

    // 使用缓存（如果未过期）
    if (!refresh && this.balanceCache && now < this.cacheExpiry) {
      return this.balanceCache;
    }

    try {
      // 获取余额数据
      const balanceData = await this.accountApi.getBalance();

      // 解析余额
      let available = 0;
      let frozen = 0;
      let total = 0;

      for (const item of balanceData) {
        if (item.ccy === 'USDT') {
          available = parseFloat(item.availBal) || 0;
          frozen = parseFloat(item.frozenBal) || 0;
          total = parseFloat(item.bal) || 0;
        }
      }

      // 获取权益（未实现盈亏）
      const equity = total; // 暂时使用 total，后续可以从持仓计算

      const balance: AccountBalance = {
        available,
        frozen,
        total,
        equity,
        unrealizedPnl: 0,
        margin: 0,
      };

      this.balanceCache = balance;
      this.cacheExpiry = now + this.cacheDuration;

      return balance;

    } catch (error) {
      logger.error('获取账户余额失败', { error });
      throw error;
    }
  }

  /**
   * 获取可用资金
   */
  async getAvailableBalance(): Promise<number> {
    const balance = await this.getBalance();
    return balance.available;
  }

  /**
   * 获取总资金
   */
  async getTotalBalance(): Promise<number> {
    const balance = await this.getBalance();
    return balance.total;
  }

  // =====================================================
  // 持仓信息
  // =====================================================

  /**
   * 获取当前所有持仓（带缓存）
   */
  async getPositions(refresh = false): Promise<PositionInfo[]> {
    const now = Date.now();

    // 使用缓存（如果未过期）
    if (!refresh && this.positionsCache && now < this.cacheExpiry) {
      return this.positionsCache;
    }

    try {
      // 获取持仓数据
      const positionsData = await this.accountApi.getPositions();

      const positions: PositionInfo[] = [];

      for (const pos of positionsData) {
        // 只处理合约持仓（SWAP后缀）
        if (!pos.instId.endsWith('-SWAP')) {
          continue;
        }

        // 解析币种
        const coin = pos.instId.replace('-USDT-SWAP', '');

        // 解析持仓方向
        let side: 'long' | 'short' | 'net' = 'net';
        if (pos.posSide === 'long') side = 'long';
        else if (pos.posSide === 'short') side = 'short';

        // 解析未实现盈亏
        const unrealizedPnl = parseFloat(pos.upl) || 0;
        const unrealizedPnlRatio = pos.uplRatio || '0%';

        // 解析持仓数量
        const size = parseFloat(pos.pos) || 0;

        positions.push({
          positionId: pos.posId,
          coin,
          side,
          size,
          avgPrice: parseFloat(pos.avgPx) || 0,
          lastPrice: parseFloat(pos.last) || 0,
          unrealizedPnl,
          unrealizedPnlRatio,
          margin: parseFloat(pos.margin) || 0,
          realizedPnl: 0,
          liquidationPrice: parseFloat(pos.liqPx) || 0,
          markPrice: parseFloat(pos.markPx) || 0,
          leverage: pos.lever,
          timestamp: Date.now(),
        });
      }

      this.positionsCache = positions;
      this.cacheExpiry = now + this.cacheDuration;

      return positions;

    } catch (error) {
      logger.error('获取持仓信息失败', { error });
      return [];
    }
  }

  /**
   * 获取指定币种的持仓
   */
  async getPosition(coin: string): Promise<PositionInfo | null> {
    const positions = await this.getPositions();
    return positions.find(p => p.coin === coin) || null;
  }

  /**
   * 获取持仓数量
   */
  async getPositionCount(): Promise<number> {
    const positions = await this.getPositions();
    return positions.length;
  }

  // =====================================================
  // 风险敞口计算
  // =====================================================

  /**
   * 计算当前风险敞口
   */
  async getExposure(): Promise<ExposureInfo> {
    try {
      const positions = await this.getPositions();
      const balance = await this.getBalance();

      let totalExposure = 0;
      let longExposure = 0;
      let shortExposure = 0;
      const coins: string[] = [];

      for (const pos of positions) {
        // 敞口 = 持仓数量 × 当前价格
        const exposure = pos.size * pos.lastPrice;
        totalExposure += exposure;

        if (pos.side === 'long') {
          longExposure += exposure;
        } else if (pos.side === 'short') {
          shortExposure += exposure;
        }

        coins.push(pos.coin);
      }

      // 净敞口 = 多头敞口 - 空头敞口
      const netExposure = longExposure - shortExposure;

      // 风险敞口占总资金百分比
      const exposurePercent = (totalExposure / balance.total) * 100;

      return {
        totalExposure,
        exposurePercent,
        longExposure,
        shortExposure,
        netExposure,
        positionCount: positions.length,
        coins,
      };

    } catch (error) {
      logger.error('计算风险敞口失败', { error });
      return {
        totalExposure: 0,
        exposurePercent: 0,
        longExposure: 0,
        shortExposure: 0,
        netExposure: 0,
        positionCount: 0,
        coins: [],
      };
    }
  }

  /**
   * 获取未实现盈亏总和
   */
  async getTotalUnrealizedPnl(): Promise<number> {
    try {
      const positions = await this.getPositions();
      return positions.reduce((sum, pos) => sum + pos.unrealizedPnl, 0);
    } catch (error) {
      logger.error('计算未实现盈亏失败', { error });
      return 0;
    }
  }

  // =====================================================
  // 清除缓存
  // =====================================================

  /**
   * 清除所有缓存
   */
  clearCache(): void {
    this.balanceCache = null;
    this.positionsCache = null;
  }

  /**
   * 强制刷新数据
   */
  async refresh(): Promise<void> {
    this.clearCache();
    await Promise.all([
      this.getBalance(true),
      this.getPositions(true),
    ]);
  }
}

// =====================================================
// 导出单例获取函数
// =====================================================

let globalAccountManager: AccountManager | null = null;

export function getGlobalAccountManager(auth?: OkxAuth, isDemo?: boolean): AccountManager {
  if (!globalAccountManager) {
    if (!auth) {
      throw new Error('首次初始化必须提供 auth 参数');
    }
    globalAccountManager = new AccountManager(auth, isDemo);
  }
  return globalAccountManager;
}
