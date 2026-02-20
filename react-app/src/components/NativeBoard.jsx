import { useEffect, useRef, useState } from 'react';

const GGB_SCRIPT_URL = 'https://www.geogebra.org/apps/deployggb.js';
const PARSER_SCRIPT_URL = '/ggb-parser.js';
const TIKZ_SCRIPT_URL = '/tikz-generator.js';
const STORAGE_SHOW_AXES = 'ggb_show_axes';
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
const STORAGE_TIKZ_ANGLE_REGION = 'ggb_tikz_angle_region';
const STORAGE_TIKZ_OPT_TARGET_CM = 'ggb_tikz_opt_target_cm'; // 兼容旧版本
const STORAGE_TIKZ_OPT_TARGET_W_CM = 'ggb_tikz_opt_target_w_cm';
const STORAGE_TIKZ_OPT_TARGET_H_CM = 'ggb_tikz_opt_target_h_cm';
const STORAGE_TIKZ_OPT_PRIORITY = 'ggb_tikz_opt_priority';
const STORAGE_TIKZ_OPT_LABEL_OFFSET_PT = 'ggb_tikz_opt_label_offset_pt';
const STORAGE_TIKZ_OPT_LABEL_FONT_PT = 'ggb_tikz_opt_label_font_pt';
const DEFAULT_TIKZ_BOUNDS = { xmin: -2.3, xmax: 2.8, ymin: -2.6, ymax: 2.4 };
const ALLOWED_TIKZ_THICKNESS = new Set(['thin', 'semithick', 'thick', 'very thick', 'ultra thick']);

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
  const tikzScale = Math.max(0.2, Math.min(5, Number(localStorage.getItem(STORAGE_TIKZ_SCALE) || 1.2)));
  const lineExtend = Math.max(0, Math.min(6, Number(localStorage.getItem(STORAGE_TIKZ_LINE_EXTEND) || 0.25)));
  const pointRadiusPt = Math.max(0.05, Math.min(3, Number(localStorage.getItem(STORAGE_TIKZ_POINT_RADIUS) || 0.25)));
  const polygonFillColor = String(localStorage.getItem(STORAGE_TIKZ_POLYGON_FILL) || 'black').trim() || 'black';
  const axisThickness = readTikzThickness(STORAGE_TIKZ_AXIS_THICKNESS, 'semithick');
  const conicThickness = readTikzThickness(STORAGE_TIKZ_CONIC_THICKNESS, 'thick');
  const lineThickness = readTikzThickness(STORAGE_TIKZ_LINE_THICKNESS, 'semithick');
  const segmentThickness = readTikzThickness(STORAGE_TIKZ_SEGMENT_THICKNESS, 'thick');
  const polygonThickness = readTikzThickness(STORAGE_TIKZ_POLYGON_THICKNESS, 'thick');
  const angleRegionRaw = String(localStorage.getItem(STORAGE_TIKZ_ANGLE_REGION) || 'auto').trim().toLowerCase();
  const lineLineAngleSelector = ['auto', 'left', 'right', 'above', 'below'].includes(angleRegionRaw)
    ? angleRegionRaw
    : 'auto';

  return {
    tikzScale,
    lineExtend,
    pointRadiusPt,
    polygonFillColor,
    axisThickness,
    conicThickness,
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

function buildTikzPreviewHtml(rawCode) {
  const tikzRaw = extractTikzPictureBlock(rawCode);
  const tikzNoComments = stripLatexComments(tikzRaw);
  const tikzCompat = convertTkzAnglesForPreview(tikzNoComments);
  const tikzCode = makeAsciiSafeForBtoa(tikzCompat).replace(/<\/script>/gi, '<\\/script>');
  const preamble = '\\usetikzlibrary{arrows.meta,calc,intersections}';
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    body{margin:0;padding:12px;background:#fff;color:#1f2a3d;font-family:Segoe UI,PingFang SC,Microsoft YaHei,sans-serif;}
    .wrap{border:1px solid #dce4f0;border-radius:10px;padding:12px;min-height:120px;}
    .hint{font-size:12px;color:#5f6f88;margin-top:8px;}
  </style>
  <script src="https://tikzjax.com/v1/tikzjax.js"></script>
</head>
<body>
  <div class="wrap">
    <script type="text/tikz">
${preamble}
${tikzCode}
    </script>
  </div>
  <div class="hint">若预览为空，通常是 TikZ 代码超出 TikZJax 支持范围，可直接复制到本地 LaTeX 编译。</div>
</body>
</html>`;
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

function computeOptimizedAxisBounds(points) {
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

  // 新规则：直接取边界并向外扩 0.5
  let xmin = minX - 0.5;
  let xmax = maxX + 0.5;
  let ymin = minY - 0.5;
  let ymax = maxY + 0.5;

  // 原点必须可见；若某侧不足，则以 0.5 起/止
  if (xmin > -0.5) xmin = -0.5;
  if (xmax < 0.5) xmax = 0.5;
  if (ymin > -0.5) ymin = -0.5;
  if (ymax < 0.5) ymax = 0.5;

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

function replaceAxisAndOrigin(out, bounds) {
  const srcLines = String(out || '').split('\n');
  const beginRe = /^\s*\\begin\{tikzpicture\}/;
  const isAxisComment = (ln) => /^\s*%\s*坐标轴\s*$/.test(ln);
  const isXAxis = (ln) => /\\draw\[[^\]]*->/.test(ln) && /\{\$x\$\}\s*;/.test(ln);
  const isYAxis = (ln) => /\\draw\[[^\]]*->/.test(ln) && /\{\$y\$\}\s*;/.test(ln);
  const isOrigin = (ln) => /\\node\s+at\s*\([^)]*\)\s*\{\$O\$\}\s*;/.test(ln);
  const xLine = `    \\draw[->, semithick] (${bounds.xmin},0) -- (${bounds.xmax},0) node[right] {$x$};`;
  const yLine = `    \\draw[->, semithick] (0,${bounds.ymin}) -- (0,${bounds.ymax}) node[above] {$y$};`;
  const oLine = '    \\node at (-0.18,-0.18) {$O$};';

  const lines = [];
  let beginIdx = -1;
  srcLines.forEach((ln) => {
    if (isAxisComment(ln) || isXAxis(ln) || isYAxis(ln) || isOrigin(ln)) return;
    lines.push(ln);
  });
  lines.forEach((ln, idx) => {
    if (beginRe.test(ln) && beginIdx < 0) beginIdx = idx;
  });
  const insertAt = beginIdx >= 0 ? beginIdx + 1 : 0;
  const add = ['    % 坐标轴', xLine, yLine, oLine];
  lines.splice(insertAt, 0, ...add);

  return lines.join('\n');
}

function estimateLabelTextWidthCm(text, fontPt = 12) {
  const t = String(text || '').replace(/\\[A-Za-z]+/g, 'x');
  const n = Math.max(1, t.length);
  return Math.max(0.22, (fontPt / 12) * (0.09 * n + 0.12));
}

function intersectsBox(a, b) {
  return !(a.x2 < b.x1 || a.x1 > b.x2 || a.y2 < b.y1 || a.y1 > b.y2);
}

function optimizePointLabels(out, coordMap, allPoints, options = {}) {
  const labelOffsetPt = Math.max(0, Math.min(8, Number(options.labelOffsetPt ?? 1)));
  const labelFontPt = Math.max(8, Math.min(20, Number(options.labelFontPt ?? 12)));
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
  const b = computeOptimizedAxisBounds(points);
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

  out = replaceAxisAndOrigin(out, b);
  out = optimizePointLabels(out, coordMap, points, {
    labelOffsetPt: prefs.labelOffsetPt ?? 1,
    labelFontPt: prefs.labelFontPt ?? 12
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
  const [tikzPreviewSrcDoc, setTikzPreviewSrcDoc] = useState('');
  const [tikzPreviewSize, setTikzPreviewSize] = useState(null);
  const [tikzWindowPos, setTikzWindowPos] = useState(() => getCenteredTikzWindowPos());
  const [tikzPrefsOpen, setTikzPrefsOpen] = useState(false);
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
  const [optLabelOffsetPt, setOptLabelOffsetPt] = useState(() => {
    const v = Number(localStorage.getItem(STORAGE_TIKZ_OPT_LABEL_OFFSET_PT) || 1);
    return Number.isFinite(v) ? Math.max(0, Math.min(8, v)) : 1;
  });
  const [optLabelFontPt, setOptLabelFontPt] = useState(() => {
    const v = Number(localStorage.getItem(STORAGE_TIKZ_OPT_LABEL_FONT_PT) || 12);
    return Number.isFinite(v) ? Math.max(8, Math.min(20, v)) : 12;
  });
  const [optAngleRegion, setOptAngleRegion] = useState(() => {
    const v = String(localStorage.getItem(STORAGE_TIKZ_ANGLE_REGION) || 'auto').trim().toLowerCase();
    return ['auto', 'left', 'right', 'above', 'below'].includes(v) ? v : 'auto';
  });
  const [optDraftTargetWcm, setOptDraftTargetWcm] = useState(optTargetWcm);
  const [optDraftTargetHcm, setOptDraftTargetHcm] = useState(optTargetHcm);
  const [optDraftScalePriority, setOptDraftScalePriority] = useState(optScalePriority);
  const [optDraftLabelOffsetPt, setOptDraftLabelOffsetPt] = useState(optLabelOffsetPt);
  const [optDraftLabelFontPt, setOptDraftLabelFontPt] = useState(optLabelFontPt);
  const [optDraftAngleRegion, setOptDraftAngleRegion] = useState(optAngleRegion);

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

  const buildTikzFromBoard = () => {
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
      axis: true,
      grid: false,
      tikzScale: tikzCfg.tikzScale,
      defaultStrokeColor: 'black',
      defaultStrokeThickness: 'thick',
      defaultPointColor: 'black',
      lineExtensionStart: tikzCfg.lineExtend,
      lineExtensionEnd: tikzCfg.lineExtend,
      pointRadiusPt: tikzCfg.pointRadiusPt,
      polygonFillColor: tikzCfg.polygonFillColor,
      axisThickness: tikzCfg.axisThickness,
      conicStrokeThickness: tikzCfg.conicThickness,
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
    // 转译阶段默认执行规则优化（坐标轴/scale/标签）
    return optimizeTikzCodeRules(rawCode, {
      targetWidthCm: optTargetWcm,
      targetHeightCm: optTargetHcm,
      scalePriority: optScalePriority,
      labelOffsetPt: optLabelOffsetPt,
      labelFontPt: optLabelFontPt
    });
  };

  const compileTikzPreview = (code) => {
    const text = String(code || '').trim();
    if (!text) {
      setActionStatus('TikZ 调试区为空');
      return;
    }
    setTikzPreviewSrcDoc(buildTikzPreviewHtml(text));
    setTikzPreviewSize(estimateTikzSizeCm(text));
  };

  const aiOptimizeTikzCode = () => {
    setActionStatus('AI优化功能待接入，当前已默认执行规则转译优化');
  };

  const openTikzPrefs = () => {
    setOptDraftTargetWcm(optTargetWcm);
    setOptDraftTargetHcm(optTargetHcm);
    setOptDraftScalePriority(optScalePriority);
    setOptDraftLabelOffsetPt(optLabelOffsetPt);
    setOptDraftLabelFontPt(optLabelFontPt);
    setOptDraftAngleRegion(optAngleRegion);
    setTikzPrefsOpen(true);
  };

  const applyTikzPrefsAndClose = () => {
    const targetW = Math.max(4, Math.min(20, Number(optDraftTargetWcm) || 9));
    const targetH = Math.max(4, Math.min(20, Number(optDraftTargetHcm) || 9));
    const priority = ['fit', 'width', 'height'].includes(String(optDraftScalePriority || '').toLowerCase())
      ? String(optDraftScalePriority).toLowerCase()
      : 'fit';
    const labelOffsetPt = Math.max(0, Math.min(8, Number(optDraftLabelOffsetPt) || 1));
    const labelFontPt = Math.max(8, Math.min(20, Number(optDraftLabelFontPt) || 12));
    const region = ['auto', 'left', 'right', 'above', 'below'].includes(optDraftAngleRegion)
      ? optDraftAngleRegion
      : 'auto';
    setOptTargetWcm(targetW);
    setOptTargetHcm(targetH);
    setOptScalePriority(priority);
    setOptLabelOffsetPt(labelOffsetPt);
    setOptLabelFontPt(labelFontPt);
    setOptAngleRegion(region);
    localStorage.setItem(STORAGE_TIKZ_OPT_TARGET_W_CM, String(targetW));
    localStorage.setItem(STORAGE_TIKZ_OPT_TARGET_H_CM, String(targetH));
    localStorage.setItem(STORAGE_TIKZ_OPT_PRIORITY, priority);
    localStorage.setItem(STORAGE_TIKZ_OPT_LABEL_OFFSET_PT, String(labelOffsetPt));
    localStorage.setItem(STORAGE_TIKZ_OPT_LABEL_FONT_PT, String(labelFontPt));
    localStorage.setItem(STORAGE_TIKZ_OPT_TARGET_CM, String(Math.max(targetW, targetH)));
    localStorage.setItem(STORAGE_TIKZ_ANGLE_REGION, region);
    setTikzPrefsOpen(false);
    setActionStatus('转译偏好已应用');
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
          <a className="link" href="/legacy-index.html" target="_blank" rel="noreferrer">旧版备用</a>
        </div>
      </header>
      <div className="board-status">{actionStatus || boardStatus}</div>
      <div className="native-board-host" ref={hostRef} />
      <iframe
        className="legacy-frame legacy-frame-hidden"
        src="/legacy-index.html"
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
              <div className="tikz-debug-pane">
                <div className="tikz-debug-title">编译预览</div>
                <div className="tikz-size-hint">
                  {tikzPreviewSize
                    ? `图形估算尺寸：宽 ${tikzPreviewSize.widthCm} cm，高 ${tikzPreviewSize.heightCm} cm（scale=${tikzPreviewSize.scale}）`
                    : '图形估算尺寸：暂不可计算（代码中缺少足够的数值坐标）'}
                </div>
                <div className="tikz-debug-preview-wrap">
                  <iframe
                    className="tikz-debug-preview"
                    title="TikZ 调试预览"
                    srcDoc={tikzPreviewSrcDoc}
                  />
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
