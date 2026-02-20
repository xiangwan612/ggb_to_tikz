import { useEffect, useMemo, useRef, useState } from 'react';
import {
  getProviderMap,
  removeCustomProvider,
  upsertCustomProvider,
  isCustomProvider
} from '../lib/providers';
import { requestWithFallback } from '../lib/llm';
import { searchGGBCompletions } from '../lib/ggbCompletions';

const BASE_URL = import.meta.env.BASE_URL || '/';
const withBase = (path) => `${BASE_URL}${String(path || '').replace(/^\/+/, '')}`;
const STORAGE_PROVIDER = 'ggb_api_provider';
const STORAGE_MODEL = 'ggb_api_model';
const STORAGE_KEYS = 'ggb_provider_keys';
const STORAGE_CONTEXT_MEMORY = 'ggb_context_memory';
const STORAGE_MAX_HISTORY = 'ggb_max_history';
const STORAGE_SHOW_AXES = 'ggb_show_axes';
const STORAGE_SHOW_GRID = 'ggb_show_grid';
const STORAGE_STRICT_WHITELIST = 'ggb_strict_whitelist';
const STORAGE_UI_FONT = 'ggb_ui_font';
const STORAGE_UI_FONT_SIZE = 'ggb_ui_font_size';
const STORAGE_EXPORT_IMAGE_MODE = 'ggb_export_image_mode';
const STORAGE_EXPORT_SCALE = 'ggb_export_scale';
const STORAGE_TIKZ_SCALE = 'ggb_tikz_scale';
const STORAGE_TIKZ_LINE_EXTEND = 'ggb_tikz_line_extend';
const STORAGE_TIKZ_POINT_RADIUS = 'ggb_tikz_point_radius';
const STORAGE_TIKZ_POLYGON_FILL = 'ggb_tikz_polygon_fill';
const STORAGE_TIKZ_AXIS_THICKNESS = 'ggb_tikz_axis_thickness';
const STORAGE_TIKZ_CONIC_THICKNESS = 'ggb_tikz_conic_thickness';
const STORAGE_TIKZ_LINE_THICKNESS = 'ggb_tikz_line_thickness';
const STORAGE_TIKZ_SEGMENT_THICKNESS = 'ggb_tikz_segment_thickness';
const STORAGE_TIKZ_POLYGON_THICKNESS = 'ggb_tikz_polygon_thickness';
const STORAGE_PROMPT_CONFIGS = 'ggb_prompt_configs';
const STORAGE_ACTIVE_PROMPT = 'ggb_active_prompt';
const STORAGE_BYOK_CHECKLIST = 'ggb_byok_checklist_v1';
const DEFAULT_PROMPT_PATH = withBase('prompts/default-prompt.txt');
const DEFAULT_PROMPT_FALLBACK = '你是 GeoGebra 指令生成器。只输出每行一条可执行命令，不要解释。\n画布对象：\n{{CURRENT_OBJECTS}}\n用户输入：\n{{USER_INPUT}}';
const BUILTIN_PROVIDER_ORDER = ['openai', 'deepseek', 'siliconflow', 'doubao', 'qwen', 'kimi'];
const BUILTIN_PROVIDER_ICONS = {
  openai: '🌐',
  deepseek: '🟣',
  siliconflow: '⚡',
  doubao: '🟢',
  qwen: '✨',
  kimi: '🌙'
};

const TIKZ_THICKNESS_OPTIONS = ['thin', 'semithick', 'thick', 'very thick', 'ultra thick'];
const BYOK_CHECK_ITEMS = [
  { id: 'no_hardcoded_key', text: '代码与示例中没有真实 API Key' },
  { id: 'no_default_key', text: '页面默认不预填平台密钥' },
  { id: 'local_only', text: '密钥仅存本地浏览器，不上传服务器' },
  { id: 'auth_header_only', text: '密钥仅走 Authorization Header，不写 URL 参数' },
  { id: 'logs_masked', text: '日志与报错不输出完整密钥' },
  { id: 'test_connection', text: '已验证“测试连接”可用' },
  { id: 'clear_key', text: '已提供并验证“清除本地密钥”可用' },
  { id: 'no_public_secret', text: '部署平台环境变量中无前端可见主密钥' },
  { id: 'publish_notice', text: '发布页已声明 BYOK 模式与责任边界' },
  { id: 'incognito_regression', text: '已用无痕窗口完成上线前回归' }
];

const GGB_ALLOWED_COMMANDS = new Set([
  'Point', 'Intersect', 'Segment', 'Line', 'Ray', 'Vector',
  'Polygon', 'RegularPolygon', 'RigidPolygon', 'VectorPolygon',
  'Circle', 'Incircle', 'Ellipse', 'Hyperbola', 'Parabola',
  'Tangent', 'OrthogonalLine', 'PerpendicularLine', 'PerpendicularBisector', 'AngularBisector',
  'Semicircle', 'CircleArc', 'CircleSector', 'CircumcircleArc', 'CircumcircleSector',
  'Midpoint', 'Center'
]);

const GGB_ALLOWED_MATH_FUNCS = new Set([
  'sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'sqrt', 'abs',
  'ln', 'log', 'exp', 'floor', 'ceil', 'round', 'min', 'max',
  'sinh', 'cosh', 'tanh', 'sec', 'csc', 'cot'
]);

const GGB_RESERVED_BUILTINS = new Set(['xAxis', 'yAxis']);

function getSavedKeysMap() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS) || '{}');
  } catch {
    return {};
  }
}

function buildSystemPrompt(template, userInput) {
  const currentObjects = '（画布为空）';
  return template
    .replace(/\{\{CURRENT_OBJECTS\}\}/g, currentObjects)
    .replace(/\{\{COMMAND_HISTORY\}\}/g, currentObjects)
    .replace(/\{\{USER_INPUT\}\}/g, userInput || '');
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('读取图片失败'));
    reader.readAsDataURL(file);
  });
}

function parseCommandLines(rawText) {
  return (rawText || '')
    .replace(/```[\w]*\n?/g, '')
    .replace(/```/g, '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('//') && !line.startsWith('#') && !line.startsWith('--'));
}

function extractPrimaryCallName(cmdLine) {
  const line = String(cmdLine || '').trim();
  if (!line) return null;
  let expr = line;
  const eqIdx = line.indexOf('=');
  if (eqIdx >= 0) expr = line.slice(eqIdx + 1).trim();
  if (!expr) return null;
  const m = expr.match(/^([A-Za-z][A-Za-z0-9_]*)\s*\(/);
  return m ? m[1] : null;
}

function normalizePrimaryCommandAlias(line) {
  const raw = String(line || '');
  const replaced = raw.replace(
    /^(\s*(?:[A-Za-z][A-Za-z0-9_]*\s*=\s*)?)AngleBisector(\s*\()/,
    '$1AngularBisector$2'
  );
  return replaced;
}

function normalizeCommandAliases(lines) {
  return (lines || []).map((line) => normalizePrimaryCommandAlias(line));
}

function validateCommandsAgainstWhitelist(lines) {
  const invalid = [];
  (lines || []).forEach((line, idx) => {
    const normalizedLine = normalizePrimaryCommandAlias(line);
    const eqIdx = line.indexOf('=');
    if (eqIdx > 0) {
      const lhs = line.slice(0, eqIdx).trim();
      if (GGB_RESERVED_BUILTINS.has(lhs)) {
        invalid.push({ lineNo: idx + 1, line, name: lhs, reason: 'reserved_builtin' });
        return;
      }
    }

    const name = extractPrimaryCallName(normalizedLine);
    if (!name) return;
    if (GGB_ALLOWED_COMMANDS.has(name)) return;
    if (GGB_ALLOWED_MATH_FUNCS.has(name.toLowerCase())) return;
    invalid.push({ lineNo: idx + 1, line, name });
  });
  return invalid;
}

function formatInvalidPreview(invalid) {
  return invalid.slice(0, 3).map((x) => {
    if (x.reason === 'reserved_builtin') {
      return `第${x.lineNo}行: ${x.name}（内置对象不可重定义）`;
    }
    return `第${x.lineNo}行: ${x.name}`;
  }).join('；');
}

function getLegacyWindow() {
  const iframe = document.querySelector('.legacy-frame');
  if (!iframe || !iframe.contentWindow) return null;
  return iframe.contentWindow;
}

function setLegacyCommandInput(legacyWin, text) {
  const doc = legacyWin?.document;
  if (!doc) return false;
  const el = doc.getElementById('command-input');
  if (!el) return false;
  el.value = text || '';
  return true;
}

function getLegacyCommandInput(legacyWin) {
  const doc = legacyWin?.document;
  if (!doc) return '';
  const el = doc.getElementById('command-input');
  return el ? (el.value || '') : '';
}

function extractCommandsFromXML(xmlString) {
  try {
    const doc = new DOMParser().parseFromString(xmlString, 'text/xml');
    const construction = doc.querySelector('construction');
    if (!construction) return [];

    const lines = [];
    construction.querySelectorAll('command').forEach((cmd) => {
      const name = cmd.getAttribute('name');
      const input = cmd.querySelector('input');
      if (!name || !input) return;

      const args = [];
      for (let i = 0; ; i++) {
        const v = input.getAttribute(`a${i}`);
        if (v === null) break;
        args.push(v);
      }
      if (args.length > 0) {
        lines.push(`${name}(${args.join(', ')})`);
      }
    });
    return lines;
  } catch {
    return [];
  }
}

function loadPromptConfigs() {
  try {
    const arr = JSON.parse(localStorage.getItem(STORAGE_PROMPT_CONFIGS) || '[]');
    if (Array.isArray(arr) && arr.length > 0) {
      return arr.filter((x) => x && x.id && x.name).map((x) => ({
        id: String(x.id),
        name: String(x.name),
        content: String(x.content || ''),
        builtin: !!x.builtin
      }));
    }
  } catch {
    // ignore parse error
  }
  return [];
}

function loadByokChecklist() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_BYOK_CHECKLIST) || '{}');
    if (!raw || typeof raw !== 'object') return {};
    return raw;
  } catch {
    return {};
  }
}

