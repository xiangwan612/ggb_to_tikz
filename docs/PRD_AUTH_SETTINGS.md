# PRD: 用户注册登录与云端设置同步

- 版本: v0.1
- 日期: 2026-02-22
- 状态: Draft
- 负责人: ggb_ai

## 1. 背景

当前系统已具备前端作图与后端模型代理能力，但用户数据仍主要保存在浏览器本地（localStorage），存在以下问题：

1. 换设备后设置丢失。
2. 无法按账号管理模型配置、提示词、偏好。
3. 平台额度与用户身份无法绑定，后续风控困难。

为支持持续使用与多设备体验，需要引入账号体系，并将关键设置迁移到服务端存储。

## 2. 目标

1. 支持邮箱/密码注册与登录。
2. 登录后可自动加载并保存用户设置。
3. 支持保存 API Key（按服务商分组）及相关配置。
4. 为后续“按用户限流、配额、账单”打基础。

## 3. 非目标（本期不做）

1. 第三方登录（Google/GitHub）。
2. 团队协作与多角色权限。
3. 账单支付系统。
4. 企业级 KMS 集成（先预留接口）。

## 4. 用户故事

1. 作为新用户，我希望能注册账号并登录，这样我的设置不会丢。
2. 作为老用户，我希望换电脑登录后自动恢复模型、提示词和画板偏好。
3. 作为 BYOK 用户，我希望保存自己的 API Key，下次不用重复输入。
4. 作为平台管理员，我希望根据用户身份进行调用限制和审计。

## 5. 方案范围

### 5.1 本期功能范围（MVP）

1. 用户注册、登录、退出登录。
2. JWT 会话（短期 Access Token）。
3. 用户设置读写 API。
4. API Key 安全存储（服务端加密后入库）。
5. 前端“登录态 + 设置同步”流程。

### 5.2 需要同步的设置字段

1. providerKey、model。
2. provider 自定义配置（不含明文 key）。
3. promptConfigs、activePromptId。
4. UI 与作图偏好（showAxes/showGrid/tikz 设置等）。
5. providerKeys（按服务商保存，服务端加密存储）。

## 6. 关键产品决策

1. 未登录用户: 继续可使用本地模式（localStorage）。
2. 已登录用户: 默认启用云端设置同步。
3. API Key 保存策略: 用户可选择“仅本地保存”或“同步到云端”。
4. 云端保存的 API Key 只用于当前用户请求，不可跨用户复用。

## 7. 安全与合规要求

1. 密码必须哈希存储（Argon2 或 bcrypt，禁止明文）。
2. API Key 入库前加密（AES-GCM；密钥来自服务端环境变量）。
3. 日志中禁止打印明文 API Key、密码、Token。
4. 登录接口要有基础防爆破策略（IP/账号限速）。
5. 全部鉴权接口仅允许 HTTPS。
6. 用户可在设置中删除云端已保存的 API Key。

## 8. 后端需求

### 8.1 建议技术栈

1. 现有 Fastify 保持不变。
2. 数据库: PostgreSQL（推荐）。
3. ORM: Prisma（推荐）或 Drizzle。

### 8.2 数据模型（MVP）

1. `users`
   - `id` (uuid)
   - `email` (unique)
   - `password_hash`
   - `created_at`, `updated_at`
2. `user_settings`
   - `id` (uuid)
   - `user_id` (unique, fk users.id)
   - `settings_json` (jsonb)
   - `created_at`, `updated_at`
3. `user_api_keys`
   - `id` (uuid)
   - `user_id` (fk users.id)
   - `provider_key`
   - `encrypted_api_key`
   - `created_at`, `updated_at`
   - unique(`user_id`, `provider_key`)

### 8.3 API 设计（MVP）

1. `POST /api/auth/register`
   - body: `email`, `password`
   - resp: `user`, `accessToken`
2. `POST /api/auth/login`
   - body: `email`, `password`
   - resp: `user`, `accessToken`
3. `POST /api/auth/logout`（可选，前端删 token 即可）
4. `GET /api/me`
   - resp: 当前用户信息
5. `GET /api/settings`
   - resp: 用户设置 + 已保存 key 的 provider 列表（不回传明文）
6. `PUT /api/settings`
   - body: `settings_json`
7. `PUT /api/settings/api-keys/:providerKey`
   - body: `apiKey`（服务端加密）
8. `DELETE /api/settings/api-keys/:providerKey`

## 9. 前端需求

1. 新增登录/注册弹窗或独立页面。
2. 登录成功后缓存 token（建议内存 + refresh 方案；MVP 可先 localStorage）。
3. 进入应用后：
   - 已登录: 拉取云端设置并覆盖本地状态。
   - 未登录: 继续使用本地设置。
4. 设置页增加“云端同步状态”和“API Key 存储位置”开关。
5. `requestWithFallback` 请求中附带登录 token（若已登录）。

## 10. 迁移策略

1. 首次登录时，提示“是否将本地设置迁移到云端”。
2. 用户确认后上传本地设置，写入 `user_settings`。
3. API Key 默认不自动上传，需要用户显式确认。

## 11. 指标与验收

### 11.1 核心指标

1. 登录成功率 >= 99%（非密码错误场景）。
2. 设置同步成功率 >= 99%。
3. API Key 读写成功率 >= 99%。

### 11.2 验收标准（MVP）

1. 用户可完成注册、登录、退出。
2. A 设备修改设置后，B 设备登录可看到同步结果。
3. 云端可保存并删除指定 provider 的 API Key。
4. 服务端日志不出现明文密码/API Key。
5. 未登录模式不受影响（原流程仍可用）。

## 12. 里程碑

1. M1（后端鉴权基础）
   - users 表 + register/login/me + JWT 鉴权中间件
2. M2（设置云端化）
   - user_settings 接口 + 前端设置同步
3. M3（API Key 安全存储）
   - user_api_keys + 加解密 + 设置页管理
4. M4（稳定性与安全）
   - 限流、审计日志、错误码规范、回归测试

## 13. 风险与待确认

1. 是否允许“一个账号多端同时在线”。
2. Token 过期策略（仅 Access Token 还是 Access + Refresh）。
3. API Key 是否允许用于平台代调用（默认仅当前用户）。
4. 数据删除策略（用户注销后是否立即物理删除）。

