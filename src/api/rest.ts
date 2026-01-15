/**
 * OKX REST API 基础客户端
 *
 * 功能：
 * - 封装 Bun 的 fetch API
 * - 实现请求签名
 * - 错误处理与重试机制
 * - 速率限制控制
 * - 响应数据解析
 */

import { OkxAuth, type RequestHeaders } from '../core/auth.js';
import { ERROR_CODES, ERROR_MESSAGES, API_ENDPOINTS } from '../core/constants.js';

// =====================================================
// HTTP 方法
// =====================================================

export const HTTP_METHODS = {
  GET: 'GET',
  POST: 'POST',
  PUT: 'PUT',
  DELETE: 'DELETE'
} as const;

// =====================================================
// API 响应
// =====================================================

export interface OkxApiResponse<T = unknown> {
  code: string;
  msg: string;
  data: T;
  dataLen?: string;
}

// =====================================================
// 请求配置
// =====================================================

export interface RequestConfig {
  method?: keyof typeof HTTP_METHODS;
  endpoint: string;
  params?: Record<string, string | number | boolean>;
  body?: Record<string, unknown>;
  headers?: Record<string, string>;
  proxy?: string; // Bun fetch proxy option (e.g., "http://127.0.0.1:7890")
}

// =====================================================
// 重试配置
// =====================================================

export interface RetryConfig {
  maxRetries: number;
  retryDelay: number;
  retryableErrors: string[];
  retryableStatusCodes: number[];
}

// =====================================================
// 速率限制配置
// =====================================================

export interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
}

// =====================================================
// REST API 客户端类
// =====================================================

export class RestClient {
  private auth: OkxAuth;
  private baseUrl: string;
  private isDemo: boolean;
  private retryConfig: RetryConfig;
  private rateLimiter: RateLimiter;
  private proxy: string | undefined;

  // 请求统计
  private stats = {
    totalRequests: 0,
    successRequests: 0,
    failedRequests: 0,
    retriedRequests: 0,
  };

  constructor(auth: OkxAuth, isDemo = true, proxy?: string) {
    this.auth = auth;
    this.isDemo = isDemo;
    this.baseUrl = isDemo ? API_ENDPOINTS.DEMO_REST_API : API_ENDPOINTS.LIVE_REST_API;
    this.proxy = proxy || process.env.HTTP_PROXY || process.env.HTTPS_PROXY;

    this.retryConfig = {
      maxRetries: 3,
      retryDelay: 1000,
      retryableErrors: [
        ERROR_CODES.SERVICE_TIMEOUT,
        ERROR_CODES.REQUEST_RATE_LIMIT,
      ],
      retryableStatusCodes: [429, 500, 502, 503, 504]
    };

    this.rateLimiter = new RateLimiter({
      maxRequests: 20, // OKX 限制：20 次/秒
      windowMs: 1000
    });
  }

  /**
   * 发送请求
   * @param config 请求配置
   * @returns API 响应数据
   */
  async request<T = unknown>(config: RequestConfig): Promise<T> {
    await this.rateLimiter.waitIfNeeded();

    const method = config.method || HTTP_METHODS.GET;
    const { requestPath, body } = this.buildRequestPathAndBody(config);

    // 完整 URL - strip /api/v5 prefix from requestPath since baseUrl already includes it
    const urlPath = requestPath.startsWith('/api/v5') ? requestPath.substring(7) : requestPath;
    const url = this.baseUrl + urlPath;

    // 使用配置的代理或请求中的代理
    const proxy = config.proxy || this.proxy;

    // 在 rate limiter 之后、发送之前构建请求头（确保时间戳新鲜）
    let headers = this.auth.buildHeaders(method, requestPath, body);

    // 模拟盘需要添加特殊的请求头
    if (this.isDemo) {
      headers = { ...headers, 'x-simulated-trading': '1' };
    }

    // DEBUG: 打印请求信息
    if (process.env.DEBUG_OKX === 'true') {
      console.log(`[RestClient] Request: ${method} ${url}`);
      console.log(`[RestClient] Headers:`, JSON.stringify(headers, null, 2));
    }

    this.stats.totalRequests++;

    // 带重试的请求
    const response = await this.requestWithRetry<T>(
      url,
      method,
      headers,
      body,
      proxy
    );

    this.stats.successRequests++;
    return response;
  }