function ensurePromptConfigs(customConfigs, defaultContent) {
  const list = Array.isArray(customConfigs) ? customConfigs : [];
  const customOnly = list
    .filter((x) => x && x.id && x.id !== 'default' && !x.builtin)
    .map((x) => ({
      id: String(x.id),
      name: String(x.name || '未命名提示词'),
      content: String(x.content || ''),
      builtin: false
    }));
  return [
    {
      id: 'default',
      name: '默认提示词',
      content: String(defaultContent || DEFAULT_PROMPT_FALLBACK),
      builtin: true
    },
    ...customOnly
  ];
}

function normalizeModelItemsFromResponse(data) {
  const rawList = Array.isArray(data?.data)
    ? data.data
    : Array.isArray(data?.models)
      ? data.models
      : Array.isArray(data?.result?.models)
        ? data.result.models
        : Array.isArray(data)
          ? data
          : [];

  const items = rawList
    .map((item) => {
      if (typeof item === 'string') return { id: item, name: item };
      const id = item?.id || item?.model || item?.name || '';
      if (!id) return null;
      return { id: String(id), name: String(id) };
    })
    .filter(Boolean);

  const seen = new Set();
  return items.filter((m) => {
    if (seen.has(m.id)) return false;
    seen.add(m.id);
    return true;
  });
}

function classifyModelGroup(modelId) {
  const id = String(modelId || '').trim();
  const lower = id.toLowerCase();
  if (!id) return '其他';
  if (id.includes('/')) return id.split('/')[0] || '其他';
  if (lower.startsWith('doubao')) return 'Doubao';
  if (lower.startsWith('deepseek')) return 'DeepSeek';
  if (lower.startsWith('qwen')) return 'Qwen';
  if (lower.startsWith('moonshot') || lower.startsWith('kimi')) return 'Kimi';
  if (lower.startsWith('gpt') || lower.startsWith('o1') || lower.startsWith('o3') || lower.startsWith('o4')) return 'OpenAI';
  if (lower.includes('claude')) return 'Claude';
  return id.split('-')[0] || '其他';
}

