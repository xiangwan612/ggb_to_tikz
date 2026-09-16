import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { prisma } from './db.js';
import { decryptText, encryptText } from './crypto.js';
import { sendEmailLoginCode } from './emailSender.js';

const PASSWORD_MIN = 8;
const USERNAME_MIN = 3;
const USERNAME_MAX = 32;
const USERNAME_RE = /^[a-zA-Z0-9_]+$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;
const emailRequestTracker = new Map();

function buildToken(app, user) {
  return app.jwt.sign(
    { sub: user.id, username: user.username },
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
}

function sanitizeUser(user) {
  return {
    id: user.id,
    username: user.username,
    email: user.email || null,
    createdAt: user.createdAt
  };
}

function validateUsername(usernameRaw) {
  const username = String(usernameRaw || '').trim();
  if (username.length < USERNAME_MIN || username.length > USERNAME_MAX) {
    throw new Error(`用户名长度需在 ${USERNAME_MIN}-${USERNAME_MAX} 之间`);
  }
  if (!USERNAME_RE.test(username)) {
    throw new Error('用户名仅支持字母、数字和下划线');
  }
  return username;
}

function validatePassword(passwordRaw) {
  const password = String(passwordRaw || '');
  if (password.length < PASSWORD_MIN) {
    throw new Error(`密码至少 ${PASSWORD_MIN} 位`);
  }
  return password;
}

function normalizeEmail(emailRaw) {
  const email = String(emailRaw || '').trim().toLowerCase();
  if (!EMAIL_RE.test(email)) {
    throw new Error('邮箱格式不正确');
  }
  return email;
}

function nowMs() {
  return Date.now();
}

function getEmailCodeTtlSec() {
  return Math.max(60, Math.min(1800, Number(process.env.EMAIL_CODE_TTL_SEC || 300)));
}

function getEmailCodeIntervalSec() {
  return Math.max(10, Math.min(600, Number(process.env.EMAIL_CODE_MIN_INTERVAL_SEC || 60)));
}

function getEmailCodeHashSecret() {
  return String(process.env.EMAIL_CODE_HASH_SECRET || process.env.JWT_SECRET || 'dev-email-code-secret');
}

function hashEmailCode(email, code) {
  return crypto
    .createHash('sha256')
    .update(`${email}|${String(code || '').trim()}|${getEmailCodeHashSecret()}`)
    .digest('hex');
}

function randomCode6() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function checkRequestFrequency(email) {
  const minGap = getEmailCodeIntervalSec() * 1000;
  const last = Number(emailRequestTracker.get(email) || 0);
  const now = nowMs();
  if (last && now - last < minGap) {
    const waitSec = Math.ceil((minGap - (now - last)) / 1000);
    return { ok: false, waitSec };
  }
  emailRequestTracker.set(email, now);
  return { ok: true, waitSec: 0 };
}

function uniqueWxUsername(openidRaw) {
  const openid = String(openidRaw || '').trim();
  const tail = openid.slice(-10) || Date.now().toString(36);
  return `wx_${tail}`.replace(/[^a-zA-Z0-9_]/g, '');
}

async function ensureUsernameAvailable(username, ignoreUserId = '') {
  const exists = await prisma.user.findUnique({ where: { username } });
  if (!exists) return;
  if (ignoreUserId && exists.id === ignoreUserId) return;
  throw new Error('用户名已存在');
}

async function signInByUser(app, user) {
  return {
    user: sanitizeUser(user),
    accessToken: buildToken(app, user)
  };
}

async function ensureUserSettingsRow(tx, userId) {
  await tx.userSettings.upsert({
    where: { userId },
    create: {
      userId,
      settingsJson: '{}'
    },
    update: {}
  });
}

async function findOrCreateUserByEmailIdentity({ email, requestedUsername = '' }) {
  const existing = await prisma.user.findUnique({
    where: { email },
    include: { password: true }
  });
  if (existing) {
    await prisma.userSettings.upsert({
      where: { userId: existing.id },
      create: {
        userId: existing.id,
        settingsJson: '{}'
      },
      update: {}
    });
    return existing;
  }

  let username = requestedUsername ? validateUsername(requestedUsername) : '';
  if (username) {
    await ensureUsernameAvailable(username);
  } else {
    const local = String(email.split('@')[0] || 'user')
      .replace(/[^a-zA-Z0-9_]/g, '_')
      .slice(0, USERNAME_MAX) || 'user';
    username = local;
    let seq = 0;
    while (true) {
      const tryName = seq === 0 ? username : `${username}_${seq}`;
      const exists = await prisma.user.findUnique({ where: { username: tryName } });
      if (!exists) {
        username = tryName;
        break;
      }
      seq++;
    }
  }

  const created = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: { username, email }
    });
    await ensureUserSettingsRow(tx, user.id);
    return user;
  });

  return {
    ...created,
    password: null
  };
}

