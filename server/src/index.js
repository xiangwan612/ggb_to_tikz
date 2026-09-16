import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import {
  buildCompletionRequests,
  buildStreamingBody,
  extractAssistantDelta,
  extractAssistantText,
  fetchJsonWithAuth,
  isStreamDoneChunk
} from './llmProxy.js';
import { consumePlatformQuota } from './quota.js';
import { joinBaseAndPath, resolveApiKey, resolveProviderRequest } from './providers.js';
import { registerAuthRoutes } from './authRoutes.js';
import { prisma } from './db.js';
import { decryptText } from './crypto.js';
import { registerTikzPreviewRoute } from './tikzPreview.js';

const app = Fastify({
  logger: true
});

function parseCorsOrigin() {
  const raw = String(process.env.CORS_ORIGIN || '*').trim();
  if (!raw || raw === '*') return true;
  const allowList = raw
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);

  return (origin, cb) => {
    if (!origin || allowList.includes(origin)) {
      cb(null, true);
      return;
    }
    cb(new Error(`CORS blocked: ${origin}`), false);
  };
}

function toClientId(request) {
  const headerId = request.headers['x-client-id'];
  if (typeof headerId === 'string' && headerId.trim()) return headerId.trim();
  if (Array.isArray(headerId) && headerId[0]) return String(headerId[0]).trim();
  return request.ip || 'anonymous';
}

function extractUpstreamError(data, raw, statusCode) {
  return data?.error?.message || data?.message || raw || `HTTP ${statusCode}`;
}

function parseTemperature(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0.3;
  return Math.max(0, Math.min(2, num));
}

function parseMaxTokens(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 2000;
  return Math.max(1, Math.min(8000, Math.floor(num)));
}

function isAbortError(error) {
  if (!error) return false;
  if (error.name === 'AbortError') return true;
  return /aborted|abort/i.test(String(error.message || ''));
}

function writeNdjson(raw, payload) {
  if (!raw || raw.destroyed || raw.writableEnded) return;
  raw.write(`${JSON.stringify(payload)}\n`);
}

function readBearerToken(request) {
  const auth = request.headers.authorization;
  if (!auth || typeof auth !== 'string') return '';
  const m = auth.match(/^Bearer\s+(.+)$/i);
  return m ? String(m[1] || '').trim() : '';
}

async function getStoredUserApiKeyFromAuth(request, providerKey) {
  const token = readBearerToken(request);
  if (!token) return '';
  try {
    const payload = await app.jwt.verify(token);
    const userId = String(payload?.sub || '').trim();
    if (!userId) return '';
    const row = await prisma.userApiKey.findUnique({
      where: { userId_providerKey: { userId, providerKey } }
    });
    if (!row?.encryptedApiKey) return '';
    return decryptText(row.encryptedApiKey);
  } catch {
    return '';
  }
}

await app.register(cors, {
  origin: parseCorsOrigin(),
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'x-client-id', 'Authorization']
});

await app.register(jwt, {
  secret: String(process.env.JWT_SECRET || 'dev-jwt-secret-change-me')
});

app.decorate('authenticate', async (request, reply) => {
  try {
    await request.jwtVerify();
  } catch {
    return reply.code(401).send({
      code: 'UNAUTHORIZED',
      message: '请先登录'
    });
  }
});

await registerAuthRoutes(app);
await registerTikzPreviewRoute(app);

app.get('/api/health', async () => {
  return {
    status: 'ok',
    service: 'ggb-ai-server',
    timestamp: new Date().toISOString()
  };
});

app.post('/api/models', async (request, reply) => {
  const body = request.body || {};
  let provider;
  let auth;
  let url;
  try {
    provider = resolveProviderRequest({
      providerKey: body.providerKey,
      apiBase: body.apiBase,
      modelsEndpoint: body.modelsEndpoint
    });
    const bodyApiKey = String(body.userApiKey || '').trim();
    const storedApiKey = bodyApiKey ? '' : await getStoredUserApiKeyFromAuth(request, provider.providerKey);
    auth = resolveApiKey({
      providerKey: provider.providerKey,
      userApiKey: bodyApiKey || storedApiKey
    });
    url = joinBaseAndPath(provider.baseUrl, provider.modelsEndpoint);
  } catch (error) {
    return reply.code(400).send({
      message: error.message || '请求参数无效',
      code: 'INVALID_MODELS_REQUEST'
    });
  }

  try {
    const { response, raw, data } = await fetchJsonWithAuth({
      url,
      apiKey: auth.apiKey,
      method: 'GET',
      timeoutMs: Number(process.env.UPSTREAM_TIMEOUT_MS || 45000)
    });

    if (!response.ok) {
      return reply.code(502).send({
        message: `模型接口请求失败：${extractUpstreamError(data, raw, response.status)}`,
        code: 'UPSTREAM_MODELS_FAILED'
      });
    }

    return {
      source: auth.source,
      providerKey: provider.providerKey,
      upstream: data
    };
  } catch (error) {
    return reply.code(502).send({
      message: `模型接口请求失败：${error.message || '网络错误'}`,
      code: 'UPSTREAM_MODELS_FAILED'
    });
  }
});

