const BUILTIN_PROVIDERS = {
  deepseek: {
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    modelsEndpoint: '/models',
    platformEnvKey: 'PLATFORM_DEEPSEEK_API_KEY'
  }
};

function normalizeBaseUrl(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  let url;
  try {
    url = new URL(text);
  } catch {
    throw new Error('API Base URL 无效');
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('API Base URL 仅支持 http/https');
  }
  return url.toString().replace(/\/+$/, '');
}

function normalizeEndpoint(value, fallback = '/models') {
  const text = String(value || '').trim() || fallback;
  if (/^https?:\/\//i.test(text)) return text;
  return text.startsWith('/') ? text : `/${text}`;
}

function joinBaseAndPath(baseUrl, path) {
  if (/^https?:\/\//i.test(path)) return path;
  const left = String(baseUrl || '').replace(/\/+$/, '');
  const right = String(path || '').replace(/^\/+/, '');
  return `${left}/${right}`;
}

function getBuiltinProvider(providerKey) {
  return BUILTIN_PROVIDERS[String(providerKey || '').trim()] || null;
}

export function getPlatformApiKey(providerKey) {
  const builtin = getBuiltinProvider(providerKey);
  if (!builtin || !builtin.platformEnvKey) return '';
  return String(process.env[builtin.platformEnvKey] || '').trim();
}

export function resolveProviderRequest({ providerKey, apiBase, modelsEndpoint }) {
  const key = String(providerKey || '').trim();
  if (!key) {
    throw new Error('providerKey 不能为空');
  }

  const builtin = getBuiltinProvider(key);
  const baseFromBuiltin = builtin?.baseUrl || '';
  const normalizedBase = normalizeBaseUrl(apiBase || baseFromBuiltin);
  if (!normalizedBase) {
    throw new Error(`服务商 ${key} 缺少 apiBase`);
  }

  return {
    providerKey: key,
    builtin: !!builtin,
    baseUrl: normalizedBase,
    modelsEndpoint: normalizeEndpoint(modelsEndpoint, builtin?.modelsEndpoint || '/models')
  };
}

export function resolveApiKey({ providerKey, userApiKey }) {
  const byokKey = String(userApiKey || '').trim();
  if (byokKey) {
    return { source: 'user', apiKey: byokKey };
  }

  const platformKey = getPlatformApiKey(providerKey);
  if (platformKey) {
    return { source: 'platform', apiKey: platformKey };
  }

  throw new Error('缺少可用密钥：请填写 API Key，或联系管理员开通平台额度');
}

export { BUILTIN_PROVIDERS, joinBaseAndPath };