async function findOrCreateUserByWeChatIdentity({ openid, unionid = '', requestedUsername = '' }) {
  let identity = await prisma.userWechatIdentity.findUnique({
    where: { openid },
    include: { user: true }
  });
  if (identity) {
    if (unionid && unionid !== identity.unionid) {
      await prisma.userWechatIdentity.update({
        where: { openid },
        data: { unionid }
      });
      identity = await prisma.userWechatIdentity.findUnique({
        where: { openid },
        include: { user: true }
      });
    }
    return identity;
  }

  let username = requestedUsername || uniqueWxUsername(openid);
  if (!requestedUsername) {
    let seq = 0;
    while (true) {
      const tryName = seq === 0 ? username : `${username}_${seq}`;
      const exists = await prisma.user.findUnique({ where: { username: tryName } });
      if (!exists) {
        username = tryName;
        break;
      }
      seq++;
    }
  } else {
    username = validateUsername(username);
    await ensureUsernameAvailable(username);
  }

  const created = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: { username }
    });
    await tx.userWechatIdentity.create({
      data: {
        userId: user.id,
        openid,
        ...(unionid ? { unionid } : {})
      }
    });
    await ensureUserSettingsRow(tx, user.id);
    return user;
  });

  return {
    id: '',
    userId: created.id,
    openid,
    unionid: unionid || null,
    createdAt: created.createdAt,
    updatedAt: created.updatedAt,
    user: created
  };
}

function makeWeChatQrConnectUrl({ appId, redirectUri, state }) {
  const base = 'https://open.weixin.qq.com/connect/qrconnect';
  const params = new URLSearchParams({
    appid: appId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'snsapi_login',
    state
  });
  return `${base}?${params.toString()}#wechat_redirect`;
}

async function exchangeWeChatCodeForIdentity(code) {
  const appId = String(process.env.WECHAT_APP_ID || '').trim();
  const appSecret = String(process.env.WECHAT_APP_SECRET || '').trim();
  if (!appId || !appSecret) {
    throw new Error('微信登录未配置：缺少 WECHAT_APP_ID 或 WECHAT_APP_SECRET');
  }

  const params = new URLSearchParams({
    appid: appId,
    secret: appSecret,
    code,
    grant_type: 'authorization_code'
  });
  const url = `https://api.weixin.qq.com/sns/oauth2/access_token?${params.toString()}`;
  const response = await fetch(url);
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.errcode) {
    const msg = data?.errmsg || `HTTP ${response.status}`;
    throw new Error(`微信授权失败：${msg}`);
  }
  const openid = String(data?.openid || '').trim();
  const unionid = String(data?.unionid || '').trim();
  if (!openid) {
    throw new Error('微信授权失败：未返回 openid');
  }
  return { openid, unionid };
}