app.post('/api/chat/stream', async (request, reply) => {
  const body = request.body || {};
  let provider;
  let auth;
  let model = '';
  let messages = [];
  let quota = null;
  try {
    provider = resolveProviderRequest({
      providerKey: body.providerKey,
      apiBase: body.apiBase
    });

    model = String(body.model || '').trim();
    if (!model) {
      return reply.code(400).send({
        message: 'model 不能为空',
        code: 'INVALID_MODEL'
      });
    }

    messages = Array.isArray(body.messages) ? body.messages : [];
    if (messages.length === 0) {
      return reply.code(400).send({
        message: 'messages 不能为空',
        code: 'INVALID_MESSAGES'
      });
    }

    auth = resolveApiKey({
      providerKey: provider.providerKey,
      userApiKey: String(body.userApiKey || '').trim() || await getStoredUserApiKeyFromAuth(request, provider.providerKey)
    });

    if (auth.source === 'platform') {
      quota = consumePlatformQuota(toClientId(request));
      if (quota.enabled && quota.blocked) {
        return reply.code(429).send({
          message: `平台额度已用完：每天最多 ${quota.limit} 次`,
          code: 'PLATFORM_QUOTA_EXCEEDED',
          quota
        });
      }
    }
  } catch (error) {
    return reply.code(400).send({
      message: error.message || '请求参数无效',
      code: 'INVALID_CHAT_REQUEST'
    });
  }

  const reqList = buildCompletionRequests(
    provider.providerKey,
    provider.baseUrl,
    model,
    messages,
    parseTemperature(body.temperature),
    parseMaxTokens(body.maxTokens)
  );

  const timeoutMs = Math.max(5000, Number(process.env.UPSTREAM_TIMEOUT_MS || 45000));
  const errors = [];
  let responseHijacked = false;

  for (let i = 0; i < reqList.length; i += 1) {
    const reqItem = reqList[i];
    const controller = new AbortController();
    const onClientClose = () => controller.abort();
    request.raw.on('close', onClientClose);
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const upstream = await fetch(reqItem.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${auth.apiKey}`
        },
        body: JSON.stringify(buildStreamingBody(provider.providerKey, reqItem.label, reqItem.body)),
        signal: controller.signal
      });

      if (!upstream.ok) {
        const raw = await upstream.text();
        let data = {};
        try {
          data = raw ? JSON.parse(raw) : {};
        } catch {
          data = {};
        }
        errors.push(`${reqItem.label}: ${extractUpstreamError(data, raw, upstream.status)}`);
        continue;
      }

      if (!responseHijacked) {
        reply.hijack();
        reply.raw.writeHead(200, {
          'Content-Type': 'application/x-ndjson; charset=utf-8',
          'Cache-Control': 'no-cache, no-transform',
          Connection: 'keep-alive',
          'X-Accel-Buffering': 'no'
        });
        responseHijacked = true;
        writeNdjson(reply.raw, {
          type: 'meta',
          phase: 'connected',
          via: reqItem.label,
          source: auth.source,
          providerKey: provider.providerKey,
          quota
        });
      } else {
        writeNdjson(reply.raw, {
          type: 'phase',
          phase: 'fallback',
          message: '当前通道无输出，切换备用通道',
          via: reqItem.label
        });
      }

      const contentType = String(upstream.headers.get('content-type') || '').toLowerCase();
      let fullContent = '';
      let sawDelta = false;

      if (contentType.includes('text/event-stream')) {
        const reader = upstream.body?.getReader();
        const decoder = new TextDecoder();
        if (!reader) {
          errors.push(`${reqItem.label}: 流式响应不可读`);
          continue;
        }

        let buffer = '';
        let dataLines = [];
        let streamFinished = false;

        const flushDataBlock = () => {
          if (dataLines.length === 0 || streamFinished) return;
          const payload = dataLines.join('\n').trim();
          dataLines = [];
          if (!payload) return;
          if (payload === '[DONE]') {
            streamFinished = true;
            return;
          }

          let parsed = null;
          try {
            parsed = JSON.parse(payload);
          } catch {
            parsed = null;
          }

          if (parsed) {
            const delta = extractAssistantDelta(provider.providerKey, parsed);
            if (delta) {
              if (!sawDelta) {
                sawDelta = true;
                writeNdjson(reply.raw, {
                  type: 'phase',
                  phase: 'generating',
                  via: reqItem.label
                });
              }
              fullContent += delta;
              writeNdjson(reply.raw, { type: 'delta', text: delta });
            }
            if (isStreamDoneChunk(payload, parsed)) {
              streamFinished = true;
            }
            return;
          }

          if (!sawDelta) {
            sawDelta = true;
            writeNdjson(reply.raw, {
              type: 'phase',
              phase: 'generating',
              via: reqItem.label
            });
          }
          fullContent += payload;
          writeNdjson(reply.raw, { type: 'delta', text: payload });
        };

        while (!streamFinished) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const rawLine of lines) {
            const line = rawLine.replace(/\r$/, '');
            if (!line) {
              flushDataBlock();
              if (streamFinished) break;
              continue;
            }
            if (line.startsWith(':')) continue;
            if (line.startsWith('event:')) continue;
            if (line.startsWith('data:')) {
              dataLines.push(line.slice(5).trimStart());
            } else {
              dataLines.push(line.trim());
            }
          }
        }

        buffer += decoder.decode();
        if (buffer.trim()) {
          dataLines.push(buffer.trim());
        }
        flushDataBlock();
      } else {
        const raw = await upstream.text();
        let data = {};
        try {
          data = raw ? JSON.parse(raw) : {};
        } catch {
          data = {};
        }
        fullContent = extractAssistantText(provider.providerKey, data);
        if (fullContent) {
          sawDelta = true;
          writeNdjson(reply.raw, {
            type: 'phase',
            phase: 'generating',
            via: reqItem.label
          });
          writeNdjson(reply.raw, { type: 'delta', text: fullContent });
        }
      }

      if (sawDelta && fullContent.trim()) {
        writeNdjson(reply.raw, {
          type: 'done',
          content: fullContent,
          via: reqItem.label,
          source: auth.source,
          providerKey: provider.providerKey,
          quota
        });
        reply.raw.end();
        return;
      }

      errors.push(`${reqItem.label}: 空响应`);
    } catch (error) {
      if (isAbortError(error) && request.raw.destroyed) {
        return;
      }
      errors.push(`${reqItem.label}: ${error.message || '网络错误'}`);
    } finally {
      clearTimeout(timer);
      request.raw.off('close', onClientClose);
    }
  }

  const message = errors.join(' | ') || '模型无可用输出';
  if (responseHijacked) {
    writeNdjson(reply.raw, {
      type: 'error',
      message,
      code: 'UPSTREAM_CHAT_FAILED',
      quota
    });
    reply.raw.end();
    return;
  }

  return reply.code(502).send({
    message,
    code: 'UPSTREAM_CHAT_FAILED',
    quota
  });
});

app.post('/api/chat', async (request, reply) => {
  const body = request.body || {};
  let provider;
  let auth;
  let model = '';
  let messages = [];
  let quota = null;
  try {
    provider = resolveProviderRequest({
      providerKey: body.providerKey,
      apiBase: body.apiBase
    });

    model = String(body.model || '').trim();
    if (!model) {
      return reply.code(400).send({
        message: 'model 不能为空',
        code: 'INVALID_MODEL'
      });
    }

    messages = Array.isArray(body.messages) ? body.messages : [];
    if (messages.length === 0) {
      return reply.code(400).send({
        message: 'messages 不能为空',
        code: 'INVALID_MESSAGES'
      });
    }

    auth = resolveApiKey({
      providerKey: provider.providerKey,
      userApiKey: String(body.userApiKey || '').trim() || await getStoredUserApiKeyFromAuth(request, provider.providerKey)
    });

    if (auth.source === 'platform') {
      quota = consumePlatformQuota(toClientId(request));
      if (quota.enabled && quota.blocked) {
        return reply.code(429).send({
          message: `平台额度已用完：每天最多 ${quota.limit} 次`,
          code: 'PLATFORM_QUOTA_EXCEEDED',
          quota
        });
      }
    }

  } catch (error) {
    return reply.code(400).send({
      message: error.message || '请求参数无效',
      code: 'INVALID_CHAT_REQUEST'
    });
  }

  const reqList = buildCompletionRequests(
    provider.providerKey,
    provider.baseUrl,
    model,
    messages,
    parseTemperature(body.temperature),
    parseMaxTokens(body.maxTokens)
  );
  const errors = [];

  for (const req of reqList) {
    try {
      const { response, raw, data } = await fetchJsonWithAuth({
        url: req.url,
        apiKey: auth.apiKey,
        method: 'POST',
        body: req.body,
        timeoutMs: Number(process.env.UPSTREAM_TIMEOUT_MS || 45000)
      });

      if (!response.ok) {
        errors.push(`${req.label}: ${extractUpstreamError(data, raw, response.status)}`);
        continue;
      }

      try {
        const content = extractAssistantText(provider.providerKey, data);
        if (content) {
          return {
            content,
            via: req.label,
            source: auth.source,
            providerKey: provider.providerKey,
            quota
          };
        }
        errors.push(`${req.label}: 空响应`);
      } catch (error) {
        errors.push(`${req.label}: ${error.message}`);
      }
    } catch (error) {
      errors.push(`${req.label}: ${error.message || '网络错误'}`);
    }
  }

  return reply.code(502).send({
    message: errors.join(' | ') || '模型无可用输出',
    code: 'UPSTREAM_CHAT_FAILED',
    quota
  });
});

const port = Number(process.env.PORT) || 8787;
const host = process.env.HOST || '0.0.0.0';

const start = async () => {
  try {
    await app.listen({ port, host });
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
};

const shutdown = async (signal) => {
  app.log.info({ signal }, 'Shutting down server');
  try {
    await prisma.$disconnect();
    await app.close();
    process.exit(0);
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

start();
