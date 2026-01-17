---
description: Use Bun instead of Node.js, npm, pnpm, or vite.
globs: "*.ts, *.tsx, *.html, *.css, *.js, *.jsx, package.json"
alwaysApply: false
---

Default to using Bun instead of Node.js.

- Use `bun <file>` instead of `node <file>` or `ts-node <file>`
- Use `bun test` instead of `jest` or `vitest`
- Use `bun build <file.html|file.ts|file.css>` instead of `webpack` or `esbuild`
- Use `bun install` instead of `npm install` or `yarn install` or `pnpm install`
- Use `bun run <script>` instead of `npm run <script>` or `yarn run <script>` or `pnpm run <script>`
- Use `bunx <package> <command>` instead of `npx <package> <command>`
- Bun automatically loads .env, so don't use dotenv.

## APIs

- `Bun.serve()` supports WebSockets, HTTPS, and routes. Don't use `express`.
- `bun:sqlite` for SQLite. Don't use `better-sqlite3`.
- `Bun.redis` for Redis. Don't use `ioredis`.
- `Bun.sql` for Postgres. Don't use `pg` or `postgres.js`.
- `WebSocket` is built-in. Don't use `ws`.
- Prefer `Bun.file` over `node:fs`'s readFile/writeFile
- Bun.$`ls` instead of execa.

## Testing

Use `bun test` to run tests.

```ts#index.test.ts
import { test, expect } from "bun:test";

test("hello world", () => {
  expect(1).toBe(1);
});
```

## Frontend

Use HTML imports with `Bun.serve()`. Don't use `vite`. HTML imports fully support React, CSS, Tailwind.

Server:

```ts#index.ts
import index from "./index.html"

Bun.serve({
  routes: {
    "/": index,
    "/api/users/:id": {
      GET: (req) => {
        return new Response(JSON.stringify({ id: req.params.id }));
      },
    },
  },
  // optional websocket support
  websocket: {
    open: (ws) => {
      ws.send("Hello, world!");
    },
    message: (ws, message) => {
      ws.send(message);
    },
    close: (ws) => {
      // handle close
    }
  },
  development: {
    hmr: true,
    console: true,
  }
})
```

HTML files can import .tsx, .jsx or .js files directly and Bun's bundler will transpile & bundle automatically. `<link>` tags can point to stylesheets and Bun's CSS bundler will bundle.

```html#index.html
<html>
  <body>
    <h1>Hello, world!</h1>
    <script type="module" src="./frontend.tsx"></script>
  </body>
</html>
```

With the following `frontend.tsx`:

```tsx#frontend.tsx
import React from "react";
import { createRoot } from "react-dom/client";

// import .css files directly and it works
import './index.css';

const root = createRoot(document.body);

export default function Frontend() {
  return <h1>Hello, world!</h1>;
}

root.render(<Frontend />);
```

Then, run index.ts

```sh
bun --hot ./index.ts
```

For more information, read the Bun API docs in `node_modules/bun-types/docs/**.mdx`.

## Openai SDK

### 使用GLM模型访问输入及输出格式

#### 流式输出

```ts
import OpenAI from 'openai';

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: process.env.OPENAI_URL,
  timeout: 60000,
  maxRetries: 3,
});

const result_1 = await client.chat.completions.create({
  model: 'glm-4.7',
  messages: [
    {
      role: 'user',
      content: 'Hello, world!'
    }
  ],
  temperature: 1.0,
  max_tokens: 102400,
  stream: true
});

for await (const chunk of result_1) {
  // 先输出思考内容：{ index: 0, delta: { role: "assistant", reasoning_content: "..." } }
  // 后输出回答内容：{ index: 0, delta: { role: "assistant", content: "..." } }
  console.log(chunk.choices[0]);
}
```

### 非流式输出

```ts
const result_2 = await client.chat.completions.create({
  model: 'glm-4.7',
  messages: [
    {
      role: 'user',
      content: 'Hello, world!'
    }
  ],
  temperature: 1.0,
  max_tokens: 102400,
  stream: false
});

/**
 * {
 *    finish_reason: "stop",
 *    index: 0,
 *    message: {
 *      content: "回答内容",
 *      reasoning_content: "思考内容",
 *      role: "assistant"
 *    }
 * }
 */
console.log(result_2.choices[0]);
```


### 非流失输出且关闭思考

```ts
const result_3 = await client.chat.completions.create({
  model: 'glm-4.7',
  messages: [
    {
      role: 'user',
      content: 'Hello, world!'
    }
  ],
  thinking: {
    type: 'disabled'
  },
  temperature: 1.0,
  max_tokens: 102400,
  stream: false
});

/**
 * {
 *    finish_reason: "stop",
 *    index: 0,
 *    message: {
 *      content: "回答内容",
 *      role: "assistant"
 *    }
 * }
 */
console.log(result_3.choices[0]);
```