import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  getProviderMap,
  removeCustomProvider,
  upsertCustomProvider,
  isCustomProvider
} from '../lib/providers';
import {
  deleteCloudProviderKey,
  fetchCurrentUser,
  fetchModelsViaServer,
  getCloudProviderKeys,
  getCloudSettings,
  loginWithPassword,
  loginWithEmailCode,
  requestEmailLoginCode,
  requestWithFallback,
  requestWithFallbackStream,
  saveCloudProviderKey,
  saveCloudSettings,
  setMyPassword,
  updateMyProfile
} from '../lib/llm';
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
const STORAGE_3D_SHOW_AXES = 'ggb_3d_show_axes';
const STORAGE_3D_SHOW_GRID = 'ggb_3d_show_grid';
const STORAGE_3D_SHOW_PLANE = 'ggb_3d_show_plane';
const STORAGE_3D_AUTO_ROTATE = 'ggb_3d_auto_rotate';
const STORAGE_3D_SPIN_SPEED = 'ggb_3d_spin_speed';
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
const STORAGE_TIKZ_PREFIX = 'ggb_tikz_';
const STORAGE_TIKZ_FUNCTION_THICKNESS = 'ggb_tikz_function_thickness';
const STORAGE_TIKZ_SHOW_AXIS = 'ggb_tikz_show_axis';
const STORAGE_TIKZ_ANGLE_REGION = 'ggb_tikz_angle_region';
const TIKZ_SETTINGS_UPDATED_EVENT = 'ggb:tikz-settings-updated';
const STORAGE_PROMPT_CONFIGS = 'ggb_prompt_configs';
const STORAGE_ACTIVE_PROMPT = 'ggb_active_prompt';
const STORAGE_BYOK_CHECKLIST = 'ggb_byok_checklist_v1';
const STORAGE_CUSTOM_PROVIDERS = 'ggb_custom_providers';
const STORAGE_AUTH_TOKEN = 'ggb_auth_token';
const STORAGE_AUTH_USER = 'ggb_auth_user';
const TOAST_DURATION_MS = 1500;
const DEFAULT_PROMPT_PATH = withBase('prompts/default-prompt.txt');
const DEFAULT_PROMPT_FALLBACK = '你是 GeoGebra 指令生成器。只输出每行一条可执行命令，不要解释。\n画布对象：\n{{CURRENT_OBJECTS}}\n用户输入：\n{{USER_INPUT}}';
const BUILTIN_PROVIDER_ORDER = ['deepseek'];
const BUILTIN_PROVIDER_ICONS = {
  deepseek: '🟣'
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

const GGB_ALLOWED_COMMANDS_2D = new Set([
  'Point', 'Intersect', 'Segment', 'Line', 'Ray', 'Vector',
  'Polygon', 'RegularPolygon', 'RigidPolygon', 'VectorPolygon',
  'Circle', 'Incircle', 'Ellipse', 'Hyperbola', 'Parabola',
  'Tangent', 'OrthogonalLine', 'PerpendicularLine', 'PerpendicularBisector', 'AngularBisector',
  'Semicircle', 'CircleArc', 'CircleSector', 'CircumcircleArc', 'CircumcircleSector',
  'Midpoint', 'Center'
]);

const GGB_ALLOWED_COMMANDS_3D = new Set([
  ...GGB_ALLOWED_COMMANDS_2D,
  'PointIn', 'LineBisector', 'Plane', 'OrthogonalPlane', 'Prism',
  'Pyramid', 'Cube', 'Tetrahedron', 'Sphere', 'Cone', 'Cylinder',
  'Surface', 'Curve', 'IntersectPath', 'Circle3D', 'PlaneBisector'
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

function getAllowedCommandsByBoardType(boardType) {
  return boardType === '3d' ? GGB_ALLOWED_COMMANDS_3D : GGB_ALLOWED_COMMANDS_2D;
}

function validateCommandsAgainstWhitelist(lines, boardType = '2d') {
  const allowedCommands = getAllowedCommandsByBoardType(boardType);
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
    if (allowedCommands.has(name)) return;
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

function loadSavedAuthUser() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_AUTH_USER) || 'null');
    if (!raw || typeof raw !== 'object') return null;
    if (!raw.id) return null;
    return {
      id: String(raw.id),
      username: String(raw.username || ''),
      email: raw.email ? String(raw.email) : null
    };
  } catch {
    return null;
  }
}

function readStorageByPrefix(prefix) {
  const out = {};
  try {
    const p = String(prefix || '');
    if (!p) return out;
    const keys = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const k = localStorage.key(i);
      if (k && k.startsWith(p)) keys.push(k);
    }
    keys.sort().forEach((k) => {
      const v = localStorage.getItem(k);
      if (v !== null) out[k] = String(v);
    });
  } catch {
    return {};
  }
  return out;
}

function writeStorageByPrefix(prefix, record = {}) {
  try {
    const p = String(prefix || '');
    if (!p) return;
    const target = record && typeof record === 'object' ? record : {};
    const existing = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const k = localStorage.key(i);
      if (k && k.startsWith(p)) existing.push(k);
    }
    existing.forEach((k) => {
      if (!(k in target)) localStorage.removeItem(k);
    });
    Object.entries(target).forEach(([k, v]) => {
      if (!k.startsWith(p)) return;
      localStorage.setItem(k, String(v ?? ''));
    });
  } catch {
    // ignore localStorage write failure
  }
}

function readTikzSettingsFromStorage() {
  const lineExtendRaw = Number(localStorage.getItem(STORAGE_TIKZ_LINE_EXTEND) || 0.25);
  const pointRadiusRaw = Number(localStorage.getItem(STORAGE_TIKZ_POINT_RADIUS) || 0.25);
  const polygonFillRaw = String(localStorage.getItem(STORAGE_TIKZ_POLYGON_FILL) || 'black').trim() || 'black';
  const axisThicknessRaw = String(localStorage.getItem(STORAGE_TIKZ_AXIS_THICKNESS) || 'semithick').trim();
  const conicThicknessRaw = String(localStorage.getItem(STORAGE_TIKZ_CONIC_THICKNESS) || 'thick').trim();
  const lineThicknessRaw = String(localStorage.getItem(STORAGE_TIKZ_LINE_THICKNESS) || 'semithick').trim();
  const segmentThicknessRaw = String(localStorage.getItem(STORAGE_TIKZ_SEGMENT_THICKNESS) || 'thick').trim();
  const polygonThicknessRaw = String(localStorage.getItem(STORAGE_TIKZ_POLYGON_THICKNESS) || 'thick').trim();

  const safeThickness = (value, fallback) => (TIKZ_THICKNESS_OPTIONS.includes(value) ? value : fallback);

  return {
    lineExtend: Number.isFinite(lineExtendRaw) ? Math.max(0, Math.min(6, lineExtendRaw)) : 0.25,
    pointRadius: Number.isFinite(pointRadiusRaw) ? Math.max(0.05, Math.min(3, pointRadiusRaw)) : 0.25,
    polygonFill: polygonFillRaw || 'black',
    axisThickness: safeThickness(axisThicknessRaw, 'semithick'),
    conicThickness: safeThickness(conicThicknessRaw, 'thick'),
    lineThickness: safeThickness(lineThicknessRaw, 'semithick'),
    segmentThickness: safeThickness(segmentThicknessRaw, 'thick'),
    polygonThickness: safeThickness(polygonThicknessRaw, 'thick')
  };
}

function sortObjectByKey(input) {
  const src = input && typeof input === 'object' ? input : {};
  const out = {};
  Object.keys(src).sort().forEach((k) => {
    out[k] = src[k];
  });
  return out;
}

