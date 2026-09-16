import { useCallback, useEffect, useRef, useState } from 'react';

const BASE_URL = import.meta.env.BASE_URL || '/';
const withBase = (path) => `${BASE_URL}${String(path || '').replace(/^\/+/, '')}`;
// GeoGebra 应用与引导脚本都在本地 vendor 目录，不再走 geogebra.org CDN。
// 见 docs/ 与 MAP.md：CDN 冷启动需下载约 20MB，本地加载首屏即完成且可离线使用。
const GGB_VENDOR_BASE = withBase('vendor/geogebra/');
const GGB_SCRIPT_URL = `${GGB_VENDOR_BASE}deployggb.js`;
const GGB_CODEBASE_URL = `${GGB_VENDOR_BASE}HTML5/5.0/web3d/`;
const TIKZJAX_SCRIPT_URL = 'https://tikzjax.com/v1/tikzjax.js';
const PARSER_SCRIPT_URL = withBase('ggb-parser.js');
const TIKZ_SCRIPT_URL = withBase('tikz-generator.js');
const PARSER_3D_SCRIPT_URL = withBase('ggb-3d-parser.js');
const TIKZ_3D_SCRIPT_URL = withBase('tikz-3d-generator.js');
const STORAGE_SHOW_AXES = 'ggb_show_axes';
const STORAGE_SHOW_GRID = 'ggb_show_grid';
const STORAGE_3D_SHOW_AXES = 'ggb_3d_show_axes';
const STORAGE_3D_SHOW_GRID = 'ggb_3d_show_grid';
const STORAGE_3D_SHOW_PLANE = 'ggb_3d_show_plane';
const STORAGE_3D_AUTO_ROTATE = 'ggb_3d_auto_rotate';
const STORAGE_3D_SPIN_SPEED = 'ggb_3d_spin_speed';
const STORAGE_EXPORT_IMAGE_MODE = 'ggb_export_image_mode';
const STORAGE_EXPORT_SCALE = 'ggb_export_scale';
const STORAGE_TIKZ_LINE_EXTEND = 'ggb_tikz_line_extend';
const STORAGE_TIKZ_POINT_RADIUS = 'ggb_tikz_point_radius';
const STORAGE_TIKZ_POLYGON_FILL = 'ggb_tikz_polygon_fill';
const STORAGE_TIKZ_AXIS_THICKNESS = 'ggb_tikz_axis_thickness';
const STORAGE_TIKZ_CONIC_THICKNESS = 'ggb_tikz_conic_thickness';
const STORAGE_TIKZ_FUNCTION_THICKNESS = 'ggb_tikz_function_thickness';
const STORAGE_TIKZ_LINE_THICKNESS = 'ggb_tikz_line_thickness';
const STORAGE_TIKZ_SEGMENT_THICKNESS = 'ggb_tikz_segment_thickness';
const STORAGE_TIKZ_POLYGON_THICKNESS = 'ggb_tikz_polygon_thickness';
const STORAGE_TIKZ_FACE_COLOR = 'ggb_tikz_face_color';
const STORAGE_TIKZ_FACE_OPACITY = 'ggb_tikz_face_opacity';
const STORAGE_TIKZ_LINE_COLOR = 'ggb_tikz_line_color';
const STORAGE_TIKZ_LINE_DASH = 'ggb_tikz_line_dash';
const STORAGE_TIKZ_SHOW_AXIS = 'ggb_tikz_show_axis';
const STORAGE_TIKZ_ANGLE_REGION = 'ggb_tikz_angle_region';
const STORAGE_TIKZ_OPT_TARGET_CM = 'ggb_tikz_opt_target_cm'; // 兼容旧版本
const STORAGE_TIKZ_OPT_TARGET_W_CM = 'ggb_tikz_opt_target_w_cm';
const STORAGE_TIKZ_OPT_TARGET_H_CM = 'ggb_tikz_opt_target_h_cm';
const STORAGE_TIKZ_OPT_PRIORITY = 'ggb_tikz_opt_priority';
const STORAGE_TIKZ_OPT_AXIS_PAD = 'ggb_tikz_opt_axis_pad';
const STORAGE_TIKZ_OPT_CLIP_PAD = 'ggb_tikz_opt_clip_pad';
const STORAGE_TIKZ_OPT_AXIS_SYMMETRY = 'ggb_tikz_opt_axis_symmetry';
const STORAGE_TIKZ_OPT_AXIS_SYMMETRY_MODE = 'ggb_tikz_opt_axis_symmetry_mode';
const STORAGE_TIKZ_OPT_LABEL_OFFSET_PT = 'ggb_tikz_opt_label_offset_pt';
const STORAGE_TIKZ_OPT_LABEL_FONT_PT = 'ggb_tikz_opt_label_font_pt';
const STORAGE_TIKZ_OPT_LABEL_MAX_SHIFT_PT = 'ggb_tikz_opt_label_max_shift_pt';
const STORAGE_TIKZ_LABEL_OVERRIDES = 'ggb_tikz_label_overrides';
const STORAGE_TIKZ3D_AZIMUTH = 'ggb_tikz3d_azimuth_deg';
const STORAGE_TIKZ3D_DEPTH = 'ggb_tikz3d_depth_scale';
const STORAGE_TIKZ3D_SHOW_POINT_LABELS = 'ggb_tikz3d_show_point_labels';
const STORAGE_TIKZ3D_PROJECTION_PRESET = 'ggb_tikz3d_projection_preset';
const STORAGE_TIKZ3D_AUTO_ROUND_PREFER = 'ggb_tikz3d_auto_round_prefer';
const TIKZ_SETTINGS_UPDATED_EVENT = 'ggb:tikz-settings-updated';
const TOAST_DURATION_MS = 1500;
const DEFAULT_TIKZ3D_AZIMUTH = -60;
const DEFAULT_TIKZ3D_DEPTH = 0.55;
const DEFAULT_TIKZ3D_PROJECTION_PRESET = 'exam';
const VALID_TIKZ3D_PROJECTION_PRESETS = ['exam', 'round', 'xml', 'custom'];
const ROUND_PREFERRED_STRUCTURED_KEYS = ['cylinders3d', 'cones3d', 'spheres3d'];
const ROUND_PREFERRED_COMMANDS = new Set(['Cylinder', 'Cone', 'Sphere']);
const DEFAULT_TIKZ_BOUNDS = { xmin: -2.3, xmax: 2.8, ymin: -2.6, ymax: 2.4 };
const DEFAULT_3D_ENTRY_VIEW = Object.freeze({
  xZero: -3.9585129906448397,
  yZero: -3.847254076123744,
  zZero: -1.5778469041735042,
  scale: 55.30186435273293,
  xAngle: 32,
  zAngle: 64
});
const TIKZ_THICKNESS_OPTIONS = ['thin', 'semithick', 'thick', 'very thick', 'ultra thick'];
const ALLOWED_TIKZ_THICKNESS = new Set(TIKZ_THICKNESS_OPTIONS);
const LINE_DASH_OPTIONS = ['', 'solid', 'dashed', 'dotted', 'dash dot', 'dash dot dot'];
const ALLOWED_LINE_DASH = new Set(LINE_DASH_OPTIONS);
const LABEL_POSITION_OPTIONS = ['above right', 'above left', 'below right', 'below left', 'above', 'below', 'right', 'left'];
const LABEL_NUDGE_DIRECTIONS = [
  [{ icon: '↖', dx: -1, dy: 1, title: '左上' }, { icon: '↑', dx: 0, dy: 1, title: '上' }, { icon: '↗', dx: 1, dy: 1, title: '右上' }],
  [{ icon: '←', dx: -1, dy: 0, title: '左' }, { icon: '⊙', dx: 0, dy: 0, title: '重置偏移' }, { icon: '→', dx: 1, dy: 0, title: '右' }],
  [{ icon: '↙', dx: -1, dy: -1, title: '左下' }, { icon: '↓', dx: 0, dy: -1, title: '下' }, { icon: '↘', dx: 1, dy: -1, title: '右下' }]
];
let tikzJaxRenderFn = null;
let tikzJaxReadyPromise = null;

function ensureTikzJaxReady() {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('当前环境不支持 TikZJax'));
  }
  if (typeof tikzJaxRenderFn === 'function') {
    return Promise.resolve(tikzJaxRenderFn);
  }
  if (tikzJaxReadyPromise) {
    return tikzJaxReadyPromise;
  }

  tikzJaxReadyPromise = new Promise((resolve, reject) => {
    const prevOnload = window.onload;
    const script = document.createElement('script');
    script.src = `${TIKZJAX_SCRIPT_URL}?v=${Date.now()}`;
    script.async = true;
    script.onload = () => {
      if (typeof window.onload === 'function') {
        tikzJaxRenderFn = window.onload;
        window.onload = prevOnload;
        resolve(tikzJaxRenderFn);
      } else {
        window.onload = prevOnload;
        reject(new Error('TikZJax 初始化函数不可用'));
      }
    };
    script.onerror = () => {
      window.onload = prevOnload;
      reject(new Error('TikZJax 脚本加载失败'));
    };
    document.head.appendChild(script);
  }).catch((err) => {
    tikzJaxReadyPromise = null;
    throw err;
  });

  return tikzJaxReadyPromise;
}

async function renderTikzJaxFallback(host, rawCode) {
  const render = await ensureTikzJaxReady();
  host.innerHTML = '';
  const tikzScript = document.createElement('script');
  tikzScript.type = 'text/tikz';
  tikzScript.text = buildTikzPreviewContent(rawCode);
  host.appendChild(tikzScript);

  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      observer.disconnect();
      reject(new Error('浏览器渲染超时'));
    }, 25_000);
    const finish = () => {
      if (!host.querySelector('svg')) return;
      window.clearTimeout(timeout);
      observer.disconnect();
      resolve();
    };
    const observer = new MutationObserver(finish);
    observer.observe(host, { childList: true, subtree: true });
    try {
      Promise.resolve(render()).then(finish).catch(reject);
      finish();
    } catch (error) {
      window.clearTimeout(timeout);
      observer.disconnect();
      reject(error);
    }
  });
}

function ensureGGBScript() {
  return new Promise((resolve, reject) => {
    if (window.GGBApplet) {
      resolve();
      return;
    }
    const existed = document.querySelector(`script[src="${GGB_SCRIPT_URL}"]`);
    if (existed) {
      existed.addEventListener('load', () => resolve(), { once: true });
      existed.addEventListener('error', () => reject(new Error('GeoGebra 脚本加载失败')), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = GGB_SCRIPT_URL;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('GeoGebra 脚本加载失败'));
    document.head.appendChild(script);
  });
}

function ensurePlainScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src=\"${src}\"]`)) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`脚本加载失败: ${src}`));
    document.head.appendChild(script);
  });
}

function readShowAxes() {
  return (localStorage.getItem(STORAGE_SHOW_AXES) || 'on') === 'on';
}

function readShowGrid() {
  return (localStorage.getItem(STORAGE_SHOW_GRID) || 'off') === 'on';
}

function read3DDisplaySettings() {
  const spinRaw = Number(localStorage.getItem(STORAGE_3D_SPIN_SPEED) || 2);
  return {
    showAxes: (localStorage.getItem(STORAGE_3D_SHOW_AXES) || 'on') === 'on',
    showGrid: (localStorage.getItem(STORAGE_3D_SHOW_GRID) || 'on') === 'on',
    showPlane: (localStorage.getItem(STORAGE_3D_SHOW_PLANE) || 'on') === 'on',
    autoRotate: (localStorage.getItem(STORAGE_3D_AUTO_ROTATE) || 'off') === 'on',
    spinSpeed: Number.isFinite(spinRaw) ? Math.max(-10, Math.min(10, spinRaw)) : 2
  };
}

function parse3DCoordSystemFromXml(xmlText) {
  const xml = String(xmlText || '').trim();
  if (!xml || typeof DOMParser === 'undefined') return null;
  try {
    const doc = new DOMParser().parseFromString(xml, 'text/xml');
    if (doc.querySelector('parsererror')) return null;
    const coord = doc.querySelector('euclidianView3D > coordSystem');
    if (!coord) return null;
    const readAttr = (name) => {
      const value = Number(coord.getAttribute(name));
      return Number.isFinite(value) ? value : null;
    };
    const parsed = {
      xZero: readAttr('xZero'),
      yZero: readAttr('yZero'),
      zZero: readAttr('zZero'),
      scale: readAttr('scale'),
      xAngle: readAttr('xAngle'),
      zAngle: readAttr('zAngle')
    };
    return Object.values(parsed).every((value) => value !== null) ? parsed : null;
  } catch {
    return null;
  }
}

function isDefault3DEntryViewXml(xmlText) {
  const parsed = parse3DCoordSystemFromXml(xmlText);
  if (!parsed) return false;
  const tolerance = 1e-3;
  return (
    Math.abs(parsed.xZero - DEFAULT_3D_ENTRY_VIEW.xZero) <= tolerance
    && Math.abs(parsed.yZero - DEFAULT_3D_ENTRY_VIEW.yZero) <= tolerance
    && Math.abs(parsed.zZero - DEFAULT_3D_ENTRY_VIEW.zZero) <= tolerance
    && Math.abs(parsed.scale - DEFAULT_3D_ENTRY_VIEW.scale) <= tolerance
    && Math.abs(parsed.xAngle - DEFAULT_3D_ENTRY_VIEW.xAngle) <= tolerance
    && Math.abs(parsed.zAngle - DEFAULT_3D_ENTRY_VIEW.zAngle) <= tolerance
  );
}

function applyAxesVisibility(api, showAxes) {
  if (!api) return;
  try {
    if (typeof api.setAxesVisible === 'function') {
      api.setAxesVisible(showAxes, showAxes);
      return;
    }
    if (typeof api.setAxisVisible === 'function') {
      api.setAxisVisible(1, showAxes);
      api.setAxisVisible(2, showAxes);
    }
  } catch {
    // ignore API differences
  }
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
      // ignore reset errors
    }
  }

  return { ok: false, deleted: 0, total: names.length, fallback: '' };
}

function is3DConstructionEmptyXml(xmlText) {
  const xml = String(xmlText || '').trim();
  if (!xml || typeof DOMParser === 'undefined') return true;
  try {
    const doc = new DOMParser().parseFromString(xml, 'text/xml');
    if (doc.querySelector('parsererror')) return true;
    const construction = doc.querySelector('construction');
    if (!construction) return true;
    return !construction.querySelector('command, element, expression');
  } catch {
    return true;
  }
}

function patchDefault3DEntryXml(xmlText, width, height) {
  const xml = String(xmlText || '').trim();
  if (!xml || typeof DOMParser === 'undefined' || typeof XMLSerializer === 'undefined') return '';
  const w = Math.max(640, Math.floor(Number(width) || 1113));
  const h = Math.max(480, Math.floor(Number(height) || 842));
  const v = DEFAULT_3D_ENTRY_VIEW;
  try {
    const doc = new DOMParser().parseFromString(xml, 'text/xml');
    if (doc.querySelector('parsererror')) return '';
    const ensureChild = (parent, tag) => {
      let node = parent?.querySelector?.(tag) || null;
      if (!node && parent) {
        node = doc.createElement(tag);
        parent.appendChild(node);
      }
      return node;
    };

    const gui = ensureChild(doc.querySelector('geogebra') || doc.documentElement, 'gui');
    const windowEl = ensureChild(gui, 'window');
    if (windowEl) {
      windowEl.setAttribute('width', String(w));
      windowEl.setAttribute('height', String(h));
    }

    const kernel = ensureChild(doc.querySelector('kernel') || doc.documentElement, 'kernel');
    const uses3d = ensureChild(kernel, 'uses3D');
    if (uses3d) uses3d.setAttribute('val', 'true');

    const ev3d = ensureChild(doc.querySelector('euclidianView3D') || doc.documentElement, 'euclidianView3D');
    const coord = ensureChild(ev3d, 'coordSystem');
    if (coord) {
      coord.setAttribute('xZero', String(v.xZero));
      coord.setAttribute('yZero', String(v.yZero));
      coord.setAttribute('zZero', String(v.zZero));
      coord.setAttribute('scale', String(v.scale));
      coord.setAttribute('xAngle', String(v.xAngle));
      coord.setAttribute('zAngle', String(v.zAngle));
    }
    const evSettings = ensureChild(ev3d, 'evSettings');
    if (evSettings) {
      evSettings.setAttribute('axes', 'true');
      evSettings.setAttribute('grid', 'true');
      evSettings.setAttribute('gridIsBold', 'false');
      evSettings.setAttribute('pointCapturing', '3');
      evSettings.setAttribute('rightAngleStyle', '1');
      evSettings.setAttribute('gridType', '3');
    }
    const ensureAxis = (id, label) => {
      let axis = ev3d.querySelector(`axis[id="${id}"]`);
      if (!axis) {
        axis = doc.createElement('axis');
        axis.setAttribute('id', String(id));
        ev3d.appendChild(axis);
      }
      axis.setAttribute('show', 'true');
      axis.setAttribute('label', label);
      axis.setAttribute('unitLabel', '');
      axis.setAttribute('tickStyle', '1');
      axis.setAttribute('showNumbers', 'true');
    };
    ensureAxis(0, 'x');
    ensureAxis(1, 'y');
    ensureAxis(2, 'z');
    const plate = ensureChild(ev3d, 'plate');
    if (plate) plate.setAttribute('show', 'true');
    const clipping = ensureChild(ev3d, 'clipping');
    if (clipping) {
      clipping.setAttribute('use', 'false');
      clipping.setAttribute('show', 'false');
      clipping.setAttribute('size', '1');
    }
    const projection = ensureChild(ev3d, 'projection');
    if (projection) projection.setAttribute('type', '0');

    return new XMLSerializer().serializeToString(doc);
  } catch {
    return '';
  }
}

function buildDefault3DEntryXml(width, height) {
  const w = Math.max(640, Math.floor(Number(width) || 1113));
  const h = Math.max(480, Math.floor(Number(height) || 842));
  const v = DEFAULT_3D_ENTRY_VIEW;
  return `<?xml version="1.0" encoding="utf-8"?>
<geogebra format="5.0" version="5.2.909.9" app="3d" platform="w" id="codex-default-3d" xmlns="" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="https://www.geogebra.org/apps/xsd/ggb.xsd">
<gui>
  <window width="${w}" height="${h}"/>
  <labelingStyle val="3"/>
  <font size="16"/>
</gui>
<euclidianView>
  <coordSystem xZero="0" yZero="0" scale="50" yscale="50"/>
  <evSettings axes="true" grid="false" gridIsBold="false" pointCapturing="3" rightAngleStyle="1" checkboxSize="26" gridType="3"/>
  <bgColor r="255" g="255" b="255"/>
  <axesColor r="28" g="28" b="31"/>
  <gridColor r="180" g="179" b="186"/>
</euclidianView>
<algebraView>
  <mode val="3"/>
</algebraView>
<kernel>
  <uses3D val="true"/>
  <continuous val="false"/>
  <usePathAndRegionParameters val="true"/>
  <decimals val="2"/>
  <angleUnit val="degree"/>
  <algebraStyle val="3" spreadsheet="0"/>
  <coordStyle val="0"/>
</kernel>
<tableview min="0" max="0" step="0"/>
<scripting blocked="false" disabled="false"/>
<euclidianView3D>
  <coordSystem xZero="${v.xZero}" yZero="${v.yZero}" zZero="${v.zZero}" scale="${v.scale}" xAngle="${v.xAngle}" zAngle="${v.zAngle}"/>
  <evSettings axes="true" grid="true" gridIsBold="false" pointCapturing="3" rightAngleStyle="1" gridType="3"/>
  <axis id="0" show="true" label="x" unitLabel="" tickStyle="1" showNumbers="true"/>
  <axis id="1" show="true" label="y" unitLabel="" tickStyle="1" showNumbers="true"/>
  <axis id="2" show="true" label="z" unitLabel="" tickStyle="1" showNumbers="true"/>
  <plate show="true"/>
  <bgColor r="255" g="255" b="255"/>
  <clipping use="false" show="false" size="1"/>
  <projection type="0"/>
</euclidianView3D>
<construction title="" author="" date="">
</construction>
</geogebra>`;
}

function apply3DEntryPreset(api, width, height) {
  if (!api) return false;
  const xmlText = (typeof api.getXML === 'function') ? String(api.getXML() || '') : '';
  if (xmlText && !is3DConstructionEmptyXml(xmlText)) return false;
  let applied = false;

  if (xmlText) {
    const patched = patchDefault3DEntryXml(xmlText, width, height);
    if (patched) {
      try {
        if (typeof api.setXML === 'function') {
          api.setXML(patched);
          applied = true;
        }
      } catch {
        // ignore API differences
      }
    }
  }

  if (!applied) {
    const xml = buildDefault3DEntryXml(width, height);
    try {
      if (typeof api.setXML === 'function') {
        api.setXML(xml);
        applied = true;
      }
    } catch {
      // ignore API differences
    }
    if (!applied) {
      try {
        if (typeof api.setXMLBase64 === 'function' && typeof btoa === 'function') {
          api.setXMLBase64(btoa(xml));
          applied = true;
        }
      } catch {
        // ignore API differences
      }
    }
  }

  return applied;
}

function apply3DEntryPresetWithRetry(api, width, height, { maxAttempts = 4, delayMs = 120 } = {}) {
  if (!api) return () => {};
  let stopped = false;
  let timer = 0;
  let attempts = 0;

  const run = () => {
    if (stopped) return;
    attempts += 1;
    apply3DEntryPreset(api, width, height);
    const xmlNow = (typeof api.getXML === 'function') ? String(api.getXML() || '') : '';
    if (isDefault3DEntryViewXml(xmlNow) || attempts >= maxAttempts) {
      return;
    }
    if (typeof window !== 'undefined') {
      timer = window.setTimeout(run, delayMs);
    }
  };

  run();

  return () => {
    stopped = true;
    if (timer && typeof window !== 'undefined') {
      window.clearTimeout(timer);
    }
  };
}

function apply3DDisplayVisibility(api, {
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
    if (typeof window !== 'undefined') {
      window.setTimeout(() => {
        runEvalSilently(api, 'SetSpinSpeed(0)');
      }, 80);
    }
  }
}