export default function CommandPanel({ ggbApi, ggbReady, onOpenLegacy }) {
  const [providerMap, setProviderMap] = useState(() => getProviderMap());
  const providerKeys = useMemo(() => Object.keys(providerMap), [providerMap]);
  const providerEntries = useMemo(() => {
    const builtins = BUILTIN_PROVIDER_ORDER
      .filter((key) => providerMap[key])
      .map((key) => ({
        key,
        name: providerMap[key].name || key,
        icon: BUILTIN_PROVIDER_ICONS[key] || '🌐',
        custom: false
      }));
    const customs = providerKeys
      .filter((key) => isCustomProvider(key))
      .sort((a, b) => String(providerMap[a]?.name || a).localeCompare(String(providerMap[b]?.name || b), 'zh-CN'))
      .map((key) => ({
        key,
        name: providerMap[key]?.name || key,
        icon: '⚙️',
        custom: true
      }));
    return [...builtins, ...customs];
  }, [providerKeys, providerMap]);
  const [providerKey, setProviderKey] = useState(() => localStorage.getItem(STORAGE_PROVIDER) || 'openai');
  const provider = useMemo(() => providerMap[providerKey] || providerMap.openai, [providerKey, providerMap]);

  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState(() => localStorage.getItem(STORAGE_MODEL) || '');
  const [models, setModels] = useState([]);
  const groupedModels = useMemo(() => {
    const groups = new Map();
    (models || []).forEach((m) => {
      const id = m?.id || m?.value || '';
      if (!id) return;
      const g = classifyModelGroup(id);
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g).push(m);
    });
    return Array.from(groups.entries())
      .map(([name, list]) => ({ name, list }))
      .sort((a, b) => b.list.length - a.list.length || a.name.localeCompare(b.name, 'zh-CN'));
  }, [models]);

  const [contextMemory, setContextMemory] = useState(() => (localStorage.getItem(STORAGE_CONTEXT_MEMORY) || 'on') === 'on');
  const [maxHistory, setMaxHistory] = useState(() => Number(localStorage.getItem(STORAGE_MAX_HISTORY) || 10));
  const [showAxes, setShowAxes] = useState(() => (localStorage.getItem(STORAGE_SHOW_AXES) || 'on') === 'on');
  const [showGrid, setShowGrid] = useState(() => (localStorage.getItem(STORAGE_SHOW_GRID) || 'off') === 'on');
  const [strictWhitelist, setStrictWhitelist] = useState(() => (localStorage.getItem(STORAGE_STRICT_WHITELIST) || 'off') === 'on');
  const [uiFont, setUiFont] = useState(() => localStorage.getItem(STORAGE_UI_FONT) || 'Arial');
  const [uiFontSize, setUiFontSize] = useState(() => Number(localStorage.getItem(STORAGE_UI_FONT_SIZE) || 14));
  const [imageExportMode, setImageExportMode] = useState(() => localStorage.getItem(STORAGE_EXPORT_IMAGE_MODE) || 'file');
  const [exportScale, setExportScale] = useState(() => Number(localStorage.getItem(STORAGE_EXPORT_SCALE) || 2));
  const [tikzScale, setTikzScale] = useState(() => Number(localStorage.getItem(STORAGE_TIKZ_SCALE) || 1.2));
  const [tikzLineExtend, setTikzLineExtend] = useState(() => Number(localStorage.getItem(STORAGE_TIKZ_LINE_EXTEND) || 0.25));
  const [tikzPointRadius, setTikzPointRadius] = useState(() => Number(localStorage.getItem(STORAGE_TIKZ_POINT_RADIUS) || 0.25));
  const [tikzPolygonFill, setTikzPolygonFill] = useState(() => localStorage.getItem(STORAGE_TIKZ_POLYGON_FILL) || 'black');
  const [tikzAxisThickness, setTikzAxisThickness] = useState(() => localStorage.getItem(STORAGE_TIKZ_AXIS_THICKNESS) || 'semithick');
  const [tikzConicThickness, setTikzConicThickness] = useState(() => localStorage.getItem(STORAGE_TIKZ_CONIC_THICKNESS) || 'thick');
  const [tikzLineThickness, setTikzLineThickness] = useState(() => localStorage.getItem(STORAGE_TIKZ_LINE_THICKNESS) || 'semithick');
  const [tikzSegmentThickness, setTikzSegmentThickness] = useState(() => localStorage.getItem(STORAGE_TIKZ_SEGMENT_THICKNESS) || 'thick');
  const [tikzPolygonThickness, setTikzPolygonThickness] = useState(() => localStorage.getItem(STORAGE_TIKZ_POLYGON_THICKNESS) || 'thick');

  const [defaultPromptText, setDefaultPromptText] = useState(DEFAULT_PROMPT_FALLBACK);
  const [promptConfigs, setPromptConfigs] = useState(() =>
    ensurePromptConfigs(loadPromptConfigs(), DEFAULT_PROMPT_FALLBACK)
  );
  const [byokChecklist, setByokChecklist] = useState(() => {
    const saved = loadByokChecklist();
    return BYOK_CHECK_ITEMS.reduce((acc, item) => {
      acc[item.id] = !!saved[item.id];
      return acc;
    }, {});
  });
  const [activePromptId, setActivePromptId] = useState(() => localStorage.getItem(STORAGE_ACTIVE_PROMPT) || 'default');
  const activePrompt = useMemo(
    () => promptConfigs.find((p) => p.id === activePromptId) || promptConfigs[0] || { content: defaultPromptText, name: '默认提示词' },
    [promptConfigs, activePromptId, defaultPromptText]
  );
  const promptTemplate = activePrompt?.content || defaultPromptText;

  const [customProviderDraft, setCustomProviderDraft] = useState({
    key: '',
    name: '',
    baseUrl: '',
    modelsEndpoint: '/models'
  });
  const [providerModalOpen, setProviderModalOpen] = useState(false);
  const [providerModalMode, setProviderModalMode] = useState('add');
  const [promptEditorOpen, setPromptEditorOpen] = useState(false);
  const [editingPromptId, setEditingPromptId] = useState('');
  const [promptDraftName, setPromptDraftName] = useState('');
  const [promptDraftContent, setPromptDraftContent] = useState('');
  const [userInput, setUserInput] = useState('');
  const [pendingImageDataUrl, setPendingImageDataUrl] = useState('');
  const [pendingImageMimeType, setPendingImageMimeType] = useState('');

  const [status, setStatus] = useState('');
  const [toastVisible, setToastVisible] = useState(false);
  const [toastText, setToastText] = useState('');
  const [loading, setLoading] = useState(false);
  const [conversationHistory, setConversationHistory] = useState([]);
  const [chatMessages, setChatMessages] = useState([]);

  const [commandEditor, setCommandEditor] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);

  const chatEndRef = useRef(null);
  const promptEditorRef = useRef(null);
  const commandEditorRef = useRef(null);
  const [cmdCompletion, setCmdCompletion] = useState({
    open: false,
    items: [],
    activeIndex: 0,
    start: 0,
    end: 0,
    top: 0,
    left: 0
  });

  useEffect(() => {
    const keysMap = getSavedKeysMap();
    setApiKey(keysMap[providerKey] || '');
  }, [providerKey]);

  useEffect(() => {
    fetch(DEFAULT_PROMPT_PATH)
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((text) => {
        const t = (text || '').trim();
        const content = t || DEFAULT_PROMPT_FALLBACK;
        setDefaultPromptText(content);
        setPromptConfigs((prev) => ensurePromptConfigs(prev, content));
      })
      .catch(() => {
        setDefaultPromptText(DEFAULT_PROMPT_FALLBACK);
        setPromptConfigs((prev) => ensurePromptConfigs(prev, DEFAULT_PROMPT_FALLBACK));
      });
  }, []);

  useEffect(() => {
    setPromptConfigs((prev) => ensurePromptConfigs(prev, defaultPromptText));
  }, [defaultPromptText]);

  useEffect(() => {
    if (!providerMap[providerKey]) {
      setProviderKey('openai');
    }
  }, [providerMap, providerKey]);

  useEffect(() => {
    setModels([]);
    setModel('');
  }, [providerKey, provider]);

  useEffect(() => {
    localStorage.setItem(STORAGE_PROVIDER, providerKey);
  }, [providerKey]);

  useEffect(() => {
    if (model) localStorage.setItem(STORAGE_MODEL, model);
  }, [model]);

  useEffect(() => {
    const customOnly = (promptConfigs || []).filter((p) => p && !p.builtin && p.id !== 'default');
    localStorage.setItem(STORAGE_PROMPT_CONFIGS, JSON.stringify(customOnly));
  }, [promptConfigs]);

  useEffect(() => {
    if (activePromptId) localStorage.setItem(STORAGE_ACTIVE_PROMPT, activePromptId);
  }, [activePromptId]);

  useEffect(() => {
    localStorage.setItem(STORAGE_BYOK_CHECKLIST, JSON.stringify(byokChecklist || {}));
  }, [byokChecklist]);

  useEffect(() => {
    if (promptConfigs.some((p) => p.id === activePromptId)) return;
    setActivePromptId('default');
  }, [promptConfigs, activePromptId]);

  useEffect(() => {
    localStorage.setItem(STORAGE_CONTEXT_MEMORY, contextMemory ? 'on' : 'off');
  }, [contextMemory]);

  useEffect(() => {
    localStorage.setItem(STORAGE_MAX_HISTORY, String(maxHistory));
  }, [maxHistory]);

  useEffect(() => {
    localStorage.setItem(STORAGE_SHOW_AXES, showAxes ? 'on' : 'off');
  }, [showAxes]);

  useEffect(() => {
    localStorage.setItem(STORAGE_SHOW_GRID, showGrid ? 'on' : 'off');
  }, [showGrid]);

  useEffect(() => {
    localStorage.setItem(STORAGE_STRICT_WHITELIST, strictWhitelist ? 'on' : 'off');
  }, [strictWhitelist]);

  useEffect(() => {
    localStorage.setItem(STORAGE_UI_FONT, uiFont || 'Arial');
  }, [uiFont]);

  useEffect(() => {
    localStorage.setItem(STORAGE_UI_FONT_SIZE, String(Math.max(10, Math.min(20, uiFontSize || 14))));
  }, [uiFontSize]);

  useEffect(() => {
    localStorage.setItem(STORAGE_EXPORT_IMAGE_MODE, imageExportMode === 'clipboard' ? 'clipboard' : 'file');
  }, [imageExportMode]);

  useEffect(() => {
    localStorage.setItem(STORAGE_EXPORT_SCALE, String(Math.max(1, Math.min(4, exportScale || 2))));
  }, [exportScale]);

  useEffect(() => {
    localStorage.setItem(STORAGE_TIKZ_SCALE, String(Math.max(0.2, Math.min(5, tikzScale || 1.2))));
  }, [tikzScale]);

  useEffect(() => {
    localStorage.setItem(STORAGE_TIKZ_LINE_EXTEND, String(Math.max(0, Math.min(6, tikzLineExtend || 0))));
  }, [tikzLineExtend]);

  useEffect(() => {
    localStorage.setItem(STORAGE_TIKZ_POINT_RADIUS, String(Math.max(0.05, Math.min(3, tikzPointRadius || 0.25))));
  }, [tikzPointRadius]);

  useEffect(() => {
    localStorage.setItem(STORAGE_TIKZ_POLYGON_FILL, String(tikzPolygonFill || 'black').trim() || 'black');
  }, [tikzPolygonFill]);

  useEffect(() => {
    localStorage.setItem(STORAGE_TIKZ_AXIS_THICKNESS, TIKZ_THICKNESS_OPTIONS.includes(tikzAxisThickness) ? tikzAxisThickness : 'semithick');
  }, [tikzAxisThickness]);

  useEffect(() => {
    localStorage.setItem(STORAGE_TIKZ_CONIC_THICKNESS, TIKZ_THICKNESS_OPTIONS.includes(tikzConicThickness) ? tikzConicThickness : 'thick');
  }, [tikzConicThickness]);

  useEffect(() => {
    localStorage.setItem(STORAGE_TIKZ_LINE_THICKNESS, TIKZ_THICKNESS_OPTIONS.includes(tikzLineThickness) ? tikzLineThickness : 'semithick');
  }, [tikzLineThickness]);

  useEffect(() => {
    localStorage.setItem(STORAGE_TIKZ_SEGMENT_THICKNESS, TIKZ_THICKNESS_OPTIONS.includes(tikzSegmentThickness) ? tikzSegmentThickness : 'thick');
  }, [tikzSegmentThickness]);

  useEffect(() => {
    localStorage.setItem(STORAGE_TIKZ_POLYGON_THICKNESS, TIKZ_THICKNESS_OPTIONS.includes(tikzPolygonThickness) ? tikzPolygonThickness : 'thick');
  }, [tikzPolygonThickness]);

  useEffect(() => {
    if (!ggbReady || !ggbApi) return;
    try {
      if (typeof ggbApi.setAxesVisible === 'function') {
        ggbApi.setAxesVisible(showAxes, showAxes);
      } else if (typeof ggbApi.setAxisVisible === 'function') {
        ggbApi.setAxisVisible(1, showAxes);
        ggbApi.setAxisVisible(2, showAxes);
      }
      if (typeof ggbApi.setGridVisible === 'function') {
        ggbApi.setGridVisible(showGrid);
      }
    } catch {
      // ignore axis toggle errors from API differences
    }
  }, [ggbReady, ggbApi, showAxes, showGrid]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  useEffect(() => {
    if (!status) return;
    setToastText(status);
    setToastVisible(true);
    const timer = setTimeout(() => setToastVisible(false), 2200);
    return () => clearTimeout(timer);
  }, [status]);

  const saveKey = (value) => {
    const keysMap = getSavedKeysMap();
    keysMap[providerKey] = value;
    localStorage.setItem(STORAGE_KEYS, JSON.stringify(keysMap));
  };

  const testApiConnection = async () => {
    if (!apiKey) {
      setStatus('请先填写 API Key');
      return;
    }
    setStatus('正在测试 API 连接...');
    try {
      const endpoint = provider?.modelsEndpoint || '/models';
      const resp = await fetch(`${provider.baseUrl}${endpoint}`, {
        headers: { Authorization: `Bearer ${apiKey}` }
      });
      if (!resp.ok) {
        const raw = await resp.text();
        throw new Error(raw || `HTTP ${resp.status}`);
      }
      setStatus('连接成功：模型接口可用');
    } catch (e) {
      setStatus(`连接失败：${e.message}`);
    }
  };

  const resetDefaultPrompt = () => {
    fetch(DEFAULT_PROMPT_PATH)
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((text) => {
        const t = (text || '').trim();
        const content = t || DEFAULT_PROMPT_FALLBACK;
        setDefaultPromptText(content);
        setPromptConfigs((prev) => ensurePromptConfigs(prev, content));
        setStatus('默认提示词已从文件恢复');
      })
      .catch(() => {
        setDefaultPromptText(DEFAULT_PROMPT_FALLBACK);
        setPromptConfigs((prev) => ensurePromptConfigs(prev, DEFAULT_PROMPT_FALLBACK));
        setStatus('默认提示词已恢复（兜底模板）');
      });
  };

  const refreshProviderMap = () => setProviderMap(getProviderMap());

  const openAddProviderModal = () => {
    setProviderModalMode('add');
    setCustomProviderDraft({
      key: '',
      name: '',
      baseUrl: '',
      modelsEndpoint: '/models'
    });
    setProviderModalOpen(true);
  };

  const openEditProviderModal = (targetKey) => {
    if (!targetKey || !isCustomProvider(targetKey) || !providerMap[targetKey]) {
      setStatus('仅支持编辑自定义服务商');
      return;
    }
    const item = providerMap[targetKey];
    setProviderModalMode('edit');
    setCustomProviderDraft({
      key: targetKey,
      name: item.name || '',
      baseUrl: item.baseUrl || '',
      modelsEndpoint: item.modelsEndpoint || '/models'
    });
    setProviderModalOpen(true);
  };

  const saveCustomProvider = () => {
    const draftKey = String(customProviderDraft.key || '').trim();
    const key = providerModalMode === 'edit' ? draftKey : `custom_${Date.now()}`;
    const name = String(customProviderDraft.name || '').trim();
    const baseUrl = String(customProviderDraft.baseUrl || '').trim();
    if (!name || !baseUrl) {
      setStatus('请填写服务商名称与 API 地址');
      return;
    }
    try {
      upsertCustomProvider(key, {
        name,
        baseUrl,
        modelsEndpoint: String(customProviderDraft.modelsEndpoint || '').trim() || '/models',
        defaultModels: []
      });
      refreshProviderMap();
      setProviderKey(key);
      setProviderModalOpen(false);
      setStatus(providerModalMode === 'edit' ? '自定义服务商已更新' : '自定义服务商已添加');
    } catch (e) {
      setStatus(`保存失败：${e.message}`);
    }
  };

  const removeProviderByKey = (targetKey) => {
    if (!targetKey || !isCustomProvider(targetKey)) {
      setStatus('内置服务商不能删除');
      return;
    }
    if (!window.confirm('确定删除该自定义服务商吗？')) return;
    removeCustomProvider(targetKey);
    refreshProviderMap();
    if (providerKey === targetKey) {
      setProviderKey('openai');
    }
    setStatus('自定义服务商已删除');
  };

  const openPromptEditor = (targetPromptId = null) => {
    if (targetPromptId) {
      const target = promptConfigs.find((p) => p.id === targetPromptId);
      if (!target) return;
      if (target.builtin || target.id === 'default') {
        setStatus('默认提示词不可修改');
        return;
      }
      setEditingPromptId(target.id);
      setPromptDraftName(target.name || '');
      setPromptDraftContent(target.content || '');
    } else {
      setEditingPromptId('');
      setPromptDraftName('');
      setPromptDraftContent(defaultPromptText);
    }
    setPromptEditorOpen(true);
  };

  const insertPromptVariable = (variable) => {
    const el = promptEditorRef.current;
    if (!el) {
      setPromptDraftContent((prev) => `${prev}${variable}`);
      return;
    }
    const start = el.selectionStart || 0;
    const end = el.selectionEnd || 0;
    const text = promptDraftContent || '';
    const next = `${text.slice(0, start)}${variable}${text.slice(end)}`;
    setPromptDraftContent(next);
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + variable.length;
      el.setSelectionRange(pos, pos);
    });
  };

  const savePromptConfig = () => {
    const name = String(promptDraftName || '').trim();
    const content = String(promptDraftContent || '').trim();
    if (!name) {
      setStatus('请输入提示词名称');
      return;
    }
    if (!content) {
      setStatus('提示词内容不能为空');
      return;
    }
    if (editingPromptId) {
      if (editingPromptId === 'default') {
        setStatus('默认提示词不可修改');
        return;
      }
      setPromptConfigs((prev) => prev.map((p) => (p.id === editingPromptId ? { ...p, name, content } : p)));
      setActivePromptId(editingPromptId);
      setStatus('提示词已更新');
    } else {
      const id = `prompt_${Date.now()}`;
      setPromptConfigs((prev) => [...prev, { id, name, content, builtin: false }]);
      setActivePromptId(id);
      setStatus('提示词已添加');
    }
    setPromptEditorOpen(false);
  };

  const deletePromptById = (id) => {
    const target = promptConfigs.find((p) => p.id === id);
    if (!target) return;
    if (target.builtin) {
      setStatus('默认提示词不能删除');
      return;
    }
    if (!window.confirm(`确定删除提示词「${target.name}」吗？`)) return;
    setPromptConfigs((prev) => prev.filter((p) => p.id !== id));
    if (activePromptId === id) setActivePromptId('default');
    setStatus('提示词已删除');
  };

  const byokDoneCount = useMemo(
    () => BYOK_CHECK_ITEMS.filter((item) => !!byokChecklist[item.id]).length,
    [byokChecklist]
  );

  const toggleByokItem = (id) => {
    if (!id) return;
    setByokChecklist((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const markAllByokItems = () => {
    const next = BYOK_CHECK_ITEMS.reduce((acc, item) => {
      acc[item.id] = true;
      return acc;
    }, {});
    setByokChecklist(next);
    setStatus('BYOK 自查已全部勾选');
  };

  const clearByokItems = () => {
    const next = BYOK_CHECK_ITEMS.reduce((acc, item) => {
      acc[item.id] = false;
      return acc;
    }, {});
    setByokChecklist(next);
    setStatus('BYOK 自查已清空');
  };

  const loadModels = async () => {
    setStatus('模型加载中...');
    try {
      if (!apiKey) {
        setStatus('请先输入 API Key');
        return;
      }
      if (!provider?.baseUrl) {
        setStatus('当前服务商缺少 API 地址');
        return;
      }

      const endpoint = provider.modelsEndpoint || '/models';
      const resp = await fetch(`${provider.baseUrl}${endpoint}`, {
        headers: { Authorization: `Bearer ${apiKey}` }
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      const arr = normalizeModelItemsFromResponse(data);
      const finalModels = arr.length > 0 ? arr : provider.defaultModels || [];
      if (finalModels.length === 0) {
        setModels([]);
        setStatus('模型列表为空，请检查 API 地址或密钥权限');
        return;
      }
      setModels(finalModels);
      if (!model || !finalModels.some((m) => (m.id || m.value) === model)) {
        setModel(finalModels[0].id || finalModels[0].value || '');
      }
      const groupCount = new Set(finalModels.map((m) => classifyModelGroup(m.id || m.value || ''))).size;
      setStatus(`模型加载完成（${finalModels.length}，分组 ${groupCount}）`);
    } catch (e) {
      const fallback = provider.defaultModels || [];
      if (fallback.length > 0) {
        setModels(fallback);
        if (!model || !fallback.some((m) => (m.id || m.value) === model)) {
          setModel(fallback[0].id || fallback[0].value || '');
        }
        setStatus(`模型获取失败，已回退预设：${e.message}`);
      } else {
        setModels([]);
        setStatus(`模型获取失败：${e.message}`);
      }
    }
  };

  const clearPendingImage = () => {
    setPendingImageDataUrl('');
    setPendingImageMimeType('');
  };

  const handleInputPaste = async (event) => {
    const clipboard = event.clipboardData;
    if (!clipboard || !clipboard.items) return;
    const imageItem = Array.from(clipboard.items).find((item) => item.type && item.type.startsWith('image/'));
    if (!imageItem) return;

    const file = imageItem.getAsFile();
    if (!file) return;

    try {
      const dataUrl = await fileToDataUrl(file);
      if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) {
        throw new Error('图片格式不支持');
      }
      setPendingImageDataUrl(dataUrl);
      setPendingImageMimeType(file.type || 'image/*');
      setStatus('图片已粘贴，可直接发送');
    } catch (e) {
      setStatus(`图片粘贴失败：${e.message}`);
    }
  };

  const appendCommandsToEditor = (text) => {
    const cleaned = (text || '').replace(/```[\w]*\n?/g, '').replace(/```/g, '').trim();
    if (!cleaned) return;
    setCommandEditor((prev) => {
      const current = (prev || '').trim();
      if (!current) return cleaned;
      const divider = `\n\n-- AI 追加 ${new Date().toLocaleTimeString()}\n`;
      return `${current}${divider}${cleaned}`;
    });
  };

  const sendMessage = async () => {
    const text = userInput.trim();
    const hasImage = !!pendingImageDataUrl;

    if (!apiKey || !model) {
      setStatus('请先填写 API Key 和模型');
      return;
    }
    if (!text && !hasImage) {
      setStatus('请输入内容或粘贴图片');
      return;
    }

    const userBubbleText = text || '（图片）';
    const imageDataUrl = pendingImageDataUrl;

    setChatMessages((prev) => [
      ...prev,
      {
        role: 'user',
        text: userBubbleText,
        imageDataUrl,
        time: Date.now()
      }
    ]);

    setUserInput('');
    clearPendingImage();
    setLoading(true);
    setStatus('请求中...');

    try {
      const messages = [{ role: 'system', content: buildSystemPrompt(promptTemplate, '') }];

      if (contextMemory) {
        const recent = conversationHistory.slice(-Math.max(1, maxHistory) * 2);
        messages.push(...recent);
      }

      if (hasImage) {
        messages.push({
          role: 'user',
          content: [
            { type: 'text', text: text || '请根据图片生成 GeoGebra 作图指令。' },
            { type: 'image_url', image_url: { url: imageDataUrl } }
          ]
        });
      } else {
        messages.push({ role: 'user', content: text });
      }

      const result = await requestWithFallback({
        providerKey,
        apiBase: provider.baseUrl,
        apiKey,
        model,
        messages
      });

      setChatMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          text: result.content,
          time: Date.now(),
          via: result.via
        }
      ]);

      appendCommandsToEditor(result.content);

      setConversationHistory((prev) => {
        const next = [
          ...prev,
          { role: 'user', content: text || '[用户发送了一张图片]' },
          { role: 'assistant', content: result.content }
        ];
        return next.slice(-Math.max(1, maxHistory) * 2);
      });

      setStatus(`请求成功（通道：${result.via}）`);
    } catch (e) {
      const msg = `请求失败：${e.message}`;
      setChatMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          text: msg,
          time: Date.now(),
          error: true
        }
      ]);
      setStatus(msg);
    } finally {
      setLoading(false);
    }
  };

  const validateCommands = () => {
    const lines = parseCommandLines(commandEditor);
    if (lines.length === 0) {
      setStatus('命令编辑器为空');
      return false;
    }
    const invalid = validateCommandsAgainstWhitelist(lines);
    if (invalid.length > 0) {
      setStatus(`白名单校验失败：${formatInvalidPreview(invalid)}`);
      return false;
    }
    setStatus(`白名单校验通过（${lines.length} 条）`);
    return true;
  };

  const executeCommandsToLegacy = () => {
    const lines = normalizeCommandAliases(parseCommandLines(commandEditor));
    if (lines.length === 0) {
      setStatus('命令编辑器为空');
      return;
    }

    const invalid = validateCommandsAgainstWhitelist(lines);
    if (invalid.length > 0 && strictWhitelist) {
      setStatus(`执行已拦截：${formatInvalidPreview(invalid)}`);
      return;
    }
    if (invalid.length > 0 && !strictWhitelist) {
      setStatus(`发现疑似未收录指令，已放行执行：${formatInvalidPreview(invalid)}`);
    }

    try {
      if (ggbReady && ggbApi && typeof ggbApi.evalCommand === 'function') {
        let ok = 0;
        let fail = 0;
        lines.forEach((cmd) => {
          try {
            ggbApi.evalCommand(cmd);
            ok++;
          } catch {
            fail++;
          }
        });
        setStatus(`原生画板执行完成：成功 ${ok} 条，失败 ${fail} 条`);
        return;
      }

      const legacy = getLegacyWindow();
      if (!legacy) {
        setStatus('未找到原生画板，也未找到旧版 iframe');
        return;
      }
      setLegacyCommandInput(legacy, lines.join('\n'));
      if (typeof legacy.executeGGBCommands === 'function') {
        legacy.executeGGBCommands(lines.join('\n'));
        setStatus(`已回退到旧版画板执行 ${lines.length} 条命令`);
        return;
      }
      setStatus('执行失败：既无原生 API，也无旧版执行函数');
    } catch (e) {
      setStatus(`执行失败：${e.message}`);
    }
  };

  const readCommandsFromLegacyBoard = () => {
    try {
      if (ggbReady && ggbApi && typeof ggbApi.getXML === 'function') {
        const xml = ggbApi.getXML();
        const lines = extractCommandsFromXML(xml);
        if (lines.length > 0) {
          setCommandEditor(lines.join('\n'));
          setStatus(`已从原生画板读取 ${lines.length} 条命令`);
          return;
        }
      }

      const legacy = getLegacyWindow();
      if (!legacy) {
        setStatus('未找到原生命令，也未找到旧版 iframe');
        return;
      }
      if (typeof legacy.readCommandsFromGGB === 'function') {
        legacy.readCommandsFromGGB();
      }
      const txt = getLegacyCommandInput(legacy);
      if (!txt.trim()) {
        setStatus('旧版未读取到可重建命令');
        return;
      }
      setCommandEditor(txt);
      setStatus(`已从旧版画板读取 ${parseCommandLines(txt).length} 条命令`);
    } catch (e) {
      setStatus(`读取失败：${e.message}`);
    }
  };

  const clearLegacyBoard = () => {
    try {
      if (ggbReady && ggbApi && typeof ggbApi.reset === 'function') {
        ggbApi.reset();
        setStatus('已清空原生画板');
        return;
      }

      const legacy = getLegacyWindow();
      if (!legacy) {
        setStatus('未找到原生画板，也未找到旧版 iframe');
        return;
      }
      if (typeof legacy.clearBoard === 'function') {
        legacy.clearBoard(false);
        setStatus('已回退到旧版清空画板');
        return;
      }
      setStatus('旧版画板未暴露 clearBoard');
    } catch (e) {
      setStatus(`清空画板失败：${e.message}`);
    }
  };

  const clearCommandEditor = () => {
    setCommandEditor('');
    setCmdCompletion({ open: false, items: [], activeIndex: 0, start: 0, end: 0, top: 0, left: 0 });
    setStatus('命令编辑器已清空');
  };

  const getCaretPixelPos = (textarea, caretPos) => {
    if (!textarea) return { top: 12, left: 12 };
    const div = document.createElement('div');
    const style = window.getComputedStyle(textarea);
    const props = [
      'boxSizing', 'width', 'height', 'overflowX', 'overflowY',
      'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
      'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
      'fontStyle', 'fontVariant', 'fontWeight', 'fontStretch', 'fontSize',
      'fontSizeAdjust', 'lineHeight', 'fontFamily', 'textAlign', 'textTransform',
      'textIndent', 'textDecoration', 'letterSpacing', 'wordSpacing'
    ];
    div.style.position = 'absolute';
    div.style.visibility = 'hidden';
    props.forEach((p) => {
      div.style[p] = style[p];
    });
    div.style.whiteSpace = 'pre-wrap';
    div.style.wordWrap = 'break-word';

    const value = textarea.value || '';
    const pos = Math.max(0, Math.min(Number(caretPos) || 0, value.length));
    div.textContent = value.substring(0, pos);
    const span = document.createElement('span');
    span.textContent = value.substring(pos) || '.';
    div.appendChild(span);
    document.body.appendChild(div);

    const top = span.offsetTop - textarea.scrollTop + parseFloat(style.borderTopWidth) + parseFloat(style.paddingTop);
    const left = span.offsetLeft - textarea.scrollLeft + parseFloat(style.borderLeftWidth) + parseFloat(style.paddingLeft);
    document.body.removeChild(div);
    return { top, left };
  };

  const updateCommandCompletion = (text, caret, textareaEl = null) => {
    const t = String(text || '');
    const pos = Number.isFinite(caret) ? caret : t.length;
    const left = t.slice(0, Math.max(0, pos));
    const m = left.match(/([A-Za-z][A-Za-z0-9_]*)$/);
    if (!m) {
      setCmdCompletion((prev) => (prev.open ? { open: false, items: [], activeIndex: 0, start: 0, end: 0, top: 0, left: 0 } : prev));
      return;
    }
    const prefix = m[1];
    if (prefix.length < 1) {
      setCmdCompletion((prev) => (prev.open ? { open: false, items: [], activeIndex: 0, start: 0, end: 0, top: 0, left: 0 } : prev));
      return;
    }
    const items = searchGGBCompletions(prefix, 10);
    if (items.length === 0) {
      setCmdCompletion((prev) => (prev.open ? { open: false, items: [], activeIndex: 0, start: 0, end: 0, top: 0, left: 0 } : prev));
      return;
    }
    const start = pos - prefix.length;
    const anchor = getCaretPixelPos(textareaEl || commandEditorRef.current, pos);
    setCmdCompletion({
      open: true,
      items,
      activeIndex: 0,
      start,
      end: pos,
      top: anchor.top + 24,
      left: anchor.left
    });
  };

  const applyCommandCompletion = (item) => {
    if (!item) return;
    const start = Math.max(0, cmdCompletion.start || 0);
    const end = Math.max(start, cmdCompletion.end || start);
    const current = String(commandEditor || '');
    const insertText = String(item.insertText || item.name || '');
    const next = `${current.slice(0, start)}${insertText}${current.slice(end)}`;
    setCommandEditor(next);
    setCmdCompletion({ open: false, items: [], activeIndex: 0, start: 0, end: 0, top: 0, left: 0 });

    requestAnimationFrame(() => {
      const el = commandEditorRef.current;
      if (!el) return;
      el.focus();
      const p = insertText.indexOf('(');
      const caret = start + (p >= 0 ? p + 1 : insertText.length);
      el.setSelectionRange(caret, caret);
    });
  };

  const copyCommands = async () => {
    try {
      await navigator.clipboard.writeText(commandEditor || '');
      setStatus('命令已复制到剪贴板');
    } catch {
      setStatus('复制失败，请手动复制');
    }
  };

  const clearChat = () => {
    setChatMessages([]);
    setConversationHistory([]);
    setStatus('对话已清空');
  };

  return (
    <section className="panel panel-center">
      {toastVisible ? (
        <div className="top-toast">❗ {toastText}</div>
      ) : null}
      <header className="panel-subheader panel-subheader-compact">
        <div className="workspace-mark">AI 对话与命令</div>
        <button className="btn btn-lite" onClick={() => setSettingsOpen(true)}>⚙️ 设置</button>
      </header>

      <div className="workbench">
        <div className="three-col-shell">
          <div className="col-chat clean-chat-card">
            <div className="clean-card-head">
              <strong>对话框</strong>
              <button className="btn btn-lite" onClick={clearChat}>清空</button>
            </div>

            <div className="chat-box clean-chat-box">
              {chatMessages.length === 0 ? (
                <div className="chat-empty">开始输入题目或粘贴图片（Ctrl/Cmd+V）</div>
              ) : (
                chatMessages.map((msg, idx) => (
                  <div key={`${msg.time}-${idx}`} className={`chat-item ${msg.role === 'user' ? 'user' : 'assistant'} ${msg.error ? 'error' : ''}`}>
                    <div className="chat-role">{msg.role === 'user' ? '你' : 'AI'}</div>
                    <div className="chat-content">{msg.text}</div>
                    {msg.imageDataUrl ? <img className="chat-image" src={msg.imageDataUrl} alt="粘贴图片" /> : null}
                    {msg.via ? <div className="chat-meta">通道：{msg.via}</div> : null}
                  </div>
                ))
              )}
              <div ref={chatEndRef} />
            </div>

            <label className="block clean-input-wrap">
              <span className="clean-input-label">输入（Enter 发送，Shift+Enter 换行）</span>
              <textarea
                className="input-box"
                value={userInput}
                onChange={(e) => setUserInput(e.target.value)}
                onPaste={handleInputPaste}
                placeholder="输入题目文字，或 Ctrl/Cmd+V 粘贴截图"
                onKeyDown={(e) => {
                  if (e.isComposing || e.keyCode === 229) return;
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    if (!loading) sendMessage();
                  }
                }}
              />
            </label>

            {pendingImageDataUrl ? (
              <div className="pending-image">
                <div className="pending-image-thumb-wrap">
                  <img src={pendingImageDataUrl} alt="待发送图片" className="pending-image-thumb" />
                </div>
                <div className="pending-meta">
                  <span>已粘贴图片（{pendingImageMimeType || 'image/*'}）</span>
                  <button className="btn btn-lite" onClick={clearPendingImage}>移除</button>
                </div>
              </div>
            ) : null}
          </div>

          <div className="col-command clean-cmd-card">
            <div className="clean-card-head">
              <strong className="cmd-title">命令区</strong>
              <div className="actions-row gap cmd-head-actions">
                <button className="btn btn-lite cmd-mini-btn" onClick={copyCommands}>复制</button>
                <button className="btn btn-lite cmd-mini-btn" onClick={clearLegacyBoard}>清空画板</button>
                <button className="btn btn-lite cmd-mini-btn" onClick={clearCommandEditor}>清空代码</button>
                <button className="btn cmd-mini-btn" onClick={executeCommandsToLegacy}>执行</button>
              </div>
            </div>

            <div className="command-editor-box">
              <textarea
                ref={commandEditorRef}
                className="output-box"
                value={commandEditor}
                onChange={(e) => {
                  const next = e.target.value;
                  setCommandEditor(next);
                  const inputType = e?.nativeEvent?.inputType || '';
                  if (inputType.startsWith('delete')) {
                    setCmdCompletion((prev) => ({ ...prev, open: false }));
                    return;
                  }
                  // 仅在输入文本时触发补全，避免编辑操作被补全逻辑干扰
                  if (inputType === 'insertText' || inputType === 'insertCompositionText') {
                    const inserted = String(e?.nativeEvent?.data || '');
                    if (/^[A-Za-z.]$/.test(inserted)) {
                      updateCommandCompletion(next, e.target.selectionStart, e.target);
                      return;
                    }
                  }
                  setCmdCompletion((prev) => ({ ...prev, open: false }));
                }}
                onKeyDown={(e) => {
                  if (e.isComposing || e.keyCode === 229) return;

                  // 防止按键重复事件导致命令被连续删除（用户反馈“命令被吃掉”）
                  if ((e.key === 'Backspace' || e.key === 'Delete') && e.repeat) {
                    e.preventDefault();
                    return;
                  }

                  if (e.key === 'Backspace' || e.key === 'Delete') {
                    setCmdCompletion((prev) => (prev.open ? { ...prev, open: false } : prev));
                    return;
                  }

                  if (!cmdCompletion.open) return;
                  if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    setCmdCompletion((prev) => ({
                      ...prev,
                      activeIndex: prev.items.length === 0 ? 0 : (prev.activeIndex + 1) % prev.items.length
                    }));
                    return;
                  }
                  if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    setCmdCompletion((prev) => ({
                      ...prev,
                      activeIndex: prev.items.length === 0 ? 0 : (prev.activeIndex - 1 + prev.items.length) % prev.items.length
                    }));
                    return;
                  }
                  if (e.key === 'Enter' || e.key === 'Tab') {
                    e.preventDefault();
                    applyCommandCompletion(cmdCompletion.items[cmdCompletion.activeIndex]);
                    return;
                  }
                  if (e.key === 'Escape') {
                    e.preventDefault();
                    setCmdCompletion({ open: false, items: [], activeIndex: 0, start: 0, end: 0, top: 0, left: 0 });
                  }
                }}
                onClick={(e) => {
                  // 点击仅用于刷新补全位置，不主动展开
                  if (!cmdCompletion.open) return;
                  updateCommandCompletion(e.target.value, e.target.selectionStart, e.target);
                }}
                onBlur={() => {
                  setTimeout(() => {
                    setCmdCompletion((prev) => ({ ...prev, open: false }));
                  }, 120);
                }}
                placeholder="AI 返回会自动追加到这里。你也可以手动编辑后执行。"
              />
              {cmdCompletion.open ? (
                <div className="cmd-completion-menu" style={{ top: cmdCompletion.top, left: cmdCompletion.left }}>
                  {cmdCompletion.items.map((item, idx) => (
                    <button
                      key={item.name}
                      className={`cmd-completion-item ${idx === cmdCompletion.activeIndex ? 'active' : ''}`}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        applyCommandCompletion(item);
                      }}
                    >
                      <span className="cmd-completion-name">{item.name}</span>
                      <span className="cmd-completion-detail">{item.detail || ''}</span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

          </div>
        </div>

      </div>

      {settingsOpen ? (
        <div className="settings-modal-overlay" onClick={() => setSettingsOpen(false)}>
          <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
            <div className="settings-modal-head">
              <strong>设置</strong>
              <button className="btn btn-lite" onClick={() => setSettingsOpen(false)}>关闭</button>
            </div>

            <div className="settings-section">
              <h4>API 配置</h4>
              <div className="provider-selector">
                <div className="provider-list">
                  {providerEntries.map((entry) => (
                    <div
                      key={entry.key}
                      className={`provider-item ${providerKey === entry.key ? 'active' : ''}`}
                      onClick={() => setProviderKey(entry.key)}
                    >
                      <span className="provider-icon">{entry.icon}</span>
                      <span className="provider-name">{entry.name}</span>
                      {entry.custom ? (
                        <button
                          className="provider-delete-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeProviderByKey(entry.key);
                          }}
                        >
                          ×
                        </button>
                      ) : null}
                    </div>
                  ))}
                  <div className="provider-item add-provider-btn" onClick={openAddProviderModal}>
                    <span className="provider-icon">+</span>
                    <span className="provider-name">添加自定义</span>
                  </div>
                </div>

                <div className="provider-config">
                  <label className="span-2">
                    API 密钥
                    <div className="api-key-input-wrapper">
                      <input
                        type={showApiKey ? 'text' : 'password'}
                        value={apiKey}
                        onChange={(e) => {
                          const v = e.target.value.trim();
                          setApiKey(v);
                          saveKey(v);
                        }}
                        placeholder="输入 API Key"
                      />
                      <button className="btn-icon-small" onClick={() => setShowApiKey((v) => !v)}>👁️</button>
                      <button className="btn-icon-small btn-check-key" onClick={testApiConnection}>✓</button>
                    </div>
                    <span className="hint-text">{provider?.baseUrl || '请先选择服务商'} </span>
                  </label>

                  <label className="span-2">
                    模型
                    <div className="model-select-wrapper">
                      <select value={model} onChange={(e) => setModel(e.target.value)}>
                        <option value="">选择模型</option>
                        {groupedModels.map((group) => (
                          <optgroup key={group.name} label={`${group.name} (${group.list.length})`}>
                            {group.list.map((m) => (
                              <option key={m.id || m.value} value={m.id || m.value}>
                                {m.name || m.label || m.id || m.value}
                              </option>
                            ))}
                          </optgroup>
                        ))}
                      </select>
                      <button className="btn-icon-small refresh-models-btn" onClick={loadModels}>🔄</button>
                    </div>
                    <span className="hint-text">从 API 拉取模型并按类别分组显示，点击 🔄 刷新</span>
                  </label>

                  <div className="actions-row gap">
                    <button className="btn" onClick={loadModels}>刷新模型</button>
                    <button className="btn btn-lite" onClick={testApiConnection}>测试连接</button>
                    {isCustomProvider(providerKey) ? (
                      <button className="btn btn-lite" onClick={() => openEditProviderModal(providerKey)}>编辑服务商</button>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>

            <div className="settings-section">
              <h4>AI 提示词</h4>
              <div className="prompt-list-container">
                {promptConfigs.map((p) => (
                  <div
                    key={p.id}
                    className={`prompt-list-item ${activePromptId === p.id ? 'active' : ''}`}
                    onClick={() => setActivePromptId(p.id)}
                  >
                    <div className="prompt-list-info">
                      <div className="prompt-list-name">{p.builtin ? '🎯 默认提示词' : p.name}</div>
                      <div className="prompt-list-desc">{p.builtin ? '平衡的通用提示词' : '自定义提示词'}</div>
                    </div>
                    <div className="prompt-list-actions" onClick={(e) => e.stopPropagation()}>
                      {!p.builtin ? (
                        <button className="btn-icon-small" onClick={() => openPromptEditor(p.id)} title="编辑">✏️</button>
                      ) : null}
                      {!p.builtin ? (
                        <button className="btn-icon-small" onClick={() => deletePromptById(p.id)} title="删除">🗑️</button>
                      ) : null}
                      {activePromptId === p.id ? <span className="prompt-list-check">✓</span> : null}
                    </div>
                  </div>
                ))}
              </div>
              <div className="actions-row gap">
                <button className="btn btn-lite" onClick={() => openPromptEditor()}>+ 添加自定义提示词</button>
                <button
                  className="btn btn-lite"
                  onClick={() => openPromptEditor(activePromptId)}
                  disabled={activePromptId === 'default'}
                  title={activePromptId === 'default' ? '默认提示词不可编辑' : '编辑当前提示词'}
                >
                  编辑当前
                </button>
                <button className="btn btn-lite" onClick={resetDefaultPrompt}>恢复默认模板</button>
              </div>
              <div className="prompt-preview">
                当前提示词预览：{String(promptTemplate || '').slice(0, 120)}{String(promptTemplate || '').length > 120 ? '...' : ''}
              </div>
            </div>

            <div className="settings-section">
              <h4>画布显示</h4>
              <div className="form-grid">
                <label>
                  坐标轴
                  <select value={showAxes ? 'on' : 'off'} onChange={(e) => setShowAxes(e.target.value === 'on')}>
                    <option value="on">显示</option>
                    <option value="off">隐藏</option>
                  </select>
                </label>

                <label>
                  网格
                  <select value={showGrid ? 'on' : 'off'} onChange={(e) => setShowGrid(e.target.value === 'on')}>
                    <option value="on">显示</option>
                    <option value="off">隐藏</option>
                  </select>
                </label>

                <label>
                  字体
                  <select value={uiFont} onChange={(e) => setUiFont(e.target.value)}>
                    <option value="Arial">Arial</option>
                    <option value="Times New Roman">Times New Roman</option>
                    <option value="Microsoft YaHei">Microsoft YaHei</option>
                    <option value="PingFang SC">PingFang SC</option>
                  </select>
                </label>

                <label>
                  字号（10-20）
                  <input
                    type="number"
                    min={10}
                    max={20}
                    value={uiFontSize}
                    onChange={(e) => setUiFontSize(Math.max(10, Math.min(20, Number(e.target.value) || 14)))}
                  />
                </label>
              </div>
            </div>

            <div className="settings-section">
              <h4>AI 对话</h4>
              <div className="form-grid">
                <label>
                  上下文记忆
                  <select value={contextMemory ? 'on' : 'off'} onChange={(e) => setContextMemory(e.target.value === 'on')}>
                    <option value="on">开启（推荐）</option>
                    <option value="off">关闭</option>
                  </select>
                </label>

                <label>
                  记忆轮数
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={maxHistory}
                    onChange={(e) => setMaxHistory(Math.max(1, Math.min(20, Number(e.target.value) || 1)))}
                  />
                </label>

                <label>
                  执行白名单
                  <select value={strictWhitelist ? 'on' : 'off'} onChange={(e) => setStrictWhitelist(e.target.value === 'on')}>
                    <option value="off">宽松模式（仅提示，不拦截）</option>
                    <option value="on">严格模式（拦截未知指令）</option>
                  </select>
                </label>
              </div>
            </div>

            <div className="settings-section">
              <h4>导出设置</h4>
              <div className="form-grid">
                <label>
                  默认格式
                  <select value={imageExportMode} onChange={(e) => setImageExportMode(e.target.value === 'clipboard' ? 'clipboard' : 'file')}>
                    <option value="file">PNG 图片</option>
                    <option value="clipboard">复制到剪切板</option>
                  </select>
                </label>

                <label>
                  导出缩放
                  <input
                    type="number"
                    min={1}
                    max={4}
                    value={exportScale}
                    onChange={(e) => setExportScale(Math.max(1, Math.min(4, Number(e.target.value) || 2)))}
                  />
                </label>
              </div>
            </div>

            <div className="settings-section">
              <h4>TikZ 导出设置</h4>
              <div className="form-grid">
                <label>
                  scale 缩放
                  <input
                    type="number"
                    min={0.2}
                    max={5}
                    step={0.1}
                    value={tikzScale}
                    onChange={(e) => setTikzScale(Math.max(0.2, Math.min(5, Number(e.target.value) || 1.2)))}
                  />
                </label>

                <label>
                  直线/射线延伸参数
                  <input
                    type="number"
                    min={0}
                    max={6}
                    step={0.05}
                    value={tikzLineExtend}
                    onChange={(e) => setTikzLineExtend(Math.max(0, Math.min(6, Number(e.target.value) || 0)))}
                  />
                </label>

                <label>
                  点半径（pt）
                  <input
                    type="number"
                    min={0.05}
                    max={3}
                    step={0.05}
                    value={tikzPointRadius}
                    onChange={(e) => setTikzPointRadius(Math.max(0.05, Math.min(3, Number(e.target.value) || 0.25)))}
                  />
                </label>

                <label>
                  多边形填充颜色
                  <input
                    value={tikzPolygonFill}
                    onChange={(e) => setTikzPolygonFill(e.target.value)}
                    placeholder="例如 black / blue!20 / none"
                  />
                </label>

                <label>
                  坐标轴线宽
                  <select value={tikzAxisThickness} onChange={(e) => setTikzAxisThickness(e.target.value)}>
                    {TIKZ_THICKNESS_OPTIONS.map((it) => (
                      <option key={it} value={it}>{it}</option>
                    ))}
                  </select>
                </label>

                <label>
                  圆锥曲线线宽
                  <select value={tikzConicThickness} onChange={(e) => setTikzConicThickness(e.target.value)}>
                    {TIKZ_THICKNESS_OPTIONS.map((it) => (
                      <option key={it} value={it}>{it}</option>
                    ))}
                  </select>
                </label>

                <label>
                  直线/射线线宽
                  <select value={tikzLineThickness} onChange={(e) => setTikzLineThickness(e.target.value)}>
                    {TIKZ_THICKNESS_OPTIONS.map((it) => (
                      <option key={it} value={it}>{it}</option>
                    ))}
                  </select>
                </label>

                <label>
                  线段线宽
                  <select value={tikzSegmentThickness} onChange={(e) => setTikzSegmentThickness(e.target.value)}>
                    {TIKZ_THICKNESS_OPTIONS.map((it) => (
                      <option key={it} value={it}>{it}</option>
                    ))}
                  </select>
                </label>

                <label>
                  多边形边线线宽
                  <select value={tikzPolygonThickness} onChange={(e) => setTikzPolygonThickness(e.target.value)}>
                    {TIKZ_THICKNESS_OPTIONS.map((it) => (
                      <option key={it} value={it}>{it}</option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="actions-row gap">
                <button
                  className="btn btn-lite"
                  onClick={() => {
                    setTikzScale(1.2);
                    setTikzLineExtend(0.25);
                    setTikzPointRadius(0.25);
                    setTikzPolygonFill('black');
                    setTikzAxisThickness('semithick');
                    setTikzConicThickness('thick');
                    setTikzLineThickness('semithick');
                    setTikzSegmentThickness('thick');
                    setTikzPolygonThickness('thick');
                    setStatus('TikZ 设置已恢复默认');
                  }}
                >
                  恢复 TikZ 默认
                </button>
              </div>
            </div>

            <div className="settings-section">
              <h4>BYOK 发布自查</h4>
              <div className="byok-checklist-head">
                <span className="status-chip">已完成 {byokDoneCount}/{BYOK_CHECK_ITEMS.length}</span>
                <span className={`status-chip ${byokDoneCount === BYOK_CHECK_ITEMS.length ? 'ok' : ''}`}>
                  {byokDoneCount === BYOK_CHECK_ITEMS.length ? '可发布（BYOK）' : '未完成，不建议发布'}
                </span>
              </div>
              <div className="byok-checklist">
                {BYOK_CHECK_ITEMS.map((item) => (
                  <label key={item.id} className={`byok-item ${byokChecklist[item.id] ? 'checked' : ''}`}>
                    <input
                      type="checkbox"
                      checked={!!byokChecklist[item.id]}
                      onChange={() => toggleByokItem(item.id)}
                    />
                    <span>{item.text}</span>
                  </label>
                ))}
              </div>
              <div className="actions-row gap wrap">
                <button className="btn btn-lite" onClick={markAllByokItems}>全部勾选</button>
                <button className="btn btn-lite" onClick={clearByokItems}>清空勾选</button>
              </div>
              <div className="prompt-preview">
                该清单只用于发布前自检，不会上传任何数据。
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {providerModalOpen ? (
        <div className="settings-modal-overlay" onClick={() => setProviderModalOpen(false)}>
          <div className="settings-modal provider-modal" onClick={(e) => e.stopPropagation()}>
            <div className="settings-modal-head">
              <strong>{providerModalMode === 'edit' ? '编辑自定义服务商' : '添加自定义服务商'}</strong>
              <button className="btn btn-lite" onClick={() => setProviderModalOpen(false)}>关闭</button>
            </div>
            <div className="form-grid">
              <label>
                服务商名称
                <input
                  value={customProviderDraft.name}
                  onChange={(e) => setCustomProviderDraft((p) => ({ ...p, name: e.target.value }))}
                  placeholder="例如：我的 API"
                />
              </label>
              <label>
                API 地址
                <input
                  value={customProviderDraft.baseUrl}
                  onChange={(e) => setCustomProviderDraft((p) => ({ ...p, baseUrl: e.target.value.trim() }))}
                  placeholder="https://api.example.com/v1"
                />
              </label>
              <label>
                模型接口
                <input
                  value={customProviderDraft.modelsEndpoint}
                  onChange={(e) => setCustomProviderDraft((p) => ({ ...p, modelsEndpoint: e.target.value.trim() }))}
                  placeholder="/models"
                />
              </label>
            </div>
            <div className="actions-row gap">
              <button className="btn btn-lite" onClick={() => setProviderModalOpen(false)}>取消</button>
              <button className="btn" onClick={saveCustomProvider}>保存</button>
            </div>
          </div>
        </div>
      ) : null}

      {promptEditorOpen ? (
        <div className="settings-modal-overlay" onClick={() => setPromptEditorOpen(false)}>
          <div className="settings-modal prompt-editor-modal" onClick={(e) => e.stopPropagation()}>
            <div className="settings-modal-head">
              <strong>{editingPromptId ? '编辑提示词' : '添加提示词'}</strong>
              <button className="btn btn-lite" onClick={() => setPromptEditorOpen(false)}>关闭</button>
            </div>

            <div className="form-grid">
              <label className="span-2">
                <input
                  value={promptDraftName}
                  onChange={(e) => setPromptDraftName(e.target.value)}
                  placeholder="提示词名称，例如：初中几何专用"
                />
              </label>
            </div>

            <div className="prompt-variables">
              <span className="hint-text">插入变量：</span>
              <button className="var-tag" onClick={() => insertPromptVariable('{{CURRENT_OBJECTS}}')}>{'{{CURRENT_OBJECTS}}'}</button>
              <button className="var-tag" onClick={() => insertPromptVariable('{{USER_INPUT}}')}>{'{{USER_INPUT}}'}</button>
            </div>

            <label className="block">
              <textarea
                ref={promptEditorRef}
                className="input-box prompt-editor-box"
                value={promptDraftContent}
                onChange={(e) => setPromptDraftContent(e.target.value)}
                placeholder="在此编辑提示词全文"
              />
            </label>

            <div className="actions-row gap">
              <button className="btn btn-lite" onClick={resetDefaultPrompt}>恢复默认</button>
              <button className="btn" onClick={savePromptConfig}>保存提示词</button>
              <span className="status-chip">长度 {String(promptDraftContent || '').length} 字符</span>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
