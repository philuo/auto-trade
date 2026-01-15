/**
 * OKX Account API 接口
 *
 * 功能：
 * - 获取账户余额
 * - 获取持仓信息
 * - 设置杠杆（仅合约）
 * - 获取最大可开单数量
 * - 账户配置管理
 */

import { RestClient } from './rest.js';
import { type OkxAuth } from '../core/auth.js';
import type { TdMode, InstType } from '../core/constants.js';

// =====================================================
// 账户余额数据
// =====================================================

/**
 * 余额信息
 */
export interface BalanceInfo {
  ccy: string;                  // 币种
  bal: string;                  // 余额
  frozenBal: string;            // 冻结余额
  availBal: string;             // 可用余额
  cashBal: string;              // 资金账户余额
  eq: string;                   // 美金权益（该币种折合成美金后权益）
  liab: string;                 // 债务额
  upl: string;                  // 未实现盈亏
  uplLiab: string;              // 未实现亏损
  crossLiab: string;            // 全仓欠款
  isoLiab: string;              // 逐仓欠款
  isoUpl: string;               // 逐仓未实现盈亏
  marginRatio: string;          // 保证金率
  interest: string;             // 计息
  twap: string;                 // TWAP
  maxSpotSz: string;            // 现货最大可交易币数
  maxFutSz: string;             // 最大可交易币合约张数
  maxOptSz: string;             // 最大可交易币期权合约张数
  stpBal: string;               // 止盈止损余额
  stpIsoBal: string;            // 止盈止损逐仓余额
  notionalLever: string;        // 名义杠杆
  adjFut: string;               // 调整后期货账户余额
  implEq: string;               // 隐含权益
  deltaBS: string;              // 希腊值
  deltaPA: string;              // 希腊值
  gammaBS: string;              // 希腊值
  gammaPA: string;              // 希腊值
  thetaBS: string;              // 希腊值
  thetaPA: string;              // 希腊值
  vegaBS: string;               // 希腊值
  vegaPA: string;               // 希腊值
  ccyInUseAmt: string;          // 币种已占用金额
  ccyInUseAmtLiab: string;      // 币种已占用债务
  rchrgrSrc: string;            // 充电币来源
  uTime: string;                // 更新时间
  cashInfo: CashInfo;
}

/**
 * 资金账户信息
 */
export interface CashInfo {
  notionalLever: string;        // 名义杠杆
  notionalUsd: string;          // 名义美金
  cashBal: string;              // 现货现金余额
  uTime: string;                // 更新时间
}

// =====================================================
// 持仓数据
// =====================================================

/**
 * 持仓信息
 */
export interface PositionInfo {
  instType: InstType;           // 产品类型
  instId: string;               // 产品ID
  pos: string;                  // 持仓数量
  posCcy: string;               // 持仓币种
  avgPx: string;                // 开仓平均价
  upl: string;                  // 未实现盈亏
  uplRatio: string;             // 未实现盈亏率
  uplLastPx: string;            // 未实现盈亏-根据最新标签价计算
  lever: string;                // 杠杆倍数
  lever5: string;               // 5倍杠杆下的仓位数据
  usdPx: string;                // 美金价
  px: string;                   // 最新成交价
  liqPx: string;                // 强平价格
  markPx: string;               // 标记价格
  markValue: string;            // 标记价值
  imr: string;                  // 初始保证金
  margin: string;               // 保证金余额
  mgnRatio: string;             // 保证金率
  maintainMargin: string;       // 维持保证金
  estLiqPx: string;             // 预估强平价
  ccy: string;                  // 保证金币种
  posId: string;                // 持仓ID
  notionalUsd: string;          // 美金价值
  adl: string;                  // ADL排名
  liab: string;                 // 债务额
  interest: string;             // 利息
  tradeId: string;              // 最新成交ID
  optVal: string;               // 期权价值
  pendingCloseOrdLiab: string;  // 待平仓委托占用
  pxUsd: string;                // 美金价格
  pxSettle: string;             // 结算币价格
  pxVol: string;                // 波动率价格
  pxBlock: string;              // 大宗交易价格
  riskLimit: string;            // 风险限额
  realAdl: string;              // 真实ADL排名
  algoClPosId: string;          // 组合减仓ID
  ccyToU: string;               // 币种USD价格
  ccyInUseAmt: string;          // 币种已占用金额
  ccyInUseAmtLiab: string;      // 币种已占用债务
  uTime: string;                // 更新时间
  note: string;                 // 备注
  last: string;                 // 最新标记价格
  optIdx: string;               // 期权索引
  deltaBS: string;              // 希腊值
  deltaPA: string;              // 希腊值
  deltaPALiab: string;          // 希腊值
  deltaBSLiab: string;          // 希腊值
  gammaBS: string;              // 希腊值
  gammaPA: string;              // 希腊值
  thetaBS: string;              // 希腊值
  thetaPA: string;              // 希腊值
  vegaBS: string;               // 希腊值
  vegaPA: string;               // 希腊值
}

// =====================================================
// 杠杆配置
// =====================================================

/**
 * 杠杆设置结果
 */
