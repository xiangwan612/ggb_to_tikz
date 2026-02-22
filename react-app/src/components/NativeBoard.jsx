import { useEffect, useRef, useState } from 'react';

const BASE_URL = import.meta.env.BASE_URL || '/';
const withBase = (path) => `${BASE_URL}${String(path || '').replace(/^\/+/, '')}`;
const GGB_SCRIPT_URL = 'https://www.geogebra.org/apps/deployggb.js';
const TIKZJAX_SCRIPT_URL = 'https://tikzjax.com/v1/tikzjax.js';
const PARSER_SCRIPT_URL = withBase('ggb-parser.js');
const TIKZ_SCRIPT_URL = withBase('tikz-generator.js');
const LEGACY_PAGE_URL = withBase('legacy-index.html');
const STORAGE_SHOW_AXES = 'ggb_show_axes';
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
const DEFAULT_TIKZ_BOUNDS = { xmin: -2.3, xmax: 2.8, ymin: -2.6, ymax: 2.4 };
const TIKZ_THICKNESS_OPTIONS = ['thin', 'semithick', 'thick', 'very thick', 'ultra thick'];
const ALLOWED_TIKZ_THICKNESS = new Set(TIKZ_THICKNESS_OPTIONS);
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

function getLegacyWindow() {
  const iframe = document.querySelector('.legacy-frame');
  if (!iframe || !iframe.contentWindow) return null;
  return iframe.contentWindow;
}

function readShowAxes() {
  return (localStorage.getItem(STORAGE_SHOW_AXES) || 'on') === 'on';
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
    lineLineAngleSelector
  };
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
  const preamble = '\\usetikzlibrary{arrows.meta,calc,intersections}';
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

