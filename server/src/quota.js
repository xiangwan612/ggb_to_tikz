const DAILY_PLATFORM_LIMIT = Math.max(0, Number(process.env.PLATFORM_DAILY_LIMIT || 30));
const usageMap = new Map();

function getDateKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function sanitizeClientId(raw) {
  const value = String(raw || '').trim();
  if (!value) return 'anonymous';
  return value.slice(0, 120);
}

function makeUsageKey(dateKey, clientId) {
  return `${dateKey}::${clientId}`;
}

function cleanupOldUsage(todayKey) {
  for (const key of usageMap.keys()) {
    if (!key.startsWith(`${todayKey}::`)) {
      usageMap.delete(key);
    }
  }
}

export function consumePlatformQuota(clientIdRaw) {
  const clientId = sanitizeClientId(clientIdRaw);
  const dateKey = getDateKey();

  if (DAILY_PLATFORM_LIMIT <= 0) {
    return {
      date: dateKey,
      clientId,
      limit: 0,
      used: 0,
      remaining: 0,
      enabled: false
    };
  }

  cleanupOldUsage(dateKey);

  const usageKey = makeUsageKey(dateKey, clientId);
  const used = usageMap.get(usageKey) || 0;
  if (used >= DAILY_PLATFORM_LIMIT) {
    return {
      date: dateKey,
      clientId,
      limit: DAILY_PLATFORM_LIMIT,
      used,
      remaining: 0,
      enabled: true,
      blocked: true
    };
  }

  const next = used + 1;
  usageMap.set(usageKey, next);
  return {
    date: dateKey,
    clientId,
    limit: DAILY_PLATFORM_LIMIT,
    used: next,
    remaining: Math.max(0, DAILY_PLATFORM_LIMIT - next),
    enabled: true,
    blocked: false
  };
}