export interface LeverageResult {
  instId: string;               // 产品ID
  lever: string;                // 杠杆倍数
  mgnMode: string;              // 保证金模式
  posSide: string;              // 持仓方向
}

// =====================================================
// 最大可开单数量
// =====================================================

/**
 * 最大可开单数量信息
 */
export interface MaxSizeInfo {
  instId: string;               // 产品ID
  ccy: string;                  // 币种
  maxBuy: string;               // 最大可买
  maxSell: string;              // 最大可卖
  currBuy: string;              // 当前买方向占用
  currSell: string;             // 当前卖方向占用
  currSz: string;               // 当前币对持仓（买卖占用之和）
  maxBuySz: string;             // 最大可买（张数）
  maxSellSz: string;            // 最大可卖（张数）
  minBuy: string;               // 最小可买
  minSell: string;              // 最小可卖
  lever: string;                // 杠杆倍数
}

/**
 * 最大可开单数量请求参数
 */
export interface MaxSizeParams {
  instId: string;               // 产品ID
  tdMode: TdMode;               // 交易模式
  ccy?: string;                 // 币种
  px?: string;                  // 委托价格
  leverage?: string;            // 杠杆倍数
  unSpotOffset?: string;        // 现货对冲时的数量
}

// =====================================================
// 账户配置
// =====================================================

/**
 * 账户配置信息
 */
export interface AccountConfig {
  acctLv: string;               // 账户等级
  autoLoan: boolean;            // 自动借贷
  ctIsoMode: string;            // 合约逐仓模式
  espMode: string;              // 用户体验改进计划状态
  isoMode: string;              // 现货逐仓模式
  loanFixedBal: string;         // 固定借款额度
  loanFixedBalIso: string;      // 逐仓固定借款额度
  mgnIsoMode: string;           // 保证金模式
  posMode: string;              // 持仓模式
  spMemAcctVal: string;         // 简单模式账户资产估值
  spotOffsetType: string;       // 现货对冲类型
  ulMode: string;               // 统一账户模式
}

// =====================================================
// 账户利率
// =====================================================

/**
 * 账户利率信息
 */
export interface InterestRate {
  ccy: string;                  // 币种
  interest: string;             // 利率
  level: string;                // 等级
  loanQuota: string;            // 借款额度
  loanQuotaUl: string;          // 统一账户借款额度
}

// =====================================================
// 账户余额历史
// =====================================================

/**
 * 账户余额历史
 */
export interface BalanceHistory {
  bal: string;                  // 余额
  balChg: string;               // 余额变化
  ccy: string;                  // 币种
  type: string;                 // 类型
  ts: string;                   // 生成时间
}

/**
 * 余额历史请求参数
 */
export interface BalanceHistoryParams {
  ccy: string;                  // 币种
  type: string;                 // 类型
  before?: string;              // 请求此时间戳之前的内容
  after?: string;               // 请求此时间戳之后的内容
  limit?: string;               // 返回结果的数量
}

// =====================================================
// 账户 API 客户端
// =====================================================

export class AccountApi {
  private client: RestClient;
  private auth: OkxAuth;

  constructor(auth: OkxAuth, isDemo = true, proxy?: string) {
    this.auth = auth;
    this.client = new RestClient(auth, isDemo, proxy);
  }

  /**
   * 获取账户余额
   * @param ccy 币种，不填返回所有币种
   */
  async getBalance(ccy?: string): Promise<BalanceInfo[]> {
    return this.client.get<BalanceInfo[]>('/account/balance', ccy ? { ccy } : undefined);
  }

  /**
   * 获取单个币种余额
   * @param ccy 币种
   */
  async getSingleBalance(ccy: string): Promise<BalanceInfo | null> {
    const balances = await this.getBalance(ccy);
    return balances.length > 0 ? (balances[0] ?? null) : null;
  }

  /**
   * 获取可用余额
   * @param ccy 币种
   */
  async getAvailableBalance(ccy: string): Promise<number> {
    const balance = await this.getSingleBalance(ccy);
    return balance ? parseFloat(balance.availBal) : 0;
  }

  /**
   * 获取持仓信息（仅合约）
   * @param instType 产品类型 SPOT/SWAP/MARGIN/OPTIONS
   * @param instId 产品ID
   * @param mgnMode 保证金模式
   */
  async getPositions(
    instType?: InstType,
    instId?: string,
    mgnMode?: string
  ): Promise<PositionInfo[]> {
    const params: Record<string, string> = {};

    if (instType) {
      params.instType = instType;
    }
    if (instId) {
      params.instId = instId;
    }
    if (mgnMode) {
      params.mgnMode = mgnMode;
    }

    return this.client.get<PositionInfo[]>('/account/positions', params);
  }

  /**
   * 获取单个产品的持仓
   * @param instId 产品ID
   * @param instType 产品类型
   * @param mgnMode 保证金模式
   */
  async getSinglePosition(
    instId: string,
    instType: InstType = 'SPOT',
    mgnMode?: string
  ): Promise<PositionInfo | null> {
    const positions = await this.getPositions(instType, instId, mgnMode);
    return positions.length > 0 ? (positions[0] ?? null) : null;
  }

