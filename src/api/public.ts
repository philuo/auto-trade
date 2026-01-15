/**
 * OKX Public API 接口
 *
 * 功能：
 * - 获取交易产品基础信息
 * - 获取交割和行权记录
 * - 获取持仓总量
 * - 获取衍生品仓位档位
 */

import { RestClient } from './rest.js';
import { OkxAuth } from '../core/auth.js';
import type { OkxAuth as OkxAuthType } from '../core/auth.js';
import type { InstType } from '../core/constants.js';

// =====================================================
// 产品信息
// =====================================================

/**
 * 产品基础信息
 */
export interface Instrument {
  instType: InstType;           // 产品类型 SPOT/SWAP/FUTURES/OPTION
  instId: string;               // 产品ID
  underlying: string;           // 标的指数
  category: string;             // 币种类别
  baseCcy: string;              // 交易货币币种
  quoteCcy: string;             // 计价货币币种
  settleCcy: string;            // 盈亏结算和保证金币种
  ctVal: string;                // 合约面值
  ctMult: string;               // 合约乘数
  ctType: string;               // 悖离类型
  optType: string;              // 期权类型 C or P
  stk: string;                  // 行权价格
  listTime: string;             // 上线时间
  expTime: string;              // 首次交割/行权时间
  lever: string;                // 杠杆倍数
  tickSz: string;               // 下单价格精度
  lotSz: string;                // 下单数量精度
  minSz: string;                // 最小下单数量
  state: string;                // 状态
  maxLmtSz: string;             // 最大限价单数量
  maxMktSz: string;             // 最大市价单数量
  alias: string;                // 标的别名
}

// =====================================================
// 交割和行权记录
// =====================================================

/**
 * 交割/行权记录
 */
export interface DeliveryRecord {
  instId: string;               // 产品ID
  instType: string;             // 产品类型
  px: string;                   // 平仓价格
  ts: string;                   // 平仓时间
  idxPx: string;                // 标的指数价格
  idxRebalancePx: string;       // 再平衡标的指数价格
  timeLapsed: string;           // 时间间隔
}

// =====================================================
// 持仓总量
// =====================================================

/**
 * 持仓总量
 */
export interface OpenInterest {
  instId: string;               // 产品ID
  openInt: string;              // 持仓总量
  ts: string;                   // 数据产生时间
}

// =====================================================
// 衍生品仓位档位
// =====================================================

/**
 * 仓位档位
 */
export interface PositionTier {
  instId: string;               // 产品ID
  tier: string;                 // 档位
  minSz: string;                // 最小持仓数量
  maxSz: string;                // 最大持仓数量
  maxMktSz: string;             // 最大市价平仓数量
  mmr: string;                  // 维持保证金率
  imr: string;                  // 初始保证金率
  maxLmtSz: string;             // 最大限价平仓数量
}

// =====================================================
// 估算利息
// =====================================================

/**
 * 估算利率
 */
export interface InterestRate {
  ccy: string;                  // 借币/借条币种
  interest: string;             // 24小时利率
  level: string;                // 档位
}

// =====================================================
// 公共 API 客户端
// =====================================================

export class PublicApi {
  private client: RestClient;
  private auth: OkxAuthType | null;

  constructor(auth?: OkxAuthType, isDemo = true, proxy?: string) {
    this.auth = auth || null;
    // Create a dummy auth instance if none provided
    // Public endpoints don't require authentication
    const authInstance = auth || new OkxAuth({
      apiKey: '',
      secretKey: '',
      passphrase: ''
    });
    this.client = new RestClient(authInstance, isDemo, proxy);
  }

  /**
   * 获取交易产品基础信息
   * @param instType 产品类型 SPOT/SWAP/FUTURES/OPTION/MARGIN
   * @param instId 产品ID
   * @param underlying 标的指数 BTC-USD , ETH-USD 等
   */
  async getInstruments(
    instType?: InstType,
    instId?: string,
    underlying?: string
  ): Promise<Instrument[]> {
    const params: Record<string, string> = {};
    if (instType) params.instType = instType;
    if (instId) params.instId = instId;
    if (underlying) params.underlying = underlying;
    return this.client.get<Instrument[]>('/public/instruments', params);
  }

  /**
   * 获取现货产品列表
   */
  async getSpotInstruments(): Promise<Instrument[]> {
    return this.getInstruments('SPOT');
  }

  /**
   * 获取合约产品列表
   */
  async getSwapInstruments(underlying?: string): Promise<Instrument[]> {
    return this.getInstruments('SWAP', undefined, underlying);
  }

  /**
   * 获取单个产品信息
   * @param instId 产品ID
   * @param instType 产品类型
   */
  async getInstrument(instId: string, instType: InstType = 'SPOT'): Promise<Instrument | null> {
    const instruments = await this.getInstruments(instType, instId);
    return instruments.length > 0 ? (instruments[0] ?? null) : null;
  }

  /**
   * 获取交割和行权记录
   * @param instType 产品类型
   * @param underlying 标的指数 BTC-USD , ETH-USD 等
   * @param after 请求此时间戳之前的内容
   * @param before 请求此时间戳之后的内容
   * @param limit 返回结果的数量
   */
  async getDeliveryExerciseHistory(
    instType?: string,
    underlying?: string,
    after?: string,
    before?: string,
    limit?: string
  ): Promise<DeliveryRecord[]> {
    const params: Record<string, string> = {};
    if (instType) params.instType = instType;
    if (underlying) params.underlying = underlying;
    if (after) params.after = after;
    if (before) params.before = before;
    if (limit) params.limit = limit;
    return this.client.get<DeliveryRecord[]>('/public/delivery-exercise-history', params);
  }

