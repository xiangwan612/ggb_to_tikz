# ggb_ai Server

## Run

```bash
cd server
npm install
cp .env.example .env
npm run prisma:generate
npm run prisma:push
npm run dev
```

If `prisma:push` fails in your local env, use:

```bash
npm run db:init
```

Required env keys:
- `JWT_SECRET`
- `API_KEY_ENCRYPTION_SECRET`

Optional email code login keys:
- `EMAIL_CODE_TTL_SEC`
- `EMAIL_CODE_MIN_INTERVAL_SEC`
- `EMAIL_CODE_DEV_MODE`
- `EMAIL_CODE_ALLOW_PLAINTEXT_RESPONSE`
- `EMAIL_CODE_HASH_SECRET`
- `SMTP_HOST` / `SMTP_PORT` / `SMTP_SECURE` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM`

If SMTP is not configured and `EMAIL_CODE_DEV_MODE=true`, backend will still generate codes.
When `EMAIL_CODE_ALLOW_PLAINTEXT_RESPONSE=true`, the request-code API response includes `debugCode` for local testing.

## Health Check

```bash
curl http://localhost:8787/api/health
```

## APIs

- `POST /api/auth/register`
  - Body: `username`, `password`, `email`(optional)
- `POST /api/auth/login`
  - Body: `login`(username/email), `password`
- `POST /api/auth/email/request-code`
  - Body: `email`
- `POST /api/auth/email/login`
  - Body: `email`, `code`, `username`(optional, 首次创建账号可用)
- `GET /api/me` (Bearer Token)
- `PUT /api/me/profile` (Bearer Token)
  - Body: `username`
- `POST /api/auth/password/set` (Bearer Token)
  - Body: `password`, `currentPassword`(已有密码时必填)
- `GET /api/settings` (Bearer Token)
- `PUT /api/settings` (Bearer Token)
  - Body: `{ "settings": { ... } }`
- `PUT /api/settings/api-keys/:providerKey` (Bearer Token)
  - Body: `{ "apiKey": "..." }`（服务端加密后入库）
- `DELETE /api/settings/api-keys/:providerKey` (Bearer Token)
- `POST /api/models`
  - Body: `providerKey`, `apiBase`(optional), `userApiKey`(optional), `modelsEndpoint`(optional)
  - 规则：优先 `userApiKey`；否则尝试“登录用户云端保存 key”；再否则尝试平台 key

- `POST /api/chat`
  - Body: `providerKey`, `model`, `messages`, `apiBase`(optional), `userApiKey`(optional)
  - 规则：优先 `userApiKey`（BYOK）；否则尝试“登录用户云端保存 key”；再否则平台 key
  - 平台 key 会按 `PLATFORM_DAILY_LIMIT` 限制次数（按 `x-client-id` + 日期）