  /**
   * 设置杠杆（仅合约）
   * @param instId 产品ID
   * @param lever 杠杆倍数
   * @param mgnMode 保证金模式
   * @param posSide 持仓方向
   */
  async setLeverage(
    instId: string,
    lever: string,
    mgnMode: string,
    posSide?: string
  ): Promise<LeverageResult[]> {
    return this.client.post<LeverageResult[]>('/account/set-leverage', {
      instId,
      lever,
      mgnMode,
      posSide
    });
  }

  /**
   * 获取最大可开单数量
   * @param params 最大可开单数量请求参数
   */
  async getMaxSize(params: MaxSizeParams): Promise<MaxSizeInfo[]> {
    const requestParams: Record<string, string | number | boolean> = {
      instId: params.instId,
      tdMode: params.tdMode
    };
    if (params.ccy) requestParams.ccy = params.ccy;
    if (params.px) requestParams.px = params.px;
    if (params.leverage) requestParams.leverage = params.leverage;
    if (params.unSpotOffset) requestParams.unSpotOffset = params.unSpotOffset;
    return this.client.get<MaxSizeInfo[]>('/account/max-size', requestParams);
  }

  /**
   * 获取账户配置
   */
  async getAccountConfig(): Promise<AccountConfig[]> {
    return this.client.get<AccountConfig[]>('/account/config');
  }

  /**
   * 设置账户模式
   * @param posMode 持仓模式 simple_mode：简单模式 net_mode：单币种保证金模式 cross_mode：跨币种保证金模式
   */
  async setAccountMode(posMode: string): Promise<{ result: boolean }> {
    return this.client.post<{ result: boolean }>('/account/set-account-level', {
      posMode
    });
  }

  /**
   * 获取用户当前杠杆
   * @param instId 产品ID
   * @param mgnMode 保证金模式
   */
  async getLeverage(instId: string, mgnMode: string): Promise<string | null> {
    const positions = await this.getPositions('SWAP', instId, mgnMode);
    return positions.length > 0 ? positions[0].lever : null;
  }

  /**
   * 获取账户利率
   * @param ccy 币种
   */
  async getInterestRate(ccy: string): Promise<InterestRate[]> {
    return this.client.get<InterestRate[]>('/account/interest-rate', { ccy });
  }

  /**
   * 获取余额流水
   * @param params 余额历史请求参数
   */
  async getBalanceHistory(params: BalanceHistoryParams): Promise<BalanceHistory[]> {
    const requestParams: Record<string, string | number | boolean> = {
      ccy: params.ccy,
      type: params.type
    };
    if (params.before) requestParams.before = params.before;
    if (params.after) requestParams.after = params.after;
    if (params.limit) requestParams.limit = params.limit;
    return this.client.get<BalanceHistory[]>('/account/bills', requestParams);
  }

  /**
   * 获取交易账户资产估值（仅用于查看总资产）
   * @param ccy 币种，默认为 USDT
   */
  async getAccountAssetValuation(ccy = 'USDT'): Promise<{ totalEq: string; }> {
    const result = await this.client.get<{ totalEq: string }[]>('/account/balance', {});
    if (result.length > 0 && result[0]) {
      return { totalEq: result[0].totalEq || '0' };
    }
    return { totalEq: '0' };
  }
}

// =====================================================
// 工具函数
// =====================================================

/**
 * 创建账户 API 客户端实例
 */
export function createAccountApi(auth: OkxAuth, isDemo = true, proxy?: string): AccountApi {
  return new AccountApi(auth, isDemo, proxy);
}

/**
 * 格式化余额信息
 */
export function formatBalance(balance: BalanceInfo): {
  ccy: string;
  balance: number;
  available: number;
  frozen: number;
  equity: number;
} {
  return {
    ccy: balance.ccy,
    balance: parseFloat(balance.bal),
    available: parseFloat(balance.availBal),
    frozen: parseFloat(balance.frozenBal),
    equity: parseFloat(balance.eq)
  };
}

/**
 * 格式化持仓信息
 */
export function formatPosition(position: PositionInfo): {
  instId: string;
  pos: number;
  avgPx: number;
  upl: number;
  uplRatio: number;
  lever: number;
} {
  return {
    instId: position.instId,
    pos: parseFloat(position.pos),
    avgPx: parseFloat(position.avgPx),
    upl: parseFloat(position.upl),
    uplRatio: parseFloat(position.uplRatio || '0'),
    lever: parseFloat(position.lever)
  };
}

/**
 * 计算账户总权益（USDT）
 */
export function calculateTotalEquity(balances: BalanceInfo[]): number {
  return balances.reduce((sum, b) => sum + parseFloat(b.eq), 0);
}

/**
 * 计算可用余额（USDT）
 */
export function calculateAvailableBalance(balances: BalanceInfo[]): number {
  return balances.reduce((sum, b) => sum + parseFloat(b.availBal), 0);
}

/**
 * 获取特定币种余额
 */
export function getBalanceByCcy(balances: BalanceInfo[], ccy: string): BalanceInfo | null {
  return balances.find(b => b.ccy === ccy) || null;
}