  /**
   * 带重试的请求
   */
  private async requestWithRetry<T>(
    url: string,
    method: string,
    headers: any,
    body: string,
    proxy: string | undefined,
    attempt = 1
  ): Promise<T> {
    // 每次重试都重新生成时间戳和签名，避免时间戳过期
    if (attempt > 1) {
      headers = this.auth.buildHeaders(method, url.replace(this.baseUrl, ''), body);
      if (this.isDemo) {
        headers = { ...headers, 'x-simulated-trading': '1' };
      }
    }

    try {
      // Use plain object without type to avoid TypeScript transpilation issues
      // Create a fresh copy of headers to avoid reference issues
      const fetchOptions = {
        method,
        headers: { ...headers },
        proxy: proxy || undefined
      } as any;

      if (body && method !== HTTP_METHODS.GET) {
        fetchOptions.body = body;
      }

      // DEBUG: 打印请求选项
      if (process.env.DEBUG_OKX === 'true') {
        console.log(`[RestClient] FetchOptions:`, JSON.stringify({
          url: url,
          urlType: typeof url,
          method: fetchOptions.method,
          methodType: typeof fetchOptions.method,
          headersKeys: Object.keys(fetchOptions.headers || {}),
          headersValues: Object.keys(fetchOptions.headers || {}).reduce((acc, k) => {
            acc[k] = k === 'OK-ACCESS-SIGN' ? '...' : (fetchOptions.headers || {})[k];
            return acc;
          }, {}),
          hasProxy: !!fetchOptions.proxy,
          proxyUrl: fetchOptions.proxy,
          proxyType: typeof fetchOptions.proxy,
          hasBody: !!fetchOptions.body,
          bodyType: typeof fetchOptions.body
        }, null, 2));
      }

      const response = await fetch(url, fetchOptions);

      // DEBUG: 打印响应状态
      if (process.env.DEBUG_OKX === 'true') {
        console.log(`[RestClient] Response Status: ${response.status} ${response.statusText}`);
      }

      // 检查 HTTP 状态码
      if (!response.ok) {
        const shouldRetry = this.retryConfig.retryableStatusCodes.includes(response.status);

        if (shouldRetry && attempt < this.retryConfig.maxRetries) {
          this.stats.retriedRequests++;
          console.warn(`[RestClient] HTTP ${response.status}, retrying (${attempt}/${this.retryConfig.maxRetries})...`);

          await this.delay(this.retryConfig.retryDelay * attempt);
          return this.requestWithRetry<T>(url, method, headers, body, proxy, attempt + 1);
        }

        // Try to get error details from response body
        let errorDetails = response.statusText;
        try {
          const errorBody = await response.text();
          if (errorBody) {
            errorDetails = `${response.statusText} - ${errorBody}`;
          }
        } catch (e) {
          // Ignore error parsing errors
        }

        throw new Error(`HTTP ${response.status}: ${errorDetails}`);
      }

      // 解析响应
      const json = await response.json() as OkxApiResponse<T>;

      // 检查业务错误码
      if (json.code !== ERROR_CODES.SUCCESS) {
        const errorMsg = ERROR_MESSAGES[json.code] || json.msg;

        const shouldRetry = this.retryConfig.retryableErrors.includes(json.code);

        if (shouldRetry && attempt < this.retryConfig.maxRetries) {
          this.stats.retriedRequests++;
          console.warn(`[RestClient] API error ${json.code}: ${errorMsg}, retrying (${attempt}/${this.retryConfig.maxRetries})...`);

          await this.delay(this.retryConfig.retryDelay * attempt);
          return this.requestWithRetry<T>(url, method, headers, body, proxy, attempt + 1);
        }

        throw new Error(`API Error ${json.code}: ${errorMsg}`);
      }

      return json.data;

    } catch (error) {
      this.stats.failedRequests++;

      // 网络错误重试
      if (attempt < this.retryConfig.maxRetries && this.isNetworkError(error)) {
        this.stats.retriedRequests++;
        console.warn(`[RestClient] Network error, retrying (${attempt}/${this.retryConfig.maxRetries})...`, error);

        await this.delay(this.retryConfig.retryDelay * attempt);
        return this.requestWithRetry<T>(url, method, headers, body, proxy, attempt + 1);
      }

      throw error;
    }
  }