  /**
   * 获取持仓总量
   * @param instType 产品类型 SWAP/FUTURES/OPTION
   * @param instId 产品ID (可选)
   * @param ccy 币种 (可选)
   */
  async getOpenInterest(
    instType: string,
    instId?: string,
    ccy?: string
  ): Promise<OpenInterest[]> {
    const params: Record<string, string> = { instType };
    if (instId) params.instId = instId;
    if (ccy) params.ccy = ccy;
    return this.client.get<OpenInterest[]>('/public/open-interest', params);
  }

  /**
   * 获取衍生品仓位档位
   * @param instType 产品类型 SWAP/FUTURES/OPTION
   * @param tdMode 交易模式 (必需)
   * @param uly 标的指数 (可选，但推荐提供，如 BTC-USD)
   * @param instId 产品ID (可选)
   * @param ccy 币种 (可选)
   * @param tier 档位 (可选)
   */
  async getPositionTiers(
    instType: string,
    tdMode: string,
    uly?: string,
    instId?: string,
    ccy?: string,
    tier?: string
  ): Promise<PositionTier[]> {
    const params: Record<string, string> = { instType, tdMode };
    if (uly) params.uly = uly;
    if (instId) params.instId = instId;
    if (ccy) params.ccy = ccy;
    if (tier) params.tier = tier;
    return this.client.get<PositionTier[]>('/public/position-tiers', params);
  }

  /**
   * 获取借币利率
   * @param ccy 币种
   */
  async getInterestRate(ccy: string): Promise<InterestRate[]> {
    return this.client.get<InterestRate[]>('/account/interest-rate', { ccy });
  }

  /**
   * 获取所有借币利率
   */
  async getAllInterestRates(): Promise<InterestRate[]> {
    return this.client.get<InterestRate[]>('/account/interest-rate', {});
  }

  /**
   * 获取系统时间
   */
  async getServerTime(): Promise<{ ts: string }> {
    const result = await this.client.get<{ ts: string }[]>('/public/time', {});
    return result[0] ?? { ts: Date.now().toString() };
  }

  /**
   * 获取产品首页广告位
   * @param pageType 页面类型
   */
  async getBanner(pageType?: string): Promise<unknown[]> {
    const params: Record<string, string> = {};
    if (pageType) params.pageType = pageType;
    return this.client.get('/public/banner', params);
  }

  /**
   * 检查产品是否可交易
   * @param instId 产品ID
   * @param instType 产品类型
   */
  async isInstrumentTrading(instId: string, instType: InstType = 'SPOT'): Promise<boolean> {
    const instrument = await this.getInstruments(instType, instId);
    return instrument.length > 0 && instrument[0].state === 'live';
  }

  /**
   * 获取产品精度信息
   * @param instId 产品ID
   * @param instType 产品类型
   */
  async getInstrumentPrecision(instId: string, instType: InstType = 'SPOT'): Promise<{
    tickSize: number;
    lotSize: number;
    minSize: number;
  } | null> {
    const instrument = await this.getInstrument(instId, instType);
    if (!instrument) return null;

    return {
      tickSize: parseFloat(instrument.tickSz),
      lotSize: parseFloat(instrument.lotSz),
      minSize: parseFloat(instrument.minSz)
    };
  }

  /**
   * 格式化价格精度
   * @param price 价格
   * @param tickSize 价格精度
   */
  formatPrice(price: number, tickSize: number): number {
    const decimals = Math.abs(Math.log10(tickSize));
    return Math.floor(price * Math.pow(10, decimals)) / Math.pow(10, decimals);
  }

  /**
   * 格式化数量精度
   * @param size 数量
   * @param lotSize 数量精度
   */
  formatSize(size: number, lotSize: number): number {
    const decimals = Math.abs(Math.log10(lotSize));
    return Math.floor(size * Math.pow(10, decimals)) / Math.pow(10, decimals);
  }
}

// =====================================================
// 工具函数
// =====================================================

/**
 * 创建公共 API 客户端实例
 */
export function createPublicApi(auth?: OkxAuth, isDemo = true, proxy?: string): PublicApi {
  return new PublicApi(auth, isDemo, proxy);
}

/**
 * 判断产品类型是否为现货
 */
export function isSpotInstrument(instType: InstType): boolean {
  return instType === 'SPOT';
}

/**
 * 判断产品类型是否为合约
 */
export function isSwapInstrument(instType: InstType): boolean {
  return instType === 'SWAP';
}

/**
 * 判断产品类型是否为期权
 */
export function isOptionInstrument(instType: InstType): boolean {
  return instType === 'OPTIONS';
}

/**
 * 获取交易对基础币种
 */
export function getBaseCcy(instId: string): string {
  return instId.split('-')[0];
}

/**
 * 获取交易对计价币种
 */
export function getQuoteCcy(instId: string): string {
  const parts = instId.split('-');
  return parts.length > 1 ? parts[1] : 'USDT';
}

/**
 * 检查产品是否支持保证金模式
 */
export function supportsMargin(instrument: Instrument): boolean {
  return instrument.state === 'live' &&
         (instrument.instType === 'SPOT' || instrument.instType === 'MARGIN');
}

/**
 * 获取产品交易对列表（按币种过滤）
 * @param instruments 产品列表
 * @param baseCcy 基础币种
 */
export function filterInstrumentsByBaseCcy(instruments: Instrument[], baseCcy: string): Instrument[] {
  return instruments.filter(inst => {
    const instBaseCcy = inst.instId.split('-')[0];
    return instBaseCcy === baseCcy && inst.state === 'live';
  });
}

/**
 * 获取可用交易对（过滤掉暂停交易的产品）
 */
export function getActiveInstruments(instruments: Instrument[]): Instrument[] {
  return instruments.filter(inst => inst.state === 'live');
}
