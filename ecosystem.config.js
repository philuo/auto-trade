/**
 * PM2 配置文件
 *
 * 使用方法:
 *   pm2 start ecosystem.config.js
 *   pm2 stop okx-trading
 *   pm2 restart okx-trading
 *   pm2 delete okx-trading
 *   pm2 logs okx-trading
 *   pm2 monit
 */

module.exports = {
  apps: [{
    name: 'okx-trading',

    // 脚本路径
    script: './index.ts',

    // 使用ts-node或bun运行
    interpreter: 'bun',

    // 实例数量（1为单实例）
    instances: 1,

    // 执行模式（fork模式）
    exec_mode: 'fork',

    // 自动重启
    watch: false,
    autorestart: true,

    // 最大内存限制（超过后重启）
    max_memory_restart: '500M',

    // 环境变量
    env: {
      NODE_ENV: 'production',
    },

    // 开发环境
    env_development: {
      NODE_ENV: 'development',
      NO_PM2: '1',  // 开发模式不使用PM2的daemon模式
    },

    // 日志配置
    error_file: './logs/pm2-error.log',
    out_file: './logs/pm2-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',

    // 合并日志
    combine_logs: true,

    // 时间戳
    time: true,

    // 日志轮转
    log_file_size: '10M',
    log_file_count: 5,

    // 进程管理
    min_uptime: '10s',      // 最小运行时间，小于此时间退出视为异常启动
    max_restarts: 10,       // 最大重启次数
    restart_delay: 4000,    // 重启延迟（毫秒）

    // 优雅关闭
    kill_timeout: 5000,     // 强制关闭等待时间
    wait_ready: true,       // 等待应用就绪
    listen_timeout: 10000,  // 监听超时

    // 其他配置
    pmx: true,              // 启用PM2监控
    automation: false,      // 禁用PM2 Plus自动监控
    treekill: true,         // 杀死所有子进程
  }],
};
