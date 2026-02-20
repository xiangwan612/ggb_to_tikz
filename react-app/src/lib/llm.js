export function normalizeArkInputContent(messageContent) {
  if (Array.isArray(messageContent)) {
    return messageContent
      .map((part) => {
        if (!part || typeof part !== 'object') return null;
        if (part.type === 'text') {
          const text = String(part.text || '').trim();
          return text ? { type: 'input_text', text } : null;
        }
        if (part.type === 'image_url') {
          const url = typeof part.image_url === 'string' ? part.image_url : part.image_url?.url;
          return url ? { type: 'input_image', image_url: url } : null;
        }
        return null;
      })
      .filter(Boolean);
  }
  const text = String(messageContent || '').trim();
  return text ? [{ type: 'input_text', text }] : [];
}

export function buildCompletionRequests(providerKey, apiBase, model, messages, temperature = 0.3, maxTokens = 2000) {
  if (providerKey === 'doubao') {
    const safeMessages = Array.isArray(messages) ? messages : [];
    const instructions = safeMessages
      .filter((msg) => msg && msg.role === 'system')
      .map((msg) => (typeof msg.content === 'string' ? msg.content.trim() : ''))
      .filter(Boolean)
      .join('\n\n');

    const input = safeMessages
      .filter((msg) => msg && msg.role !== 'system')
      .map((msg) => ({
        role: msg.role === 'assistant' ? 'assistant' : 'user',
        content: normalizeArkInputContent(msg.content)
      }))
      .filter((msg) => Array.isArray(msg.content) && msg.content.length > 0);

    return [
      {
        label: 'responses',
        url: `${apiBase}/responses`,
        body: {
          model,
          input,
          temperature,
          max_output_tokens: maxTokens,
          ...(instructions ? { instructions } : {})
        }
      },
      {
        label: 'chat_completions_fallback',
        url: `${apiBase}/chat/completions`,
        body: {
          model,
          messages: safeMessages,
          temperature,
          max_tokens: maxTokens
        }
      }
    ];
  }

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

export function extractAssistantText(providerKey, data) {
  if (providerKey === 'doubao') {
    if (typeof data?.output_text === 'string' && data.output_text.trim()) {
      return data.output_text.trim();
    }
    if (Array.isArray(data?.output)) {
      const texts = [];
      data.output.forEach((item) => {
        if (!item) return;
        if (Array.isArray(item.content)) {
          item.content.forEach((part) => {
            const t = part?.text || part?.output_text || '';
            if (typeof t === 'string' && t.trim()) texts.push(t.trim());
          });
        } else if (typeof item.text === 'string' && item.text.trim()) {
          texts.push(item.text.trim());
        }
      });
      if (texts.length > 0) return texts.join('\n');
    }
  }

  const text = data?.choices?.[0]?.message?.content;
  if (typeof text === 'string' && text.trim()) {
    return text.trim();
  }
  throw new Error('未能从响应中解析出模型输出');
}

export async function requestWithFallback({ providerKey, apiBase, apiKey, model, messages }) {
  const requests = buildCompletionRequests(providerKey, apiBase, model, messages, 0.3, 2000);
  const errors = [];

  for (const req of requests) {
    const response = await fetch(req.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify(req.body)
    });

    const raw = await response.text();
    let data = {};
    try {
      data = raw ? JSON.parse(raw) : {};
    } catch {
      data = {};
    }

    if (!response.ok) {
      const msg = data?.error?.message || data?.message || raw || `HTTP ${response.status}`;
      errors.push(`${req.label}: ${msg}`);
      continue;
    }

    try {
      const content = extractAssistantText(providerKey, data);
      if (content) return { content, raw: data, via: req.label };
      errors.push(`${req.label}: 空响应`);
    } catch (e) {
      errors.push(`${req.label}: ${e.message}`);
    }
  }

  throw new Error(errors.join(' | ') || '模型无可用输出');
}
