export function buildCompletionRequests(providerKey, apiBase, model, messages, temperature = 0.3, maxTokens = 2000) {
  return [
    {
      label: 'chat_completions',
      url: `${apiBase}/chat/completions`,
      body: {
        model,
        messages,
        temperature,
        max_tokens: maxTokens
      }
    }
  ];
}

function readTextFromContent(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .map((part) => {
      if (typeof part === 'string') return part;
      if (!part || typeof part !== 'object') return '';
      if (typeof part.text === 'string') return part.text;
      if (typeof part.output_text === 'string') return part.output_text;
      if (typeof part.delta === 'string') return part.delta;
      if (typeof part.value === 'string') return part.value;
      return '';
    })
    .join('');
}

function readTextCandidate(value) {
  if (!value || typeof value !== 'object') return '';
  if (typeof value.text === 'string') return value.text;
  if (typeof value.output_text === 'string') return value.output_text;
  if (typeof value.delta === 'string') return value.delta;
  if (typeof value.value === 'string') return value.value;
  const contentText = readTextFromContent(value.content);
  if (contentText) return contentText;
  return '';
}

export function buildStreamingBody(providerKey, requestLabel, body = {}) {
  return {
    ...(body || {}),
    stream: true
  };
}

export function extractAssistantDelta(providerKey, data) {
  if (!data || typeof data !== 'object') return '';

  const type = String(data.type || '').toLowerCase();
  if (type.includes('output_text.delta') && typeof data.delta === 'string') {
    return data.delta;
  }

  if (Array.isArray(data.choices)) {
    const text = data.choices
      .map((choice) => {
        if (!choice || typeof choice !== 'object') return '';
        if (typeof choice.text === 'string') return choice.text;
        const fromDelta = readTextCandidate(choice.delta);
        if (fromDelta) return fromDelta;
        return readTextCandidate(choice.message);
      })
      .join('');
    if (text) return text;
  }

  if (typeof data.delta === 'string' && data.delta) {
    return data.delta;
  }

  if (type.includes('delta')) {
    const text = readTextCandidate(data);
    if (text) return text;
  }

  return '';
}

export function isStreamDoneChunk(rawLine, data) {
  const line = String(rawLine || '').trim();
  if (!line) return false;
  if (line === '[DONE]') return true;

  if (!data || typeof data !== 'object') return false;
  if (data.done === true) return true;
  const type = String(data.type || '').toLowerCase();
  if (type === 'done' || type.endsWith('.done') || type.endsWith('.completed')) return true;

  if (Array.isArray(data.choices)) {
    return data.choices.some((choice) => {
      if (!choice || typeof choice !== 'object') return false;
      const finishReason = choice.finish_reason;
      return finishReason !== null && finishReason !== undefined;
    });
  }

  return false;
}

export function extractAssistantText(providerKey, data) {
  const choice = data?.choices?.[0];
  const fromMessage = readTextCandidate(choice?.message);
  if (typeof fromMessage === 'string' && fromMessage.trim()) {
    return fromMessage.trim();
  }

  const fromChoiceText = choice?.text;
  if (typeof fromChoiceText === 'string' && fromChoiceText.trim()) {
    return fromChoiceText.trim();
  }

  const fromChoiceDelta = readTextCandidate(choice?.delta);
  if (typeof fromChoiceDelta === 'string' && fromChoiceDelta.trim()) {
    return fromChoiceDelta.trim();
  }

  const fromTopLevel = readTextCandidate(data);
  if (typeof fromTopLevel === 'string' && fromTopLevel.trim()) {
    return fromTopLevel.trim();
  }

  throw new Error('未能从响应中解析出模型输出');
}

export async function fetchJsonWithAuth({ url, apiKey, method = 'GET', body, timeoutMs = 45000 }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(5000, Number(timeoutMs) || 45000));
  try {
    const response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal
    });
    const raw = await response.text();
    let data = {};
    try {
      data = raw ? JSON.parse(raw) : {};
    } catch {
      data = {};
    }
    return { response, raw, data };
  } finally {
    clearTimeout(timer);
  }
}