export default function NativeBoard({ onReadyChange }) {
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
  const [actionStatus, setActionStatus] = useState('');
  const [toastVisible, setToastVisible] = useState(false);
  const [toastText, setToastText] = useState('');
  const [elementsOpen, setElementsOpen] = useState(false);
  const [elementsData, setElementsData] = useState(null);
  const [elementsRawXml, setElementsRawXml] = useState('');
  const [xmlLayerOpen, setXmlLayerOpen] = useState(false);
  const [tikzDebugOpen, setTikzDebugOpen] = useState(false);
  const [tikzDebugCode, setTikzDebugCode] = useState('');
  const [tikzPreviewContent, setTikzPreviewContent] = useState('');
  const [tikzPreviewSize, setTikzPreviewSize] = useState(null);
  const [tikzWindowPos, setTikzWindowPos] = useState(() => getCenteredTikzWindowPos());
  const [tikzPrefsOpen, setTikzPrefsOpen] = useState(false);
  const [labelOverrides, setLabelOverrides] = useState(() => readLabelOverrides());
  const [labelAdjustTarget, setLabelAdjustTarget] = useState('');
  const [labelAdjustPos, setLabelAdjustPos] = useState('above right');
  const [labelAdjustX, setLabelAdjustX] = useState('0');
  const [labelAdjustY, setLabelAdjustY] = useState('0');
  const [labelAdjustStep, setLabelAdjustStep] = useState('0.2');
  const labelAdjustAutoTimerRef = useRef(null);
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

  useEffect(() => {
    if (!actionStatus) return;
    setToastText(actionStatus);
    setToastVisible(true);
    const timer = setTimeout(() => setToastVisible(false), 2200);
    return () => clearTimeout(timer);
  }, [actionStatus]);

  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      try {
        await ensureGGBScript();
        await Promise.all([ensurePlainScript(PARSER_SCRIPT_URL), ensurePlainScript(TIKZ_SCRIPT_URL)]);
        if (cancelled) return;

        const ggbParams = {
          appName: 'geometry',
          width: 1200,
          height: 800,
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
            setNativeApi(api);
            applyAxesVisibility(api, readShowAxes());
            onReadyChange?.(api, true);
            setBoardStatus('原生 GeoGebra 已就绪');
          }
        };

        const applet = new window.GGBApplet(ggbParams, true);
        if (hostRef.current) {
          hostRef.current.innerHTML = '';
          applet.inject(hostRef.current);
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
      setNativeApi(null);
      onReadyChange?.(null, false);
    };
  }, [onReadyChange]);

  const buildTikzFromBoard = (optOverrides = {}) => {
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
      labelOverrides,
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
    setTikzPreviewContent(buildTikzPreviewContent(text));
    setTikzPreviewSize(estimateTikzSizeCm(text));
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
    compileTikzPreview(nextCode);
    if (!silent) setActionStatus(`已自动应用标签 ${label} 的微调`);
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
    compileTikzPreview(nextCode);
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
    if (tikzDebugOpen) {
      try {
        let refreshed = '';
        const currentCode = String(tikzDebugCode || '').trim();
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
          axisThickness
        };
        // 优先对“当前调试器代码”应用偏好，避免覆盖用户手工微调与补充内容。
        if (currentCode) {
          const labelFromCode = extractAdjustableLabelOptionsMap(currentCode);
          refreshed = optimizeTikzCodeRules(currentCode, {
            ...optPayload,
            labelOverrides: { ...(labelOverrides || {}), ...labelFromCode }
          });
        } else if (nativeApi && typeof nativeApi.getXML === 'function' && window.GGBParser && window.TikZGenerator) {
          refreshed = buildTikzFromBoard(optPayload);
        } else {
          const legacy = getLegacyWindow();
          if (legacy && typeof legacy.buildTikZFromBoard === 'function') {
            refreshed = String(legacy.buildTikZFromBoard() || '');
          }
        }
        if (String(refreshed || '').trim()) {
          setTikzDebugCode(refreshed);
          compileTikzPreview(refreshed);
          setActionStatus('转译偏好已应用到当前调试代码');
        } else {
          setActionStatus('转译偏好已应用');
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
      if (nativeApi && typeof nativeApi.getXML === 'function' && window.GGBParser && window.TikZGenerator) {
        code = buildTikzFromBoard();
      } else {
        const legacy = getLegacyWindow();
        if (legacy && typeof legacy.buildTikZFromBoard === 'function') {
          code = String(legacy.buildTikZFromBoard() || '');
        }
      }
      if (!String(code || '').trim()) {
        setActionStatus('未获取到可调试的 TikZ 代码');
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
    if (!tikzDebugOpen) return undefined;
    const stop = () => stopContinuousNudge();
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
    return () => {
      window.removeEventListener('pointerup', stop);
      window.removeEventListener('pointercancel', stop);
      stopContinuousNudge();
    };
  }, [tikzDebugOpen]);

  const exportTikz = async () => {
    try {
      if (nativeApi && typeof nativeApi.getXML === 'function' && window.GGBParser && window.TikZGenerator) {
        const code = buildTikzFromBoard();
        await navigator.clipboard.writeText(code);
        setActionStatus('已复制 TikZ 代码');
        return;
      }

      const legacy = getLegacyWindow();
      if (!legacy) {
        setActionStatus('导出失败：未找到画板实例');
        return;
      }
      if (typeof legacy.exportTikZToClipboard === 'function') {
        await legacy.exportTikZToClipboard();
        setActionStatus('已回退旧版导出 TikZ');
        return;
      }
      setActionStatus('导出失败：旧版未暴露 TikZ 导出');
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

      const legacy = getLegacyWindow();
      if (!legacy) {
        setActionStatus('导出失败：未找到画板实例');
        return;
      }
      if (typeof legacy.exportImage === 'function') {
        await legacy.exportImage();
        setActionStatus('已回退旧版导出图片');
        return;
      }
      setActionStatus('导出失败：旧版未暴露图片导出');
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

      if (typeof nativeApi.getXML === 'function' && window.GGBParser) {
        const xml = nativeApi.getXML() || '';
        const parser = new window.GGBParser(xml);
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

      const legacy = getLegacyWindow();
      if (legacy && typeof legacy.showBoardElements === 'function') {
        legacy.showBoardElements();
        setActionStatus('已回退旧版元素查看器');
        return;
      }

      setActionStatus('元素查看不可用');
    } catch (e) {
      setActionStatus(`元素查看失败：${e.message}`);
    }
  };

  const clearBoard = () => {
    try {
      if (nativeApi && typeof nativeApi.reset === 'function') {
        nativeApi.reset();
        setActionStatus('已清空画板');
        return;
      }
      const legacy = getLegacyWindow();
      if (!legacy) {
        setActionStatus('清空失败：未找到画板实例');
        return;
      }
      if (typeof legacy.clearBoard === 'function') {
        legacy.clearBoard(false);
        setActionStatus('已回退旧版清空画板');
        return;
      }
      setActionStatus('清空失败：旧版未暴露 clearBoard');
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
    host.innerHTML = '';

    const content = String(tikzPreviewContent || '').trim();
    if (!content) return;

    const tikzScript = document.createElement('script');
    tikzScript.type = 'text/tikz';
    tikzScript.text = content;
    host.appendChild(tikzScript);
    let cancelled = false;
    ensureTikzJaxReady()
      .then((render) => {
        if (cancelled) return;
        return render();
      })
      .catch((e) => {
        if (!cancelled) setActionStatus(`TikZ 预览失败：${e.message}`);
      });
    return () => {
      cancelled = true;
    };
  }, [tikzPreviewContent]);

  return (
    <section className="panel panel-right">
      {toastVisible ? <div className="top-toast">❗ {toastText}</div> : null}
      <header className="panel-subheader">
        <h2>原生 GeoGebra 画板（React）</h2>
        <div className="board-head-actions">
          <button className="btn btn-lite board-btn" onClick={clearBoard}>清空画板</button>
          <button className="btn btn-lite board-btn" onClick={showBoardElements}>画板元素</button>
          <button className="btn btn-lite board-btn" onClick={exportImage}>导出图片</button>
          <button className="btn btn-lite board-btn" onClick={openTikzDebugger}>TikZ 调试</button>
          <button className="btn board-btn" onClick={exportTikz}>导出 TikZ</button>
          <a className="link" href={LEGACY_PAGE_URL} target="_blank" rel="noreferrer">旧版备用</a>
        </div>
      </header>
      <div className="board-status">{actionStatus || boardStatus}</div>
      <div className="native-board-host" ref={hostRef} />
      <iframe
        className="legacy-frame legacy-frame-hidden"
        src={LEGACY_PAGE_URL}
        title="Legacy GeoGebra Fallback"
      />

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
                  <div className="tikz-debug-preview-canvas" ref={tikzPreviewHostRef} />
                </div>
                <div className="tikz-preview-hint">
                  若预览为空，通常是 TikZ 代码超出 TikZJax 支持范围，可直接复制到本地 LaTeX 编译。
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
                    <label>
                      多边形填充颜色
                      <input
                        value={optDraftPolygonFill}
                        onChange={(e) => setOptDraftPolygonFill(e.target.value)}
                        placeholder="例如 black / blue!20 / none"
                      />
                    </label>
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