  /**
   * 构建 URL 路径和请求体
   */
  private buildRequestPathAndBody(config: RequestConfig): {
    requestPath: string;
    body: string;
  } {
    // Request path must include /api/v5 for signature
    let requestPath = '/api/v5' + config.endpoint;
    let body = '';

    // 添加查询参数
    if (config.params && Object.keys(config.params).length > 0) {
      const searchParams = new URLSearchParams();

      for (const [key, value] of Object.entries(config.params)) {
        searchParams.append(key, String(value));
      }

      requestPath += '?' + searchParams.toString();
    }

    // 添加请求体
    if (config.body && Object.keys(config.body).length > 0) {
      body = JSON.stringify(config.body);
    }

    return { requestPath, body };
  }

  /**
   * 判断是否为网络错误
   */
  private isNetworkError(error: unknown): boolean {
    if (error instanceof Error) {
      return error.message.includes('fetch') ||
             error.message.includes('network') ||
             error.message.includes('ECONNREFUSED');
    }
    return false;
  }

  /**
   * 延迟
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * GET 请求
   */
  async get<T = unknown>(endpoint: string, params?: Record<string, string | number | boolean>): Promise<T> {
    return this.request<T>({ method: HTTP_METHODS.GET, endpoint, params });
  }

  /**
   * POST 请求
   */
  async post<T = unknown>(endpoint: string, body?: Record<string, unknown>): Promise<T> {
    return this.request<T>({ method: HTTP_METHODS.POST, endpoint, body });
  }

  /**
   * PUT 请求
   */
  async put<T = unknown>(endpoint: string, body?: Record<string, unknown>): Promise<T> {
    return this.request<T>({ method: HTTP_METHODS.PUT, endpoint, body });
  }

  /**
   * DELETE 请求
   */
  async delete<T = unknown>(endpoint: string, body?: Record<string, unknown>): Promise<T> {
    return this.request<T>({ method: HTTP_METHODS.DELETE, endpoint, body });
  }

  /**
   * 获取统计信息
   */
  getStats() {
    return { ...this.stats };
  }

  /**
   * 重置统计信息
   */
  resetStats(): void {
    this.stats = {
      totalRequests: 0,
      successRequests: 0,
      failedRequests: 0,
      retriedRequests: 0,
    };
  }

  /**
   * 更新重试配置
   */
  updateRetryConfig(config: Partial<RetryConfig>): void {
    this.retryConfig = { ...this.retryConfig, ...config };
  }

  /**
   * 更新速率限制配置
   */
  updateRateLimitConfig(config: Partial<RateLimitConfig>): void {
    this.rateLimiter.updateConfig(config);
  }
}

// =====================================================
// 速率限制器
// =====================================================

class RateLimiter {
  private requests: number[] = [];
  private config: RateLimitConfig;

  constructor(config: RateLimitConfig) {
    this.config = config;
  }

  /**
   * 等待如果需要（速率限制）
   */
  async waitIfNeeded(): Promise<void> {
    const now = Date.now();

    // 清理过期的请求记录
    this.requests = this.requests.filter(t => now - t < this.config.windowMs);

    // 如果达到限制，等待
    if (this.requests.length >= this.config.maxRequests) {
      const oldest = this.requests[0];
      if (oldest) {
        const waitTime = this.config.windowMs - (now - oldest);
        if (waitTime > 0) {
          console.log(`[RateLimiter] Rate limit reached, waiting ${waitTime}ms...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
        }
      }
    }

    // 记录本次请求
    this.requests.push(Date.now());
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<RateLimitConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * 获取当前请求数
   */
  getCurrentRequestCount(): number {
    const now = Date.now();
    this.requests = this.requests.filter(t => now - t < this.config.windowMs);
    return this.requests.length;
  }
}

// =====================================================
// 工具函数
// =====================================================

/**
 * 创建 REST 客户端实例
 */
export function createRestClient(auth: OkxAuth, isDemo = true, proxy?: string): RestClient {
  return new RestClient(auth, isDemo, proxy);
}

/**
 * 格式化错误信息
 */
export function formatErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