function readHostSize(host) {
  const rect = host?.getBoundingClientRect?.() || { width: 0, height: 0 };
  return {
    width: Math.max(360, Math.floor(Number(rect.width) || 0)),
    height: Math.max(420, Math.floor(Number(rect.height) || 0))
  };
}

function forceHostChildrenFill(host) {
  if (!host) return;
  const root = host.firstElementChild;
  if (root && root.style) {
    root.style.width = '100%';
    root.style.height = '100%';
    root.style.maxWidth = '100%';
  }
  const iframeList = host.querySelectorAll('iframe');
  iframeList.forEach((node) => {
    if (!node.style) return;
    node.style.width = '100%';
    node.style.height = '100%';
    node.style.display = 'block';
  });
}

function syncAppletSizeToHost(host, applet, api) {
  if (!host) return;
  const { width, height } = readHostSize(host);
  if (applet && typeof applet.setSize === 'function') {
    applet.setSize(width, height);
    return;
  }
  if (api && typeof api.setSize === 'function') {
    api.setSize(width, height);
    return;
  }
  forceHostChildrenFill(host);
}

function dataUrlToBlob(dataUrl) {
  const parts = String(dataUrl || '').split(',');
  if (parts.length < 2) throw new Error('图片数据无效');
  const mimeMatch = parts[0].match(/data:(.*?);base64/);
  const mime = mimeMatch ? mimeMatch[1] : 'image/png';
  const bin = atob(parts[1]);
  const len = bin.length;
  const arr = new Uint8Array(len);
  for (let i = 0; i < len; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

function deriveTikZBoundsFromParsed(parsed, fallback = DEFAULT_TIKZ_BOUNDS) {
  const points = parsed?.structured?.points || [];
  const visible = points.filter(
    (p) => p && p.visible && Number.isFinite(Number(p.x)) && Number.isFinite(Number(p.y))
  );
  if (visible.length === 0) return fallback;

  let xmin = Infinity;
  let xmax = -Infinity;
  let ymin = Infinity;
  let ymax = -Infinity;
  visible.forEach((p) => {
    const x = Number(p.x);
    const y = Number(p.y);
    xmin = Math.min(xmin, x);
    xmax = Math.max(xmax, x);
    ymin = Math.min(ymin, y);
    ymax = Math.max(ymax, y);
  });

  let dx = xmax - xmin;
  let dy = ymax - ymin;
  if (dx < 1e-6) dx = 2;
  if (dy < 1e-6) dy = 2;
  const padX = Math.max(0.8, dx * 0.2);
  const padY = Math.max(0.8, dy * 0.2);

  return {
    xmin: Number((xmin - padX).toFixed(2)),
    xmax: Number((xmax + padX).toFixed(2)),
    ymin: Number((ymin - padY).toFixed(2)),
    ymax: Number((ymax + padY).toFixed(2))
  };
}

function readTikzThickness(storageKey, fallback) {
  const v = String(localStorage.getItem(storageKey) || '').trim();
  return ALLOWED_TIKZ_THICKNESS.has(v) ? v : fallback;
}

function normalizeLineDashOption(value) {
  const v = String(value || '').trim().toLowerCase();
  return ALLOWED_LINE_DASH.has(v) ? v : '';
}

function readTikzSettings() {
  const showAxis = (localStorage.getItem(STORAGE_TIKZ_SHOW_AXIS) || 'on') === 'on';
  const lineExtend = Math.max(0, Math.min(6, Number(localStorage.getItem(STORAGE_TIKZ_LINE_EXTEND) || 0.25)));
  const pointRadiusPt = Math.max(0.05, Math.min(3, Number(localStorage.getItem(STORAGE_TIKZ_POINT_RADIUS) || 0.25)));
  const polygonFillColor = String(localStorage.getItem(STORAGE_TIKZ_POLYGON_FILL) || 'black').trim() || 'black';
  const axisThickness = readTikzThickness(STORAGE_TIKZ_AXIS_THICKNESS, 'semithick');
  const conicThickness = readTikzThickness(STORAGE_TIKZ_CONIC_THICKNESS, 'thick');
  const functionThickness = readTikzThickness(STORAGE_TIKZ_FUNCTION_THICKNESS, 'thick');
  const lineThickness = readTikzThickness(STORAGE_TIKZ_LINE_THICKNESS, 'semithick');
  const segmentThickness = readTikzThickness(STORAGE_TIKZ_SEGMENT_THICKNESS, 'thick');
  const polygonThickness = readTikzThickness(STORAGE_TIKZ_POLYGON_THICKNESS, 'thick');
  const faceColor = String(localStorage.getItem(STORAGE_TIKZ_FACE_COLOR) || 'blue!55').trim() || 'blue!55';
  const faceOpacityRaw = Number(localStorage.getItem(STORAGE_TIKZ_FACE_OPACITY) || 0.25);
  const faceOpacity = Number.isFinite(faceOpacityRaw)
    ? Math.max(0, Math.min(1, faceOpacityRaw))
    : 0.25;
  const lineColor = String(localStorage.getItem(STORAGE_TIKZ_LINE_COLOR) || 'black').trim() || 'black';
  const lineDash = normalizeLineDashOption(localStorage.getItem(STORAGE_TIKZ_LINE_DASH) || '');
  const angleRegionRaw = String(localStorage.getItem(STORAGE_TIKZ_ANGLE_REGION) || 'auto').trim().toLowerCase();
  const lineLineAngleSelector = ['auto', 'left', 'right', 'above', 'below'].includes(angleRegionRaw)
    ? angleRegionRaw
    : 'auto';

  return {
    showAxis,
    lineExtend,
    pointRadiusPt,
    polygonFillColor,
    axisThickness,
    conicThickness,
    functionThickness,
    lineThickness,
    segmentThickness,
    polygonThickness,
    faceColor,
    faceOpacity,
    lineColor,
    lineDash,
    lineLineAngleSelector
  };
}

function readTikz3DSettings() {
  let azimuthText = localStorage.getItem(STORAGE_TIKZ3D_AZIMUTH);
  let depthText = localStorage.getItem(STORAGE_TIKZ3D_DEPTH);
  const presetRaw = String(localStorage.getItem(STORAGE_TIKZ3D_PROJECTION_PRESET) || '').trim().toLowerCase();
  const projectionPreset = VALID_TIKZ3D_PROJECTION_PRESETS.includes(presetRaw)
    ? presetRaw
    : DEFAULT_TIKZ3D_PROJECTION_PRESET;
  // 兼容旧版本默认值（45 / 0.55）：视为“未自定义”，改为跟随 XML 视角
  const legacyDefault = (
    azimuthText !== null
    && depthText !== null
    && Math.abs(Number(azimuthText) - 45) < 1e-9
    && Math.abs(Number(depthText) - 0.55) < 1e-9
  );
  if (legacyDefault) {
    azimuthText = null;
    depthText = null;
  }
  const hasManual3dView = (!legacyDefault) && (azimuthText !== null || depthText !== null);
  const fixedPreset = (legacyDefault && !presetRaw)
    ? 'xml'
    : ((!presetRaw && hasManual3dView) ? 'custom' : projectionPreset);
  const azimuthRaw = azimuthText === null ? NaN : Number(azimuthText);
  const depthRaw = depthText === null ? NaN : Number(depthText);
  const showPointLabels = (localStorage.getItem(STORAGE_TIKZ3D_SHOW_POINT_LABELS) || 'on') === 'on';
  const autoRoundPrefer = (localStorage.getItem(STORAGE_TIKZ3D_AUTO_ROUND_PREFER) || 'on') === 'on';
  return {
    projectionPreset: fixedPreset,
    azimuthDeg: Number.isFinite(azimuthRaw) ? Math.max(-180, Math.min(180, azimuthRaw)) : null,
    depthScale: Number.isFinite(depthRaw) ? Math.max(0, Math.min(2, depthRaw)) : null,
    showPointLabels,
    autoRoundPrefer
  };
}

function read3DProjectionFromXml(xmlText) {
  const out = {
    azimuthDeg: DEFAULT_TIKZ3D_AZIMUTH,
    depthScale: DEFAULT_TIKZ3D_DEPTH
  };
  const xml = String(xmlText || '').trim();
  if (!xml || typeof DOMParser === 'undefined') return out;
  try {
    const doc = new DOMParser().parseFromString(xml, 'text/xml');
    const coordSystem = doc.querySelector('euclidianView3D > coordSystem');
    if (!coordSystem) return out;
    const zAngleRaw = Number(coordSystem.getAttribute('zAngle'));
    if (Number.isFinite(zAngleRaw)) {
      out.azimuthDeg = Math.max(-180, Math.min(180, zAngleRaw));
    }
    const xAngleRaw = Number(coordSystem.getAttribute('xAngle'));
    if (Number.isFinite(xAngleRaw)) {
      // 由 XML 俯仰角估算深度，20° 对应约 0.55（与历史默认值一致）
      const depth = Math.abs(Math.sin((xAngleRaw * Math.PI) / 180)) * 1.6;
      out.depthScale = Math.max(0, Math.min(2, Number(depth.toFixed(4))));
    }
  } catch {
    // ignore malformed xml
  }
  return out;
}

function hasVisible3DItems(list) {
  return Array.isArray(list) && list.some((item) => item && item.visible !== false);
}

function shouldPreferRoundProjection(parsed3d) {
  const structured = parsed3d?.structured || {};
  for (const key of ROUND_PREFERRED_STRUCTURED_KEYS) {
    if (hasVisible3DItems(structured[key])) return true;
  }
  if (hasVisible3DItems(structured.others)) {
    const matched = structured.others.some((item) => ROUND_PREFERRED_COMMANDS.has(String(item?.commandName || '').trim()));
    if (matched) return true;
  }
  const elements = Array.isArray(parsed3d?.elements) ? parsed3d.elements : [];
  return elements.some((item) => ROUND_PREFERRED_COMMANDS.has(String(item?.commandName || '').trim()));
}

function extractTikzPictureBlock(code) {
  const text = String(code || '');
  const match = text.match(/\\begin\{tikzpicture\}[\s\S]*?\\end\{tikzpicture\}/);
  return match ? match[0] : text;
}

function stripLatexComments(text) {
  return String(text || '')
    .split('\n')
    .map((line) => {
      let out = '';
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '%') {
          const prev = i > 0 ? line[i - 1] : '';
          if (prev !== '\\') break;
        }
        out += ch;
      }
      return out.replace(/\s+$/, '');
    })
    .join('\n');
}

function makeAsciiSafeForBtoa(text) {
  let out = '';
  for (const ch of String(text || '')) {
    const cp = ch.codePointAt(0) || 0;
    if (cp <= 0xff) {
      out += ch;
    } else {
      out += `{\\char"${cp.toString(16).toUpperCase()}}`;
    }
  }
  return out;
}

function convertTkzAnglesForPreview(tikzText) {
  const text = String(tikzText || '');
  if (!text.includes('\\tkzMarkAngle')) return text;

  const coordMap = {};
  const coordRe = /\\coordinate\s*\(\s*([A-Za-z][A-Za-z0-9_]*)\s*\)\s*at\s*\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\)\s*;/g;
  let m = null;
  while ((m = coordRe.exec(text)) !== null) {
    coordMap[m[1]] = { x: Number(m[2]), y: Number(m[3]) };
  }

  const lines = text.split('\n');
  const out = [];

  const angleDeg = (o, p) => Math.atan2(p.y - o.y, p.x - o.x) * 180 / Math.PI;
  const shortest = (s, e) => {
    let d = (e - s) % 360;
    if (d > 180) d -= 360;
    if (d <= -180) d += 360;
    return d;
  };
  const normalize = (x, y) => {
    const n = Math.hypot(x, y);
    if (!Number.isFinite(n) || n < 1e-9) return null;
    return { x: x / n, y: y / n };
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const right = line.match(/\\tkzMarkRightAngle(?:\[[^\]]*size\s*=\s*([0-9.]+)[^\]]*\])?\s*\(\s*([A-Za-z][A-Za-z0-9_]*)\s*,\s*([A-Za-z][A-Za-z0-9_]*)\s*,\s*([A-Za-z][A-Za-z0-9_]*)\s*\)/);
    if (right) {
      const size = Number(right[1] || '0.25');
      const p1 = coordMap[right[2]];
      const v = coordMap[right[3]];
      const p2 = coordMap[right[4]];
      if (!p1 || !v || !p2 || !Number.isFinite(size)) {
        out.push('% ' + line);
        continue;
      }
      const u1 = normalize(p1.x - v.x, p1.y - v.y);
      const u2 = normalize(p2.x - v.x, p2.y - v.y);
      if (!u1 || !u2) {
        out.push('% ' + line);
        continue;
      }
      const pA = { x: v.x + u1.x * size, y: v.y + u1.y * size };
      const pB = { x: v.x + u2.x * size, y: v.y + u2.y * size };
      const pC = { x: pA.x + u2.x * size, y: pA.y + u2.y * size };

      let label = '';
      const next = lines[i + 1] || '';
      const labelMatch = next.match(/\\tkzLabelAngle(?:\[[^\]]*\])?\s*\(\s*[A-Za-z][A-Za-z0-9_]*\s*,\s*[A-Za-z][A-Za-z0-9_]*\s*,\s*[A-Za-z][A-Za-z0-9_]*\s*\)\s*\{([^}]*)\}/);
      if (labelMatch) {
        label = ` node[midway, fill=white, inner sep=1pt] {${labelMatch[1]}}`;
        i += 1;
      }
      out.push(`\\draw[black, thick] (${pA.x.toFixed(2)},${pA.y.toFixed(2)}) -- (${pC.x.toFixed(2)},${pC.y.toFixed(2)}) -- (${pB.x.toFixed(2)},${pB.y.toFixed(2)})${label};`);
      continue;
    }

    const mark = line.match(/\\tkzMarkAngle(?:\[[^\]]*size\s*=\s*([0-9.]+)[^\]]*\])?\s*\(\s*([A-Za-z][A-Za-z0-9_]*)\s*,\s*([A-Za-z][A-Za-z0-9_]*)\s*,\s*([A-Za-z][A-Za-z0-9_]*)\s*\)/);
    if (!mark) {
      out.push(line);
      continue;
    }

    const size = Number(mark[1] || '0.75');
    const p1 = coordMap[mark[2]];
    const v = coordMap[mark[3]];
    const p2 = coordMap[mark[4]];
    if (!p1 || !v || !p2 || !Number.isFinite(size)) {
      out.push('% ' + line);
      continue;
    }

    const s = angleDeg(v, p1);
    const e = angleDeg(v, p2);
    const d = shortest(s, e);

    let label = '';
    const next = lines[i + 1] || '';
    const labelMatch = next.match(/\\tkzLabelAngle(?:\[[^\]]*\])?\s*\(\s*[A-Za-z][A-Za-z0-9_]*\s*,\s*[A-Za-z][A-Za-z0-9_]*\s*,\s*[A-Za-z][A-Za-z0-9_]*\s*\)\s*\{([^}]*)\}/);
    if (labelMatch) {
      label = ` node[midway, fill=white, inner sep=1pt] {${labelMatch[1]}}`;
      i += 1;
    }

    out.push(`\\draw[black, thick] (${v.x.toFixed(2)},${v.y.toFixed(2)}) ++(${s.toFixed(2)}:${size.toFixed(2)}) arc[start angle=${s.toFixed(2)}, delta angle=${d.toFixed(2)}, radius=${size.toFixed(2)}]${label};`);
  }

  return out.join('\n');
}

function buildTikzPreviewContent(rawCode) {
  const tikzRaw = extractTikzPictureBlock(rawCode);
  const tikzNoComments = stripLatexComments(tikzRaw);
  const tikzCompat = convertTkzAnglesForPreview(tikzNoComments);
  const tikzCode = makeAsciiSafeForBtoa(tikzCompat).replace(/<\/script>/gi, '<\\/script>');
  const preamble = '\\usetikzlibrary{arrows.meta,calc,intersections,3d}';
  return `${preamble}\n${tikzCode}`;
}

function estimateTikzSizeCm(rawCode) {
  const code = String(rawCode || '');
  const scaleMatch = code.match(/\\begin\{tikzpicture\}\s*\[([^\]]*)\]/);
  let scale = 1;
  if (scaleMatch) {
    const m = scaleMatch[1].match(/(?:^|,)\s*scale\s*=\s*([0-9.]+)/i);
    if (m) scale = Number(m[1]) || 1;
  }

  const points = [];
  const re = /\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\)/g;
  let mm = null;
  while ((mm = re.exec(code)) !== null) {
    const x = Number(mm[1]);
    const y = Number(mm[2]);
    if (Number.isFinite(x) && Number.isFinite(y)) {
      points.push({ x, y });
    }
  }

  if (points.length < 2) return null;
  let xmin = Infinity;
  let xmax = -Infinity;
  let ymin = Infinity;
  let ymax = -Infinity;
  points.forEach((p) => {
    xmin = Math.min(xmin, p.x);
    xmax = Math.max(xmax, p.x);
    ymin = Math.min(ymin, p.y);
    ymax = Math.max(ymax, p.y);
  });

  const widthCm = Math.max(0, (xmax - xmin) * scale);
  const heightCm = Math.max(0, (ymax - ymin) * scale);
  return {
    widthCm: Number(widthCm.toFixed(2)),
    heightCm: Number(heightCm.toFixed(2)),
    scale: Number(scale.toFixed(3))
  };
}

function collectNumericPointsFromTikz(code) {
  const text = String(code || '');
  const points = [];
  const coordMap = {};

  const coordDefRe = /\\coordinate\s*\(\s*([A-Za-z][A-Za-z0-9_]*)\s*\)\s*at\s*\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\)\s*;/g;
  let c = null;
  while ((c = coordDefRe.exec(text)) !== null) {
    const name = c[1];
    const x = Number(c[2]);
    const y = Number(c[3]);
    if (Number.isFinite(x) && Number.isFinite(y)) {
      coordMap[name] = { x, y };
      points.push({ x, y });
    }
  }

  const refToCoord = (token) => {
    const t = String(token || '').trim();
    const mNum = t.match(/^\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\)$/);
    if (mNum) return { x: Number(mNum[1]), y: Number(mNum[2]) };
    const mLab = t.match(/^\(\s*([A-Za-z][A-Za-z0-9_]*)\s*\)$/);
    if (mLab && coordMap[mLab[1]]) return coordMap[mLab[1]];
    return null;
  };

  const usedLabels = new Set();
  const lines = text.split('\n');
  lines.forEach((line) => {
    const s = line.trim();
    if (!s.startsWith('\\draw') && !s.startsWith('\\fill')) return;
    if (/\{\$x\$\}\s*;/.test(s) || /\{\$y\$\}\s*;/.test(s)) return;
    const reLabel = /\(\s*([A-Za-z][A-Za-z0-9_]*)\s*\)/g;
    let m = null;
    while ((m = reLabel.exec(s)) !== null) {
      const lab = m[1];
      if (!/^Ang\d+/i.test(lab)) usedLabels.add(lab);
    }
    const reNum = /\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\)/g;
    let n = null;
    while ((n = reNum.exec(s)) !== null) {
      const x = Number(n[1]);
      const y = Number(n[2]);
      if (Number.isFinite(x) && Number.isFinite(y)) points.push({ x, y });
    }

    // circle: \draw ... (A) circle[radius=2.40];
    const cMatch = s.match(/(\([^)]+\))\s*circle\s*\[\s*radius\s*=\s*(-?\d+(?:\.\d+)?)\s*\]/i);
    if (cMatch) {
      const center = refToCoord(cMatch[1]);
      const r = Math.abs(Number(cMatch[2]));
      if (center && Number.isFinite(r) && r > 1e-9) {
        points.push({ x: center.x + r, y: center.y });
        points.push({ x: center.x - r, y: center.y });
        points.push({ x: center.x, y: center.y + r });
        points.push({ x: center.x, y: center.y - r });
      }
    }

    // ellipse: \draw ... (O) ellipse[x radius=a, y radius=b];
    const eMatch = s.match(/(\([^)]+\))\s*ellipse\s*\[\s*x\s*radius\s*=\s*(-?\d+(?:\.\d+)?)\s*,\s*y\s*radius\s*=\s*(-?\d+(?:\.\d+)?)\s*\]/i);
    if (eMatch) {
      const center = refToCoord(eMatch[1]);
      const rx = Math.abs(Number(eMatch[2]));
      const ry = Math.abs(Number(eMatch[3]));
      if (center && Number.isFinite(rx) && Number.isFinite(ry) && rx > 1e-9 && ry > 1e-9) {
        // 若含旋转选项，为稳妥使用 max(rx,ry) 做保守包围盒
        const hasRotate = /rotate\s+around\s*=/.test(s);
        const ex = hasRotate ? Math.max(rx, ry) : rx;
        const ey = hasRotate ? Math.max(rx, ry) : ry;
        points.push({ x: center.x + ex, y: center.y });
        points.push({ x: center.x - ex, y: center.y });
        points.push({ x: center.x, y: center.y + ey });
        points.push({ x: center.x, y: center.y - ey });
      }
    }
  });

  if (usedLabels.size > 0) {
    usedLabels.forEach((lab) => {
      const p = coordMap[lab];
      if (p) points.push({ x: p.x, y: p.y });
    });
  } else {
    Object.keys(coordMap).forEach((lab) => {
      if (/^Ang\d+/i.test(lab)) return;
      const p = coordMap[lab];
      points.push({ x: p.x, y: p.y });
    });
  }

  return { points, coordMap };
}

function roundNice(v) {
  return Math.ceil(v * 2) / 2;
}

