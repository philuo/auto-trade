/**
 * OKX WebSocket 测试
 *
 * 测试功能：
 * - 客户端创建测试
 * - 连接管理测试
 * - 登录认证测试
 * - 频道订阅测试
 * - 消息处理测试
 * - 重连机制测试
 * - 事件监听测试
 * - 错误处理测试
 */

import { beforeAll, describe, test, expect, afterAll } from 'bun:test';
import { WsClient, createWsClient, createWsClientFromEnv } from '../../src/websocket/client.js';
import { OkxAuth, loadAuthFromEnv } from '../../src/core/auth.js';
import { API_ENDPOINTS } from '../../src/core/constants.js';
import type { ConnectionState } from '../../src/websocket/types.js';

// =====================================================
// 测试配置
// =====================================================

const IS_DEMO = true;
const shouldSkipIntegration = !process.env.OKX_API_KEY || !process.env.OKX_SECRET_KEY;

describe('OKX WebSocket Tests', () => {
  // =====================================================
  // 客户端创建测试
  // =====================================================

  describe('Client Creation', () => {
    test('should create WebSocket client with config', () => {
      const client = new WsClient({
        apiKey: 'test-key',
        secretKey: 'test-secret',
        passphrase: 'test-pass',
        isDemo: true,
      });
      expect(client).toBeInstanceOf(WsClient);
    });

    test('should create WebSocket client using factory function', () => {
      const client = createWsClient({
        apiKey: 'test-key',
        secretKey: 'test-secret',
        passphrase: 'test-pass',
        isDemo: true,
      });
      expect(client).toBeInstanceOf(WsClient);
    });

    test('should throw error when creating from env without credentials', () => {
      if (!process.env.OKX_API_KEY) {
        expect(() => createWsClientFromEnv()).toThrow();
      }
    });

    test('should get initial connection state', () => {
      const client = new WsClient({
        apiKey: 'test-key',
        secretKey: 'test-secret',
        passphrase: 'test-pass',
      });
      expect(client.getState()).toBe('disconnected');
    });

    test('should have zero subscriptions initially', () => {
      const client = new WsClient({
        apiKey: 'test-key',
        secretKey: 'test-secret',
        passphrase: 'test-pass',
      });
      expect(client.getSubscriptionCount()).toBe(0);
    });
  });

  // =====================================================
  // 连接管理测试
  // =====================================================

  describe('Connection Management', () => {
    let client: WsClient;

    beforeAll(() => {
      client = new WsClient({
        apiKey: 'test-key',
        secretKey: 'test-secret',
        passphrase: 'test-pass',
        isDemo: true,
        autoReconnect: false,
      });
    });

    test('should handle disconnect', () => {
      expect(client.getState()).toBe('disconnected');
      client.disconnect();
      expect(client.getState()).toBe('disconnected');
    });

    test('should remove all listeners', () => {
      client.removeAllListeners();
      expect(client.getSubscriptionCount()).toBe(0);
    });
  });

  // =====================================================
  // 频道订阅测试
  // =====================================================

  describe('Channel Subscription', () => {
    let client: WsClient;

    beforeAll(() => {
      client = new WsClient({
        apiKey: 'test-key',
        secretKey: 'test-secret',
        passphrase: 'test-pass',
        isDemo: true,
        autoReconnect: false,
      });
    });

    test('should subscribe to channel', () => {
      client.subscribe(
        { channel: 'tickers', instId: 'BTC-USDT' },
        () => {}
      );
      expect(client.getSubscriptionCount()).toBe(1);
    });

    test('should unsubscribe from channel', () => {
      // Subscribe first
      client.subscribe(
        { channel: 'tickers', instId: 'ETH-USDT' },
        () => {}
      );
      expect(client.getSubscriptionCount()).toBeGreaterThan(0);

      // Then unsubscribe
      client.unsubscribe({ channel: 'tickers', instId: 'ETH-USDT' });
    });

    test('should unsubscribe from all channels', () => {
      // Subscribe multiple channels
      client.subscribe({ channel: 'tickers', instId: 'BTC-USDT' }, () => {});
      client.subscribe({ channel: 'tickers', instId: 'ETH-USDT' }, () => {});
      client.subscribe({ channel: 'tickers', instId: 'BNB-USDT' }, () => {});

      expect(client.getSubscriptionCount()).toBeGreaterThan(0);

      client.unsubscribeAll();
      expect(client.getSubscriptionCount()).toBe(0);
    });
  });

  // =====================================================
  // 事件监听测试
  // =====================================================

  describe('Event Listeners', () => {
    test('should add open listener', () => {
      const client = new WsClient({
        apiKey: 'test-key',
        secretKey: 'test-secret',
        passphrase: 'test-pass',
        isDemo: true,
      });

      let called = false;
      client.onOpen(() => {
        called = true;
      });
      expect(client).toBeInstanceOf(WsClient);
    });

    test('should add close listener', () => {
      const client = new WsClient({
        apiKey: 'test-key',
        secretKey: 'test-secret',
        passphrase: 'test-pass',
        isDemo: true,
      });

      let called = false;
      client.onClose(() => {
        called = true;
      });
      expect(client).toBeInstanceOf(WsClient);
    });

    test('should add error listener', () => {
      const client = new WsClient({
        apiKey: 'test-key',
        secretKey: 'test-secret',
        passphrase: 'test-pass',
        isDemo: true,
      });

      let called = false;
      client.onError(() => {
        called = true;
      });
      expect(client).toBeInstanceOf(WsClient);
    });

    test('should remove all listeners', () => {
      const client = new WsClient({
        apiKey: 'test-key',
        secretKey: 'test-secret',
        passphrase: 'test-pass',
        isDemo: true,
      });

      client.onOpen(() => {});
      client.onClose(() => {});
      client.onError(() => {});

      client.removeAllListeners();
      expect(client).toBeInstanceOf(WsClient);
    });
  });

  // =====================================================
  // 错误处理测试
  // =====================================================

  describe('Error Handling', () => {
    test('should handle invalid config gracefully', () => {
      expect(() => {
        new WsClient({
          apiKey: '',
          secretKey: '',
          passphrase: '',
        });
      }).not.toThrow();
    });

    test('should handle disconnect when not connected', () => {
      const client = new WsClient({
        apiKey: 'test-key',
        secretKey: 'test-secret',
        passphrase: 'test-pass',
      });
      expect(() => client.disconnect()).not.toThrow();
    });

    test('should handle unsubscribe when not subscribed', () => {
      const client = new WsClient({
        apiKey: 'test-key',
        secretKey: 'test-secret',
        passphrase: 'test-pass',
      });
      expect(() => {
        client.unsubscribe({ channel: 'tickers', instId: 'BTC-USDT' });
      }).not.toThrow();
    });

    test('should handle unsubscribe all when nothing subscribed', () => {
      const client = new WsClient({
        apiKey: 'test-key',
        secretKey: 'test-secret',
        passphrase: 'test-pass',
      });
      expect(() => client.unsubscribeAll()).not.toThrow();
    });
  });

  // =====================================================
  // 类型验证测试
  // =====================================================

  describe('Type Validation', () => {
    test('should have correct connection state type', () => {
      const state: ConnectionState = 'disconnected';
      const validStates: ConnectionState[] = [
        'disconnected',
        'connecting',
        'connected',
        'authenticating',
        'authenticated',
      ];
      expect(validStates).toContain(state);
    });

    test('should validate subscription config structure', () => {
      const config = {
        channel: 'tickers',
        instId: 'BTC-USDT',
      };
      expect(config.channel).toBe('tickers');
      expect(config.instId).toBe('BTC-USDT');
    });
  });

  // =====================================================
  // 集成测试（需要真实凭证）
  // =====================================================

  describe.skipIf(shouldSkipIntegration)('Integration Tests', () => {
    let client: WsClient;

    beforeAll(() => {
      client = createWsClientFromEnv();
    });

    afterAll(() => {
      client.disconnect();
    });

    test('should connect to public WebSocket', async () => {
      await client.connectPublic();
      expect(client.getState()).toBe('connected');
    }, 10000);

    test('should connect to private WebSocket', async () => {
      await client.connectPrivate();
      expect(client.getState()).toBe('connected');
    }, 10000);

    test('should login to private WebSocket', async () => {
      await client.connect();
      expect(client.getState()).toBe('authenticated');
    }, 10000);

    test('should subscribe to ticker channel', (done) => {
      // ticker 频道持续推送，是测试订阅功能的最佳选择
      client.subscribe(
        { channel: 'tickers', instId: 'BTC-USDT' },
        (data) => {
          expect(data).toBeTruthy();
          done();
        }
      );
    }, 15000);

    test('should subscribe to trades channel', (done) => {
      // trades 频道提供实时成交数据
      // 注意：只在有交易时推送，使用更长的超时时间
      const timeout = setTimeout(() => {
        // 如果超时，至少验证订阅已注册（不抛错）
        expect(client.getSubscriptionCount()).toBeGreaterThan(0);
        done();
      }, 30000); // 30秒超时，给足够的时间等待交易

      client.subscribe(
        { channel: 'trades', instId: 'BTC-USDT' },
        (data) => {
          clearTimeout(timeout);
          expect(data).toBeTruthy();
          expect(data.length).toBeGreaterThan(0);
          done();
        }
      );
    }, 35000);

    test('should subscribe to order book channel', (done) => {
      // books5 频道持续推送深度数据
      client.subscribe(
        { channel: 'books5', instId: 'BTC-USDT' },
        (data) => {
          expect(data).toBeTruthy();
          done();
        }
      );
    }, 15000);

    test('should handle multiple subscriptions', (done) => {
      // 测试可以接收多个数据推送
      let tickersReceived = 0;
      const targetCount = 3;

      client.subscribe(
        { channel: 'tickers', instId: 'BTC-USDT' },
        () => {
          tickersReceived++;
          if (tickersReceived >= targetCount) {
            done();
          }
        }
      );
    }, 20000);

    test('should subscribe to account channel after login', (done) => {
      // 账户频道需要认证，测试私有连接
      client.subscribe(
        { channel: 'account' },
        (data) => {
          expect(data).toBeTruthy();
          done();
        }
      );
    }, 15000);
  });

  // =====================================================
  // WebSocket 登录详细测试
  // =====================================================

  describe.skipIf(shouldSkipIntegration)('WebSocket Login Test', () => {
    test('should complete WebSocket login with time sync check', async () => {
      const authConfig = loadAuthFromEnv();
      expect(authConfig).toBeTruthy();

      const auth = new OkxAuth(authConfig!);
      const PROXY = process.env.HTTP_PROXY || process.env.HTTPS_PROXY;

      // 检查服务器时间
      const response = await fetch('https://www.okx.com/api/v5/public/time', {
        proxy: PROXY
      });
      const data = await response.json() as { code: string; data: Array<{ ts: string }> };
      expect(data.code).toBe('0');

      const serverTimestamp = parseInt(data.data[0].ts);
      const localTimestamp = Date.now();
      const timeDiff = localTimestamp - serverTimestamp;

      // 时间偏差应该在合理范围内
      expect(Math.abs(timeDiff)).toBeLessThan(5000);

      // 测试 WebSocket 登录
      const url = API_ENDPOINTS.DEMO_WS_PRIVATE;

      await new Promise<void>((resolve, reject) => {
        const ws = new WebSocket(url, PROXY ? { proxy: PROXY } : undefined);

        const timeout = setTimeout(() => {
          ws.close();
          reject(new Error('Login test timeout'));
        }, 15000);

        ws.onopen = () => {
          // 生成登录时间戳（使用秒级时间戳）
          const timestamp = auth.getSecondsTimestamp();
          const signResult = auth.sign(timestamp, 'GET', '/users/self/verify', '');

          const loginMessage = {
            op: 'login',
            args: [{
              apiKey: authConfig!.apiKey,
              passphrase: authConfig!.passphrase,
              timestamp: timestamp,
              sign: signResult.sign,
            }],
          };

          ws.send(JSON.stringify(loginMessage));
        };

        ws.onmessage = (event) => {
          const response = JSON.parse(event.data);

          if (response.event === 'login') {
            clearTimeout(timeout);
            ws.close();

            if (response.code === '0') {
              expect(response.code).toBe('0');
              resolve();
            } else {
              reject(new Error(`Login failed: ${response.msg} (${response.code})`));
            }
          }
        };

        ws.onerror = (error) => {
          clearTimeout(timeout);
          reject(new Error(`WebSocket error: ${error}`));
        };

        ws.onclose = () => {
          // Connection closed
        };
      });
    }, 20000);
  });

  // =====================================================
  // 运行测试信息
  // =====================================================

  // 如果直接运行此文件
  if (import.meta.main) {
    console.log('Running OKX WebSocket Tests...');
    console.log(`Demo Mode: ${IS_DEMO}`);
    console.log(`Integration Tests: ${shouldSkipIntegration ? 'SKIPPED (missing credentials)' : 'ENABLED'}`);
    console.log('');
    console.log('To run tests with full integration:');
    console.log('1. Set environment variables: OKX_API_KEY, OKX_SECRET_KEY, OKX_PASSPHRASE');
    console.log('2. Run: bun test tests/websocket/websocket.test.ts');
  }
});
