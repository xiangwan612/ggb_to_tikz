const STORAGE_CLIENT_ID = 'ggb_client_id';
const API_BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/+$/, '');

function makeApiUrl(path) {
  const p = String(path || '').startsWith('/') ? path : `/${path}`;
  return `${API_BASE}${p}`;
}

function getClientId() {
  try {
    const old = localStorage.getItem(STORAGE_CLIENT_ID);
    if (old) return old;
    const next = `web_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(STORAGE_CLIENT_ID, next);
    return next;
  } catch {
    return `web_${Date.now()}`;
  }
}

function buildHeaders(authToken = '') {
  const headers = {
    'Content-Type': 'application/json',
    'x-client-id': getClientId()
  };
  const token = String(authToken || '').trim();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

async function requestJson({ path, method = 'POST', payload, authToken = '' }) {
  const hasBody = payload !== undefined;
  const response = await fetch(makeApiUrl(path), {
    method,
    headers: buildHeaders(authToken),
    body: hasBody ? JSON.stringify(payload || {}) : undefined
  });
  const rawText = await response.text();
  let data = {};
  try {
    data = rawText ? JSON.parse(rawText) : {};
  } catch {
    data = {};
  }
  if (!response.ok) {
    const err = new Error(data?.message || rawText || `HTTP ${response.status}`);
    err.code = data?.code || 'API_ERROR';
    err.status = response.status;
    err.quota = data?.quota || null;
    err.waitSec = Number(data?.waitSec || 0);
    err.data = data;
    throw err;
  }
  return data;
}

export async function fetchModelsViaServer({ providerKey, apiBase, apiKey, modelsEndpoint, authToken }) {
  return requestJson({
    path: '/api/models',
    method: 'POST',
    authToken,
    payload: {
      providerKey,
      apiBase,
      userApiKey: apiKey || '',
      modelsEndpoint: modelsEndpoint || '/models'
    }
  });
}

export async function requestWithFallback({ providerKey, apiBase, apiKey, model, messages, authToken }) {
  const data = await requestJson({
    path: '/api/chat',
    method: 'POST',
    authToken,
    payload: {
      providerKey,
      apiBase,
      userApiKey: apiKey || '',
      model,
      messages
    }
  });
  return {
    content: data?.content || '',
    via: data?.via || 'proxy',
    source: data?.source || 'user',
    quota: data?.quota || null,
    raw: data
  };
}

function toAbortError() {
  const err = new Error('请求已停止');
  err.code = 'ABORT_ERR';
  err.name = 'AbortError';
  err.status = 499;
  return err;
}

function parseNdjsonLine(line, onEvent) {
  const text = String(line || '').trim();
  if (!text) return null;
  let event = null;
  try {
    event = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof onEvent === 'function') {
    onEvent(event);
  }
  return event;
}

export async function requestWithFallbackStream({
  providerKey,
  apiBase,
  apiKey,
  model,
  messages,
  authToken,
  signal,
  onEvent
}) {
  let response;
  try {
    response = await fetch(makeApiUrl('/api/chat/stream'), {
      method: 'POST',
      headers: buildHeaders(authToken),
      body: JSON.stringify({
        providerKey,
        apiBase,
        userApiKey: apiKey || '',
        model,
        messages
      }),
      signal
    });
  } catch (error) {
    if (error?.name === 'AbortError') throw toAbortError();
    throw error;
  }

  if (!response.ok) {
    if (response.status === 404) {
      return requestWithFallback({ providerKey, apiBase, apiKey, model, messages, authToken });
    }
    const rawText = await response.text();
    let data = {};
    try {
      data = rawText ? JSON.parse(rawText) : {};
    } catch {
      data = {};
    }
    const err = new Error(data?.message || rawText || `HTTP ${response.status}`);
    err.code = data?.code || 'API_ERROR';
    err.status = response.status;
    err.quota = data?.quota || null;
    err.waitSec = Number(data?.waitSec || 0);
    err.data = data;
    throw err;
  }

  const result = {
    content: '',
    via: 'proxy',
    source: 'user',
    quota: null,
    raw: null
  };

  const handleEvent = (event) => {
    if (!event) return null;
    if (event.type === 'meta') {
      if (event.via) result.via = String(event.via);
      if (event.source) result.source = String(event.source);
      if (event.quota) result.quota = event.quota;
      return null;
    }
    if (event.type === 'delta') {
      result.content += String(event.text || '');
      return null;
    }
    if (event.type === 'done') {
      result.content = String(event.content || result.content || '');
      result.via = String(event.via || result.via || 'proxy');
      result.source = String(event.source || result.source || 'user');
      result.quota = event.quota || result.quota || null;
      result.raw = event;
      return result;
    }
    if (event.type === 'error') {
      const err = new Error(event.message || '流式请求失败');
      err.code = event.code || 'UPSTREAM_CHAT_FAILED';
      err.status = 502;
      err.quota = event.quota || null;
      throw err;
    }
    return null;
  };

  const reader = response.body?.getReader();
  if (!reader) {
    const rawText = await response.text();
    const lines = rawText.split('\n');
    for (const line of lines) {
      const done = handleEvent(parseNdjsonLine(line, onEvent));
      if (done) return done;
    }
    if (!result.content.trim()) {
      const err = new Error('模型无可用输出');
      err.code = 'UPSTREAM_CHAT_FAILED';
      err.status = 502;
      throw err;
    }
    return result;
  }

  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    let chunk;
    try {
      chunk = await reader.read();
    } catch (error) {
      if (error?.name === 'AbortError' || signal?.aborted) throw toAbortError();
      throw error;
    }
    if (chunk.done) break;
    buffer += decoder.decode(chunk.value, { stream: true });

    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      const done = handleEvent(parseNdjsonLine(line, onEvent));
      if (done) return done;
    }
  }

  buffer += decoder.decode();
  if (buffer.trim()) {
    const done = handleEvent(parseNdjsonLine(buffer, onEvent));
    if (done) return done;
  }

  if (signal?.aborted) throw toAbortError();
  if (!result.content.trim()) {
    const err = new Error('模型无可用输出');
    err.code = 'UPSTREAM_CHAT_FAILED';
    err.status = 502;
    throw err;
  }
  return result;
}

export async function registerWithPassword({ username, password, email }) {
  return requestJson({
    path: '/api/auth/register',
    method: 'POST',
    payload: { username, password, email }
  });
}

export async function loginWithPassword({ login, password }) {
  return requestJson({
    path: '/api/auth/login',
    method: 'POST',
    payload: { login, password }
  });
}

export async function fetchCurrentUser({ authToken }) {
  return requestJson({
    path: '/api/me',
    method: 'GET',
    authToken
  });
}

export async function updateMyProfile({ authToken, username }) {
  return requestJson({
    path: '/api/me/profile',
    method: 'PUT',
    authToken,
    payload: { username }
  });
}

export async function setMyPassword({ authToken, password, currentPassword }) {
  return requestJson({
    path: '/api/auth/password/set',
    method: 'POST',
    authToken,
    payload: { password, currentPassword }
  });
}

export async function requestEmailLoginCode({ email }) {
  return requestJson({
    path: '/api/auth/email/request-code',
    method: 'POST',
    payload: { email }
  });
}

export async function loginWithEmailCode({ email, code, username }) {
  return requestJson({
    path: '/api/auth/email/login',
    method: 'POST',
    payload: { email, code, username }
  });
}

export async function getCloudSettings({ authToken }) {
  return requestJson({
    path: '/api/settings',
    method: 'GET',
    authToken
  });
}

export async function getCloudProviderKeys({ authToken }) {
  return requestJson({
    path: '/api/settings/api-keys',
    method: 'GET',
    authToken
  });
}

export async function saveCloudSettings({ authToken, settings }) {
  return requestJson({
    path: '/api/settings',
    method: 'PUT',
    authToken,
    payload: { settings }
  });
}

export async function saveCloudProviderKey({ authToken, providerKey, apiKey }) {
  return requestJson({
    path: `/api/settings/api-keys/${encodeURIComponent(providerKey)}`,
    method: 'PUT',
    authToken,
    payload: { apiKey }
  });
}

export async function deleteCloudProviderKey({ authToken, providerKey }) {
  return requestJson({
    path: `/api/settings/api-keys/${encodeURIComponent(providerKey)}`,
    method: 'DELETE',
    authToken
  });
}

export async function requestRawApi({ path, method = 'GET', payload, authToken = '' }) {
  return requestJson({ path, method, payload, authToken });
}