function computeOptimizedAxisBounds(points, axisPad = 0.5) {
  if (!points.length) {
    return { xmin: -3, xmax: 3, ymin: -3, ymax: 3 };
  }
  const clean = points.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
  if (!clean.length) return { xmin: -3, xmax: 3, ymin: -3, ymax: 3 };

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  clean.forEach((p) => {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  });

  const pad = Math.max(0.1, Math.min(5, Number(axisPad) || 0.5));
  // 新规则：直接取边界并向外扩 pad
  let xmin = minX - pad;
  let xmax = maxX + pad;
  let ymin = minY - pad;
  let ymax = maxY + pad;

  // 原点必须可见；若某侧不足，则以 pad 起/止
  if (xmin > -pad) xmin = -pad;
  if (xmax < pad) xmax = pad;
  if (ymin > -pad) ymin = -pad;
  if (ymax < pad) ymax = pad;

  // 刻度友好：向外 round 到 0.5
  const floorHalf = (v) => Math.floor(v * 2) / 2;
  const ceilHalf = (v) => Math.ceil(v * 2) / 2;
  xmin = floorHalf(xmin);
  xmax = ceilHalf(xmax);
  ymin = floorHalf(ymin);
  ymax = ceilHalf(ymax);

  // 兜底：避免宽高退化
  if (!(xmax > xmin)) { xmin -= 0.5; xmax += 0.5; }
  if (!(ymax > ymin)) { ymin -= 0.5; ymax += 0.5; }

  return { xmin, xmax, ymin, ymax };
}

function scoreSymmetricBounds(bounds, mode = 'area') {
  const w = Math.max(1e-6, Number(bounds.xmax) - Number(bounds.xmin));
  const h = Math.max(1e-6, Number(bounds.ymax) - Number(bounds.ymin));
  const area = w * h;
  if (mode === 'max_area') return [-area, h, w];
  if (mode === 'min_height') return [h, area, w];
  if (mode === 'min_width') return [w, area, h];
  return [area, h, w];
}

function selectSymmetricAxisBounds(baseBounds, mode = 'area') {
  const b = {
    xmin: Number(baseBounds?.xmin),
    xmax: Number(baseBounds?.xmax),
    ymin: Number(baseBounds?.ymin),
    ymax: Number(baseBounds?.ymax)
  };
  if (![b.xmin, b.xmax, b.ymin, b.ymax].every(Number.isFinite)) return baseBounds;

  const maxAbsX = Math.max(Math.abs(b.xmin), Math.abs(b.xmax));
  const maxAbsY = Math.max(Math.abs(b.ymin), Math.abs(b.ymax));
  const loYX = Math.min(b.xmin, b.ymin);
  const hiYX = Math.max(b.xmax, b.ymax);

  // 你要求的“整体面积最大优先”规则：
  // x、y 分别取绝对值较大的那一侧，再用相反数覆盖另一侧（即同时关于 x/y 轴对称）
  if (mode === 'max_area') {
    return {
      xmin: Math.floor((-maxAbsX) * 2) / 2,
      xmax: Math.ceil(maxAbsX * 2) / 2,
      ymin: Math.floor((-maxAbsY) * 2) / 2,
      ymax: Math.ceil(maxAbsY * 2) / 2
    };
  }

  const candidates = [
    // 关于 x 轴对称
    { xmin: b.xmin, xmax: b.xmax, ymin: -maxAbsY, ymax: maxAbsY },
    // 关于 y 轴对称
    { xmin: -maxAbsX, xmax: maxAbsX, ymin: b.ymin, ymax: b.ymax },
    // 关于 y = x 对称（x/y 同范围）
    { xmin: loYX, xmax: hiYX, ymin: loYX, ymax: hiYX },
    // 关于 y = -x 对称
    (() => {
      const xMin = Math.min(b.xmin, -b.ymax);
      const xMax = Math.max(b.xmax, -b.ymin);
      return { xmin: xMin, xmax: xMax, ymin: -xMax, ymax: -xMin };
    })()
  ];

  let best = candidates[0];
  let bestScore = scoreSymmetricBounds(best, mode);
  for (let i = 1; i < candidates.length; i++) {
    const c = candidates[i];
    const s = scoreSymmetricBounds(c, mode);
    let better = false;
    for (let j = 0; j < s.length; j++) {
      if (s[j] < bestScore[j] - 1e-9) { better = true; break; }
      if (s[j] > bestScore[j] + 1e-9) break;
    }
    if (better) {
      best = c;
      bestScore = s;
    }
  }

  return {
    xmin: Math.floor(best.xmin * 2) / 2,
    xmax: Math.ceil(best.xmax * 2) / 2,
    ymin: Math.floor(best.ymin * 2) / 2,
    ymax: Math.ceil(best.ymax * 2) / 2
  };
}

function getClipBounds(bounds, clipPad = 0) {
  const pad = Math.max(-3, Math.min(3, Number(clipPad) || 0));
  let xmin = Number((bounds.xmin - pad).toFixed(2));
  let xmax = Number((bounds.xmax + pad).toFixed(2));
  let ymin = Number((bounds.ymin - pad).toFixed(2));
  let ymax = Number((bounds.ymax + pad).toFixed(2));

  // 兜底：避免 clip 退化或反转
  if (!(xmax > xmin)) {
    const cx = (Number(bounds.xmin) + Number(bounds.xmax)) / 2;
    xmin = Number((cx - 0.25).toFixed(2));
    xmax = Number((cx + 0.25).toFixed(2));
  }
  if (!(ymax > ymin)) {
    const cy = (Number(bounds.ymin) + Number(bounds.ymax)) / 2;
    ymin = Number((cy - 0.25).toFixed(2));
    ymax = Number((cy + 0.25).toFixed(2));
  }
  return { xmin, xmax, ymin, ymax };
}

function replaceAutoClipBounds(out, bounds, clipPad = 0) {
  const { xmin, xmax, ymin, ymax } = getClipBounds(bounds, clipPad);

  const re = /(%\s*按坐标轴边界裁剪[^\n]*\n)(\s*)\\clip\s*\([^)]*\)\s*rectangle\s*\([^)]*\)\s*;/g;
  return String(out || '').replace(
    re,
    (_m, comment, indent) => `${comment}${indent}\\clip (${xmin},${ymin}) rectangle (${xmax},${ymax});`
  );
}

function alignFunctionDomainsToClip(out, bounds, clipPad = 0) {
  const { xmin, xmax } = getClipBounds(bounds, clipPad);
  const lines = String(out || '').split('\n');
  const domainRe = /domain\s*=\s*(-?\d+(?:\.\d+)?)\s*:\s*(-?\d+(?:\.\d+)?)/i;
  const inFuncPlot = (ln) => /\\draw\[/.test(ln) && /plot\s*\(\\x,\{/.test(ln);
  const hasPotentialDiscontinuity = (expr) => {
    const s = String(expr || '').toLowerCase();
    if (!s) return false;
    if (/\b(tan|cot|sec|csc|ln|log|sqrt|asin|acos)\s*\(/i.test(s)) return true;
    if (s.includes('/')) return true;
    return false;
  };
  const toNum = (v) => Number(Number(v).toFixed(2));

  const mapped = lines.map((ln) => {
    if (!inFuncPlot(ln)) return ln;
    const m = ln.match(domainRe);
    if (!m) return ln;
    const exprMatch = ln.match(/plot\s*\(\\x,\{([\s\S]*?)\}\)\s*;/i);
    const expr = exprMatch ? exprMatch[1] : '';
    const conservative = hasPotentialDiscontinuity(expr);
    const a = Number(m[1]);
    const b = Number(m[2]);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return ln;
    const forward = a <= b;
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    const nLo = conservative ? Math.max(lo, xmin) : xmin;
    const nHi = conservative ? Math.min(hi, xmax) : xmax;
    if (!(nHi > nLo)) return '';
    return ln.replace(
      domainRe,
      forward
        ? `domain=${toNum(nLo)}:${toNum(nHi)}`
        : `domain=${toNum(nHi)}:${toNum(nLo)}`
    );
  });

  return mapped.filter((ln) => ln !== '').join('\n');
}

function replaceAxisAndOrigin(out, bounds, options = {}) {
  const showAxis = options.showAxis !== false;
  const axisThickness = ALLOWED_TIKZ_THICKNESS.has(String(options.axisThickness || '').trim())
    ? String(options.axisThickness).trim()
    : 'semithick';
  const pointRadiusPtRaw = Number(options.pointRadiusPt);
  const pointRadiusPt = Number.isFinite(pointRadiusPtRaw)
    ? Math.max(0.05, Math.min(10, pointRadiusPtRaw))
    : 0.5;
  const srcLines = String(out || '').split('\n');
  const beginRe = /^\s*\\begin\{tikzpicture\}/;
  const endRe = /^\s*\\end\{tikzpicture\}/;
  const isAxisComment = (ln) => /^\s*%\s*坐标轴\s*$/.test(ln);
  const isXAxis = (ln) => /\\draw\[[^\]]*->/.test(ln) && /\{\$x\$\}\s*;/.test(ln);
  const isYAxis = (ln) => /\\draw\[[^\]]*->/.test(ln) && /\{\$y\$\}\s*;/.test(ln);
  const isOrigin = (ln) => /\\node\s+at\s*\([^)]*\)\s*\{\$O\$\}\s*;/.test(ln);
  const isAutoOriginPoint = (ln) => /%\s*axis-origin\s*$/.test(ln);
  const isPointsComment = (ln) => /^\s*%\s*点\s*$/.test(ln);
  const isPointLabelO = (ln) => /^(\s*\\fill\[[^\]]*\]\s*\([^)]+\)\s*circle\[radius=[^\]]+\]\s*)node\[[^\]]*\]\s*\{\$O\$\}\s*;/.test(ln);
  const xLine = `    \\draw[->, ${axisThickness}] (${bounds.xmin},0) -- (${bounds.xmax},0) node[right] {$x$};`;
  const yLine = `    \\draw[->, ${axisThickness}] (0,${bounds.ymin}) -- (0,${bounds.ymax}) node[above] {$y$};`;
  const originPointLine = `\\fill[black] (0.00,0.00) circle[radius=${Number(pointRadiusPt.toFixed(3))}pt] node[above right, xshift=0pt, yshift=0pt] {$O$}; % axis-origin`;

  const lines = [];
  let beginIdx = -1;
  let hasManualOriginPoint = false;
  srcLines.forEach((ln) => {
    if (isAxisComment(ln) || isXAxis(ln) || isYAxis(ln) || isOrigin(ln) || isAutoOriginPoint(ln)) return;
    if (isPointLabelO(ln)) hasManualOriginPoint = true;
    lines.push(ln);
  });
  lines.forEach((ln, idx) => {
    if (beginRe.test(ln) && beginIdx < 0) beginIdx = idx;
  });
  if (!showAxis) return lines.join('\n');
  const insertAt = beginIdx >= 0 ? beginIdx + 1 : 0;
  const add = ['    % 坐标轴', xLine, yLine];
  lines.splice(insertAt, 0, ...add);

  if (!hasManualOriginPoint) {
    let pIdx = -1;
    let endIdx = -1;
    lines.forEach((ln, idx) => {
      if (isPointsComment(ln) && pIdx < 0) pIdx = idx;
      if (endRe.test(ln) && endIdx < 0) endIdx = idx;
    });
    if (pIdx >= 0) {
      lines.splice(pIdx + 1, 0, originPointLine);
    } else if (endIdx >= 0) {
      lines.splice(endIdx, 0, '% 点', originPointLine);
    } else {
      lines.push('% 点', originPointLine);
    }
  }

  return lines.join('\n');
}

function estimateLabelTextWidthCm(text, fontPt = 12) {
  const t = String(text || '').replace(/\\[A-Za-z]+/g, 'x');
  const n = Math.max(1, t.length);
  return Math.max(0.22, (fontPt / 12) * (0.09 * n + 0.12));
}

function readLabelMaxShiftPt() {
  try {
    const raw = Number(localStorage.getItem(STORAGE_TIKZ_OPT_LABEL_MAX_SHIFT_PT) || 12);
    return Number.isFinite(raw) ? Math.max(2, Math.min(50, raw)) : 12;
  } catch {
    return 12;
  }
}

function normalizeLabelOverride(item, maxShiftPt = readLabelMaxShiftPt()) {
  if (!item || typeof item !== 'object') return null;
  const position = LABEL_POSITION_OPTIONS.includes(String(item.position || '').trim())
    ? String(item.position || '').trim()
    : 'above right';
  const xshift = Number(item.xshift);
  const yshift = Number(item.yshift);
  const clamp = Number.isFinite(Number(maxShiftPt))
    ? Math.max(2, Math.min(50, Number(maxShiftPt)))
    : 12;
  return {
    position,
    xshift: Number.isFinite(xshift) ? Math.max(-clamp, Math.min(clamp, xshift)) : 0,
    yshift: Number.isFinite(yshift) ? Math.max(-clamp, Math.min(clamp, yshift)) : 0
  };
}

function readLabelOverrides() {
  try {
    const raw = localStorage.getItem(STORAGE_TIKZ_LABEL_OVERRIDES);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    const out = {};
    Object.keys(parsed).forEach((k) => {
      const nk = String(k || '').trim();
      if (!nk) return;
      const n = normalizeLabelOverride(parsed[k]);
      if (n) out[nk] = n;
    });
    return out;
  } catch {
    return {};
  }
}

function writeLabelOverrides(map) {
  const out = {};
  Object.keys(map || {}).forEach((k) => {
    const nk = String(k || '').trim();
    if (!nk) return;
    const n = normalizeLabelOverride(map[k]);
    if (n) out[nk] = n;
  });
  localStorage.setItem(STORAGE_TIKZ_LABEL_OVERRIDES, JSON.stringify(out));
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(TIKZ_SETTINGS_UPDATED_EVENT, { detail: { source: 'label-overrides' } }));
  }
  return out;
}

function extractAdjustableLabelOptionsMap(code) {
  const lines = String(code || '').split('\n');
  const pointLineRe = /^(\s*\\fill\[[^\]]*\]\s*)(\([^)]+\))(\s*circle\[radius=[^\]]+\]\s*)node\[([^\]]*)\]\s*\{\$([^$]*)\$\}(;.*)$/;
  const nodeAtLineRe = /^(\s*\\node)\s*(\[[^\]]*\])?\s*at\s*(\([^)]+\))\s*\{\$([^$]*)\$\}(;.*)$/;
  const out = {};
  lines.forEach((ln) => {
    const pm = ln.match(pointLineRe);
    if (pm) {
      const opts = String(pm[4] || '');
      const label = String(pm[5] || '').trim();
      if (!label) return;
      const position = LABEL_POSITION_OPTIONS.find((p) => opts.includes(p)) || 'above right';
      const xMatch = opts.match(/xshift\s*=\s*(-?\d+(?:\.\d+)?)pt/i);
      const yMatch = opts.match(/yshift\s*=\s*(-?\d+(?:\.\d+)?)pt/i);
      out[label] = {
        position,
        xshift: xMatch ? Number(xMatch[1]) : 0,
        yshift: yMatch ? Number(yMatch[1]) : 0
      };
      return;
    }
    const nm = ln.match(nodeAtLineRe);
    if (nm) {
      const opts = String((nm[2] || '').replace(/^\[|\]$/g, ''));
      const label = String(nm[4] || '').trim();
      if (!label) return;
      const position = LABEL_POSITION_OPTIONS.find((p) => opts.includes(p)) || 'above right';
      const xMatch = opts.match(/xshift\s*=\s*(-?\d+(?:\.\d+)?)pt/i);
      const yMatch = opts.match(/yshift\s*=\s*(-?\d+(?:\.\d+)?)pt/i);
      out[label] = {
        position,
        xshift: xMatch ? Number(xMatch[1]) : 0,
        yshift: yMatch ? Number(yMatch[1]) : 0
      };
    }
  });
  return out;
}

function extractAdjustableLabelsFromTikz(code) {
  return Object.keys(extractAdjustableLabelOptionsMap(code)).sort();
}

function getTikzKeyOptionValue(optionsText, key) {
  const escaped = String(key || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(?:^|,)\\s*${escaped}\\s*=\\s*([^,]+)`, 'i');
  const m = String(optionsText || '').match(re);
  return m ? String(m[1] || '').trim() : '';
}

function removeTikzKeyOption(optionsText, key) {
  const escaped = String(key || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(^|,)\\s*${escaped}\\s*=\\s*[^,]*(?=,|$)`, 'ig');
  const out = String(optionsText || '').replace(re, '$1');
  return cleanupTikzOptionCommas(out);
}

function parseDashOptionFromTikzOptions(optionsText) {
  const opts = String(optionsText || '').toLowerCase();
  if (/(^|,)\s*dash\s+dot\s+dot\s*(,|$)/.test(opts)) return 'dash dot dot';
  if (/(^|,)\s*dash\s+dot\s*(,|$)/.test(opts)) return 'dash dot';
  if (/(^|,)\s*dashed\s*(,|$)/.test(opts) || /dash\s*pattern\s*=/.test(opts)) return 'dashed';
  if (/(^|,)\s*dotted\s*(,|$)/.test(opts)) return 'dotted';
  if (/(^|,)\s*solid\s*(,|$)/.test(opts)) return 'solid';
  return '';
}

function rebuildTikzCommandLine(prefix, optionsText, suffix) {
  const opts = cleanupTikzOptionCommas(optionsText);
  return opts ? `${prefix}[${opts}]${suffix}` : `${prefix}${suffix}`;
}

function extractAdjustableStyleItems(code) {
  const lines = String(code || '').split('\n');
  const out = [];
  let lineNo = 0;
  let faceNo = 0;
  lines.forEach((ln, idx) => {
    const s = String(ln || '');
    const t = s.trim();
    if (!t || t.startsWith('%')) return;

    const drawMatch = s.match(/^(\s*\\draw)(\[[^\]]*\])?(\s*.*)$/);
    if (drawMatch) {
      if (isAxisDrawLine(s)) return;
      const opts = String(drawMatch[2] || '').replace(/^\[|\]$/g, '');
      const suffix = String(drawMatch[3] || '');
      const hasCycle = /--\s*cycle/.test(suffix);
      const hasFill = /(^|,)\s*fill\s*=/i.test(opts);
      const kind = (hasCycle || hasFill) ? 'face' : 'line';
      if (kind === 'line') lineNo += 1;
      if (kind === 'face') faceNo += 1;
      const brief = suffix.replace(/\s+/g, ' ').trim().slice(0, 36);
      out.push({
        id: `${kind}:${idx}`,
        kind,
        lineIndex: idx,
        options: opts,
        label: `${kind === 'line' ? '线' : '面'} ${kind === 'line' ? lineNo : faceNo}${brief ? ` · ${brief}` : ''}`
      });
      return;
    }

    const fillMatch = s.match(/^(\s*\\fill)(\[[^\]]*\])?(\s*.*)$/);
    if (!fillMatch) return;
    const suffix = String(fillMatch[3] || '');
    if (!/--\s*cycle/.test(suffix)) return;
    faceNo += 1;
    const opts = String(fillMatch[2] || '').replace(/^\[|\]$/g, '');
    const brief = suffix.replace(/\s+/g, ' ').trim().slice(0, 36);
    out.push({
      id: `face:${idx}`,
      kind: 'face',
      lineIndex: idx,
      options: opts,
      label: `面 ${faceNo}${brief ? ` · ${brief}` : ''}`
    });
  });
  return out;
}

function applyStyleAdjustToTikzCode(code, targetId, patch = {}) {
  const id = String(targetId || '').trim();
  const m = id.match(/^(line|face):(\d+)$/);
  if (!m) return String(code || '');
  const kind = m[1];
  const lineIndex = Number(m[2]);
  const lines = String(code || '').split('\n');
  if (!Number.isInteger(lineIndex) || lineIndex < 0 || lineIndex >= lines.length) return String(code || '');
  const src = String(lines[lineIndex] || '');

  const drawMatch = src.match(/^(\s*\\draw)(\[[^\]]*\])?(\s*.*)$/);
  const fillMatch = src.match(/^(\s*\\fill)(\[[^\]]*\])?(\s*.*)$/);
  if (!drawMatch && !fillMatch) return String(code || '');

  if (kind === 'line') {
    if (!drawMatch || isAxisDrawLine(src)) return String(code || '');
    const prefix = drawMatch[1];
    let opts = String(drawMatch[2] || '').replace(/^\[|\]$/g, '');
    const suffix = drawMatch[3];
    opts = stripDashOptions(opts);
    const dash = normalizeLineDashOption(patch.lineDash || '');
    if (dash && dash !== 'solid') {
      opts = `${opts}${opts ? ', ' : ''}${dash}`;
    }
    const lineColor = String(patch.lineColor || '').trim();
    opts = lineColor ? setTikzKeyOption(opts, 'draw', lineColor) : removeTikzKeyOption(opts, 'draw');
    lines[lineIndex] = rebuildTikzCommandLine(prefix, opts, suffix);
    return lines.join('\n');
  }

  const faceColor = String(patch.faceColor || '').trim();
  const faceOpacityText = String(patch.faceOpacity ?? '').trim();
  const faceOpacityNum = Number(faceOpacityText);
  const hasFaceOpacity = faceOpacityText !== '' && Number.isFinite(faceOpacityNum);
  const faceOpacity = hasFaceOpacity ? Math.max(0, Math.min(1, faceOpacityNum)) : null;

  if (drawMatch) {
    const prefix = drawMatch[1];
    let opts = String(drawMatch[2] || '').replace(/^\[|\]$/g, '');
    const suffix = drawMatch[3];
    opts = faceColor ? setTikzKeyOption(opts, 'fill', faceColor) : removeTikzKeyOption(opts, 'fill');
    opts = hasFaceOpacity
      ? setTikzKeyOption(opts, 'fill opacity', Number(faceOpacity.toFixed(2)))
      : removeTikzKeyOption(opts, 'fill opacity');
    lines[lineIndex] = rebuildTikzCommandLine(prefix, opts, suffix);
    return lines.join('\n');
  }

  const prefix = fillMatch[1];
  let opts = String(fillMatch[2] || '').replace(/^\[|\]$/g, '');
  const suffix = fillMatch[3];
  opts = faceColor ? setTikzKeyOption(opts, 'fill', faceColor) : removeTikzKeyOption(opts, 'fill');
  opts = hasFaceOpacity
    ? setTikzKeyOption(opts, 'opacity', Number(faceOpacity.toFixed(2)))
    : removeTikzKeyOption(opts, 'opacity');
  lines[lineIndex] = rebuildTikzCommandLine(prefix, opts, suffix);
  return lines.join('\n');
}