export async function registerAuthRoutes(app) {
  app.post('/api/auth/register', async (request, reply) => {
    const body = request.body || {};
    let username;
    let password;
    let email = '';
    try {
      username = validateUsername(body.username);
      password = validatePassword(body.password);
      email = String(body.email || '').trim().toLowerCase();
      await ensureUsernameAvailable(username);
    } catch (error) {
      return reply.code(400).send({
        code: 'REGISTER_INVALID_INPUT',
        message: error.message || '注册参数不合法'
      });
    }

    if (email) {
      const existsEmail = await prisma.user.findUnique({ where: { email } });
      if (existsEmail) {
        return reply.code(409).send({
          code: 'REGISTER_EMAIL_EXISTS',
          message: '邮箱已被使用'
        });
      }
    }

    const passwordHash = await bcrypt.hash(password, 10);
    try {
      const user = await prisma.$transaction(async (tx) => {
        const created = await tx.user.create({
          data: {
            username,
            ...(email ? { email } : {})
          }
        });
        await tx.userPassword.create({
          data: {
            userId: created.id,
            passwordHash
          }
        });
        await ensureUserSettingsRow(tx, created.id);
        return created;
      });
      return signInByUser(app, user);
    } catch (error) {
      request.log.error({ err: error }, 'register failed');
      return reply.code(500).send({
        code: 'REGISTER_FAILED',
        message: '注册失败，请稍后重试'
      });
    }
  });

  app.post('/api/auth/login', async (request, reply) => {
    const body = request.body || {};
    const login = String(body.login || body.username || '').trim();
    const password = String(body.password || '');
    if (!login || !password) {
      return reply.code(400).send({
        code: 'LOGIN_INVALID_INPUT',
        message: '请输入账号和密码'
      });
    }

    const user = await prisma.user.findFirst({
      where: {
        OR: [{ username: login }, { email: login.toLowerCase() }]
      },
      include: { password: true }
    });
    if (!user?.password?.passwordHash) {
      return reply.code(401).send({
        code: 'LOGIN_FAILED',
        message: '账号或密码错误'
      });
    }

    const ok = await bcrypt.compare(password, user.password.passwordHash);
    if (!ok) {
      return reply.code(401).send({
        code: 'LOGIN_FAILED',
        message: '账号或密码错误'
      });
    }

    return signInByUser(app, user);
  });

  app.post('/api/auth/email/request-code', async (request, reply) => {
    const body = request.body || {};
    let email = '';
    try {
      email = normalizeEmail(body.email);
    } catch (error) {
      return reply.code(400).send({
        code: 'EMAIL_INVALID',
        message: error.message || '邮箱格式不正确'
      });
    }

    const freq = checkRequestFrequency(email);
    if (!freq.ok) {
      return reply.code(429).send({
        code: 'EMAIL_CODE_TOO_FREQUENT',
        message: `请求过于频繁，请 ${freq.waitSec} 秒后重试`,
        waitSec: freq.waitSec
      });
    }

    const ttlSec = getEmailCodeTtlSec();
    const intervalSec = getEmailCodeIntervalSec();
    const code = randomCode6();
    const codeHash = hashEmailCode(email, code);
    const created = await prisma.emailLoginCode.create({
      data: {
        email,
        codeHash,
        purpose: 'login',
        expiresAt: new Date(nowMs() + ttlSec * 1000)
      }
    });

    const devMode = String(process.env.EMAIL_CODE_DEV_MODE || 'true').toLowerCase() === 'true';
    const allowPlain = String(process.env.EMAIL_CODE_ALLOW_PLAINTEXT_RESPONSE || 'false').toLowerCase() === 'true';
    let sendResult = { sent: false, reason: 'unknown' };
    try {
      sendResult = await sendEmailLoginCode({
        email,
        code,
        ttlSec,
        appName: String(process.env.APP_NAME || 'ggb_ai')
      });
    } catch (error) {
      sendResult = { sent: false, reason: error.message || 'send_failed' };
    }

    if (!sendResult.sent && !devMode) {
      emailRequestTracker.delete(email);
      try {
        await prisma.emailLoginCode.delete({ where: { id: created.id } });
      } catch {
      }
      request.log.error({
        email,
        reason: sendResult.reason || 'send_failed',
        rejected: sendResult.rejected || [],
        messageId: sendResult.messageId || ''
      }, 'email code send failed');
      return reply.code(500).send({
        code: 'EMAIL_SEND_FAILED',
        message: `验证码发送失败：${sendResult.reason || '请稍后重试'}`
      });
    }

    if (!sendResult.sent && devMode) {
      request.log.warn({ email, code }, 'email code generated in dev mode');
    }
    if (sendResult.sent) {
      request.log.info({
        email,
        messageId: sendResult.messageId || '',
        accepted: sendResult.accepted || [],
        rejected: sendResult.rejected || []
      }, 'email code sent');
    }

    const response = {
      ok: true,
      expiresInSec: ttlSec,
      nextRequestInSec: intervalSec,
      channel: sendResult.sent ? 'email' : 'debug'
    };
    if (!sendResult.sent && devMode && allowPlain) {
      response.debugCode = code;
    }
    return response;
  });

  app.post('/api/auth/email/login', async (request, reply) => {
    const body = request.body || {};
    let email = '';
    let code = '';
    let requestedUsername = '';
    try {
      email = normalizeEmail(body.email);
      code = String(body.code || '').trim();
      requestedUsername = String(body.username || '').trim();
      if (!/^\d{6}$/.test(code)) {
        throw new Error('验证码应为 6 位数字');
      }
    } catch (error) {
      return reply.code(400).send({
        code: 'EMAIL_LOGIN_INVALID_INPUT',
        message: error.message || '参数不合法'
      });
    }

    const candidateRows = await prisma.emailLoginCode.findMany({
      where: {
        email,
        purpose: 'login',
        usedAt: null,
        expiresAt: { gt: new Date() }
      },
      orderBy: { createdAt: 'desc' },
      take: 8
    });
    if (candidateRows.length === 0) {
      return reply.code(401).send({
        code: 'EMAIL_CODE_INVALID',
        message: '验证码无效或已过期'
      });
    }

    const codeHash = hashEmailCode(email, code);
    const matched = candidateRows.find((x) => x.codeHash === codeHash);
    if (!matched) {
      const top = candidateRows[0];
      await prisma.emailLoginCode.update({
        where: { id: top.id },
        data: { attempts: { increment: 1 } }
      });
      return reply.code(401).send({
        code: 'EMAIL_CODE_INVALID',
        message: '验证码无效或已过期'
      });
    }

    await prisma.emailLoginCode.update({
      where: { id: matched.id },
      data: { usedAt: new Date() }
    });

    let user;
    try {
      user = await findOrCreateUserByEmailIdentity({
        email,
        requestedUsername
      });
    } catch (error) {
      return reply.code(400).send({
        code: 'EMAIL_LOGIN_CREATE_USER_FAILED',
        message: error.message || '创建用户失败'
      });
    }

    const loadedUser = await prisma.user.findUnique({
      where: { id: user.id },
      include: { password: true }
    });
    if (!loadedUser) {
      return reply.code(500).send({
        code: 'EMAIL_LOGIN_FAILED',
        message: '登录失败，请稍后重试'
      });
    }

    const loginPayload = await signInByUser(app, loadedUser);
    return {
      ...loginPayload,
      authMethod: 'email_code',
      needSetPassword: !loadedUser.password?.passwordHash
    };
  });

  app.get('/api/me', { preValidation: [app.authenticate] }, async (request, reply) => {
    const userId = String(request.user?.sub || '');
    if (!userId) {
      return reply.code(401).send({
        code: 'UNAUTHORIZED',
        message: '登录态无效'
      });
    }
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return reply.code(401).send({
        code: 'UNAUTHORIZED',
        message: '用户不存在'
      });
    }
    return { user: sanitizeUser(user) };
  });

  app.put('/api/me/profile', { preValidation: [app.authenticate] }, async (request, reply) => {
    const userId = String(request.user?.sub || '');
    const body = request.body || {};
    let username;
    try {
      username = validateUsername(body.username);
      await ensureUsernameAvailable(username, userId);
    } catch (error) {
      return reply.code(400).send({
        code: 'PROFILE_INVALID_INPUT',
        message: error.message || '用户名不合法'
      });
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: { username }
    });
    return { user: sanitizeUser(updated) };
  });

  app.post('/api/auth/password/set', { preValidation: [app.authenticate] }, async (request, reply) => {
    const userId = String(request.user?.sub || '');
    const body = request.body || {};
    const currentPassword = String(body.currentPassword || '');
    let nextPassword = '';
    try {
      nextPassword = validatePassword(body.password);
    } catch (error) {
      return reply.code(400).send({
        code: 'PASSWORD_INVALID_INPUT',
        message: error.message || '密码不合法'
      });
    }

    const passwordRow = await prisma.userPassword.findUnique({ where: { userId } });
    if (passwordRow?.passwordHash) {
      if (!currentPassword) {
        return reply.code(400).send({
          code: 'PASSWORD_CURRENT_REQUIRED',
          message: '需要输入当前密码'
        });
      }
      const ok = await bcrypt.compare(currentPassword, passwordRow.passwordHash);
      if (!ok) {
        return reply.code(401).send({
          code: 'PASSWORD_CURRENT_INVALID',
          message: '当前密码错误'
        });
      }
    }

    const passwordHash = await bcrypt.hash(nextPassword, 10);
    await prisma.userPassword.upsert({
      where: { userId },
      update: { passwordHash },
      create: { userId, passwordHash }
    });
    return { ok: true };
  });

  app.get('/api/settings', { preValidation: [app.authenticate] }, async (request) => {
    const userId = String(request.user?.sub || '');
    const [settingRow, keyRows] = await Promise.all([
      prisma.userSettings.findUnique({ where: { userId } }),
      prisma.userApiKey.findMany({
        where: { userId },
        select: { providerKey: true, updatedAt: true }
      })
    ]);

    let settings = {};
    try {
      settings = JSON.parse(settingRow?.settingsJson || '{}');
    } catch {
      settings = {};
    }
    return {
      settings,
      storedApiKeys: keyRows.map((x) => ({
        providerKey: x.providerKey,
        updatedAt: x.updatedAt
      }))
    };
  });

  app.get('/api/settings/api-keys', { preValidation: [app.authenticate] }, async (request) => {
    const userId = String(request.user?.sub || '');
    const keyRows = await prisma.userApiKey.findMany({
      where: { userId },
      select: {
        providerKey: true,
        updatedAt: true
      }
    });

    return {
      apiKeys: keyRows.map((row) => ({
        providerKey: row.providerKey,
        updatedAt: row.updatedAt,
        hasApiKey: true
      }))
    };
  });

  app.put('/api/settings', { preValidation: [app.authenticate] }, async (request, reply) => {
    const userId = String(request.user?.sub || '');
    const body = request.body || {};
    const settings = body.settings;
    if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
      return reply.code(400).send({
        code: 'SETTINGS_INVALID_INPUT',
        message: 'settings 必须是对象'
      });
    }
    await prisma.userSettings.upsert({
      where: { userId },
      create: {
        userId,
        settingsJson: JSON.stringify(settings)
      },
      update: {
        settingsJson: JSON.stringify(settings)
      }
    });
    return { ok: true };
  });

  app.put('/api/settings/api-keys/:providerKey', { preValidation: [app.authenticate] }, async (request, reply) => {
    const userId = String(request.user?.sub || '');
    const providerKey = String(request.params?.providerKey || '').trim();
    const apiKey = String(request.body?.apiKey || '').trim();
    if (!providerKey) {
      return reply.code(400).send({
        code: 'API_KEY_PROVIDER_REQUIRED',
        message: 'providerKey 不能为空'
      });
    }
    if (!apiKey) {
      return reply.code(400).send({
        code: 'API_KEY_REQUIRED',
        message: 'apiKey 不能为空'
      });
    }

    let encryptedApiKey = '';
    try {
      encryptedApiKey = encryptText(apiKey);
    } catch (error) {
      return reply.code(500).send({
        code: 'API_KEY_ENCRYPT_FAILED',
        message: error.message || '密钥加密失败'
      });
    }

    await prisma.userApiKey.upsert({
      where: {
        userId_providerKey: { userId, providerKey }
      },
      create: {
        userId,
        providerKey,
        encryptedApiKey
      },
      update: {
        encryptedApiKey
      }
    });
    return { ok: true };
  });

  app.delete('/api/settings/api-keys/:providerKey', { preValidation: [app.authenticate] }, async (request, reply) => {
    const userId = String(request.user?.sub || '');
    const providerKey = String(request.params?.providerKey || '').trim();
    if (!providerKey) {
      return reply.code(400).send({
        code: 'API_KEY_PROVIDER_REQUIRED',
        message: 'providerKey 不能为空'
      });
    }
    await prisma.userApiKey.deleteMany({
      where: { userId, providerKey }
    });
    return { ok: true };
  });

  app.get('/api/settings/api-keys/:providerKey/test', { preValidation: [app.authenticate] }, async (request, reply) => {
    const userId = String(request.user?.sub || '');
    const providerKey = String(request.params?.providerKey || '').trim();
    const row = await prisma.userApiKey.findUnique({
      where: { userId_providerKey: { userId, providerKey } }
    });
    if (!row) {
      return reply.code(404).send({
        code: 'API_KEY_NOT_FOUND',
        message: '未找到该服务商密钥'
      });
    }
    try {
      const plain = decryptText(row.encryptedApiKey);
      return { ok: !!plain, length: plain.length };
    } catch {
      return reply.code(500).send({
        code: 'API_KEY_DECRYPT_FAILED',
        message: '密钥解密失败'
      });
    }
  });

  // 微信正式扫码登录将走 code -> openid 的官方流程，这里先提供开发联调入口。
  app.post('/api/auth/wechat/mock-login', async (request, reply) => {
    if ((process.env.WECHAT_MOCK_ENABLED || 'false').toLowerCase() !== 'true') {
      return reply.code(403).send({
        code: 'WECHAT_MOCK_DISABLED',
        message: '未开启微信 mock 登录'
      });
    }

    const body = request.body || {};
    const openid = String(body.openid || '').trim();
    const unionid = String(body.unionid || '').trim();
    const requestedUsername = String(body.username || '').trim();
    if (!openid) {
      return reply.code(400).send({
        code: 'WECHAT_OPENID_REQUIRED',
        message: 'openid 不能为空'
      });
    }

    let identity;
    try {
      identity = await findOrCreateUserByWeChatIdentity({
        openid,
        unionid,
        requestedUsername
      });
    } catch (error) {
      return reply.code(400).send({
        code: 'WECHAT_USERNAME_INVALID',
        message: error.message || '用户名不可用'
      });
    }

    const hasPassword = !!(await prisma.userPassword.findUnique({ where: { userId: identity.user.id } }));
    return {
      ...(await signInByUser(app, identity.user)),
      authMethod: 'wechat_mock',
      needSetPassword: !hasPassword
    };
  });

  app.get('/api/auth/wechat/login-url', async (request, reply) => {
    const appId = String(process.env.WECHAT_APP_ID || '').trim();
    const redirectUri = String(process.env.WECHAT_REDIRECT_URI || '').trim();
    if (!appId || !redirectUri) {
      return reply.code(500).send({
        code: 'WECHAT_NOT_CONFIGURED',
        message: '缺少 WECHAT_APP_ID 或 WECHAT_REDIRECT_URI'
      });
    }
    const stateRaw = String(request.query?.state || '').trim();
    const state = stateRaw || `st_${Date.now().toString(36)}`;
    return {
      loginUrl: makeWeChatQrConnectUrl({ appId, redirectUri, state }),
      state
    };
  });

  app.post('/api/auth/wechat/code-login', async (request, reply) => {
    const body = request.body || {};
    const code = String(body.code || '').trim();
    const requestedUsername = String(body.username || '').trim();
    if (!code) {
      return reply.code(400).send({
        code: 'WECHAT_CODE_REQUIRED',
        message: 'code 不能为空'
      });
    }

    let identityPayload;
    try {
      identityPayload = await exchangeWeChatCodeForIdentity(code);
    } catch (error) {
      return reply.code(400).send({
        code: 'WECHAT_CODE_EXCHANGE_FAILED',
        message: error.message || '微信授权失败'
      });
    }

    let identity;
    try {
      identity = await findOrCreateUserByWeChatIdentity({
        openid: identityPayload.openid,
        unionid: identityPayload.unionid,
        requestedUsername
      });
    } catch (error) {
      return reply.code(400).send({
        code: 'WECHAT_USERNAME_INVALID',
        message: error.message || '用户名不可用'
      });
    }

    const hasPassword = !!(await prisma.userPassword.findUnique({ where: { userId: identity.user.id } }));
    return {
      ...(await signInByUser(app, identity.user)),
      authMethod: 'wechat',
      needSetPassword: !hasPassword
    };
  });
}