function normalizeSpinSpeed(value, fallback = 2) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(-10, Math.min(10, n));
}

function makeSettingsSnapshot({
  providerKey,
  model,
  contextMemory,
  maxHistory,
  showAxes,
  showGrid,
  showAxes3d,
  showGrid3d,
  showPlane3d,
  autoRotate3d,
  spinSpeed3d,
  strictWhitelist,
  uiFont,
  uiFontSize,
  imageExportMode,
  exportScale,
  tikzScale,
  tikzLineExtend,
  tikzPointRadius,
  tikzPolygonFill,
  tikzAxisThickness,
  tikzConicThickness,
  tikzLineThickness,
  tikzSegmentThickness,
  tikzPolygonThickness,
  tikzStorage,
  promptConfigs,
  activePromptId,
  byokChecklist
}) {
  return {
    providerKey,
    model,
    contextMemory: !!contextMemory,
    maxHistory: Number(maxHistory || 10),
    showAxes: !!showAxes,
    showGrid: !!showGrid,
    showAxes3d: !!showAxes3d,
    showGrid3d: !!showGrid3d,
    showPlane3d: !!showPlane3d,
    autoRotate3d: !!autoRotate3d,
    spinSpeed3d: normalizeSpinSpeed(spinSpeed3d, 2),
    strictWhitelist: !!strictWhitelist,
    uiFont: String(uiFont || 'Arial'),
    uiFontSize: Number(uiFontSize || 14),
    imageExportMode: imageExportMode === 'clipboard' ? 'clipboard' : 'file',
    exportScale: Number(exportScale || 2),
    tikzScale: Number(tikzScale || 1.2),
    tikzLineExtend: Number(tikzLineExtend || 0.25),
    tikzPointRadius: Number(tikzPointRadius || 0.25),
    tikzPolygonFill: String(tikzPolygonFill || 'black'),
    tikzAxisThickness: String(tikzAxisThickness || 'semithick'),
    tikzConicThickness: String(tikzConicThickness || 'thick'),
    tikzLineThickness: String(tikzLineThickness || 'semithick'),
    tikzSegmentThickness: String(tikzSegmentThickness || 'thick'),
    tikzPolygonThickness: String(tikzPolygonThickness || 'thick'),
    tikzStorage: sortObjectByKey(
      tikzStorage && typeof tikzStorage === 'object'
        ? tikzStorage
        : readStorageByPrefix(STORAGE_TIKZ_PREFIX)
    ),
    promptConfigs: (promptConfigs || []).filter((x) => x && x.id).map((x) => ({
      id: String(x.id),
      name: String(x.name || ''),
      content: String(x.content || ''),
      builtin: !!x.builtin
    })),
    activePromptId: String(activePromptId || 'default'),
    byokChecklist: byokChecklist || {},
    customProvidersRaw: localStorage.getItem(STORAGE_CUSTOM_PROVIDERS) || '{}'
  };
}