function applyLabelOverridesToTikzCode(code, overrides = {}, labelFontPt = 12, labelMaxShiftPt = 12) {
  const lines = String(code || '').split('\n');
  const pointLineRe = /^(\s*\\fill\[[^\]]*\]\s*)(\([^)]+\))(\s*circle\[radius=[^\]]+\]\s*)node\[[^\]]*\]\s*\{\$([^$]*)\$\}(;.*)$/;
  const nodeAtLineRe = /^(\s*\\node)\s*(\[[^\]]*\])?\s*at\s*(\([^)]+\))\s*\{\$([^$]*)\$\}(;.*)$/;
  const fontPt = Math.max(8, Math.min(20, Number(labelFontPt) || 12));
  const fontOpt = `font=\\fontsize{${fontPt}pt}{${Math.round(fontPt + 1)}pt}\\selectfont`;
  const normalizeNodeOpts = (optsRaw, ov) => {
    const dropSet = new Set(LABEL_POSITION_OPTIONS.map((p) => p.toLowerCase()));
    const kept = String(optsRaw || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .filter((part) => {
        const lc = part.toLowerCase();
        if (dropSet.has(lc)) return false;
        if (/^xshift\s*=/.test(lc)) return false;
        if (/^yshift\s*=/.test(lc)) return false;
        if (/^font\s*=/.test(lc)) return false;
        return true;
      });
    return [ov.position, `xshift=${Number(ov.xshift.toFixed(2))}pt`, `yshift=${Number(ov.yshift.toFixed(2))}pt`, fontOpt, ...kept].join(', ');
  };

  const mapped = lines.map((ln) => {
    const m = ln.match(pointLineRe);
    if (m) {
      const prefix = m[1];
      const ref = m[2];
      const middle = m[3];
      const label = String(m[4] || '').trim();
      const suffix = m[5];
      const ov = normalizeLabelOverride(overrides[label], labelMaxShiftPt);
      if (!ov) return ln;
      const nodeOpts = `${ov.position}, xshift=${Number(ov.xshift.toFixed(2))}pt, yshift=${Number(ov.yshift.toFixed(2))}pt, ${fontOpt}`;
      return `${prefix}${ref}${middle}node[${nodeOpts}] {$${label}$}${suffix}`;
    }
    const n = ln.match(nodeAtLineRe);
    if (n) {
      const prefix = n[1];
      const optsRaw = String((n[2] || '').replace(/^\[|\]$/g, ''));
      const atRef = n[3];
      const label = String(n[4] || '').trim();
      const suffix = n[5];
      const ov = normalizeLabelOverride(overrides[label], labelMaxShiftPt);
      if (!ov) return ln;
      const nodeOpts = normalizeNodeOpts(optsRaw, ov);
      return `${prefix}[${nodeOpts}] at ${atRef} {$${label}$}${suffix}`;
    }
    return ln;
  });
  return mapped.join('\n');
}

function intersectsBox(a, b) {
  return !(a.x2 < b.x1 || a.x1 > b.x2 || a.y2 < b.y1 || a.y1 > b.y2);
}

function optimizePointLabels(out, coordMap, allPoints, options = {}) {
  const labelOffsetPt = Math.max(0, Math.min(8, Number(options.labelOffsetPt ?? 1)));
  const labelFontPt = Math.max(8, Math.min(20, Number(options.labelFontPt ?? 12)));
  const labelMaxShiftPt = Number.isFinite(Number(options.labelMaxShiftPt))
    ? Math.max(2, Math.min(50, Number(options.labelMaxShiftPt)))
    : readLabelMaxShiftPt();
  const labelOverrides = (options.labelOverrides && typeof options.labelOverrides === 'object')
    ? options.labelOverrides
    : {};
  const offsetCm = labelOffsetPt * 0.0353;
  const lines = String(out || '').split('\n');
  const assigned = [];

  const centroid = allPoints.length
    ? {
        x: allPoints.reduce((s, p) => s + p.x, 0) / allPoints.length,
        y: allPoints.reduce((s, p) => s + p.y, 0) / allPoints.length
      }
    : { x: 0, y: 0 };

  const candidates = [
    { key: 'above right', dx: 1, dy: 1 },
    { key: 'above left', dx: -1, dy: 1 },
    { key: 'below right', dx: 1, dy: -1 },
    { key: 'below left', dx: -1, dy: -1 },
    { key: 'above', dx: 0, dy: 1 },
    { key: 'below', dx: 0, dy: -1 },
    { key: 'right', dx: 1, dy: 0 },
    { key: 'left', dx: -1, dy: 0 }
  ];

  const refToCoord = (ref) => {
    const name = String(ref || '').trim();
    const mNum = name.match(/^\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\)$/);
    if (mNum) return { x: Number(mNum[1]), y: Number(mNum[2]) };
    const mLab = name.match(/^\(\s*([A-Za-z][A-Za-z0-9_]*)\s*\)$/);
    if (mLab && coordMap[mLab[1]]) return coordMap[mLab[1]];
    return null;
  };

  const pointLineRe = /^(\s*\\fill\[[^\]]*\]\s*)(\([^)]+\))(\s*circle\[radius=[^\]]+\]\s*)node\[[^\]]*\]\s*\{\$([^$]*)\$\}(;.*)$/;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(pointLineRe);
    if (!m) continue;
    const prefix = m[1];
    const ref = m[2];
    const middle = m[3];
    const label = m[4];
    const suffix = m[5];
    const p = refToCoord(ref);
    if (!p) continue;
    const forced = normalizeLabelOverride(labelOverrides[label], labelMaxShiftPt);
    if (forced) {
      const fontOpt = `font=\\fontsize{${labelFontPt}pt}{${Math.round(labelFontPt + 1)}pt}\\selectfont`;
      const nodeOpts = `${forced.position}, xshift=${Number(forced.xshift.toFixed(2))}pt, yshift=${Number(forced.yshift.toFixed(2))}pt, ${fontOpt}`;
      lines[i] = `${prefix}${ref}${middle}node[${nodeOpts}] {$${label}$}${suffix}`;
      continue;
    }

    const w = estimateLabelTextWidthCm(label, labelFontPt);
    const h = Math.max(0.16, 0.14 * (labelFontPt / 12));
    let best = null;
    let bestScore = Infinity;

    candidates.forEach((c) => {
      const cx = p.x + c.dx * (offsetCm + w * 0.35);
      const cy = p.y + c.dy * (offsetCm + h * 0.55);
      const box = { x1: cx - w / 2, x2: cx + w / 2, y1: cy - h / 2, y2: cy + h / 2 };
      let score = 0;
      assigned.forEach((b) => {
        if (intersectsBox(box, b)) score += 800;
      });
      allPoints.forEach((pp) => {
        if (pp === p) return;
        const dx = Math.max(0, box.x1 - pp.x, pp.x - box.x2);
        const dy = Math.max(0, box.y1 - pp.y, pp.y - box.y2);
        const d = Math.hypot(dx, dy);
        if (d < 0.18) score += (0.18 - d) * 350;
      });
      const outDx = p.x - centroid.x;
      const outDy = p.y - centroid.y;
      if (outDx * c.dx + outDy * c.dy < 0) score += 12;
      if (score < bestScore) {
        bestScore = score;
        best = { c, box };
      }
    });
    if (!best) continue;
    assigned.push(best.box);

    const sx = best.c.dx === 0 ? 0 : (best.c.dx * labelOffsetPt);
    const sy = best.c.dy === 0 ? 0 : (best.c.dy * labelOffsetPt);
    const fontOpt = `font=\\fontsize{${labelFontPt}pt}{${Math.round(labelFontPt + 1)}pt}\\selectfont`;
    const nodeOpts = `${best.c.key}, xshift=${sx}pt, yshift=${sy}pt, ${fontOpt}`;
    lines[i] = `${prefix}${ref}${middle}node[${nodeOpts}] {$${label}$}${suffix}`;
  }

  return lines.join('\n');
}

function optimizeTikzCodeRules(rawCode, prefs = {}) {
  const code = String(rawCode || '');
  if (!code.trim()) return code;
  const { points, coordMap } = collectNumericPointsFromTikz(code);
  const axisPad = Math.max(0.1, Math.min(5, Number(prefs.axisPad ?? 0.5)));
  const clipPad = Math.max(-3, Math.min(3, Number(prefs.clipPad ?? 0)));
  const symmetryEnabled = !!prefs.axisSymmetryEnabled;
  const symmetryMode = ['area', 'max_area', 'min_height', 'min_width'].includes(String(prefs.axisSymmetryMode || '').toLowerCase())
    ? String(prefs.axisSymmetryMode).toLowerCase()
    : 'area';
  let b = computeOptimizedAxisBounds(points, axisPad);
  if (symmetryEnabled) {
    b = selectSymmetricAxisBounds(b, symmetryMode);
  }
  const bboxW = Math.max(0.5, b.xmax - b.xmin);
  const bboxH = Math.max(0.5, b.ymax - b.ymin);
  const targetW = Math.max(4, Math.min(20, Number(prefs.targetWidthCm ?? 9)));
  const targetH = Math.max(4, Math.min(20, Number(prefs.targetHeightCm ?? 9)));
  const priority = ['fit', 'width', 'height'].includes(String(prefs.scalePriority || '').toLowerCase())
    ? String(prefs.scalePriority).toLowerCase()
    : 'fit';
  let scale = Math.min(targetW / bboxW, targetH / bboxH);
  if (priority === 'width') scale = targetW / bboxW;
  if (priority === 'height') scale = targetH / bboxH;
  scale = Math.max(0.5, Math.min(1.6, Number(scale.toFixed(2))));

  let out = code;
  out = out.replace(/\\begin\{tikzpicture\}\[([^\]]*)\]/, (m, opts) => {
    const cleaned = String(opts || '')
      .replace(/(^|,)\s*scale\s*=\s*[^,\]]+/i, '')
      .replace(/^,\s*|\s*,\s*$/g, '')
      .trim();
    return `\\begin{tikzpicture}[scale=${scale}${cleaned ? `, ${cleaned}` : ''}]`;
  });

  out = replaceAxisAndOrigin(out, b, {
    showAxis: prefs.showAxis !== false,
    axisThickness: prefs.axisThickness || 'semithick',
    pointRadiusPt: Number.isFinite(Number(prefs.pointRadiusPt)) ? Number(prefs.pointRadiusPt) : undefined
  });
  out = replaceAutoClipBounds(out, b, clipPad);
  out = alignFunctionDomainsToClip(out, b, clipPad);
  out = optimizePointLabels(out, coordMap, points, {
    labelOffsetPt: prefs.labelOffsetPt ?? 1,
    labelFontPt: prefs.labelFontPt ?? 12,
    labelMaxShiftPt: prefs.labelMaxShiftPt ?? readLabelMaxShiftPt(),
    labelOverrides: prefs.labelOverrides || {}
  });
  return out;
}

function cleanupTikzOptionCommas(text) {
  return String(text || '')
    .replace(/\s*,\s*/g, ', ')
    .replace(/^\s*,\s*|\s*,\s*$/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function stripDashOptions(optionsText) {
  let out = String(optionsText || '');
  out = out
    .replace(/(^|,)\s*dashed\s*(?=,|$)/gi, '$1')
    .replace(/(^|,)\s*dotted\s*(?=,|$)/gi, '$1')
    .replace(/(^|,)\s*dash\s+dot\s+dot\s*(?=,|$)/gi, '$1')
    .replace(/(^|,)\s*dash\s+dot\s*(?=,|$)/gi, '$1')
    .replace(/(^|,)\s*dash\s*pattern\s*=\s*[^,]*(?=,|$)/gi, '$1');
  return cleanupTikzOptionCommas(out);
}

function setTikzKeyOption(optionsText, key, value) {
  const re = new RegExp(`(^|,)\\s*${String(key).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*=\\s*[^,]*(?=,|$)`, 'i');
  let out = String(optionsText || '');
  if (re.test(out)) {
    out = out.replace(re, `$1 ${key}=${value}`);
  } else {
    out = `${out}${out.trim() ? ', ' : ''}${key}=${value}`;
  }
  return cleanupTikzOptionCommas(out);
}

function isAxisDrawLine(line) {
  return /\{\$[xyz]\$\}\s*;/.test(String(line || ''));
}

function applyGlobalTikzStyleOverrides(code, prefs = {}) {
  const faceColor = String(prefs.faceColor || '').trim();
  const faceOpacityRaw = Number(prefs.faceOpacity);
  const faceOpacity = Number.isFinite(faceOpacityRaw) ? Math.max(0, Math.min(1, faceOpacityRaw)) : null;
  const lineColor = String(prefs.lineColor || '').trim();
  const lineDash = normalizeLineDashOption(prefs.lineDash || '');
  const lines = String(code || '').split('\n');

  const updated = lines.map((line) => {
    const s = String(line || '');
    if (!s.trim() || s.trim().startsWith('%')) return s;

    const drawMatch = s.match(/^(\s*\\draw)\[([^\]]*)\](.*)$/);
    if (drawMatch) {
      const prefix = drawMatch[1];
      let opts = drawMatch[2];
      const suffix = drawMatch[3];
      const hasFill = /(^|,)\s*fill\s*=/.test(opts);

      if (!isAxisDrawLine(s)) {
        opts = stripDashOptions(opts);
        if (lineDash && lineDash !== 'solid') {
          opts = `${opts}${opts ? ', ' : ''}${lineDash}`;
        }
        if (lineColor) {
          opts = `${opts}${opts ? ', ' : ''}${lineColor}`;
        }
      }

      if (hasFill && faceColor) {
        opts = setTikzKeyOption(opts, 'fill', faceColor);
      }
      if (hasFill && faceOpacity !== null) {
        opts = setTikzKeyOption(opts, 'fill opacity', Number(faceOpacity.toFixed(2)));
      }
      return `${prefix}[${cleanupTikzOptionCommas(opts)}]${suffix}`;
    }

    const fillMatch = s.match(/^(\s*\\fill)\[([^\]]*)\](.*)$/);
    if (fillMatch && /--\s*cycle/.test(s)) {
      const prefix = fillMatch[1];
      let opts = fillMatch[2];
      const suffix = fillMatch[3];
      if (faceColor) {
        opts = `${opts}${opts ? ', ' : ''}${faceColor}`;
      }
      if (faceOpacity !== null) {
        opts = setTikzKeyOption(opts, 'opacity', Number(faceOpacity.toFixed(2)));
      }
      return `${prefix}[${cleanupTikzOptionCommas(opts)}]${suffix}`;
    }

    return s;
  });

  return updated.join('\n');
}

const ELEMENT_GROUPS = [
  { key: 'points', icon: '📍', title: '点' },
  { key: 'functions', icon: '📈', title: '函数' },
  { key: 'segments', icon: '━', title: '线段' },
  { key: 'polygons', icon: '⬠', title: '多边形' },
  { key: 'vectors', icon: '⇀', title: '向量' },
  { key: 'rays', icon: '↗', title: '射线' },
  { key: 'lines', icon: '╍', title: '直线' },
  { key: 'conics', icon: '○', title: '圆锥曲线' },
  { key: 'conicparts', icon: '◔', title: '圆弧/扇形' },
  { key: 'others', icon: '📦', title: '其他' }
];

function buildFallbackStructured(nativeApi) {
  const names = (nativeApi && typeof nativeApi.getAllObjectNames === 'function')
    ? (nativeApi.getAllObjectNames() || [])
    : [];
  const structured = {
    points: [],
    functions: [],
    segments: [],
    polygons: [],
    vectors: [],
    rays: [],
    lines: [],
    conics: [],
    conicparts: [],
    others: []
  };
  names.forEach((label) => {
    const tp = String((typeof nativeApi.getObjectType === 'function' ? nativeApi.getObjectType(label) : 'other') || 'other').toLowerCase();
    const item = { label, type: tp };
    if (tp === 'point') structured.points.push(item);
    else if (tp === 'function') structured.functions.push(item);
    else if (tp === 'segment') structured.segments.push(item);
    else if (tp === 'polygon') structured.polygons.push(item);
    else if (tp === 'vector') structured.vectors.push(item);
    else if (tp === 'ray') structured.rays.push(item);
    else if (tp === 'line') structured.lines.push(item);
    else if (tp === 'conic') structured.conics.push(item);
    else if (tp === 'conicpart') structured.conicparts.push(item);
    else structured.others.push(item);
  });
  return structured;
}

function formatElementSummary(el = {}) {
  if (el.type === 'point' && Number.isFinite(el.x) && Number.isFinite(el.y)) {
    return `(${el.x.toFixed(2)}, ${el.y.toFixed(2)})`;
  }
  if (el.type === 'segment') {
    if (el.startLabel && el.endLabel) return `${el.startLabel} -> ${el.endLabel}`;
  }
  if (el.type === 'line') {
    if (el.point1Label && el.point2Label) return `过 ${el.point1Label}, ${el.point2Label}`;
    if (Number.isFinite(el.a) && Number.isFinite(el.b) && Number.isFinite(el.c)) {
      return `${el.a.toFixed(2)}x + ${el.b.toFixed(2)}y + ${el.c.toFixed(2)} = 0`;
    }
  }
  if (el.type === 'ray') {
    if (el.startLabel && el.throughLabel) return `${el.startLabel} -> ${el.throughLabel}`;
  }
  if (el.type === 'vector') {
    if (el.startLabel && el.endLabel) return `${el.startLabel} -> ${el.endLabel}`;
  }
  if (typeof el.exp === 'string' && el.exp.trim()) return el.exp.trim();
  if (typeof el.commandName === 'string' && el.commandName.trim()) return el.commandName.trim();
  return el.type || 'object';
}

