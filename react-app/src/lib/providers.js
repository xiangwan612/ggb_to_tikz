const STORAGE_CUSTOM_PROVIDERS = 'ggb_custom_providers';

export const API_PROVIDERS = {
  deepseek: {
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    modelsEndpoint: '/models',
    defaultModels: [
      { id: 'deepseek-chat', name: 'deepseek-chat' },
      { id: 'deepseek-reasoner', name: 'deepseek-reasoner' }
    ]
  }
};

function safeParseCustomProviders() {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_CUSTOM_PROVIDERS) || '{}');
    if (!data || typeof data !== 'object') return {};
    return data;
  } catch {
    return {};
  }
}

function normalizeProviderPayload(payload = {}) {
  const name = String(payload.name || '').trim();
  const baseUrl = String(payload.baseUrl || '').trim();
  const modelsEndpoint = String(payload.modelsEndpoint || '').trim();
  const skipModelFetch = !!payload.skipModelFetch;
  const defaultModels = Array.isArray(payload.defaultModels) ? payload.defaultModels : [];
  return { name, baseUrl, modelsEndpoint, skipModelFetch, defaultModels };
}

export function getProviderMap() {
  if (typeof window === 'undefined') return { ...API_PROVIDERS };
  return {
    ...API_PROVIDERS,
    ...safeParseCustomProviders()
  };
}

export function getProviderKeyList() {
  return Object.keys(getProviderMap());
}

export function getProvider(providerKey) {
  const map = getProviderMap();
  return map[providerKey] || API_PROVIDERS.deepseek;
}

export function isCustomProvider(providerKey) {
  return !Object.prototype.hasOwnProperty.call(API_PROVIDERS, providerKey);
}

export function upsertCustomProvider(providerKey, payload) {
  const key = String(providerKey || '').trim();
  if (!key) throw new Error('服务商标识不能为空');
  if (Object.prototype.hasOwnProperty.call(API_PROVIDERS, key)) {
    throw new Error('不能覆盖内置服务商');
  }
  if (typeof window === 'undefined') return;
  const current = safeParseCustomProviders();
  current[key] = normalizeProviderPayload(payload);
  localStorage.setItem(STORAGE_CUSTOM_PROVIDERS, JSON.stringify(current));
}

export function removeCustomProvider(providerKey) {
  const key = String(providerKey || '').trim();
  if (!key) return;
  if (Object.prototype.hasOwnProperty.call(API_PROVIDERS, key)) return;
  if (typeof window === 'undefined') return;
  const current = safeParseCustomProviders();
  delete current[key];
  localStorage.setItem(STORAGE_CUSTOM_PROVIDERS, JSON.stringify(current));
}