function parseJsonSafe(text, fallback = {}) {
  try {
    const val = JSON.parse(String(text || ''));
    return val && typeof val === 'object' ? val : fallback;
  } catch {
    return fallback;
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

function runEvalSilently(api, command) {
  if (!api || typeof api.evalCommand !== 'function') return false;
  try {
    return api.evalCommand(command) !== false;
  } catch {
    return false;
  }
}

function clearBoardObjects(api) {
  if (!api) return { ok: false, deleted: 0, total: 0, fallback: '' };
  let names = [];
  try {
    if (typeof api.getAllObjectNames === 'function') {
      const arr = api.getAllObjectNames();
      names = Array.isArray(arr) ? arr : [];
    }
  } catch {
    names = [];
  }

  const keep = new Set(['xAxis', 'yAxis', 'zAxis', 'xOyPlane']);
  let deleted = 0;
  names.forEach((nameRaw) => {
    const name = String(nameRaw || '').trim();
    if (!name || keep.has(name)) return;
    try {
      if (typeof api.deleteObject === 'function') {
        const ret = api.deleteObject(name);
        if (ret !== false) {
          deleted += 1;
          return;
        }
      }
    } catch {
      // continue fallback
    }
    if (runEvalSilently(api, `Delete(${name})`)) {
      deleted += 1;
    }
  });

  if (deleted > 0 || names.length === 0) {
    return { ok: true, deleted, total: names.length, fallback: '' };
  }

  if (typeof api.reset === 'function') {
    try {
      api.reset();
      return { ok: true, deleted: 0, total: names.length, fallback: 'reset' };
    } catch {
      // ignore
    }
  }

  return { ok: false, deleted: 0, total: names.length, fallback: '' };
}

function apply3DDisplayPreferences(api, {
  showAxes = true,
  showGrid = false,
  showPlane = true,
  autoRotate = false,
  spinSpeed = 2,
  hardStopSpin = false
} = {}) {
  if (!api) return;
  const shouldKeepPlaneObject = !!showPlane || !!showGrid;
  try {
    if (typeof api.setAxesVisible === 'function') {
      if (api.setAxesVisible.length >= 4) {
        api.setAxesVisible(3, showAxes, showAxes, showAxes);
      } else {
        api.setAxesVisible(showAxes, showAxes);
      }
    }
    if (typeof api.setAxisVisible === 'function') {
      api.setAxisVisible(1, showAxes);
      api.setAxisVisible(2, showAxes);
      api.setAxisVisible(3, showAxes);
    }
  } catch {
    // ignore API differences
  }
  try {
    if (typeof api.setVisible === 'function') {
      api.setVisible('xAxis', showAxes);
      api.setVisible('yAxis', showAxes);
      api.setVisible('zAxis', showAxes);
      // 为了支持“底面隐藏但网格显示”，需要在网格开启时保持平面对象可见
      api.setVisible('xOyPlane', shouldKeepPlaneObject);
    }
  } catch {
    // ignore API differences
  }
  try {
    if (typeof api.setFilling === 'function') {
      // 用填充透明度表示“底面显示/隐藏”，不影响网格本身
      api.setFilling('xOyPlane', showPlane ? 0.2 : 0);
    }
  } catch {
    // ignore API differences
  }
  try {
    if (typeof api.setGridVisible === 'function') {
      if (api.setGridVisible.length >= 2) {
        api.setGridVisible(3, !!showGrid);
      } else {
        api.setGridVisible(!!showGrid);
      }
    }
  } catch {
    // ignore API differences
  }
  const normalizedSpeedRaw = Number(spinSpeed);
  const normalizedSpeedBase = Number.isFinite(normalizedSpeedRaw) ? normalizedSpeedRaw : 2;
  const normalizedSpeed = Math.max(-10, Math.min(10, normalizedSpeedBase));
  const effectiveSpeed = autoRotate
    ? (Math.abs(normalizedSpeed) <= 1 ? (normalizedSpeed < 0 ? -2 : 2) : normalizedSpeed)
    : 0;
  const spinLiteral = Number(effectiveSpeed.toFixed(2));
  runEvalSilently(api, `SetSpinSpeed(${spinLiteral})`);
  if (!autoRotate && hardStopSpin) {
    if (typeof api.stopAnimation === 'function') {
      try {
        api.stopAnimation();
      } catch {
        // ignore API differences
      }
    }
    // 双保险：在下一帧再写一次 0，避免交互后回弹
    if (typeof window !== 'undefined') {
      window.setTimeout(() => {
        runEvalSilently(api, 'SetSpinSpeed(0)');
      }, 80);
    }
  }
}

export default function CommandPanel({ ggbApi, ggbReady, boardType = '2d' }) {
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
  const [providerKey, setProviderKey] = useState(() => localStorage.getItem(STORAGE_PROVIDER) || 'deepseek');
  const provider = useMemo(() => providerMap[providerKey] || providerMap.deepseek, [providerKey, providerMap]);

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
  const [showAxes3d, setShowAxes3d] = useState(() => (localStorage.getItem(STORAGE_3D_SHOW_AXES) || 'on') === 'on');
  const [showGrid3d, setShowGrid3d] = useState(() => (localStorage.getItem(STORAGE_3D_SHOW_GRID) || 'on') === 'on');
  const [showPlane3d, setShowPlane3d] = useState(() => (localStorage.getItem(STORAGE_3D_SHOW_PLANE) || 'on') === 'on');
  const [autoRotate3d, setAutoRotate3d] = useState(() => (localStorage.getItem(STORAGE_3D_AUTO_ROTATE) || 'off') === 'on');
  const [spinSpeed3d, setSpinSpeed3d] = useState(() => normalizeSpinSpeed(localStorage.getItem(STORAGE_3D_SPIN_SPEED), 2));
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

  const [status, setStatusRaw] = useState('');
  const [statusTick, setStatusTick] = useState(0);
  const [toastItems, setToastItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [streamPhase, setStreamPhase] = useState('idle');
  const [streamPreview, setStreamPreview] = useState('');
  const [streamVia, setStreamVia] = useState('');
  const [streamElapsedSec, setStreamElapsedSec] = useState(0);
  const [conversationHistory, setConversationHistory] = useState([]);
  const [chatMessages, setChatMessages] = useState([]);

  const [commandEditor, setCommandEditor] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [authToken, setAuthToken] = useState(() => localStorage.getItem(STORAGE_AUTH_TOKEN) || '');
  const [authUser, setAuthUser] = useState(() => loadSavedAuthUser());
  const [showPasswordLogin, setShowPasswordLogin] = useState(false);
  const [authLoginInput, setAuthLoginInput] = useState('');
  const [authPasswordInput, setAuthPasswordInput] = useState('');
  const [showAuthPassword, setShowAuthPassword] = useState(false);
  const [profileUsernameInput, setProfileUsernameInput] = useState('');
  const [profilePasswordInput, setProfilePasswordInput] = useState('');
  const [profileCurrentPasswordInput, setProfileCurrentPasswordInput] = useState('');
  const [showProfilePassword, setShowProfilePassword] = useState(false);
  const [showProfileCurrentPassword, setShowProfileCurrentPassword] = useState(false);
  const [tikzStorageVersion, setTikzStorageVersion] = useState(0);
  const [cloudSyncBusy, setCloudSyncBusy] = useState(false);
  const [cloudStoredApiKeys, setCloudStoredApiKeys] = useState([]);
  const [emailLoginInput, setEmailLoginInput] = useState('');
  const [emailCodeInput, setEmailCodeInput] = useState('');
  const [emailUsernameInput, setEmailUsernameInput] = useState('');
  const [emailCodeBusy, setEmailCodeBusy] = useState(false);
  const [emailCooldownSec, setEmailCooldownSec] = useState(0);

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
  const cloudReadyRef = useRef(false);
  const lastAutoSavedCloudSettingsRef = useRef('');
  const toastSeqRef = useRef(1);
  const toastTimerRef = useRef(new Map());
  const streamAbortRef = useRef(null);
  const streamStartedAtRef = useRef(0);
  const streamTextRef = useRef('');
  const setStatus = useCallback((nextStatus) => {
    setStatusRaw(String(nextStatus || ''));
    setStatusTick((v) => v + 1);
  }, []);
  const pushToast = useCallback((message) => {
    const text = String(message || '').trim();
    if (!text) return;
    const id = `cp_${Date.now()}_${toastSeqRef.current++}`;
    setToastItems((prev) => [...prev, { id, text }]);
    const timer = window.setTimeout(() => {
      setToastItems((prev) => prev.filter((item) => item.id !== id));
      toastTimerRef.current.delete(id);
    }, TOAST_DURATION_MS);
    toastTimerRef.current.set(id, timer);
  }, []);
  const syncTikzStateFromStorage = useCallback(() => {
    const next = readTikzSettingsFromStorage();
    setTikzLineExtend(next.lineExtend);
    setTikzPointRadius(next.pointRadius);
    setTikzPolygonFill(next.polygonFill);
    setTikzAxisThickness(next.axisThickness);
    setTikzConicThickness(next.conicThickness);
    setTikzLineThickness(next.lineThickness);
    setTikzSegmentThickness(next.segmentThickness);
    setTikzPolygonThickness(next.polygonThickness);
  }, []);
  const streamPhaseText = useMemo(() => {
    if (streamPhase === 'sending') return '已发送';
    if (streamPhase === 'connected') return '模型思考中';
    if (streamPhase === 'generating') return '正在生成';
    if (streamPhase === 'fallback') return '切换备用通道';
    if (streamPhase === 'stopped') return '已停止';
    return '准备就绪';
  }, [streamPhase]);

  const rememberAuth = (token, user) => {
    const nextToken = String(token || '').trim();
    setAuthToken(nextToken);
    if (nextToken) {
      localStorage.setItem(STORAGE_AUTH_TOKEN, nextToken);
    } else {
      localStorage.removeItem(STORAGE_AUTH_TOKEN);
    }

    const nextUser = user && user.id ? {
      id: String(user.id),
      username: String(user.username || ''),
      email: user.email ? String(user.email) : null
    } : null;
    setAuthUser(nextUser);
    if (nextUser) {
      localStorage.setItem(STORAGE_AUTH_USER, JSON.stringify(nextUser));
      setProfileUsernameInput(nextUser.username || '');
    } else {
      localStorage.removeItem(STORAGE_AUTH_USER);
      setCloudStoredApiKeys([]);
      setProfileUsernameInput('');
      cloudReadyRef.current = false;
      lastAutoSavedCloudSettingsRef.current = '';
    }
  };

  const applyCloudSettings = (settings) => {
    const s = settings && typeof settings === 'object' ? settings : {};
    if (typeof s.providerKey === 'string' && s.providerKey.trim()) setProviderKey(s.providerKey.trim());
    if (typeof s.model === 'string') setModel(s.model);
    if (typeof s.contextMemory === 'boolean') setContextMemory(s.contextMemory);
    if (Number.isFinite(Number(s.maxHistory))) setMaxHistory(Math.max(1, Math.min(20, Number(s.maxHistory))));
    if (typeof s.showAxes === 'boolean') setShowAxes(s.showAxes);
    if (typeof s.showGrid === 'boolean') setShowGrid(s.showGrid);
    if (typeof s.showAxes3d === 'boolean') setShowAxes3d(s.showAxes3d);
    if (typeof s.showGrid3d === 'boolean') setShowGrid3d(s.showGrid3d);
    if (typeof s.showPlane3d === 'boolean') setShowPlane3d(s.showPlane3d);
    if (typeof s.autoRotate3d === 'boolean') setAutoRotate3d(s.autoRotate3d);
    if (Number.isFinite(Number(s.spinSpeed3d))) setSpinSpeed3d(normalizeSpinSpeed(s.spinSpeed3d, 2));
    if (typeof s.strictWhitelist === 'boolean') setStrictWhitelist(s.strictWhitelist);
    if (typeof s.uiFont === 'string' && s.uiFont.trim()) setUiFont(s.uiFont.trim());
    if (Number.isFinite(Number(s.uiFontSize))) setUiFontSize(Math.max(10, Math.min(20, Number(s.uiFontSize))));
    if (typeof s.imageExportMode === 'string') setImageExportMode(s.imageExportMode === 'clipboard' ? 'clipboard' : 'file');
    if (Number.isFinite(Number(s.exportScale))) setExportScale(Math.max(1, Math.min(4, Number(s.exportScale))));
    if (Number.isFinite(Number(s.tikzScale))) setTikzScale(Math.max(0.2, Math.min(5, Number(s.tikzScale))));
    if (Number.isFinite(Number(s.tikzLineExtend))) setTikzLineExtend(Math.max(0, Math.min(6, Number(s.tikzLineExtend))));
    if (Number.isFinite(Number(s.tikzPointRadius))) setTikzPointRadius(Math.max(0.05, Math.min(3, Number(s.tikzPointRadius))));
    if (typeof s.tikzPolygonFill === 'string' && s.tikzPolygonFill.trim()) setTikzPolygonFill(s.tikzPolygonFill.trim());
    if (typeof s.tikzAxisThickness === 'string') setTikzAxisThickness(s.tikzAxisThickness);
    if (typeof s.tikzConicThickness === 'string') setTikzConicThickness(s.tikzConicThickness);
    if (typeof s.tikzLineThickness === 'string') setTikzLineThickness(s.tikzLineThickness);
    if (typeof s.tikzSegmentThickness === 'string') setTikzSegmentThickness(s.tikzSegmentThickness);
    if (typeof s.tikzPolygonThickness === 'string') setTikzPolygonThickness(s.tikzPolygonThickness);

    if (Array.isArray(s.promptConfigs)) {
      setPromptConfigs(ensurePromptConfigs(s.promptConfigs, defaultPromptText));
    }
    if (typeof s.activePromptId === 'string' && s.activePromptId) {
      setActivePromptId(s.activePromptId);
    }
    if (s.byokChecklist && typeof s.byokChecklist === 'object') {
      setByokChecklist(s.byokChecklist);
    }

    if (typeof s.customProvidersRaw === 'string') {
      const parsed = parseJsonSafe(s.customProvidersRaw, {});
      localStorage.setItem(STORAGE_CUSTOM_PROVIDERS, JSON.stringify(parsed));
      setProviderMap(getProviderMap());
    }

    if (s.tikzStorage && typeof s.tikzStorage === 'object') {
      writeStorageByPrefix(STORAGE_TIKZ_PREFIX, s.tikzStorage);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent(TIKZ_SETTINGS_UPDATED_EVENT, { detail: { source: 'cloud' } }));
      }
    }
  };

  const pullCloudSettings = async (token = authToken) => {
    const t = String(token || '').trim();
    if (!t) return;
    setCloudSyncBusy(true);
    try {
      const [settingsData, keyData] = await Promise.all([
        getCloudSettings({ authToken: t }),
        getCloudProviderKeys({ authToken: t })
      ]);

      const normalizedSettings = {
        ...(settingsData?.settings && typeof settingsData.settings === 'object' ? settingsData.settings : {})
      };
      if (normalizedSettings.tikzStorage && typeof normalizedSettings.tikzStorage === 'object') {
        normalizedSettings.tikzStorage = sortObjectByKey(normalizedSettings.tikzStorage);
      }

      applyCloudSettings(normalizedSettings);
      lastAutoSavedCloudSettingsRef.current = JSON.stringify(normalizedSettings);
      cloudReadyRef.current = true;

      const cloudApiKeys = Array.isArray(keyData?.apiKeys) ? keyData.apiKeys : [];
      setCloudStoredApiKeys(cloudApiKeys.map((x) => ({
        providerKey: x.providerKey,
        updatedAt: x.updatedAt
      })));
      setStatus('已从云端拉取设置（密钥仅服务端使用，不回显到浏览器）');
    } catch (error) {
      cloudReadyRef.current = false;
      setStatus(`拉取云端设置失败：${error.message}`);
    } finally {
      setCloudSyncBusy(false);
    }
  };

  const pushCloudSettings = async (token = authToken) => {
    const t = String(token || '').trim();
    if (!t) {
      setStatus('请先登录后再同步设置');
      return;
    }
    setCloudSyncBusy(true);
    try {
      await saveCloudSettings({
        authToken: t,
        settings: currentSettingsSnapshot
      });
      lastAutoSavedCloudSettingsRef.current = JSON.stringify(currentSettingsSnapshot);
      setStatus('已保存到云端');
    } catch (error) {
      setStatus(`云端保存失败：${error.message}`);
    } finally {
      setCloudSyncBusy(false);
    }
  };

  const saveCurrentProviderKeyToCloud = async () => {
    const t = String(authToken || '').trim();
    if (!t) {
      setStatus('请先登录后再保存云端密钥');
      return;
    }
    if (!providerKey || !apiKey) {
      setStatus('请先选择服务商并填写 API Key');
      return;
    }
    try {
      await saveCloudProviderKey({
        authToken: t,
        providerKey,
        apiKey
      });
      await pullCloudSettings(t);
      setStatus(`已保存 ${providerKey} 密钥到云端`);
    } catch (error) {
      setStatus(`保存云端密钥失败：${error.message}`);
    }
  };

  const removeCurrentProviderKeyFromCloud = async () => {
    const t = String(authToken || '').trim();
    if (!t) {
      setStatus('请先登录后再操作');
      return;
    }
    if (!providerKey) {
      setStatus('请先选择服务商');
      return;
    }
    try {
      await deleteCloudProviderKey({
        authToken: t,
        providerKey
      });
      await pullCloudSettings(t);
      setStatus(`已删除 ${providerKey} 云端密钥`);
    } catch (error) {
      setStatus(`删除云端密钥失败：${error.message}`);
    }
  };

  const loginByPassword = async () => {
    const login = String(authLoginInput || '').trim();
    const password = String(authPasswordInput || '');
    if (!login || !password) {
      setStatus('请输入账号和密码');
      return;
    }
    try {
      const data = await loginWithPassword({ login, password });
      rememberAuth(data?.accessToken || '', data?.user || null);
      setAuthPasswordInput('');
      await pullCloudSettings(data?.accessToken || '');
      setStatus(`登录成功：${data?.user?.username || ''}`);
    } catch (error) {
      setStatus(`登录失败：${error.message}`);
    }
  };

  const requestEmailCode = async () => {
    const email = String(emailLoginInput || '').trim();
    if (!email) {
      setStatus('请输入邮箱');
      return;
    }
    setEmailCodeBusy(true);
    try {
      const data = await requestEmailLoginCode({ email });
      const devCode = data?.debugCode ? `（开发验证码：${data.debugCode}）` : '';
      const cooldown = Math.max(0, Number(data?.nextRequestInSec || 0));
      if (cooldown > 0) setEmailCooldownSec(cooldown);
      setStatus(`验证码已发送${devCode}，请留意收件箱/垃圾箱（1-3 分钟内）`);
    } catch (error) {
      if (error.code === 'EMAIL_CODE_TOO_FREQUENT') {
        const waitSec = Math.max(0, Number(error.waitSec || 0));
        if (waitSec > 0) setEmailCooldownSec(waitSec);
      }
      setStatus(`发送验证码失败：${error.message}`);
    } finally {
      setEmailCodeBusy(false);
    }
  };

  const loginByEmailCode = async () => {
    const email = String(emailLoginInput || '').trim();
    const code = String(emailCodeInput || '').trim();
    const username = String(emailUsernameInput || '').trim();
    if (!email || !code) {
      setStatus('请输入邮箱和验证码');
      return;
    }
    try {
      const data = await loginWithEmailCode({ email, code, username });
      rememberAuth(data?.accessToken || '', data?.user || null);
      setEmailCodeInput('');
      await pullCloudSettings(data?.accessToken || '');
      if (data?.needSetPassword) {
        setStatus(`登录成功：${data?.user?.username || ''}，建议设置密码用于下次账号登录`);
      } else {
        setStatus(`登录成功：${data?.user?.username || ''}`);
      }
    } catch (error) {
      setStatus(`邮箱验证码登录失败：${error.message}`);
    }
  };

  const logoutAuth = () => {
    rememberAuth('', null);
    setStatus('已退出登录');
  };

  const updateMyUsername = async () => {
    const token = String(authToken || '').trim();
    const username = String(profileUsernameInput || '').trim();
    if (!token) {
      setStatus('请先登录');
      return;
    }
    if (!username) {
      setStatus('用户名不能为空');
      return;
    }
    try {
      const data = await updateMyProfile({ authToken: token, username });
      rememberAuth(token, data?.user || authUser);
      setStatus('用户名已更新');
    } catch (error) {
      setStatus(`更新用户名失败：${error.message}`);
    }
  };

  const updateMyPassword = async () => {
    const token = String(authToken || '').trim();
    const password = String(profilePasswordInput || '');
    const currentPassword = String(profileCurrentPasswordInput || '');
    if (!token) {
      setStatus('请先登录');
      return;
    }
    if (!password) {
      setStatus('新密码不能为空');
      return;
    }
    try {
      await setMyPassword({
        authToken: token,
        password,
        currentPassword
      });
      setProfilePasswordInput('');
      setProfileCurrentPasswordInput('');
      setStatus('密码已更新');
    } catch (error) {
      setStatus(`更新密码失败：${error.message}`);
    }
  };

  const tikzStorageSnapshot = useMemo(() => {
    const record = readStorageByPrefix(STORAGE_TIKZ_PREFIX);
    if (!(STORAGE_TIKZ_LINE_EXTEND in record)) {
      record[STORAGE_TIKZ_LINE_EXTEND] = String(Math.max(0, Math.min(6, Number(tikzLineExtend) || 0.25)));
    }
    if (!(STORAGE_TIKZ_POINT_RADIUS in record)) {
      record[STORAGE_TIKZ_POINT_RADIUS] = String(Math.max(0.05, Math.min(3, Number(tikzPointRadius) || 0.25)));
    }
    if (!(STORAGE_TIKZ_POLYGON_FILL in record)) {
      record[STORAGE_TIKZ_POLYGON_FILL] = String(tikzPolygonFill || 'black').trim() || 'black';
    }
    if (!(STORAGE_TIKZ_AXIS_THICKNESS in record)) {
      record[STORAGE_TIKZ_AXIS_THICKNESS] = TIKZ_THICKNESS_OPTIONS.includes(tikzAxisThickness) ? tikzAxisThickness : 'semithick';
    }
    if (!(STORAGE_TIKZ_CONIC_THICKNESS in record)) {
      record[STORAGE_TIKZ_CONIC_THICKNESS] = TIKZ_THICKNESS_OPTIONS.includes(tikzConicThickness) ? tikzConicThickness : 'thick';
    }
    if (!(STORAGE_TIKZ_LINE_THICKNESS in record)) {
      record[STORAGE_TIKZ_LINE_THICKNESS] = TIKZ_THICKNESS_OPTIONS.includes(tikzLineThickness) ? tikzLineThickness : 'semithick';
    }
    if (!(STORAGE_TIKZ_SEGMENT_THICKNESS in record)) {
      record[STORAGE_TIKZ_SEGMENT_THICKNESS] = TIKZ_THICKNESS_OPTIONS.includes(tikzSegmentThickness) ? tikzSegmentThickness : 'thick';
    }
    if (!(STORAGE_TIKZ_POLYGON_THICKNESS in record)) {
      record[STORAGE_TIKZ_POLYGON_THICKNESS] = TIKZ_THICKNESS_OPTIONS.includes(tikzPolygonThickness) ? tikzPolygonThickness : 'thick';
    }
    if (!(STORAGE_TIKZ_FUNCTION_THICKNESS in record)) record[STORAGE_TIKZ_FUNCTION_THICKNESS] = 'thick';
    if (!(STORAGE_TIKZ_SHOW_AXIS in record)) record[STORAGE_TIKZ_SHOW_AXIS] = 'on';
    if (!(STORAGE_TIKZ_ANGLE_REGION in record)) record[STORAGE_TIKZ_ANGLE_REGION] = 'auto';
    return sortObjectByKey(record);
  }, [
    tikzStorageVersion,
    tikzLineExtend,
    tikzPointRadius,
    tikzPolygonFill,
    tikzAxisThickness,
    tikzConicThickness,
    tikzLineThickness,
    tikzSegmentThickness,
    tikzPolygonThickness
  ]);

  const currentSettingsSnapshot = useMemo(() => makeSettingsSnapshot({
    providerKey,
    model,
    contextMemory,
    maxHistory,
    showAxes,
    showGrid,
    showAxes3d,
    showGrid3d,
    showPlane3d,
    autoRotate3d,
    spinSpeed3d,
    strictWhitelist,
    uiFont,
    uiFontSize,
    imageExportMode,
    exportScale,
    tikzScale,
    tikzLineExtend,
    tikzPointRadius,
    tikzPolygonFill,
    tikzAxisThickness,
    tikzConicThickness,
    tikzLineThickness,
    tikzSegmentThickness,
    tikzPolygonThickness,
    tikzStorage: tikzStorageSnapshot,
    promptConfigs,
    activePromptId,
    byokChecklist
  }), [
    providerKey,
    model,
    contextMemory,
    maxHistory,
    showAxes,
    showGrid,
    showAxes3d,
    showGrid3d,
    showPlane3d,
    autoRotate3d,
    spinSpeed3d,
    strictWhitelist,
    uiFont,
    uiFontSize,
    imageExportMode,
    exportScale,
    tikzScale,
    tikzLineExtend,
    tikzPointRadius,
    tikzPolygonFill,
    tikzAxisThickness,
    tikzConicThickness,
    tikzLineThickness,
    tikzSegmentThickness,
    tikzPolygonThickness,
    tikzStorageSnapshot,
    promptConfigs,
    activePromptId,
    byokChecklist
  ]);

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
      setProviderKey('deepseek');
    }
  }, [providerMap, providerKey]);

  useEffect(() => {
    const token = String(authToken || '').trim();
    if (!token) return;
    fetchCurrentUser({ authToken: token })
      .then((data) => {
        if (data?.user?.id) {
          rememberAuth(token, data.user);
          return pullCloudSettings(token);
        }
        rememberAuth('', null);
      })
      .catch(() => {
        rememberAuth('', null);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onTikzSettingsUpdated = () => {
      syncTikzStateFromStorage();
      setTikzStorageVersion((v) => v + 1);
    };
    if (typeof window !== 'undefined') {
      window.addEventListener(TIKZ_SETTINGS_UPDATED_EVENT, onTikzSettingsUpdated);
    }
    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener(TIKZ_SETTINGS_UPDATED_EVENT, onTikzSettingsUpdated);
      }
    };
  }, [syncTikzStateFromStorage]);

  useEffect(() => {
    const token = String(authToken || '').trim();
    const userId = String(authUser?.id || '').trim();
    if (!token || !userId) return;
    if (!cloudReadyRef.current) return;
    if (cloudSyncBusy) return;

    const nextSnapshot = JSON.stringify(currentSettingsSnapshot);
    if (!nextSnapshot || nextSnapshot === lastAutoSavedCloudSettingsRef.current) return;

    const timer = setTimeout(() => {
      saveCloudSettings({
        authToken: token,
        settings: currentSettingsSnapshot
      })
        .then(() => {
          lastAutoSavedCloudSettingsRef.current = nextSnapshot;
        })
        .catch(() => {
          // keep local edits; user can still manually click "保存到云端"
        });
    }, 900);

    return () => clearTimeout(timer);
  }, [authToken, authUser?.id, cloudSyncBusy, currentSettingsSnapshot]);

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
    localStorage.setItem(STORAGE_3D_SHOW_AXES, showAxes3d ? 'on' : 'off');
  }, [showAxes3d]);

  useEffect(() => {
    localStorage.setItem(STORAGE_3D_SHOW_GRID, showGrid3d ? 'on' : 'off');
  }, [showGrid3d]);

  useEffect(() => {
    localStorage.setItem(STORAGE_3D_SHOW_PLANE, showPlane3d ? 'on' : 'off');
  }, [showPlane3d]);

  useEffect(() => {
    localStorage.setItem(STORAGE_3D_AUTO_ROTATE, autoRotate3d ? 'on' : 'off');
  }, [autoRotate3d]);

  useEffect(() => {
    localStorage.setItem(STORAGE_3D_SPIN_SPEED, String(normalizeSpinSpeed(spinSpeed3d, 2)));
  }, [spinSpeed3d]);

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
      if (boardType === '3d') {
        apply3DDisplayPreferences(ggbApi, {
          showAxes: showAxes3d,
          showGrid: showGrid3d,
          showPlane: showPlane3d,
          autoRotate: autoRotate3d,
          spinSpeed: spinSpeed3d,
          hardStopSpin: !autoRotate3d
        });
        return;
      }
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
  }, [ggbReady, ggbApi, boardType, showAxes, showGrid, showAxes3d, showGrid3d, showPlane3d, autoRotate3d, spinSpeed3d]);

  useEffect(() => {
    if (!ggbReady || !ggbApi || boardType !== '3d' || autoRotate3d) return undefined;
    const stopSpin = () => {
      apply3DDisplayPreferences(ggbApi, {
        showAxes: showAxes3d,
        showGrid: showGrid3d,
        showPlane: showPlane3d,
        autoRotate: false,
        spinSpeed: 0,
        hardStopSpin: true
      });
    };
    const timer = window.setInterval(stopSpin, 900);
    stopSpin();
    window.addEventListener('mouseup', stopSpin, true);
    window.addEventListener('touchend', stopSpin, true);
    window.addEventListener('keyup', stopSpin, true);
    return () => {
      clearInterval(timer);
      window.removeEventListener('mouseup', stopSpin, true);
      window.removeEventListener('touchend', stopSpin, true);
      window.removeEventListener('keyup', stopSpin, true);
    };
  }, [ggbReady, ggbApi, boardType, autoRotate3d, showAxes3d, showGrid3d, showPlane3d]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, streamPreview, loading]);

  useEffect(() => {
    if (emailCooldownSec <= 0) return;
    const timer = setTimeout(() => {
      setEmailCooldownSec((v) => Math.max(0, v - 1));
    }, 1000);
    return () => clearTimeout(timer);
  }, [emailCooldownSec]);

  useEffect(() => {
    if (!status) return;
    pushToast(status);
  }, [status, statusTick, pushToast]);

  useEffect(() => {
    if (!loading) {
      setStreamElapsedSec(0);
      return;
    }
    const timer = setInterval(() => {
      const startedAt = Number(streamStartedAtRef.current || 0);
      if (!startedAt) return;
      setStreamElapsedSec(Math.max(0, (Date.now() - startedAt) / 1000));
    }, 180);
    return () => clearInterval(timer);
  }, [loading]);

  useEffect(() => {
    return () => {
      toastTimerRef.current.forEach((timer) => clearTimeout(timer));
      toastTimerRef.current.clear();
      if (streamAbortRef.current) {
        streamAbortRef.current.abort();
        streamAbortRef.current = null;
      }
    };
  }, []);

  const saveKey = (value) => {
    const keysMap = getSavedKeysMap();
    keysMap[providerKey] = value;
    localStorage.setItem(STORAGE_KEYS, JSON.stringify(keysMap));
  };

  const testApiConnection = async () => {
    setStatus('正在测试 API 连接...');
    try {
      const result = await fetchModelsViaServer({
        providerKey,
        apiBase: provider?.baseUrl,
        apiKey,
        modelsEndpoint: provider?.modelsEndpoint || '/models',
        authToken
      });
      const sourceLabel = result?.source === 'platform' ? '平台额度' : '自带密钥';
      setStatus(`连接成功：模型接口可用（${sourceLabel}）`);
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
      setProviderKey('deepseek');
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
      if (!provider?.baseUrl) {
        setStatus('当前服务商缺少 API 地址');
        return;
      }

      const result = await fetchModelsViaServer({
        providerKey,
        apiBase: provider.baseUrl,
        apiKey,
        modelsEndpoint: provider.modelsEndpoint || '/models',
        authToken
      });
      const data = result?.upstream || {};
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
      const sourceLabel = result?.source === 'platform' ? '平台额度' : '自带密钥';
      setStatus(`模型加载完成（${finalModels.length}，分组 ${groupCount}，${sourceLabel}）`);
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

  const resetStreamState = () => {
    streamTextRef.current = '';
    streamStartedAtRef.current = 0;
    setStreamPreview('');
    setStreamVia('');
    setStreamPhase('idle');
    setStreamElapsedSec(0);
  };

  const stopGenerating = () => {
    if (!loading || !streamAbortRef.current) return;
    streamAbortRef.current.abort();
    setStreamPhase('stopped');
  };

  const sendMessage = async () => {
    const text = userInput.trim();
    const hasImage = !!pendingImageDataUrl;

    if (!model) {
      setStatus('请先选择模型');
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
    setStreamPhase('sending');
    setStreamVia('');
    streamTextRef.current = '';
    setStreamPreview('');
    streamStartedAtRef.current = Date.now();
    setStatus('已发送，等待模型响应...');

    const abortController = new AbortController();
    streamAbortRef.current = abortController;
    let messages = [];

    const applyAssistantSuccess = (resultContent, meta = {}) => {
      const finalText = String(resultContent || '').trim();
      if (!finalText) {
        throw new Error('模型无可用输出');
      }
      setChatMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          text: finalText,
          time: Date.now(),
          via: meta.via || ''
        }
      ]);

      appendCommandsToEditor(finalText);

      setConversationHistory((prev) => {
        const next = [
          ...prev,
          { role: 'user', content: text || '[用户发送了一张图片]' },
          { role: 'assistant', content: finalText }
        ];
        return next.slice(-Math.max(1, maxHistory) * 2);
      });

      const sourceLabel = meta.source === 'platform' ? '平台额度' : '自带密钥';
      const quotaLabel = meta?.quota?.enabled ? `，剩余 ${meta.quota.remaining}` : '';
      setStatus(`请求成功（${sourceLabel}${quotaLabel}）`);
    };

    const shouldFallbackToNonStream = (error) => {
      const code = String(error?.code || '').trim();
      const msg = String(error?.message || '').trim();
      if (!msg) return false;
      if (code === 'UPSTREAM_CHAT_FAILED' || code === 'API_ERROR') return true;
      if (msg.includes('模型无可用输出')) return true;
      if (msg.includes('流式')) return true;
      return false;
    };

    try {
      messages = [{ role: 'system', content: buildSystemPrompt(promptTemplate, '') }];

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

      let activeVia = '';
      const result = await requestWithFallbackStream({
        providerKey,
        apiBase: provider.baseUrl,
        apiKey,
        model,
        messages,
        authToken,
        signal: abortController.signal,
        onEvent: (event) => {
          if (!event || typeof event !== 'object') return;
          const nextVia = String(event.via || '').trim();
          if (nextVia) {
            activeVia = nextVia;
            setStreamVia(nextVia);
          }

          if (event.type === 'meta') {
            setStreamPhase('connected');
            return;
          }

          if (event.type === 'phase') {
            const phase = String(event.phase || '').trim();
            if (phase) setStreamPhase(phase);
            return;
          }

          if (event.type === 'delta') {
            const piece = String(event.text || '');
            if (!piece) return;
            setStreamPhase('generating');
            streamTextRef.current += piece;
            setStreamPreview(streamTextRef.current);
          }
        }
      });
      applyAssistantSuccess(result.content || streamTextRef.current || '', {
        via: result.via || activeVia,
        source: result.source,
        quota: result.quota
      });
      setStreamPhase('idle');
    } catch (e) {
      const isAbort = e?.name === 'AbortError' || e?.code === 'ABORT_ERR';
      if (isAbort) {
        const partial = String(streamTextRef.current || '').trim();
        if (partial) {
          setChatMessages((prev) => [
            ...prev,
            {
              role: 'assistant',
              text: `${partial}\n\n（已停止）`,
              time: Date.now(),
              via: streamVia || 'stream'
            }
          ]);
          appendCommandsToEditor(partial);
          setConversationHistory((prev) => {
            const next = [
              ...prev,
              { role: 'user', content: text || '[用户发送了一张图片]' },
              { role: 'assistant', content: partial }
            ];
            return next.slice(-Math.max(1, maxHistory) * 2);
          });
          setStatus('已停止生成，已保留当前内容');
        } else {
          setStatus('已停止生成');
        }
        setStreamPhase('stopped');
      } else {
        if (shouldFallbackToNonStream(e)) {
          try {
            setStatus('当前模型流式不可用，正在切换标准模式...');
            const fallbackResult = await requestWithFallback({
              providerKey,
              apiBase: provider.baseUrl,
              apiKey,
              model,
              messages,
              authToken
            });
            applyAssistantSuccess(fallbackResult.content, {
              via: fallbackResult.via,
              source: fallbackResult.source,
              quota: fallbackResult.quota
            });
            setStatus('流式不可用，已自动切换标准模式并返回结果');
            setStreamPhase('idle');
          } catch (fallbackError) {
            const msg = `请求失败：${fallbackError.message}`;
            setChatMessages((prev) => [
              ...prev,
              {
                role: 'assistant',
                text: msg,
                time: Date.now(),
                error: true
              }
            ]);
            if (fallbackError?.quota?.enabled) {
              setStatus(`${msg}（今日剩余 ${fallbackError.quota.remaining}）`);
            } else {
              setStatus(msg);
            }
          }
        } else {
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
          if (e?.quota?.enabled) {
            setStatus(`${msg}（今日剩余 ${e.quota.remaining}）`);
          } else {
            setStatus(msg);
          }
        }
      }
    } finally {
      setLoading(false);
      streamAbortRef.current = null;
      resetStreamState();
    }
  };

  const validateCommands = () => {
    const lines = parseCommandLines(commandEditor);
    if (lines.length === 0) {
      setStatus('命令编辑器为空');
      return false;
    }
    const invalid = validateCommandsAgainstWhitelist(lines, boardType);
    if (invalid.length > 0) {
      setStatus(`白名单校验失败：${formatInvalidPreview(invalid)}`);
      return false;
    }
    setStatus(`白名单校验通过（${lines.length} 条）`);
    return true;
  };

  const executeCommandsToBoard = () => {
    const lines = normalizeCommandAliases(parseCommandLines(commandEditor));
    if (lines.length === 0) {
      setStatus('命令编辑器为空');
      return;
    }

    const invalid = validateCommandsAgainstWhitelist(lines, boardType);
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

      setStatus('执行失败：原生画板未就绪');
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

      setStatus('读取失败：原生画板未就绪或无可重建命令');
    } catch (e) {
      setStatus(`读取失败：${e.message}`);
    }
  };

  const clearBoard = () => {
    try {
      if (!(ggbReady && ggbApi)) {
        setStatus('清空失败：原生画板未就绪');
        return;
      }
      const result = clearBoardObjects(ggbApi);
      if (!result.ok) {
        setStatus('清空失败：当前对象不可删除');
        return;
      }
      if (boardType === '3d') {
        apply3DDisplayPreferences(ggbApi, {
          showAxes: showAxes3d,
          showGrid: showGrid3d,
          showPlane: showPlane3d,
          autoRotate: autoRotate3d,
          spinSpeed: spinSpeed3d,
          hardStopSpin: !autoRotate3d
        });
      } else {
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
          // ignore API differences
        }
      }
      setStatus(result.deleted > 0 ? `已清空原生画板（删除 ${result.deleted} 个对象）` : '已清空原生画板');
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
      {toastItems.length ? (
        <div className="top-toast-stack">
          {toastItems.map((item) => (
            <div key={item.id} className="top-toast">❗ {item.text}</div>
          ))}
        </div>
      ) : null}
      <header className="panel-subheader panel-subheader-compact">
        <div className="workspace-mark">
          AI 对话与命令 · {boardType === '3d' ? '立体模式' : '平面模式'} {authUser?.username ? `· ${authUser.username}` : '· 未登录'}
        </div>
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
              {chatMessages.length === 0 && !loading ? (
                <div className="chat-empty">开始输入题目或粘贴图片（Ctrl/Cmd+V）</div>
              ) : (
                <>
                  {chatMessages.map((msg, idx) => (
                    <div key={`${msg.time}-${idx}`} className={`chat-item ${msg.role === 'user' ? 'user' : 'assistant'} ${msg.error ? 'error' : ''}`}>
                      <div className="chat-role">{msg.role === 'user' ? '你' : 'AI'}</div>
                      <div className="chat-content">{msg.text}</div>
                      {msg.imageDataUrl ? <img className="chat-image" src={msg.imageDataUrl} alt="粘贴图片" /> : null}
                    </div>
                  ))}
                  {loading ? (
                    <div className="chat-item assistant streaming">
                      <div className="chat-role">AI</div>
                      <div className="chat-content">
                        {streamPreview || '正在思考中，请稍候...'}
                      </div>
                      <div className="chat-meta chat-meta-stream">
                        <div>模型：{model || '（未选择）'}</div>
                        <div>状态：{streamPhaseText}</div>
                        <div>耗时：{streamElapsedSec.toFixed(2)}s</div>
                      </div>
                    </div>
                  ) : null}
                </>
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

            <div className="actions-row gap clean-send-row">
              <button className="btn" onClick={sendMessage} disabled={loading}>发送</button>
              <button className="btn btn-lite" onClick={stopGenerating} disabled={!loading}>停止生成</button>
              <span className="status-chip">{streamPhaseText}</span>
            </div>

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
                <button className="btn btn-lite cmd-mini-btn" onClick={clearBoard}>清空画板</button>
                <button className="btn btn-lite cmd-mini-btn" onClick={clearCommandEditor}>清空代码</button>
                <button className="btn cmd-mini-btn" onClick={executeCommandsToBoard}>执行</button>
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
              <h4>账号与云同步</h4>
              {authUser ? (
                <>
                  <div className="prompt-preview">
                    当前账号：{authUser.username}{authUser.email ? ` (${authUser.email})` : ''}，云端密钥数量：{cloudStoredApiKeys.length}
                  </div>
                  <div className="actions-row gap wrap">
                    <button className="btn btn-lite" onClick={() => pullCloudSettings()} disabled={cloudSyncBusy}>从云端拉取</button>
                    <button className="btn btn-lite" onClick={() => pushCloudSettings()} disabled={cloudSyncBusy}>保存到云端</button>
                    <button className="btn btn-lite" onClick={logoutAuth}>退出登录</button>
                  </div>
                  <div className="form-grid">
                    <label>
                      用户名
                      <input
                        value={profileUsernameInput}
                        onChange={(e) => setProfileUsernameInput(e.target.value)}
                        placeholder="新用户名"
                      />
                    </label>
                    <label>
                      当前密码（选填）
                      <div className="password-input-wrapper">
                        <input
                          type={showProfileCurrentPassword ? 'text' : 'password'}
                          value={profileCurrentPasswordInput}
                          onChange={(e) => setProfileCurrentPasswordInput(e.target.value)}
                          placeholder="已有密码时必填"
                        />
                        <button
                          type="button"
                          className="btn-icon-small"
                          onClick={() => setShowProfileCurrentPassword((v) => !v)}
                          title={showProfileCurrentPassword ? '隐藏密码' : '显示密码'}
                          aria-label={showProfileCurrentPassword ? '隐藏密码' : '显示密码'}
                        >
                          {showProfileCurrentPassword ? '🙈' : '👁️'}
                        </button>
                      </div>
                    </label>
                    <label>
                      新密码
                      <div className="password-input-wrapper">
                        <input
                          type={showProfilePassword ? 'text' : 'password'}
                          value={profilePasswordInput}
                          onChange={(e) => setProfilePasswordInput(e.target.value)}
                          placeholder="至少8位"
                        />
                        <button
                          type="button"
                          className="btn-icon-small"
                          onClick={() => setShowProfilePassword((v) => !v)}
                          title={showProfilePassword ? '隐藏密码' : '显示密码'}
                          aria-label={showProfilePassword ? '隐藏密码' : '显示密码'}
                        >
                          {showProfilePassword ? '🙈' : '👁️'}
                        </button>
                      </div>
                    </label>
                  </div>
                  <div className="actions-row gap wrap">
                    <button className="btn btn-lite" onClick={updateMyUsername}>更新用户名</button>
                    <button className="btn btn-lite" onClick={updateMyPassword}>更新密码</button>
                  </div>
                </>
              ) : (
                <>
                  <div className="prompt-preview">
                    推荐使用邮箱验证码登录。首次登录会自动注册账号，可选填写首次用户名。
                  </div>
                  <div className="form-grid">
                    <label>
                      邮箱
                      <input
                        value={emailLoginInput}
                        onChange={(e) => setEmailLoginInput(e.target.value)}
                        placeholder="name@example.com"
                      />
                    </label>
                    <label>
                      验证码
                      <input
                        value={emailCodeInput}
                        onChange={(e) => setEmailCodeInput(e.target.value)}
                        placeholder="6位数字"
                      />
                    </label>
                    <label>
                      首次用户名（可选）
                      <input
                        value={emailUsernameInput}
                        onChange={(e) => setEmailUsernameInput(e.target.value)}
                        placeholder="首次登录可填，不填会自动生成"
                      />
                    </label>
                  </div>
                  <div className="actions-row gap wrap">
                    <button
                      className="btn btn-lite"
                      onClick={requestEmailCode}
                      disabled={emailCodeBusy || emailCooldownSec > 0}
                    >
                      {emailCodeBusy ? '发送中...' : (emailCooldownSec > 0 ? `重新发送(${emailCooldownSec}s)` : '发送验证码')}
                    </button>
                    <button className="btn" onClick={loginByEmailCode}>邮箱验证码登录 / 注册</button>
                  </div>
                  <div className="actions-row gap wrap">
                    <button className="btn btn-lite" onClick={() => setShowPasswordLogin((v) => !v)}>
                      {showPasswordLogin ? '收起账号密码登录' : '已有密码账号？点此登录'}
                    </button>
                  </div>
                  {showPasswordLogin ? (
                    <>
                      <div className="form-grid">
                        <label>
                          账号（用户名/邮箱）
                          <input
                            value={authLoginInput}
                            onChange={(e) => setAuthLoginInput(e.target.value)}
                            placeholder="demo_user 或 demo@example.com"
                          />
                        </label>
                        <label>
                          密码
                          <div className="password-input-wrapper">
                            <input
                              type={showAuthPassword ? 'text' : 'password'}
                              value={authPasswordInput}
                              onChange={(e) => setAuthPasswordInput(e.target.value)}
                              placeholder="输入密码"
                            />
                            <button
                              type="button"
                              className="btn-icon-small"
                              onClick={() => setShowAuthPassword((v) => !v)}
                              title={showAuthPassword ? '隐藏密码' : '显示密码'}
                              aria-label={showAuthPassword ? '隐藏密码' : '显示密码'}
                            >
                              {showAuthPassword ? '🙈' : '👁️'}
                            </button>
                          </div>
                        </label>
                      </div>
                      <div className="actions-row gap wrap">
                        <button className="btn btn-lite" onClick={loginByPassword}>账号密码登录</button>
                      </div>
                    </>
                  ) : null}
                </>
              )}
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
                        placeholder="可选：输入你的 API Key（留空则走平台额度）"
                      />
                      <button className="btn-icon-small" onClick={() => setShowApiKey((v) => !v)}>👁️</button>
                      <button className="btn-icon-small btn-check-key" onClick={testApiConnection}>✓</button>
                    </div>
                    <span className="hint-text">{provider?.baseUrl || '请先选择服务商'}（API Key 可留空）</span>
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
                    {authUser ? (
                      <button className="btn btn-lite" onClick={saveCurrentProviderKeyToCloud}>保存当前Key到云端</button>
                    ) : null}
                    {authUser ? (
                      <button className="btn btn-lite" onClick={removeCurrentProviderKeyFromCloud}>删除当前云端Key</button>
                    ) : null}
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
                  2D 坐标轴
                  <select value={showAxes ? 'on' : 'off'} onChange={(e) => setShowAxes(e.target.value === 'on')}>
                    <option value="on">显示</option>
                    <option value="off">隐藏</option>
                  </select>
                </label>

                <label>
                  2D 网格
                  <select value={showGrid ? 'on' : 'off'} onChange={(e) => setShowGrid(e.target.value === 'on')}>
                    <option value="on">显示</option>
                    <option value="off">隐藏</option>
                  </select>
                </label>

                <label>
                  3D 坐标轴
                  <select value={showAxes3d ? 'on' : 'off'} onChange={(e) => setShowAxes3d(e.target.value === 'on')}>
                    <option value="on">显示</option>
                    <option value="off">隐藏</option>
                  </select>
                </label>

                <label>
                  3D 底面（xOy）
                  <select value={showPlane3d ? 'on' : 'off'} onChange={(e) => setShowPlane3d(e.target.value === 'on')}>
                    <option value="on">显示</option>
                    <option value="off">隐藏</option>
                  </select>
                </label>

                <label>
                  3D 网格
                  <select
                    value={showGrid3d ? 'on' : 'off'}
                    onChange={(e) => setShowGrid3d(e.target.value === 'on')}
                  >
                    <option value="on">显示</option>
                    <option value="off">隐藏</option>
                  </select>
                </label>

                <label>
                  3D 自动旋转
                  <select value={autoRotate3d ? 'on' : 'off'} onChange={(e) => setAutoRotate3d(e.target.value === 'on')}>
                    <option value="off">关闭（默认）</option>
                    <option value="on">开启</option>
                  </select>
                </label>

                <label>
                  3D 旋转速度（SetSpinSpeed）
                  <input
                    type="number"
                    min={-10}
                    max={10}
                    step={0.1}
                    value={spinSpeed3d}
                    onChange={(e) => setSpinSpeed3d(normalizeSpinSpeed(e.target.value, 2))}
                  />
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