export default function NativeBoard({ onReadyChange, boardType = '2d', onBoardTypeChange }) {
  const getCenteredTikzWindowPos = () => {
    if (typeof window === 'undefined') return { x: 24, y: 24 };
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const modalWidth = Math.min(1500, Math.max(320, vw - 20));
    const modalHeight = Math.max(320, vh - 20);
    return {
      x: Math.max(8, Math.round((vw - modalWidth) / 2)),
      y: Math.max(8, Math.round((vh - modalHeight) / 2))
    };
  };

  const hostRef = useRef(null);
  const tikzModalRef = useRef(null);
  const tikzPreviewHostRef = useRef(null);
  const tikzDragStateRef = useRef({
    dragging: false,
    startX: 0,
    startY: 0,
    origX: 0,
    origY: 0,
    width: 0,
    height: 0
  });
  const [nativeApi, setNativeApi] = useState(null);
  const [boardStatus, setBoardStatus] = useState('画板初始化中...');
  const [actionStatus, setActionStatusRaw] = useState('');
  const [actionStatusTick, setActionStatusTick] = useState(0);
  const [toastItems, setToastItems] = useState([]);
  const [elementsOpen, setElementsOpen] = useState(false);
  const [elementsData, setElementsData] = useState(null);
  const [elementsRawXml, setElementsRawXml] = useState('');
  const [xmlLayerOpen, setXmlLayerOpen] = useState(false);
  const [tikzDebugOpen, setTikzDebugOpen] = useState(false);
  const [tikzDebugCode, setTikzDebugCode] = useState('');
  const [tikzPreviewContent, setTikzPreviewContent] = useState('');
  const [tikzPreviewSize, setTikzPreviewSize] = useState(null);
  const [tikzPreviewState, setTikzPreviewState] = useState({ phase: 'idle', message: '尚未编译', engine: '' });
  const [tikzPreviewRevision, setTikzPreviewRevision] = useState(0);
  const [tikzCompiledPdf, setTikzCompiledPdf] = useState('');
  const tikzCompileDebounceRef = useRef(null);
  const [tikzWindowPos, setTikzWindowPos] = useState(() => getCenteredTikzWindowPos());
  const [tikzPrefsOpen, setTikzPrefsOpen] = useState(false);
  const [labelOverrides, setLabelOverrides] = useState(() => readLabelOverrides());
  const [labelAdjustTarget, setLabelAdjustTarget] = useState('');
  const [labelAdjustPos, setLabelAdjustPos] = useState('above right');
  const [labelAdjustX, setLabelAdjustX] = useState('0');
  const [labelAdjustY, setLabelAdjustY] = useState('0');
  const [labelAdjustStep, setLabelAdjustStep] = useState('0.2');
  const labelAdjustAutoTimerRef = useRef(null);
  const [styleAdjustTarget, setStyleAdjustTarget] = useState('');
  const [styleAdjustLineColor, setStyleAdjustLineColor] = useState('');
  const [styleAdjustLineDash, setStyleAdjustLineDash] = useState('');
  const [styleAdjustFaceColor, setStyleAdjustFaceColor] = useState('');
  const [styleAdjustFaceOpacity, setStyleAdjustFaceOpacity] = useState('');
  const styleAdjustAutoTimerRef = useRef(null);
  const nudgeHoldDelayRef = useRef(null);
  const nudgeHoldIntervalRef = useRef(null);
  const [optTargetWcm, setOptTargetWcm] = useState(() => {
    const legacy = Number(localStorage.getItem(STORAGE_TIKZ_OPT_TARGET_CM) || 9);
    const v = Number(localStorage.getItem(STORAGE_TIKZ_OPT_TARGET_W_CM) || legacy);
    return Number.isFinite(v) ? Math.max(4, Math.min(20, v)) : 9;
  });
  const [optTargetHcm, setOptTargetHcm] = useState(() => {
    const legacy = Number(localStorage.getItem(STORAGE_TIKZ_OPT_TARGET_CM) || 9);
    const v = Number(localStorage.getItem(STORAGE_TIKZ_OPT_TARGET_H_CM) || legacy);
    return Number.isFinite(v) ? Math.max(4, Math.min(20, v)) : 9;
  });
  const [optScalePriority, setOptScalePriority] = useState(() => {
    const v = String(localStorage.getItem(STORAGE_TIKZ_OPT_PRIORITY) || 'fit').trim().toLowerCase();
    return ['fit', 'width', 'height'].includes(v) ? v : 'fit';
  });
  const [optAxisSymmetryEnabled, setOptAxisSymmetryEnabled] = useState(() => (localStorage.getItem(STORAGE_TIKZ_OPT_AXIS_SYMMETRY) || 'off') === 'on');
  const [optAxisSymmetryMode, setOptAxisSymmetryMode] = useState(() => {
    const v = String(localStorage.getItem(STORAGE_TIKZ_OPT_AXIS_SYMMETRY_MODE) || 'area').trim().toLowerCase();
    return ['area', 'max_area', 'min_height', 'min_width'].includes(v) ? v : 'area';
  });
  const [optAxisPad, setOptAxisPad] = useState(() => {
    const v = Number(localStorage.getItem(STORAGE_TIKZ_OPT_AXIS_PAD) || 0.5);
    return Number.isFinite(v) ? Math.max(0.1, Math.min(5, v)) : 0.5;
  });
  const [optClipPad, setOptClipPad] = useState(() => {
    const v = Number(localStorage.getItem(STORAGE_TIKZ_OPT_CLIP_PAD) || 0);
    return Number.isFinite(v) ? Math.max(-3, Math.min(3, v)) : 0;
  });
  const [optLabelOffsetPt, setOptLabelOffsetPt] = useState(() => {
    const v = Number(localStorage.getItem(STORAGE_TIKZ_OPT_LABEL_OFFSET_PT) || 1);
    return Number.isFinite(v) ? Math.max(0, Math.min(8, v)) : 1;
  });
  const [optLabelFontPt, setOptLabelFontPt] = useState(() => {
    const v = Number(localStorage.getItem(STORAGE_TIKZ_OPT_LABEL_FONT_PT) || 12);
    return Number.isFinite(v) ? Math.max(8, Math.min(20, v)) : 12;
  });
  const [optLabelMaxShiftPt, setOptLabelMaxShiftPt] = useState(() => {
    const v = Number(localStorage.getItem(STORAGE_TIKZ_OPT_LABEL_MAX_SHIFT_PT) || 12);
    return Number.isFinite(v) ? Math.max(2, Math.min(50, v)) : 12;
  });
  const [optAngleRegion, setOptAngleRegion] = useState(() => {
    const v = String(localStorage.getItem(STORAGE_TIKZ_ANGLE_REGION) || 'auto').trim().toLowerCase();
    return ['auto', 'left', 'right', 'above', 'below'].includes(v) ? v : 'auto';
  });
  const initTikz3d = readTikz3DSettings();
  const [tikzShowAxis, setTikzShowAxis] = useState(() => (localStorage.getItem(STORAGE_TIKZ_SHOW_AXIS) || 'on') === 'on');
  const [tikzLineExtendCfg, setTikzLineExtendCfg] = useState(() => Number(localStorage.getItem(STORAGE_TIKZ_LINE_EXTEND) || 0.25));
  const [tikzPointRadiusCfg, setTikzPointRadiusCfg] = useState(() => Number(localStorage.getItem(STORAGE_TIKZ_POINT_RADIUS) || 0.25));
  const [tikzPolygonFillCfg, setTikzPolygonFillCfg] = useState(() => localStorage.getItem(STORAGE_TIKZ_POLYGON_FILL) || 'black');
  const [tikzAxisThicknessCfg, setTikzAxisThicknessCfg] = useState(() => localStorage.getItem(STORAGE_TIKZ_AXIS_THICKNESS) || 'semithick');
  const [tikzConicThicknessCfg, setTikzConicThicknessCfg] = useState(() => localStorage.getItem(STORAGE_TIKZ_CONIC_THICKNESS) || 'thick');
  const [tikzFunctionThicknessCfg, setTikzFunctionThicknessCfg] = useState(() => localStorage.getItem(STORAGE_TIKZ_FUNCTION_THICKNESS) || 'thick');
  const [tikzLineThicknessCfg, setTikzLineThicknessCfg] = useState(() => localStorage.getItem(STORAGE_TIKZ_LINE_THICKNESS) || 'semithick');
  const [tikzSegmentThicknessCfg, setTikzSegmentThicknessCfg] = useState(() => localStorage.getItem(STORAGE_TIKZ_SEGMENT_THICKNESS) || 'thick');
  const [tikzPolygonThicknessCfg, setTikzPolygonThicknessCfg] = useState(() => localStorage.getItem(STORAGE_TIKZ_POLYGON_THICKNESS) || 'thick');
  const [tikz3dAzimuthCfg, setTikz3dAzimuthCfg] = useState(() => (
    Number.isFinite(initTikz3d.azimuthDeg) ? initTikz3d.azimuthDeg : DEFAULT_TIKZ3D_AZIMUTH
  ));
  const [tikz3dDepthCfg, setTikz3dDepthCfg] = useState(() => (
    Number.isFinite(initTikz3d.depthScale) ? initTikz3d.depthScale : DEFAULT_TIKZ3D_DEPTH
  ));
  const [tikz3dProjectionPresetCfg, setTikz3dProjectionPresetCfg] = useState(() => initTikz3d.projectionPreset || DEFAULT_TIKZ3D_PROJECTION_PRESET);
  const [tikz3dShowPointLabelsCfg, setTikz3dShowPointLabelsCfg] = useState(() => initTikz3d.showPointLabels);
  const [tikz3dAutoRoundPreferCfg, setTikz3dAutoRoundPreferCfg] = useState(() => initTikz3d.autoRoundPrefer !== false);
  const [optDraftTargetWcm, setOptDraftTargetWcm] = useState(optTargetWcm);
  const [optDraftTargetHcm, setOptDraftTargetHcm] = useState(optTargetHcm);
  const [optDraftScalePriority, setOptDraftScalePriority] = useState(optScalePriority);
  const [optDraftAxisSymmetryEnabled, setOptDraftAxisSymmetryEnabled] = useState(optAxisSymmetryEnabled);
  const [optDraftAxisSymmetryMode, setOptDraftAxisSymmetryMode] = useState(optAxisSymmetryMode);
  const [optDraftAxisPad, setOptDraftAxisPad] = useState(optAxisPad);
  const [optDraftClipPad, setOptDraftClipPad] = useState(optClipPad);
  const [optDraftLabelOffsetPt, setOptDraftLabelOffsetPt] = useState(optLabelOffsetPt);
  const [optDraftLabelFontPt, setOptDraftLabelFontPt] = useState(optLabelFontPt);
  const [optDraftLabelMaxShiftPt, setOptDraftLabelMaxShiftPt] = useState(optLabelMaxShiftPt);
  const [optDraftAngleRegion, setOptDraftAngleRegion] = useState(optAngleRegion);
  const [optDraftShowAxis, setOptDraftShowAxis] = useState(tikzShowAxis);
  const [optDraftLineExtend, setOptDraftLineExtend] = useState(tikzLineExtendCfg);
  const [optDraftPointRadius, setOptDraftPointRadius] = useState(tikzPointRadiusCfg);
  const [optDraftPolygonFill, setOptDraftPolygonFill] = useState(tikzPolygonFillCfg);
  const [optDraftAxisThickness, setOptDraftAxisThickness] = useState(tikzAxisThicknessCfg);
  const [optDraftConicThickness, setOptDraftConicThickness] = useState(tikzConicThicknessCfg);
  const [optDraftFunctionThickness, setOptDraftFunctionThickness] = useState(tikzFunctionThicknessCfg);
  const [optDraftLineThickness, setOptDraftLineThickness] = useState(tikzLineThicknessCfg);
  const [optDraftSegmentThickness, setOptDraftSegmentThickness] = useState(tikzSegmentThicknessCfg);
  const [optDraftPolygonThickness, setOptDraftPolygonThickness] = useState(tikzPolygonThicknessCfg);
  const [optDraft3dAzimuth, setOptDraft3dAzimuth] = useState(tikz3dAzimuthCfg);
  const [optDraft3dDepth, setOptDraft3dDepth] = useState(tikz3dDepthCfg);
  const [optDraft3dProjectionPreset, setOptDraft3dProjectionPreset] = useState(tikz3dProjectionPresetCfg);
  const [optDraft3dPointLabels, setOptDraft3dPointLabels] = useState(tikz3dShowPointLabelsCfg);
  const [optDraft3dAutoRoundPrefer, setOptDraft3dAutoRoundPrefer] = useState(tikz3dAutoRoundPreferCfg);
  const toastSeqRef = useRef(1);
  const toastTimerRef = useRef(new Map());
  const setActionStatus = useCallback((nextStatus) => {
    setActionStatusRaw(String(nextStatus || ''));
    setActionStatusTick((v) => v + 1);
  }, []);
  const pushToast = useCallback((message) => {
    const text = String(message || '').trim();
    if (!text) return;
    const id = `nb_${Date.now()}_${toastSeqRef.current++}`;
    setToastItems((prev) => [...prev, { id, text }]);
    const timer = window.setTimeout(() => {
      setToastItems((prev) => prev.filter((item) => item.id !== id));
      toastTimerRef.current.delete(id);
    }, TOAST_DURATION_MS);
    toastTimerRef.current.set(id, timer);
  }, []);

  const syncTikzPrefsFromStorage = useCallback(() => {
    const legacy = Number(localStorage.getItem(STORAGE_TIKZ_OPT_TARGET_CM) || 9);
    const nextTargetWRaw = Number(localStorage.getItem(STORAGE_TIKZ_OPT_TARGET_W_CM) || legacy);
    const nextTargetHRaw = Number(localStorage.getItem(STORAGE_TIKZ_OPT_TARGET_H_CM) || legacy);
    const nextTargetW = Number.isFinite(nextTargetWRaw) ? Math.max(4, Math.min(20, nextTargetWRaw)) : 9;
    const nextTargetH = Number.isFinite(nextTargetHRaw) ? Math.max(4, Math.min(20, nextTargetHRaw)) : 9;

    const nextPriorityRaw = String(localStorage.getItem(STORAGE_TIKZ_OPT_PRIORITY) || 'fit').trim().toLowerCase();
    const nextPriority = ['fit', 'width', 'height'].includes(nextPriorityRaw) ? nextPriorityRaw : 'fit';
    const nextAxisSymmetryEnabled = (localStorage.getItem(STORAGE_TIKZ_OPT_AXIS_SYMMETRY) || 'off') === 'on';
    const nextAxisSymmetryModeRaw = String(localStorage.getItem(STORAGE_TIKZ_OPT_AXIS_SYMMETRY_MODE) || 'area').trim().toLowerCase();
    const nextAxisSymmetryMode = ['area', 'max_area', 'min_height', 'min_width'].includes(nextAxisSymmetryModeRaw)
      ? nextAxisSymmetryModeRaw
      : 'area';
    const nextAxisPadRaw = Number(localStorage.getItem(STORAGE_TIKZ_OPT_AXIS_PAD) || 0.5);
    const nextAxisPad = Number.isFinite(nextAxisPadRaw) ? Math.max(0.1, Math.min(5, nextAxisPadRaw)) : 0.5;
    const nextClipPadRaw = Number(localStorage.getItem(STORAGE_TIKZ_OPT_CLIP_PAD) || 0);
    const nextClipPad = Number.isFinite(nextClipPadRaw) ? Math.max(-3, Math.min(3, nextClipPadRaw)) : 0;
    const nextLabelOffsetRaw = Number(localStorage.getItem(STORAGE_TIKZ_OPT_LABEL_OFFSET_PT) || 1);
    const nextLabelOffsetPt = Number.isFinite(nextLabelOffsetRaw) ? Math.max(0, Math.min(8, nextLabelOffsetRaw)) : 1;
    const nextLabelFontRaw = Number(localStorage.getItem(STORAGE_TIKZ_OPT_LABEL_FONT_PT) || 12);
    const nextLabelFontPt = Number.isFinite(nextLabelFontRaw) ? Math.max(8, Math.min(20, nextLabelFontRaw)) : 12;
    const nextLabelShiftRaw = Number(localStorage.getItem(STORAGE_TIKZ_OPT_LABEL_MAX_SHIFT_PT) || 12);
    const nextLabelMaxShiftPt = Number.isFinite(nextLabelShiftRaw) ? Math.max(2, Math.min(50, nextLabelShiftRaw)) : 12;
    const nextAngleRegionRaw = String(localStorage.getItem(STORAGE_TIKZ_ANGLE_REGION) || 'auto').trim().toLowerCase();
    const nextAngleRegion = ['auto', 'left', 'right', 'above', 'below'].includes(nextAngleRegionRaw) ? nextAngleRegionRaw : 'auto';

    const nextTikz = readTikzSettings();
    const nextTikz3d = readTikz3DSettings();
    const nextTikz3dAzimuth = Number.isFinite(nextTikz3d.azimuthDeg)
      ? nextTikz3d.azimuthDeg
      : DEFAULT_TIKZ3D_AZIMUTH;
    const nextTikz3dDepth = Number.isFinite(nextTikz3d.depthScale)
      ? nextTikz3d.depthScale
      : DEFAULT_TIKZ3D_DEPTH;
    const nextLabelOverrides = readLabelOverrides();

    setOptTargetWcm(nextTargetW);
    setOptTargetHcm(nextTargetH);
    setOptScalePriority(nextPriority);
    setOptAxisSymmetryEnabled(nextAxisSymmetryEnabled);
    setOptAxisSymmetryMode(nextAxisSymmetryMode);
    setOptAxisPad(nextAxisPad);
    setOptClipPad(nextClipPad);
    setOptLabelOffsetPt(nextLabelOffsetPt);
    setOptLabelFontPt(nextLabelFontPt);
    setOptLabelMaxShiftPt(nextLabelMaxShiftPt);
    setOptAngleRegion(nextAngleRegion);
    setTikzShowAxis(nextTikz.showAxis);
    setTikzLineExtendCfg(nextTikz.lineExtend);
    setTikzPointRadiusCfg(nextTikz.pointRadiusPt);
    setTikzPolygonFillCfg(nextTikz.polygonFillColor);
    setTikzAxisThicknessCfg(nextTikz.axisThickness);
    setTikzConicThicknessCfg(nextTikz.conicThickness);
    setTikzFunctionThicknessCfg(nextTikz.functionThickness);
    setTikzLineThicknessCfg(nextTikz.lineThickness);
    setTikzSegmentThicknessCfg(nextTikz.segmentThickness);
    setTikzPolygonThicknessCfg(nextTikz.polygonThickness);
    setTikz3dAzimuthCfg(nextTikz3dAzimuth);
    setTikz3dDepthCfg(nextTikz3dDepth);
    setTikz3dProjectionPresetCfg(nextTikz3d.projectionPreset || DEFAULT_TIKZ3D_PROJECTION_PRESET);
    setTikz3dShowPointLabelsCfg(nextTikz3d.showPointLabels);
    setTikz3dAutoRoundPreferCfg(nextTikz3d.autoRoundPrefer !== false);
    setLabelOverrides(nextLabelOverrides);

    setOptDraftTargetWcm(nextTargetW);
    setOptDraftTargetHcm(nextTargetH);
    setOptDraftScalePriority(nextPriority);
    setOptDraftAxisSymmetryEnabled(nextAxisSymmetryEnabled);
    setOptDraftAxisSymmetryMode(nextAxisSymmetryMode);
    setOptDraftAxisPad(nextAxisPad);
    setOptDraftClipPad(nextClipPad);
    setOptDraftLabelOffsetPt(nextLabelOffsetPt);
    setOptDraftLabelFontPt(nextLabelFontPt);
    setOptDraftLabelMaxShiftPt(nextLabelMaxShiftPt);
    setOptDraftAngleRegion(nextAngleRegion);
    setOptDraftShowAxis(nextTikz.showAxis);
    setOptDraftLineExtend(nextTikz.lineExtend);
    setOptDraftPointRadius(nextTikz.pointRadiusPt);
    setOptDraftPolygonFill(nextTikz.polygonFillColor);
    setOptDraftAxisThickness(nextTikz.axisThickness);
    setOptDraftConicThickness(nextTikz.conicThickness);
    setOptDraftFunctionThickness(nextTikz.functionThickness);
    setOptDraftLineThickness(nextTikz.lineThickness);
    setOptDraftSegmentThickness(nextTikz.segmentThickness);
    setOptDraftPolygonThickness(nextTikz.polygonThickness);
    setOptDraft3dAzimuth(nextTikz3dAzimuth);
    setOptDraft3dDepth(nextTikz3dDepth);
    setOptDraft3dProjectionPreset(nextTikz3d.projectionPreset || DEFAULT_TIKZ3D_PROJECTION_PRESET);
    setOptDraft3dPointLabels(nextTikz3d.showPointLabels);
    setOptDraft3dAutoRoundPrefer(nextTikz3d.autoRoundPrefer !== false);
  }, []);

  useEffect(() => {
    if (!actionStatus) return;
    pushToast(actionStatus);
  }, [actionStatus, actionStatusTick, pushToast]);

  useEffect(() => {
    return () => {
      toastTimerRef.current.forEach((timer) => clearTimeout(timer));
      toastTimerRef.current.clear();
    };
  }, []);

  useEffect(() => {
    const onTikzSettingsUpdated = () => {
      syncTikzPrefsFromStorage();
    };
    if (typeof window !== 'undefined') {
      window.addEventListener(TIKZ_SETTINGS_UPDATED_EVENT, onTikzSettingsUpdated);
    }
    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener(TIKZ_SETTINGS_UPDATED_EVENT, onTikzSettingsUpdated);
      }
    };
  }, [syncTikzPrefsFromStorage]);

  useEffect(() => {
    setBoardStatus(`画板切换中：${boardType === '3d' ? '立体' : '平面'}`);
  }, [boardType]);

  useEffect(() => {
    let cancelled = false;
    let applet = null;
    let appletApi = null;
    let resizeObserver = null;
    let rafId = 0;
    let stop3DEntryPresetRetry = null;

    const syncSize = () => {
      if (cancelled || !hostRef.current) return;
      syncAppletSizeToHost(hostRef.current, applet, appletApi);
    };
    const onWindowResize = () => {
      syncSize();
    };

    const init = async () => {
      try {
        await ensureGGBScript();
        await Promise.all([
          ensurePlainScript(PARSER_SCRIPT_URL),
          ensurePlainScript(TIKZ_SCRIPT_URL),
          ensurePlainScript(PARSER_3D_SCRIPT_URL),
          ensurePlainScript(TIKZ_3D_SCRIPT_URL)
        ]);
        if (cancelled) return;

        const initialSize = readHostSize(hostRef.current);

        const ggbParams = {
          appName: boardType === '3d' ? '3d' : 'geometry',
          width: initialSize.width,
          height: initialSize.height,
          showToolBar: true,
          showAlgebraInput: true,
          showMenuBar: true,
          enableRightClick: true,
          enableShiftDragZoom: true,
          showResetIcon: false,
          enableUndoRedo: true,
          language: 'zh',
          appletOnLoad: (api) => {
            if (cancelled) return;
            appletApi = api;
            setNativeApi(api);
            if (boardType === '3d') {
              if (typeof stop3DEntryPresetRetry === 'function') {
                stop3DEntryPresetRetry();
              }
              stop3DEntryPresetRetry = apply3DEntryPresetWithRetry(api, initialSize.width, initialSize.height);
              apply3DDisplayVisibility(api, { ...read3DDisplaySettings(), hardStopSpin: true });
            } else {
              applyAxesVisibility(api, readShowAxes());
              try {
                if (typeof api.setGridVisible === 'function') {
                  api.setGridVisible(readShowGrid());
                }
              } catch {
                // ignore API differences
              }
            }
            syncSize();
            onReadyChange?.(api, true);
            setBoardStatus(`原生 GeoGebra 已就绪（${boardType === '3d' ? '立体' : '平面'}）`);
          }
        };

        applet = new window.GGBApplet(ggbParams, true);
        // 必须在 inject() 之前覆盖 codebase：deployggb 的 init() 会先设成 geogebra.org 的
        // 默认地址，再用这里的覆盖值替换。第二个参数 true 表示离线模式。
        if (typeof applet.setHTML5Codebase === 'function') {
          applet.setHTML5Codebase(GGB_CODEBASE_URL, true);
        }
        if (hostRef.current) {
          hostRef.current.innerHTML = '';
          applet.inject(hostRef.current);
          syncSize();
          rafId = window.requestAnimationFrame(syncSize);
          if (typeof window.ResizeObserver === 'function') {
            resizeObserver = new window.ResizeObserver(syncSize);
            resizeObserver.observe(hostRef.current);
          }
          window.addEventListener('resize', onWindowResize);
        }
      } catch (e) {
        if (cancelled) return;
        setBoardStatus(`初始化失败：${e.message}`);
        setNativeApi(null);
        onReadyChange?.(null, false);
      }
    };

    init();

    return () => {
      cancelled = true;
      if (rafId) {
        window.cancelAnimationFrame(rafId);
      }
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
      if (typeof stop3DEntryPresetRetry === 'function') {
        stop3DEntryPresetRetry();
      }
      window.removeEventListener('resize', onWindowResize);
      setNativeApi(null);
      onReadyChange?.(null, false);
    };
  }, [onReadyChange, boardType]);

  const buildTikzFromBoard = (optOverrides = {}) => {
    if (boardType === '3d') {
      if (!(nativeApi && typeof nativeApi.getXML === 'function' && window.GGB3DParser && window.TikZ3DGenerator)) {
        throw new Error('3D 转译环境未就绪：缺少 3D 解析器或生成器');
      }
      const xml3d = nativeApi.getXML();
      const parser3d = new window.GGB3DParser(xml3d);
      const parsed3d = parser3d.parse();
      const tikzCfg3d = readTikzSettings();
      const tikz3dCfg = readTikz3DSettings();
      const xmlProjection = read3DProjectionFromXml(xml3d);
      const projectionPresetRaw = String(
        optOverrides.projectionPreset
        || tikz3dCfg.projectionPreset
        || DEFAULT_TIKZ3D_PROJECTION_PRESET
      ).trim().toLowerCase();
      const projectionPreset = VALID_TIKZ3D_PROJECTION_PRESETS.includes(projectionPresetRaw)
        ? projectionPresetRaw
        : DEFAULT_TIKZ3D_PROJECTION_PRESET;
      const autoRoundPrefer = typeof optOverrides.autoRoundPrefer === 'boolean'
        ? optOverrides.autoRoundPrefer
        : (tikz3dCfg.autoRoundPrefer !== false);
      const effectiveProjectionPreset = (
        projectionPreset === 'exam' && autoRoundPrefer && shouldPreferRoundProjection(parsed3d)
      )
        ? 'round'
        : projectionPreset;
      const baseAzimuthDeg = Number.isFinite(tikz3dCfg.azimuthDeg) ? tikz3dCfg.azimuthDeg : DEFAULT_TIKZ3D_AZIMUTH;
      const baseDepthScale = Number.isFinite(tikz3dCfg.depthScale) ? tikz3dCfg.depthScale : DEFAULT_TIKZ3D_DEPTH;
      const azimuthDeg = effectiveProjectionPreset === 'xml'
        ? xmlProjection.azimuthDeg
        : (
          Number.isFinite(Number(optOverrides.azimuthDeg))
            ? Number(optOverrides.azimuthDeg)
            : baseAzimuthDeg
        );
      const depthScale = effectiveProjectionPreset === 'xml'
        ? xmlProjection.depthScale
        : (
          Number.isFinite(Number(optOverrides.depthScale))
            ? Number(optOverrides.depthScale)
            : baseDepthScale
        );
      const showPointLabels = typeof optOverrides.showPointLabels === 'boolean'
        ? optOverrides.showPointLabels
        : tikz3dCfg.showPointLabels;
      const generator3d = new window.TikZ3DGenerator({
        outputMode: 'figure',
        projectionPreset: effectiveProjectionPreset === 'exam'
          ? 'exam'
          : (effectiveProjectionPreset === 'round' ? 'round' : 'azimuth'),
        axis: tikzCfg3d.showAxis,
        axisThickness: tikzCfg3d.axisThickness,
        lineStrokeThickness: tikzCfg3d.lineThickness,
        segmentStrokeThickness: tikzCfg3d.segmentThickness,
        polygonStrokeThickness: tikzCfg3d.polygonThickness,
        pointRadiusPt: tikzCfg3d.pointRadiusPt,
        fillPolygons: true,
        lineExtension: tikzCfg3d.lineExtend,
        azimuthDeg: Math.max(-180, Math.min(180, azimuthDeg)),
        depthScale: Math.max(0, Math.min(2, depthScale)),
        showPointLabels
      });
      return generator3d.generate(parsed3d);
    }
    if (!(nativeApi && typeof nativeApi.getXML === 'function' && window.GGBParser && window.TikZGenerator)) {
      throw new Error('当前环境未就绪：缺少原生画板或解析器');
    }
    const xml = nativeApi.getXML();
    const parser = new window.GGBParser(xml);
    const parsed = parser.parse();
    const bounds = deriveTikZBoundsFromParsed(parsed, DEFAULT_TIKZ_BOUNDS);
    const tikzCfg = readTikzSettings();
    const generator = new window.TikZGenerator({
      outputMode: 'figure',
      axis: tikzCfg.showAxis,
      grid: false,
      defaultStrokeColor: 'black',
      defaultStrokeThickness: 'thick',
      defaultPointColor: 'black',
      lineExtensionStart: tikzCfg.lineExtend,
      lineExtensionEnd: tikzCfg.lineExtend,
      pointRadiusPt: tikzCfg.pointRadiusPt,
      polygonFillColor: tikzCfg.polygonFillColor,
      axisThickness: tikzCfg.axisThickness,
      conicStrokeThickness: tikzCfg.conicThickness,
      functionStrokeThickness: tikzCfg.functionThickness,
      lineStrokeThickness: tikzCfg.lineThickness,
      segmentStrokeThickness: tikzCfg.segmentThickness,
      polygonStrokeThickness: tikzCfg.polygonThickness,
      lineLineAngleSelector: tikzCfg.lineLineAngleSelector,
      xmin: bounds.xmin,
      xmax: bounds.xmax,
      ymin: bounds.ymin,
      ymax: bounds.ymax
    });
    const rawCode = generator.generate(parsed);
    const optPrefs = {
      targetWidthCm: Number.isFinite(Number(optOverrides.targetWidthCm))
        ? Number(optOverrides.targetWidthCm)
        : optTargetWcm,
      targetHeightCm: Number.isFinite(Number(optOverrides.targetHeightCm))
        ? Number(optOverrides.targetHeightCm)
        : optTargetHcm,
      scalePriority: optOverrides.scalePriority || optScalePriority,
      axisSymmetryEnabled: typeof optOverrides.axisSymmetryEnabled === 'boolean'
        ? optOverrides.axisSymmetryEnabled
        : optAxisSymmetryEnabled,
      axisSymmetryMode: optOverrides.axisSymmetryMode || optAxisSymmetryMode,
      axisPad: Number.isFinite(Number(optOverrides.axisPad))
        ? Number(optOverrides.axisPad)
        : optAxisPad,
      clipPad: Number.isFinite(Number(optOverrides.clipPad))
        ? Number(optOverrides.clipPad)
        : optClipPad,
      labelOverrides: (optOverrides.labelOverrides && typeof optOverrides.labelOverrides === 'object')
        ? optOverrides.labelOverrides
        : labelOverrides,
      labelOffsetPt: Number.isFinite(Number(optOverrides.labelOffsetPt))
        ? Number(optOverrides.labelOffsetPt)
        : optLabelOffsetPt,
      labelFontPt: Number.isFinite(Number(optOverrides.labelFontPt))
        ? Number(optOverrides.labelFontPt)
        : optLabelFontPt,
      labelMaxShiftPt: Number.isFinite(Number(optOverrides.labelMaxShiftPt))
        ? Number(optOverrides.labelMaxShiftPt)
        : optLabelMaxShiftPt,
      showAxis: typeof optOverrides.showAxis === 'boolean' ? optOverrides.showAxis : tikzCfg.showAxis,
      axisThickness: optOverrides.axisThickness || tikzCfg.axisThickness,
      pointRadiusPt: Number.isFinite(Number(optOverrides.pointRadiusPt))
        ? Number(optOverrides.pointRadiusPt)
        : tikzCfg.pointRadiusPt
    };
    // 转译阶段默认执行规则优化（坐标轴/scale/标签）
    return optimizeTikzCodeRules(rawCode, optPrefs);
  };

  const compileTikzPreview = (code) => {
    const text = String(code || '').trim();
    if (!text) {
      setActionStatus('TikZ 调试区为空');
      return;
    }
    if (tikzCompileDebounceRef.current) {
      clearTimeout(tikzCompileDebounceRef.current);
      tikzCompileDebounceRef.current = null;
    }
    setTikzPreviewContent(text);
    setTikzPreviewSize(estimateTikzSizeCm(text));
    setTikzPreviewState({ phase: 'loading', message: '正在用本地 LaTeX 编译…', engine: 'latex' });
    setTikzPreviewRevision((revision) => revision + 1);
  };

  const scheduleTikzPreview = (code) => {
    const text = String(code || '').trim();
    if (!text) return;
    if (tikzCompileDebounceRef.current) clearTimeout(tikzCompileDebounceRef.current);
    setTikzPreviewState((current) => ({
      ...current,
      phase: 'pending',
      message: '已更新参数，停止微调后自动编译…'
    }));
    tikzCompileDebounceRef.current = setTimeout(() => {
      tikzCompileDebounceRef.current = null;
      compileTikzPreview(text);
    }, 600);
  };

  const aiOptimizeTikzCode = () => {
    setActionStatus('AI优化功能待接入，当前已默认执行规则转译优化');
  };

  const syncLabelAdjustFromCode = (code, targetLabel) => {
    const label = String(targetLabel || '').trim();
    if (!label) return;
    const fromOverride = normalizeLabelOverride(labelOverrides[label], optLabelMaxShiftPt);
    if (fromOverride) {
      setLabelAdjustPos(fromOverride.position);
      setLabelAdjustX(String(fromOverride.xshift));
      setLabelAdjustY(String(fromOverride.yshift));
      return;
    }
    const map = extractAdjustableLabelOptionsMap(code);
    const fromCode = normalizeLabelOverride(map[label], optLabelMaxShiftPt);
    if (fromCode) {
      setLabelAdjustPos(fromCode.position);
      setLabelAdjustX(String(fromCode.xshift));
      setLabelAdjustY(String(fromCode.yshift));
      return;
    }
    setLabelAdjustPos('above right');
    setLabelAdjustX('0');
    setLabelAdjustY('0');
  };

  const applyLabelAdjustToCode = ({ silent = false } = {}) => {
    const label = String(labelAdjustTarget || '').trim();
    if (!label) {
      if (!silent) setActionStatus('请先选择要微调的标签');
      return;
    }
    const ov = normalizeLabelOverride({
      position: labelAdjustPos,
      xshift: Number(labelAdjustX),
      yshift: Number(labelAdjustY)
    }, optLabelMaxShiftPt);
    if (!ov) {
      if (!silent) setActionStatus('标签参数无效');
      return;
    }
    const nextCode = applyLabelOverridesToTikzCode(tikzDebugCode, { [label]: ov }, optLabelFontPt, optLabelMaxShiftPt);
    setTikzDebugCode(nextCode);
    scheduleTikzPreview(nextCode);
    if (!silent) setActionStatus(`已自动应用标签 ${label} 的微调`);
  };

  const syncStyleAdjustFromCode = (code, targetId) => {
    const id = String(targetId || '').trim();
    if (!id) return;
    const item = extractAdjustableStyleItems(code).find((it) => it.id === id);
    if (!item) return;
    const opts = String(item.options || '');
    if (item.kind === 'line') {
      setStyleAdjustLineColor(getTikzKeyOptionValue(opts, 'draw') || '');
      setStyleAdjustLineDash(parseDashOptionFromTikzOptions(opts));
      return;
    }
    setStyleAdjustFaceColor(getTikzKeyOptionValue(opts, 'fill') || '');
    const opRaw = getTikzKeyOptionValue(opts, 'fill opacity') || getTikzKeyOptionValue(opts, 'opacity');
    const opNum = Number(opRaw);
    setStyleAdjustFaceOpacity(Number.isFinite(opNum) ? String(opNum) : '');
  };

  const applyStyleAdjustToCode = ({ silent = false } = {}) => {
    const id = String(styleAdjustTarget || '').trim();
    if (!id) {
      if (!silent) setActionStatus('请先选择要微调的线或面');
      return;
    }
    const kind = id.startsWith('line:') ? 'line' : (id.startsWith('face:') ? 'face' : '');
    if (!kind) {
      if (!silent) setActionStatus('当前目标不可微调');
      return;
    }
    const patch = kind === 'line'
      ? {
          lineColor: String(styleAdjustLineColor || '').trim(),
          lineDash: normalizeLineDashOption(styleAdjustLineDash || '')
        }
      : {
          faceColor: String(styleAdjustFaceColor || '').trim(),
          faceOpacity: String(styleAdjustFaceOpacity || '').trim()
        };
    const nextCode = applyStyleAdjustToTikzCode(tikzDebugCode, id, patch);
    if (nextCode === tikzDebugCode) return;
    setTikzDebugCode(nextCode);
    scheduleTikzPreview(nextCode);
    if (!silent) {
      setActionStatus(kind === 'line' ? '已应用当前线的微调' : '已应用当前面的微调');
    }
  };

  const resetCurrentStyleAdjust = () => {
    const id = String(styleAdjustTarget || '').trim();
    if (!id) {
      setActionStatus('请先选择要重置的线或面');
      return;
    }
    const kind = id.startsWith('line:') ? 'line' : (id.startsWith('face:') ? 'face' : '');
    const nextCode = applyStyleAdjustToTikzCode(tikzDebugCode, id, kind === 'line'
      ? { lineColor: '', lineDash: '' }
      : { faceColor: '', faceOpacity: '' });
    if (nextCode === tikzDebugCode) {
      setActionStatus('当前对象无可重置的微调项');
      return;
    }
    setTikzDebugCode(nextCode);
    scheduleTikzPreview(nextCode);
    if (kind === 'line') {
      setStyleAdjustLineColor('');
      setStyleAdjustLineDash('');
      setActionStatus('已重置当前线的微调');
    } else {
      setStyleAdjustFaceColor('');
      setStyleAdjustFaceOpacity('');
      setActionStatus('已重置当前面的微调');
    }
  };

  const nudgeLabelAdjust = (dx, dy) => {
    if (dx === 0 && dy === 0) {
      setLabelAdjustX('0');
      setLabelAdjustY('0');
      return;
    }
    const step = Number(labelAdjustStep);
    const unit = Number.isFinite(step) ? Math.max(0.2, Math.min(2, step)) : 0.2;
    const rangeMax = Number.isFinite(Number(optLabelMaxShiftPt))
      ? Math.max(2, Math.min(50, Number(optLabelMaxShiftPt)))
      : 12;
    const unitDecimals = String(unit).includes('.') ? String(unit).split('.')[1].length : 0;
    const nextByStep = (prev, delta) => {
      const base = Number(prev);
      const safeBase = Number.isFinite(base) ? base : 0;
      const stepped = Math.round((safeBase + delta * unit) / unit) * unit;
      const clamped = Math.max(-rangeMax, Math.min(rangeMax, stepped));
      return String(Number(clamped.toFixed(Math.max(1, unitDecimals))));
    };
    setLabelAdjustX((prev) => nextByStep(prev, dx));
    setLabelAdjustY((prev) => nextByStep(prev, dy));
  };

  const stopContinuousNudge = () => {
    if (nudgeHoldDelayRef.current) {
      clearTimeout(nudgeHoldDelayRef.current);
      nudgeHoldDelayRef.current = null;
    }
    if (nudgeHoldIntervalRef.current) {
      clearInterval(nudgeHoldIntervalRef.current);
      nudgeHoldIntervalRef.current = null;
    }
  };

  const startContinuousNudge = (dx, dy, event) => {
    event?.preventDefault?.();
    stopContinuousNudge();
    nudgeLabelAdjust(dx, dy);
    nudgeHoldDelayRef.current = setTimeout(() => {
      nudgeHoldIntervalRef.current = setInterval(() => {
        nudgeLabelAdjust(dx, dy);
      }, 70);
    }, 260);
  };

  const resetCurrentLabelAdjust = () => {
    const label = String(labelAdjustTarget || '').trim();
    if (!label) {
      setActionStatus('请先选择要重置的标签');
      return;
    }
    const nextMap = { ...(labelOverrides || {}) };
    delete nextMap[label];
    writeLabelOverrides(nextMap);
    setLabelOverrides(nextMap);
    setLabelAdjustPos('above right');
    setLabelAdjustX('0');
    setLabelAdjustY('0');
    const nextCode = applyLabelOverridesToTikzCode(tikzDebugCode, {
      [label]: { position: 'above right', xshift: 0, yshift: 0 }
    }, optLabelFontPt, optLabelMaxShiftPt);
    setTikzDebugCode(nextCode);
    scheduleTikzPreview(nextCode);
    setActionStatus(`已重置标签 ${label} 的微调`);
  };

  const openTikzPrefs = () => {
    setOptDraftTargetWcm(optTargetWcm);
    setOptDraftTargetHcm(optTargetHcm);
    setOptDraftScalePriority(optScalePriority);
    setOptDraftAxisSymmetryEnabled(optAxisSymmetryEnabled);
    setOptDraftAxisSymmetryMode(optAxisSymmetryMode);
    setOptDraftAxisPad(optAxisPad);
    setOptDraftClipPad(optClipPad);
    setOptDraftLabelOffsetPt(optLabelOffsetPt);
    setOptDraftLabelFontPt(optLabelFontPt);
    setOptDraftLabelMaxShiftPt(optLabelMaxShiftPt);
    setOptDraftAngleRegion(optAngleRegion);
    setOptDraftShowAxis(tikzShowAxis);
    setOptDraftLineExtend(tikzLineExtendCfg);
    setOptDraftPointRadius(tikzPointRadiusCfg);
    setOptDraftPolygonFill(tikzPolygonFillCfg);
    setOptDraftAxisThickness(tikzAxisThicknessCfg);
    setOptDraftConicThickness(tikzConicThicknessCfg);
    setOptDraftFunctionThickness(tikzFunctionThicknessCfg);
    setOptDraftLineThickness(tikzLineThicknessCfg);
    setOptDraftSegmentThickness(tikzSegmentThicknessCfg);
    setOptDraftPolygonThickness(tikzPolygonThicknessCfg);
    setOptDraft3dAzimuth(tikz3dAzimuthCfg);
    setOptDraft3dDepth(tikz3dDepthCfg);
    setOptDraft3dProjectionPreset(tikz3dProjectionPresetCfg);
    setOptDraft3dPointLabels(tikz3dShowPointLabelsCfg);
    setOptDraft3dAutoRoundPrefer(tikz3dAutoRoundPreferCfg);
    setTikzPrefsOpen(true);
  };

  const applyTikzPrefsAndClose = () => {
    const targetW = Math.max(4, Math.min(20, Number(optDraftTargetWcm) || 9));
    const targetH = Math.max(4, Math.min(20, Number(optDraftTargetHcm) || 9));
    const priority = ['fit', 'width', 'height'].includes(String(optDraftScalePriority || '').toLowerCase())
      ? String(optDraftScalePriority).toLowerCase()
      : 'fit';
    const axisSymmetryEnabled = !!optDraftAxisSymmetryEnabled;
    const axisSymmetryMode = ['area', 'max_area', 'min_height', 'min_width'].includes(String(optDraftAxisSymmetryMode || '').toLowerCase())
      ? String(optDraftAxisSymmetryMode).toLowerCase()
      : 'area';
    const axisPad = Math.max(0.1, Math.min(5, Number(optDraftAxisPad) || 0.5));
    const clipPad = Math.max(-3, Math.min(3, Number(optDraftClipPad) || 0));
    const labelOffsetPt = Math.max(0, Math.min(8, Number(optDraftLabelOffsetPt) || 1));
    const labelFontPt = Math.max(8, Math.min(20, Number(optDraftLabelFontPt) || 12));
    const labelMaxShiftPt = Math.max(2, Math.min(50, Number(optDraftLabelMaxShiftPt) || 12));
    const region = ['auto', 'left', 'right', 'above', 'below'].includes(optDraftAngleRegion)
      ? optDraftAngleRegion
      : 'auto';
    const showAxis = !!optDraftShowAxis;
    const lineExtendRaw = Number(optDraftLineExtend);
    const lineExtend = Number.isFinite(lineExtendRaw)
      ? Math.max(0, Math.min(6, lineExtendRaw))
      : 0.25;
    const pointRadiusPt = Math.max(0.05, Math.min(3, Number(optDraftPointRadius) || 0.25));
    const polygonFillColor = String(optDraftPolygonFill || 'black').trim() || 'black';
    const axisThickness = ALLOWED_TIKZ_THICKNESS.has(String(optDraftAxisThickness || '').trim())
      ? String(optDraftAxisThickness).trim()
      : 'semithick';
    const conicThickness = ALLOWED_TIKZ_THICKNESS.has(String(optDraftConicThickness || '').trim())
      ? String(optDraftConicThickness).trim()
      : 'thick';
    const functionThickness = ALLOWED_TIKZ_THICKNESS.has(String(optDraftFunctionThickness || '').trim())
      ? String(optDraftFunctionThickness).trim()
      : 'thick';
    const lineThickness = ALLOWED_TIKZ_THICKNESS.has(String(optDraftLineThickness || '').trim())
      ? String(optDraftLineThickness).trim()
      : 'semithick';
    const segmentThickness = ALLOWED_TIKZ_THICKNESS.has(String(optDraftSegmentThickness || '').trim())
      ? String(optDraftSegmentThickness).trim()
      : 'thick';
    const polygonThickness = ALLOWED_TIKZ_THICKNESS.has(String(optDraftPolygonThickness || '').trim())
      ? String(optDraftPolygonThickness).trim()
      : 'thick';
    const projectionPreset = VALID_TIKZ3D_PROJECTION_PRESETS.includes(String(optDraft3dProjectionPreset || '').trim().toLowerCase())
      ? String(optDraft3dProjectionPreset).trim().toLowerCase()
      : DEFAULT_TIKZ3D_PROJECTION_PRESET;
    const azimuthDeg = Math.max(-180, Math.min(180, Number(optDraft3dAzimuth) || DEFAULT_TIKZ3D_AZIMUTH));
    const depthScale = Math.max(0, Math.min(2, Number(optDraft3dDepth) || DEFAULT_TIKZ3D_DEPTH));
    const showPointLabels3d = !!optDraft3dPointLabels;
    const autoRoundPrefer3d = !!optDraft3dAutoRoundPrefer;
    const regenRequired = (
      lineExtend !== tikzLineExtendCfg
      || pointRadiusPt !== tikzPointRadiusCfg
      || polygonFillColor !== tikzPolygonFillCfg
      || conicThickness !== tikzConicThicknessCfg
      || functionThickness !== tikzFunctionThicknessCfg
      || lineThickness !== tikzLineThicknessCfg
      || segmentThickness !== tikzSegmentThicknessCfg
      || polygonThickness !== tikzPolygonThicknessCfg
    );
    setOptTargetWcm(targetW);
    setOptTargetHcm(targetH);
    setOptScalePriority(priority);
    setOptAxisSymmetryEnabled(axisSymmetryEnabled);
    setOptAxisSymmetryMode(axisSymmetryMode);
    setOptAxisPad(axisPad);
    setOptClipPad(clipPad);
    setOptLabelOffsetPt(labelOffsetPt);
    setOptLabelFontPt(labelFontPt);
    setOptLabelMaxShiftPt(labelMaxShiftPt);
    setOptAngleRegion(region);
    setTikzShowAxis(showAxis);
    setTikzLineExtendCfg(lineExtend);
    setTikzPointRadiusCfg(pointRadiusPt);
    setTikzPolygonFillCfg(polygonFillColor);
    setTikzAxisThicknessCfg(axisThickness);
    setTikzConicThicknessCfg(conicThickness);
    setTikzFunctionThicknessCfg(functionThickness);
    setTikzLineThicknessCfg(lineThickness);
    setTikzSegmentThicknessCfg(segmentThickness);
    setTikzPolygonThicknessCfg(polygonThickness);
    setTikz3dAzimuthCfg(azimuthDeg);
    setTikz3dDepthCfg(depthScale);
    setTikz3dProjectionPresetCfg(projectionPreset);
    setTikz3dShowPointLabelsCfg(showPointLabels3d);
    setTikz3dAutoRoundPreferCfg(autoRoundPrefer3d);
    localStorage.setItem(STORAGE_TIKZ_OPT_TARGET_W_CM, String(targetW));
    localStorage.setItem(STORAGE_TIKZ_OPT_TARGET_H_CM, String(targetH));
    localStorage.setItem(STORAGE_TIKZ_OPT_PRIORITY, priority);
    localStorage.setItem(STORAGE_TIKZ_OPT_AXIS_SYMMETRY, axisSymmetryEnabled ? 'on' : 'off');
    localStorage.setItem(STORAGE_TIKZ_OPT_AXIS_SYMMETRY_MODE, axisSymmetryMode);
    localStorage.setItem(STORAGE_TIKZ_OPT_AXIS_PAD, String(axisPad));
    localStorage.setItem(STORAGE_TIKZ_OPT_CLIP_PAD, String(clipPad));
    localStorage.setItem(STORAGE_TIKZ_OPT_LABEL_OFFSET_PT, String(labelOffsetPt));
    localStorage.setItem(STORAGE_TIKZ_OPT_LABEL_FONT_PT, String(labelFontPt));
    localStorage.setItem(STORAGE_TIKZ_OPT_LABEL_MAX_SHIFT_PT, String(labelMaxShiftPt));
    localStorage.setItem(STORAGE_TIKZ_OPT_TARGET_CM, String(Math.max(targetW, targetH)));
    localStorage.setItem(STORAGE_TIKZ_ANGLE_REGION, region);
    localStorage.setItem(STORAGE_TIKZ_SHOW_AXIS, showAxis ? 'on' : 'off');
    localStorage.setItem(STORAGE_TIKZ_LINE_EXTEND, String(lineExtend));
    localStorage.setItem(STORAGE_TIKZ_POINT_RADIUS, String(pointRadiusPt));
    localStorage.setItem(STORAGE_TIKZ_POLYGON_FILL, polygonFillColor);
    localStorage.setItem(STORAGE_TIKZ_AXIS_THICKNESS, axisThickness);
    localStorage.setItem(STORAGE_TIKZ_CONIC_THICKNESS, conicThickness);
    localStorage.setItem(STORAGE_TIKZ_FUNCTION_THICKNESS, functionThickness);
    localStorage.setItem(STORAGE_TIKZ_LINE_THICKNESS, lineThickness);
    localStorage.setItem(STORAGE_TIKZ_SEGMENT_THICKNESS, segmentThickness);
    localStorage.setItem(STORAGE_TIKZ_POLYGON_THICKNESS, polygonThickness);
    localStorage.setItem(STORAGE_TIKZ3D_AZIMUTH, String(azimuthDeg));
    localStorage.setItem(STORAGE_TIKZ3D_DEPTH, String(depthScale));
    localStorage.setItem(STORAGE_TIKZ3D_PROJECTION_PRESET, projectionPreset);
    localStorage.setItem(STORAGE_TIKZ3D_SHOW_POINT_LABELS, showPointLabels3d ? 'on' : 'off');
    localStorage.setItem(STORAGE_TIKZ3D_AUTO_ROUND_PREFER, autoRoundPrefer3d ? 'on' : 'off');
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(TIKZ_SETTINGS_UPDATED_EVENT, { detail: { source: 'native-board' } }));
    }
    if (tikzDebugOpen) {
      try {
        let refreshed = '';
        const currentCode = String(tikzDebugCode || '').trim();
        const labelFromCode = currentCode ? extractAdjustableLabelOptionsMap(currentCode) : {};
        const mergedLabelOverrides = { ...(labelOverrides || {}), ...labelFromCode };
        const optPayload = {
          targetWidthCm: targetW,
          targetHeightCm: targetH,
          scalePriority: priority,
          axisSymmetryEnabled,
          axisSymmetryMode,
          axisPad,
          clipPad,
          labelOffsetPt,
          labelFontPt,
          labelMaxShiftPt,
          showAxis,
          axisThickness,
          pointRadiusPt,
          projectionPreset,
          azimuthDeg,
          depthScale,
          showPointLabels: showPointLabels3d,
          labelOverrides: mergedLabelOverrides
        };
        // 这些参数依赖“重新转译”才会生效（线宽/填充/延伸等）。
        if (
          (regenRequired || boardType === '3d')
          && nativeApi
          && typeof nativeApi.getXML === 'function'
        ) {
          refreshed = buildTikzFromBoard(optPayload);
        } else if (currentCode && boardType !== '3d') {
          refreshed = optimizeTikzCodeRules(currentCode, optPayload);
        } else if (nativeApi && typeof nativeApi.getXML === 'function') {
          refreshed = buildTikzFromBoard(optPayload);
        }
        if (String(refreshed || '').trim()) {
          setTikzDebugCode(refreshed);
          compileTikzPreview(refreshed);
          setActionStatus(regenRequired ? '转译偏好已应用并重生成代码' : '转译偏好已应用到当前调试代码');
        } else {
          setActionStatus(regenRequired ? '转译偏好已应用（当前无法重生成）' : '转译偏好已应用');
        }
      } catch (e) {
        setActionStatus(`转译偏好已应用，但刷新失败：${e.message}`);
      }
    } else {
      setActionStatus('转译偏好已应用');
    }
    setTikzPrefsOpen(false);
  };

  const openTikzDebugger = () => {
    try {
      let code = '';
      if (nativeApi && typeof nativeApi.getXML === 'function') {
        code = buildTikzFromBoard();
      }
      if (!String(code || '').trim()) {
        setActionStatus('未获取到可调试的 TikZ 代码（请确认原生画板已就绪）');
        return;
      }
      setTikzDebugCode(code);
      setTikzWindowPos(getCenteredTikzWindowPos());
      setTikzDebugOpen(true);
      compileTikzPreview(code);
      setActionStatus('已打开 TikZ 调试器');
    } catch (e) {
      setActionStatus(`打开 TikZ 调试器失败：${e.message}`);
    }
  };

  const startDragTikzWindow = (event) => {
    if (event.button !== 0) return;
    const modal = tikzModalRef.current;
    if (!modal) return;
    const rect = modal.getBoundingClientRect();
    tikzDragStateRef.current = {
      dragging: true,
      startX: event.clientX,
      startY: event.clientY,
      origX: tikzWindowPos.x,
      origY: tikzWindowPos.y,
      width: rect.width,
      height: rect.height
    };
    event.preventDefault();
  };

  useEffect(() => {
    if (!tikzDebugOpen) return undefined;
    const onMove = (event) => {
      const s = tikzDragStateRef.current;
      if (!s.dragging) return;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const nx = s.origX + (event.clientX - s.startX);
      const ny = s.origY + (event.clientY - s.startY);
      const maxX = Math.max(8, vw - s.width - 8);
      const maxY = Math.max(8, vh - s.height - 8);
      setTikzWindowPos({
        x: Math.max(8, Math.min(maxX, nx)),
        y: Math.max(8, Math.min(maxY, ny))
      });
    };
    const onUp = () => {
      if (tikzDragStateRef.current.dragging) {
        tikzDragStateRef.current.dragging = false;
      }
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [tikzDebugOpen, tikzWindowPos.x, tikzWindowPos.y]);

  const debugPointLabels = extractAdjustableLabelsFromTikz(tikzDebugCode);
  const debugStyleItems = extractAdjustableStyleItems(tikzDebugCode);
  const styleAdjustTargetItem = debugStyleItems.find((it) => it.id === styleAdjustTarget) || null;
  const styleAdjustKind = styleAdjustTargetItem ? styleAdjustTargetItem.kind : '';

  useEffect(() => {
    if (!tikzDebugOpen) return;
    if (debugPointLabels.length === 0) {
      if (labelAdjustTarget) setLabelAdjustTarget('');
      return;
    }
    if (!debugPointLabels.includes(labelAdjustTarget)) {
      const next = debugPointLabels[0];
      setLabelAdjustTarget(next);
      syncLabelAdjustFromCode(tikzDebugCode, next);
    }
  }, [tikzDebugOpen, tikzDebugCode, labelAdjustTarget, debugPointLabels]);

  useEffect(() => {
    if (!tikzDebugOpen) return;
    const label = String(labelAdjustTarget || '').trim();
    if (!label) return;
    syncLabelAdjustFromCode(tikzDebugCode, label);
  }, [tikzDebugOpen, labelAdjustTarget, optLabelMaxShiftPt]);

  useEffect(() => {
    if (!tikzDebugOpen) return;
    if (debugStyleItems.length === 0) {
      if (styleAdjustTarget) setStyleAdjustTarget('');
      return;
    }
    if (!debugStyleItems.some((it) => it.id === styleAdjustTarget)) {
      const next = debugStyleItems[0].id;
      setStyleAdjustTarget(next);
      syncStyleAdjustFromCode(tikzDebugCode, next);
    }
  }, [tikzDebugOpen, tikzDebugCode, styleAdjustTarget, debugStyleItems]);

  useEffect(() => {
    if (!tikzDebugOpen) return;
    const id = String(styleAdjustTarget || '').trim();
    if (!id) return;
    syncStyleAdjustFromCode(tikzDebugCode, id);
  }, [tikzDebugOpen, styleAdjustTarget, tikzDebugCode]);

  useEffect(() => {
    if (!tikzDebugOpen) return;
    if (!String(labelAdjustTarget || '').trim()) return;
    const ov = normalizeLabelOverride({
      position: labelAdjustPos,
      xshift: Number(labelAdjustX),
      yshift: Number(labelAdjustY)
    }, optLabelMaxShiftPt);
    if (!ov) return;
    if (labelAdjustAutoTimerRef.current) {
      clearTimeout(labelAdjustAutoTimerRef.current);
    }
    labelAdjustAutoTimerRef.current = setTimeout(() => {
      applyLabelAdjustToCode({ silent: true });
    }, 160);
    return () => {
      if (labelAdjustAutoTimerRef.current) {
        clearTimeout(labelAdjustAutoTimerRef.current);
        labelAdjustAutoTimerRef.current = null;
      }
    };
  }, [tikzDebugOpen, labelAdjustTarget, labelAdjustPos, labelAdjustX, labelAdjustY, optLabelMaxShiftPt]);

  useEffect(() => {
    if (!tikzDebugOpen) return;
    if (!String(styleAdjustTarget || '').trim()) return;
    if (styleAdjustAutoTimerRef.current) {
      clearTimeout(styleAdjustAutoTimerRef.current);
    }
    styleAdjustAutoTimerRef.current = setTimeout(() => {
      applyStyleAdjustToCode({ silent: true });
    }, 160);
    return () => {
      if (styleAdjustAutoTimerRef.current) {
        clearTimeout(styleAdjustAutoTimerRef.current);
        styleAdjustAutoTimerRef.current = null;
      }
    };
  }, [
    tikzDebugOpen,
    styleAdjustTarget,
    styleAdjustLineColor,
    styleAdjustLineDash,
    styleAdjustFaceColor,
    styleAdjustFaceOpacity
  ]);

  useEffect(() => {
    if (!tikzDebugOpen) return undefined;
    const stop = () => stopContinuousNudge();
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
    return () => {
      window.removeEventListener('pointerup', stop);
      window.removeEventListener('pointercancel', stop);
      stopContinuousNudge();
      if (tikzCompileDebounceRef.current) {
        clearTimeout(tikzCompileDebounceRef.current);
        tikzCompileDebounceRef.current = null;
      }
    };
  }, [tikzDebugOpen]);

  const copyCompiledVector = async () => {
    if (!tikzCompiledPdf) {
      setActionStatus('尚无可导出的矢量预览，请先编译');
      return;
    }
    try {
      const blob = await fetch(tikzCompiledPdf).then((response) => response.blob());
      if (navigator.clipboard?.write && typeof ClipboardItem !== 'undefined') {
        try {
          await navigator.clipboard.write([new ClipboardItem({ 'application/pdf': blob })]);
          setActionStatus('已将矢量 PDF 复制到剪切板');
          return;
        } catch {
          // Chromium 通常不允许 PDF MIME，继续使用 macOS 后端剪切板。
        }
      }
      const response = await fetch(withBase('api/tikz/copy-pdf'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pdf: tikzCompiledPdf })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || '剪切板写入失败');
      setActionStatus('已将矢量 PDF 复制到系统剪切板');
    } catch (error) {
      setActionStatus(`矢量图复制失败：${error.message}`);
    }
  };

  const saveCompiledVector = async () => {
    if (!tikzCompiledPdf) {
      setActionStatus('尚无可导出的矢量预览，请先编译');
      return;
    }
    try {
      const blob = await fetch(tikzCompiledPdf).then((response) => response.blob());
      const suggestedName = `tikz-preview-${new Date().toISOString().replace(/[:.]/g, '-')}.pdf`;
      if (typeof window.showSaveFilePicker === 'function') {
        const handle = await window.showSaveFilePicker({
          suggestedName,
          types: [{ description: '矢量 PDF', accept: { 'application/pdf': ['.pdf'] } }]
        });
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
      } else {
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = suggestedName;
        anchor.click();
        URL.revokeObjectURL(url);
      }
      setActionStatus('已导出矢量 PDF 文件');
    } catch (error) {
      if (error.name !== 'AbortError') setActionStatus(`矢量图导出失败：${error.message}`);
    }
  };

  const exportTikz = async () => {
    try {
      if (nativeApi && typeof nativeApi.getXML === 'function') {
        const code = buildTikzFromBoard();
        await navigator.clipboard.writeText(code);
        setActionStatus('已复制 TikZ 代码');
        return;
      }
      setActionStatus('导出失败：原生画板未就绪');
    } catch (e) {
      setActionStatus(`TikZ 导出失败：${e.message}`);
    }
  };

  const exportImage = async () => {
    try {
      const mode = (localStorage.getItem(STORAGE_EXPORT_IMAGE_MODE) || 'file') === 'clipboard' ? 'clipboard' : 'file';
      const scale = Math.max(1, Math.min(4, Number(localStorage.getItem(STORAGE_EXPORT_SCALE) || 2)));

      if (nativeApi && typeof nativeApi.getPNGBase64 === 'function') {
        const raw = nativeApi.getPNGBase64(scale, false, 300, false, false);
        if (!raw) throw new Error('未获取到 PNG 数据');
        const dataUrl = raw.startsWith('data:image') ? raw : `data:image/png;base64,${raw}`;

        if (mode === 'clipboard') {
          const blob = dataUrlToBlob(dataUrl);
          await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
          setActionStatus('已复制图片到剪贴板');
          return;
        }

        const a = document.createElement('a');
        a.href = dataUrl;
        a.download = `geogebra-${Date.now()}.png`;
        a.click();
        setActionStatus('已下载图片文件');
        return;
      }
      setActionStatus('导出失败：原生画板未就绪');
    } catch (e) {
      setActionStatus(`图片导出失败：${e.message}`);
    }
  };

  const showBoardElements = () => {
    try {
      if (!nativeApi) {
        setActionStatus('元素查看失败：画板未就绪');
        return;
      }

      const parserCtor = boardType === '3d' ? window.GGB3DParser : window.GGBParser;
      if (typeof nativeApi.getXML === 'function' && typeof parserCtor === 'function') {
        const xml = nativeApi.getXML() || '';
        const parser = new parserCtor(xml);
        const parsed = parser.parse();
        const structured = parsed?.structured || buildFallbackStructured(nativeApi);
        setElementsRawXml(xml);
        setElementsData({ ...parsed, structured });
        setElementsOpen(true);
        setActionStatus('已打开画板元素');
        return;
      }

      if (typeof nativeApi.getAllObjectNames === 'function') {
        const structured = buildFallbackStructured(nativeApi);
        setElementsRawXml('');
        setElementsData({ structured, semantics: {}, stats: {} });
        setElementsOpen(true);
        setActionStatus('已打开画板元素（基础模式）');
        return;
      }

      setActionStatus('元素查看不可用');
    } catch (e) {
      setActionStatus(`元素查看失败：${e.message}`);
    }
  };

  const clearBoard = () => {
    try {
      if (!nativeApi) {
        setActionStatus('清空失败：原生画板未就绪');
        return;
      }
      const result = clearBoardObjects(nativeApi);
      if (!result.ok) {
        setActionStatus('清空失败：当前对象不可删除');
        return;
      }
      if (boardType === '3d') {
        apply3DDisplayVisibility(nativeApi, { ...read3DDisplaySettings(), hardStopSpin: true });
      } else {
        applyAxesVisibility(nativeApi, readShowAxes());
        try {
          if (typeof nativeApi.setGridVisible === 'function') {
            nativeApi.setGridVisible(readShowGrid());
          }
        } catch {
          // ignore API differences
        }
      }
      setActionStatus(result.deleted > 0 ? `已清空画板（删除 ${result.deleted} 个对象）` : '已清空画板');
    } catch (e) {
      setActionStatus(`清空失败：${e.message}`);
    }
  };

  const copyElementsJson = async () => {
    try {
      if (!elementsData) return;
      const payload = {
        meta: {
          version: 'react-elements-viewer',
          exportedAt: new Date().toISOString()
        },
        structured: elementsData.structured || {},
        semantics: elementsData.semantics || {},
        stats: elementsData.stats || {}
      };
      await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
      setActionStatus('元素 JSON 已复制');
    } catch (e) {
      setActionStatus(`复制失败：${e.message}`);
    }
  };

  const downloadElementsJson = () => {
    try {
      if (!elementsData) return;
      const payload = {
        meta: {
          version: 'react-elements-viewer',
          exportedAt: new Date().toISOString()
        },
        structured: elementsData.structured || {},
        semantics: elementsData.semantics || {},
        stats: elementsData.stats || {}
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `geogebra-debug-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setActionStatus('元素 JSON 已下载');
    } catch (e) {
      setActionStatus(`下载失败：${e.message}`);
    }
  };

  const copyRawXml = async () => {
    try {
      const xml = String(elementsRawXml || '').trim();
      if (!xml) {
        setActionStatus('当前没有可复制的 XML 数据');
        return;
      }
      await navigator.clipboard.writeText(xml);
      setActionStatus('原始 XML 已复制');
    } catch (e) {
      setActionStatus(`复制 XML 失败：${e.message}`);
    }
  };

  const downloadRawXml = () => {
    try {
      const xml = String(elementsRawXml || '').trim();
      if (!xml) {
        setActionStatus('当前没有可下载的 XML 数据');
        return;
      }
      const blob = new Blob([xml], { type: 'application/xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `geogebra-raw-${Date.now()}.xml`;
      a.click();
      URL.revokeObjectURL(url);
      setActionStatus('原始 XML 已下载');
    } catch (e) {
      setActionStatus(`下载 XML 失败：${e.message}`);
    }
  };
  useEffect(() => {
    const host = tikzPreviewHostRef.current;
    if (!host) return;

    const content = String(tikzPreviewContent || '').trim();
    if (!content) return;

    const controller = new AbortController();
    let cancelled = false;
    const renderPreview = async () => {
      setTikzPreviewState({ phase: 'loading', message: '正在用本地 LaTeX 编译…', engine: 'latex' });
      try {
        const response = await fetch(withBase('api/tikz/compile'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: content }),
          signal: controller.signal
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          const error = new Error(data.message || `本地编译服务返回 HTTP ${response.status}`);
          error.canFallback = response.status === 503 || response.status === 404;
          throw error;
        }
        if (cancelled) return;
        host.innerHTML = '';
        const image = document.createElement('img');
        image.src = String(data.image || '');
        image.alt = 'TikZ 编译预览';
        host.appendChild(image);
        if (!image.src.startsWith('data:image/')) throw new Error('本地编译未返回有效图像');
        setTikzCompiledPdf(String(data.pdf || ''));
        setTikzPreviewState({ phase: 'success', message: '编译成功', engine: '本地 LaTeX' });
      } catch (error) {
        if (cancelled || error.name === 'AbortError') return;
        const networkFailure = error instanceof TypeError;
        if (!networkFailure && !error.canFallback) {
          host.innerHTML = '';
          setTikzPreviewState({ phase: 'error', message: error.message, engine: '本地 LaTeX' });
          return;
        }

        setTikzPreviewState({ phase: 'loading', message: '本地 LaTeX 不可用，正在回退到浏览器渲染…', engine: 'TikZJax' });
        try {
          await renderTikzJaxFallback(host, content);
          if (!cancelled) setTikzPreviewState({ phase: 'success', message: '编译成功（回退模式）', engine: 'TikZJax' });
        } catch (fallbackError) {
          if (!cancelled) {
            host.innerHTML = '';
            setTikzPreviewState({
              phase: 'error',
              message: `本地 LaTeX：${error.message}；TikZJax：${fallbackError.message}`,
              engine: ''
            });
          }
        }
      }
    };
    renderPreview();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [tikzPreviewContent, tikzPreviewRevision]);

  return (
    <section className="panel panel-right">
      {toastItems.length ? (
        <div className="top-toast-stack">
          {toastItems.map((item) => (
            <div key={item.id} className="top-toast">❗ {item.text}</div>
          ))}
        </div>
      ) : null}
      <header className="panel-subheader">
        <h2>原生 GeoGebra 画板（React）</h2>
        <div className="board-head-actions">
          <div className="board-type-switch">
            <button
              className={`btn btn-lite board-btn board-type-btn ${boardType === '2d' ? 'is-active' : ''}`}
              onClick={() => onBoardTypeChange?.('2d')}
            >
              2D 画板
            </button>
            <button
              className={`btn btn-lite board-btn board-type-btn ${boardType === '3d' ? 'is-active' : ''}`}
              onClick={() => onBoardTypeChange?.('3d')}
            >
              3D 画板
            </button>
          </div>
          <button className="btn btn-lite board-btn" onClick={clearBoard}>清空画板</button>
          <button className="btn btn-lite board-btn" onClick={showBoardElements}>画板元素</button>
          <button className="btn btn-lite board-btn" onClick={exportImage}>导出图片</button>
          <button className="btn btn-lite board-btn" onClick={openTikzDebugger}>TikZ 调试</button>
          <button className="btn board-btn" onClick={exportTikz}>导出 TikZ</button>
        </div>
      </header>
      <div className="board-status">{actionStatus || boardStatus}</div>
      <div className="native-board-host" ref={hostRef} />

      {elementsOpen ? (
        <div className="settings-modal-overlay" onClick={() => setElementsOpen(false)}>
          <div className="settings-modal elements-modal" onClick={(e) => e.stopPropagation()}>
            <div className="settings-modal-head">
              <strong>📊 画板元素</strong>
              <button className="btn btn-lite" onClick={() => setElementsOpen(false)}>关闭</button>
            </div>

            <div className="elements-stats-grid">
              {ELEMENT_GROUPS.map((group) => {
                const count = (elementsData?.structured?.[group.key] || []).length;
                return (
                  <div key={group.key} className="elements-stat-card">
                    <div className="elements-stat-icon">{group.icon}</div>
                    <div className="elements-stat-count">{count}</div>
                    <div className="elements-stat-name">{group.title}</div>
                  </div>
                );
              })}
            </div>

            <div className="elements-list-panel">
              {ELEMENT_GROUPS.map((group) => {
                const list = elementsData?.structured?.[group.key] || [];
                if (list.length === 0) return null;
                return (
                  <details key={group.key} className="elements-group" open>
                    <summary>{group.icon} {group.title} ({list.length})</summary>
                    <div className="elements-group-body">
                      {list.map((el, idx) => (
                        <details key={`${group.key}-${el.label || idx}`} className="element-row">
                          <summary>
                            <span className="element-label">{el.label || `${group.title}${idx + 1}`}</span>
                            <span className="element-summary">{formatElementSummary(el)}</span>
                          </summary>
                          <pre>{el.rawXML || JSON.stringify(el, null, 2)}</pre>
                        </details>
                      ))}
                    </div>
                  </details>
                );
              })}
            </div>

            <details className="elements-json-preview">
              <summary>🔧 查看处理后的 JSON（用于 AI 转换）</summary>
              <pre>{JSON.stringify(elementsData?.structured || {}, null, 2)}</pre>
            </details>

            <details className="elements-json-preview">
              <summary>📄 查看原始 XML</summary>
              <pre>{elementsRawXml || '当前不可用'}</pre>
            </details>

            <div className="actions-row gap">
              <button className="btn btn-lite" onClick={copyElementsJson}>复制 JSON</button>
              <button className="btn btn-lite" onClick={downloadElementsJson}>下载 JSON</button>
              <button className="btn btn-lite" onClick={() => setXmlLayerOpen(true)}>顶层查看 XML</button>
              <button className="btn" onClick={exportTikz}>导出 TikZ</button>
            </div>
          </div>
        </div>
      ) : null}

      {xmlLayerOpen ? (
        <div className="settings-modal-overlay" onClick={() => setXmlLayerOpen(false)}>
          <div className="settings-modal xml-layer-modal" onClick={(e) => e.stopPropagation()}>
            <div className="settings-modal-head">
              <strong>📄 原始 XML（顶层查看）</strong>
              <button className="btn btn-lite" onClick={() => setXmlLayerOpen(false)}>关闭</button>
            </div>
            <div className="actions-row gap">
              <button className="btn btn-lite" onClick={copyRawXml}>复制 XML</button>
              <button className="btn btn-lite" onClick={downloadRawXml}>下载 XML</button>
            </div>
            <pre className="xml-layer-pre">{elementsRawXml || '当前不可用'}</pre>
          </div>
        </div>
      ) : null}

      {tikzDebugOpen ? (
        <div className="floating-layer">
          <div
            ref={tikzModalRef}
            className="settings-modal tikz-debug-modal tikz-debug-floating"
            style={{ left: tikzWindowPos.x, top: tikzWindowPos.y }}
          >
            <div className="settings-modal-head tikz-debug-drag-handle" onPointerDown={startDragTikzWindow}>
              <div className="tikz-debug-head-left">
                <strong>🧪 TikZ 调试器</strong>
                <div className="tikz-pref-anchor" onPointerDown={(e) => e.stopPropagation()}>
                  <button
                    className="btn btn-lite"
                    onClick={openTikzPrefs}
                  >
                    转译偏好
                  </button>
                </div>
              </div>
              <div className="actions-row gap">
                <details className="tikz-vector-export" onPointerDown={(event) => event.stopPropagation()}>
                  <summary className="btn btn-lite">导出矢量图</summary>
                  <div className="tikz-vector-export-menu">
                    <button className="btn btn-lite" onClick={copyCompiledVector}>复制到剪切板</button>
                    <button className="btn btn-lite" onClick={saveCompiledVector}>保存 PDF 文件</button>
                    <small>PDF 为纯矢量，放大不失真</small>
                  </div>
                </details>
                <button
                  className="btn btn-lite"
                  onClick={() => {
                    compileTikzPreview(tikzDebugCode);
                    setActionStatus('已重新编译 TikZ 预览');
                  }}
                >
                  编译预览
                </button>
                <button className="btn btn-lite" onClick={aiOptimizeTikzCode}>
                  AI优化
                </button>
                <button
                  className="btn btn-lite"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(tikzDebugCode || '');
                      setActionStatus('TikZ 代码已复制');
                    } catch {
                      setActionStatus('复制失败，请手动复制');
                    }
                  }}
                >
                  复制代码
                </button>
                <button className="btn btn-lite" onClick={() => setTikzDebugOpen(false)}>关闭</button>
              </div>
            </div>
            <div className="tikz-debug-grid">
              <div className="tikz-debug-pane">
                <div className="tikz-debug-title">TikZ 代码</div>
                <textarea
                  className="tikz-debug-editor"
                  value={tikzDebugCode}
                  onChange={(e) => setTikzDebugCode(e.target.value)}
                  placeholder="在这里粘贴或编辑 TikZ 代码"
                />
              </div>
              <div className="tikz-debug-pane tikz-debug-pane-preview">
                <div className="tikz-debug-title">编译预览</div>
                <div className="tikz-size-hint">
                  {tikzPreviewSize
                    ? `图形估算尺寸：宽 ${tikzPreviewSize.widthCm} cm，高 ${tikzPreviewSize.heightCm} cm（scale=${tikzPreviewSize.scale}）`
                    : '图形估算尺寸：暂不可计算（代码中缺少足够的数值坐标）'}
                </div>
                <div className="tikz-debug-preview-wrap">
                  <div className="tikz-debug-preview-canvas">
                    {tikzPreviewState.phase === 'loading' ? <div className="tikz-preview-loading" aria-live="polite" /> : null}
                    <div ref={tikzPreviewHostRef} />
                  </div>
                </div>
                <div className={`tikz-preview-status is-${tikzPreviewState.phase}`} aria-live="polite">
                  <span>{tikzPreviewState.phase === 'success' ? '✓' : tikzPreviewState.phase === 'error' ? '编译失败' : '编译状态'}</span>
                  <span>{tikzPreviewState.message}</span>
                  {tikzPreviewState.engine ? <small>{tikzPreviewState.engine}</small> : null}
                </div>
                <div className="settings-section" style={{ marginTop: 10 }}>
                  <h4>标签微调（半自动）</h4>
                  <div className="tikz-label-tune-grid">
                    <label className="tikz-label-tune-field">
                      <span>标签</span>
                      <select
                        className="tikz-label-tune-select"
                        value={labelAdjustTarget}
                        onChange={(e) => {
                          const v = String(e.target.value || '');
                          setLabelAdjustTarget(v);
                          syncLabelAdjustFromCode(tikzDebugCode, v);
                        }}
                      >
                        {debugPointLabels.length === 0 ? <option value="">当前无可调标签</option> : null}
                        {debugPointLabels.map((lab) => (
                          <option key={lab} value={lab}>{lab}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <div className="tikz-label-adjust-row">
                    <div className="tikz-label-tune-field">
                      <span>方向微调</span>
                      <div className="tikz-nudge-pad">
                        {LABEL_NUDGE_DIRECTIONS.flat().map((item, idx) => (
                          <button
                            key={`nudge-${idx}-${item.icon}`}
                            type="button"
                            className={`tikz-nudge-btn ${item.dx === 0 && item.dy === 0 ? 'is-center' : ''}`}
                            title={item.title}
                            aria-label={item.title}
                            onPointerDown={(e) => startContinuousNudge(item.dx, item.dy, e)}
                            onPointerLeave={stopContinuousNudge}
                          >
                            {item.icon}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="tikz-label-tune-field">
                      <span>微调设置</span>
                      <div className="tikz-label-step-controls">
                        <label className="tikz-inline-field">
                          <span>步长（pt）</span>
                          <select
                            className="tikz-label-tune-select"
                            value={labelAdjustStep}
                            onChange={(e) => setLabelAdjustStep(String(e.target.value || '0.2'))}
                          >
                            <option value="0.2">0.2</option>
                            <option value="0.5">0.5</option>
                            <option value="1">1</option>
                            <option value="2">2</option>
                          </select>
                        </label>
                        <div className="tikz-label-readout">
                          <label className="tikz-inline-field">
                            <span>右移（pt）</span>
                            <input
                              className="tikz-label-tune-input"
                              type="number"
                              min={-optLabelMaxShiftPt}
                              max={optLabelMaxShiftPt}
                              step={labelAdjustStep}
                              value={labelAdjustX}
                              onChange={(e) => setLabelAdjustX(e.target.value)}
                            />
                          </label>
                          <label className="tikz-inline-field">
                            <span>上移（pt）</span>
                            <input
                              className="tikz-label-tune-input"
                              type="number"
                              min={-optLabelMaxShiftPt}
                              max={optLabelMaxShiftPt}
                              step={labelAdjustStep}
                              value={labelAdjustY}
                              onChange={(e) => setLabelAdjustY(e.target.value)}
                            />
                          </label>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="tikz-label-tune-tip">提示：方向键支持长按连续移动；负数表示反向移动。</div>
                  <div className="actions-row gap" style={{ marginTop: 8 }}>
                    <button className="btn btn-lite" onClick={resetCurrentLabelAdjust}>重置当前点</button>
                  </div>
                </div>
                <div className="settings-section" style={{ marginTop: 10 }}>
                  <h4>线/面微调（半自动）</h4>
                  <div className="tikz-label-tune-grid">
                    <label className="tikz-label-tune-field">
                      <span>目标对象</span>
                      <select
                        className="tikz-label-tune-select"
                        value={styleAdjustTarget}
                        onChange={(e) => {
                          const id = String(e.target.value || '');
                          setStyleAdjustTarget(id);
                          syncStyleAdjustFromCode(tikzDebugCode, id);
                        }}
                      >
                        {debugStyleItems.length === 0 ? <option value="">当前无可调线/面</option> : null}
                        {debugStyleItems.map((item) => (
                          <option key={item.id} value={item.id}>{item.label}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                  {styleAdjustKind === 'line' ? (
                    <div className="tikz-label-tune-grid">
                      <label className="tikz-label-tune-field">
                        <span>线颜色</span>
                        <input
                          className="tikz-label-tune-input"
                          value={styleAdjustLineColor}
                          onChange={(e) => setStyleAdjustLineColor(e.target.value)}
                          placeholder="例如 black / blue!70"
                        />
                      </label>
                      <label className="tikz-label-tune-field">
                        <span>线型</span>
                        <select
                          className="tikz-label-tune-select"
                          value={styleAdjustLineDash}
                          onChange={(e) => setStyleAdjustLineDash(normalizeLineDashOption(e.target.value))}
                        >
                          <option value="">默认（保持原样）</option>
                          <option value="solid">solid（实线）</option>
                          <option value="dashed">dashed（虚线）</option>
                          <option value="dotted">dotted（点线）</option>
                          <option value="dash dot">dash dot（点划线）</option>
                          <option value="dash dot dot">dash dot dot（双点划线）</option>
                        </select>
                      </label>
                    </div>
                  ) : null}
                  {styleAdjustKind === 'face' ? (
                    <div className="tikz-label-tune-grid">
                      <label className="tikz-label-tune-field">
                        <span>面颜色</span>
                        <input
                          className="tikz-label-tune-input"
                          value={styleAdjustFaceColor}
                          onChange={(e) => setStyleAdjustFaceColor(e.target.value)}
                          placeholder="例如 blue!55 / red / none"
                        />
                      </label>
                      <label className="tikz-label-tune-field">
                        <span>透明度（0-1）</span>
                        <input
                          className="tikz-label-tune-input"
                          type="number"
                          min="0"
                          max="1"
                          step="0.05"
                          value={styleAdjustFaceOpacity}
                          onChange={(e) => setStyleAdjustFaceOpacity(e.target.value)}
                          placeholder="留空=保持原样"
                        />
                      </label>
                    </div>
                  ) : null}
                  <div className="actions-row gap" style={{ marginTop: 8 }}>
                    <button className="btn btn-lite" onClick={() => applyStyleAdjustToCode({ silent: false })}>立即应用</button>
                    <button className="btn btn-lite" onClick={resetCurrentStyleAdjust}>重置当前对象</button>
                  </div>
                </div>
              </div>
            </div>
          </div>
          {tikzPrefsOpen ? (
            <div className="settings-modal-overlay" onClick={() => setTikzPrefsOpen(false)}>
              <div className="settings-modal tikz-pref-modal" onClick={(e) => e.stopPropagation()}>
                <div className="settings-modal-head">
                  <strong>转译偏好</strong>
                  <button className="btn btn-lite" onClick={applyTikzPrefsAndClose}>应用并关闭</button>
                </div>
                <div className="settings-section">
                  <h4>缩放与画幅</h4>
                  <div className="settings-grid">
                    <label>
                      目标宽度（cm）
                      <input
                        type="number"
                        min="4"
                        max="20"
                        step="0.5"
                        value={optDraftTargetWcm}
                        onChange={(e) => setOptDraftTargetWcm(e.target.value)}
                      />
                    </label>
                    <label>
                      目标高度（cm）
                      <input
                        type="number"
                        min="4"
                        max="20"
                        step="0.5"
                        value={optDraftTargetHcm}
                        onChange={(e) => setOptDraftTargetHcm(e.target.value)}
                      />
                    </label>
                    <label>
                      scale 优先
                      <select
                        value={optDraftScalePriority}
                        onChange={(e) => setOptDraftScalePriority(String(e.target.value || 'fit'))}
                      >
                        <option value="fit">fit（宽高都尽量满足）</option>
                        <option value="width">width（优先宽度）</option>
                        <option value="height">height（优先高度）</option>
                      </select>
                    </label>
                    <label>
                      坐标轴对称优化
                      <select
                        value={optDraftAxisSymmetryEnabled ? 'on' : 'off'}
                        onChange={(e) => setOptDraftAxisSymmetryEnabled(e.target.value === 'on')}
                      >
                        <option value="off">关闭（保持现有逻辑）</option>
                        <option value="on">开启</option>
                      </select>
                    </label>
                    <label>
                      对称优化目标
                      <select
                        value={optDraftAxisSymmetryMode}
                        onChange={(e) => setOptDraftAxisSymmetryMode(String(e.target.value || 'area'))}
                      >
                        <option value="area">整体面积最小优先</option>
                        <option value="max_area">整体面积最大优先</option>
                        <option value="min_height">坐标范围上下对称</option>
                        <option value="min_width">坐标范围左右对称</option>
                      </select>
                    </label>
                    <label>
                      坐标轴延伸（单位）
                      <input
                        type="number"
                        min="0.1"
                        max="5"
                        step="0.1"
                        value={optDraftAxisPad}
                        onChange={(e) => setOptDraftAxisPad(e.target.value)}
                      />
                    </label>
                    <label>
                      scope 裁剪偏移（单位）
                      <input
                        type="number"
                        min="-3"
                        max="3"
                        step="0.1"
                        value={optDraftClipPad}
                        onChange={(e) => setOptDraftClipPad(e.target.value)}
                      />
                    </label>
                  </div>
                </div>
                <div className="settings-section">
                  <h4>标签与角度</h4>
                  <div className="settings-grid">
                    <label>
                      标签偏移（pt）
                      <input
                        type="number"
                        min="0"
                        max="8"
                        step="0.5"
                        value={optDraftLabelOffsetPt}
                        onChange={(e) => setOptDraftLabelOffsetPt(e.target.value)}
                      />
                    </label>
                    <label>
                      标签字号（pt）
                      <input
                        type="number"
                        min="8"
                        max="20"
                        step="1"
                        value={optDraftLabelFontPt}
                        onChange={(e) => setOptDraftLabelFontPt(e.target.value)}
                      />
                    </label>
                    <label>
                      标签微调范围（pt）
                      <input
                        type="number"
                        min="2"
                        max="50"
                        step="1"
                        value={optDraftLabelMaxShiftPt}
                        onChange={(e) => setOptDraftLabelMaxShiftPt(e.target.value)}
                      />
                    </label>
                    <label>
                      两直线角度区域
                      <select
                        value={optDraftAngleRegion}
                        onChange={(e) => setOptDraftAngleRegion(String(e.target.value || 'auto'))}
                      >
                        <option value="auto">auto</option>
                        <option value="left">left</option>
                        <option value="right">right</option>
                        <option value="above">above</option>
                        <option value="below">below</option>
                      </select>
                    </label>
                  </div>
                </div>
                {boardType === '3d' ? (
                  <div className="settings-section">
                    <h4>3D 转译偏好</h4>
                    <div className="settings-grid">
                      <label>
                        投影预设
                        <select
                          value={optDraft3dProjectionPreset}
                          onChange={(e) => setOptDraft3dProjectionPreset(String(e.target.value || DEFAULT_TIKZ3D_PROJECTION_PRESET))}
                        >
                          <option value="exam">题图预设（推荐）</option>
                          <option value="round">圆类视角（圆柱/圆锥）</option>
                          <option value="xml">跟随 XML 视角</option>
                          <option value="custom">手动方位角/景深</option>
                        </select>
                      </label>
                      {optDraft3dProjectionPreset === 'custom' ? (
                        <label>
                        观察方位角（°）
                        <input
                          type="number"
                          min="-180"
                          max="180"
                          step="1"
                          value={optDraft3dAzimuth}
                          onChange={(e) => setOptDraft3dAzimuth(e.target.value)}
                        />
                      </label>
                      ) : null}
                      {optDraft3dProjectionPreset === 'custom' ? (
                        <label>
                        景深系数（0-2）
                        <input
                          type="number"
                          min="0"
                          max="2"
                          step="0.05"
                          value={optDraft3dDepth}
                          onChange={(e) => setOptDraft3dDepth(e.target.value)}
                        />
                        </label>
                      ) : null}
                      <label>
                        点标签
                        <select
                          value={optDraft3dPointLabels ? 'on' : 'off'}
                          onChange={(e) => setOptDraft3dPointLabels(e.target.value === 'on')}
                        >
                          <option value="on">显示</option>
                          <option value="off">隐藏</option>
                        </select>
                      </label>
                      <label>
                        圆类自动视角
                        <select
                          value={optDraft3dAutoRoundPrefer ? 'on' : 'off'}
                          onChange={(e) => setOptDraft3dAutoRoundPrefer(e.target.value === 'on')}
                        >
                          <option value="on">开启（exam 自动切 round）</option>
                          <option value="off">关闭（完全按手动预设）</option>
                        </select>
                      </label>
                    </div>
                  </div>
                ) : null}
                <div className="settings-section">
                  <h4>TikZ 导出样式</h4>
                  <div className="settings-grid">
                    <label>
                      是否显示坐标轴
                      <select
                        value={optDraftShowAxis ? 'on' : 'off'}
                        onChange={(e) => setOptDraftShowAxis(e.target.value === 'on')}
                      >
                        <option value="on">显示</option>
                        <option value="off">隐藏</option>
                      </select>
                    </label>
                    <label>
                      直线/射线延伸参数
                      <input
                        type="number"
                        min="0"
                        max="6"
                        step="0.05"
                        value={optDraftLineExtend}
                        onChange={(e) => setOptDraftLineExtend(e.target.value)}
                      />
                    </label>
                    <label>
                      点半径（pt）
                      <input
                        type="number"
                        min="0.05"
                        max="3"
                        step="0.05"
                        value={optDraftPointRadius}
                        onChange={(e) => setOptDraftPointRadius(e.target.value)}
                      />
                    </label>
                    {boardType !== '3d' ? (
                      <label>
                        多边形填充颜色
                        <input
                          value={optDraftPolygonFill}
                          onChange={(e) => setOptDraftPolygonFill(e.target.value)}
                          placeholder="例如 black / blue!20 / none"
                        />
                      </label>
                    ) : null}
                    <label>
                      坐标轴线宽
                      <select
                        value={optDraftAxisThickness}
                        onChange={(e) => setOptDraftAxisThickness(String(e.target.value || 'semithick'))}
                      >
                        {TIKZ_THICKNESS_OPTIONS.map((it) => (
                          <option key={it} value={it}>{it}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      圆锥曲线线宽
                      <select
                        value={optDraftConicThickness}
                        onChange={(e) => setOptDraftConicThickness(String(e.target.value || 'thick'))}
                      >
                        {TIKZ_THICKNESS_OPTIONS.map((it) => (
                          <option key={it} value={it}>{it}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      函数线宽
                      <select
                        value={optDraftFunctionThickness}
                        onChange={(e) => setOptDraftFunctionThickness(String(e.target.value || 'thick'))}
                      >
                        {TIKZ_THICKNESS_OPTIONS.map((it) => (
                          <option key={it} value={it}>{it}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      直线/射线线宽
                      <select
                        value={optDraftLineThickness}
                        onChange={(e) => setOptDraftLineThickness(String(e.target.value || 'semithick'))}
                      >
                        {TIKZ_THICKNESS_OPTIONS.map((it) => (
                          <option key={it} value={it}>{it}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      线段线宽
                      <select
                        value={optDraftSegmentThickness}
                        onChange={(e) => setOptDraftSegmentThickness(String(e.target.value || 'thick'))}
                      >
                        {TIKZ_THICKNESS_OPTIONS.map((it) => (
                          <option key={it} value={it}>{it}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      多边形边线线宽
                      <select
                        value={optDraftPolygonThickness}
                        onChange={(e) => setOptDraftPolygonThickness(String(e.target.value || 'thick'))}
                      >
                        {TIKZ_THICKNESS_OPTIONS.map((it) => (
                          <option key={it} value={it}>{it}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                </div>
                <div className="actions-row gap">
                  <button className="btn btn-lite" onClick={() => setTikzPrefsOpen(false)}>取消</button>
                  <button className="btn" onClick={applyTikzPrefsAndClose}>应用设置</button>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
