/**
 * GeoGebra 3D XML parser (phase-1, XML-driven)
 * - Keep 3D structures independent from 2D parser
 * - Prefer command graph + resolved coordinates
 */

class GGB3DParser {
  constructor(xmlString) {
    this.parser = new DOMParser();
    this.doc = this.parser.parseFromString(String(xmlString || ''), 'text/xml');
    this.construction = this.doc.querySelector('construction');
    this.expMap = {};
    this.cmdMap = {};
    this.commandList = [];
    this.elementMap = {};
  }

  parse() {
    if (!this.construction) {
      return { elements: [], structured: {}, semantics: {}, stats: {}, rawXML: this.doc.outerHTML };
    }

    this.buildExpMap();
    this.buildCmdMap();
    this.buildElementMap();

    const structured = {
      points3d: [],
      segments3d: [],
      lines3d: [],
      rays3d: [],
      vectors3d: [],
      polygons3d: [],
      planes3d: [],
      polyhedra3d: [],
      cylinders3d: [],
      cones3d: [],
      spheres3d: [],
      others: []
    };

    const stats = { total: 0, visible: 0, byType: {} };

    this.construction.querySelectorAll('element').forEach((el) => {
      const type = String(el.getAttribute('type') || '').trim();
      const label = String(el.getAttribute('label') || '').trim();
      const showTag = el.querySelector('show');
      const visible = showTag ? showTag.getAttribute('object') !== 'false' : true;
      const cmd = this.cmdMap[label];
      const style = this.parseStyle(el);

      stats.total += 1;
      if (visible) stats.visible += 1;
      stats.byType[type] = (stats.byType[type] || 0) + 1;

      if (type === 'point' || type === 'point3d') {
        structured.points3d.push(this.parsePoint3D(el, label, visible, style, cmd));
        return;
      }
      if (type === 'segment' || type === 'segment3d') {
        structured.segments3d.push(this.parseSegment3D(label, visible, style, cmd));
        return;
      }
      if (type === 'line') {
        structured.lines3d.push(this.parseLine3D(label, visible, style, cmd));
        return;
      }
      if (type === 'ray') {
        structured.rays3d.push(this.parseRay3D(label, visible, style, cmd));
        return;
      }
      if (type === 'vector') {
        structured.vectors3d.push(this.parseVector3D(el, label, visible, style, cmd));
        return;
      }
      if (type === 'polygon' || type === 'polygon3d') {
        structured.polygons3d.push(this.parsePolygon3D(label, visible, style, cmd));
        return;
      }
      if (type === 'plane' || type === 'plane3d') {
        structured.planes3d.push(this.parsePlane3D(label, visible, style, cmd));
        return;
      }
      if (type === 'polyhedron') {
        structured.polyhedra3d.push(this.parsePolyhedron3D(label, visible, style, cmd));
        return;
      }
      if (type === 'quadriclimited' && cmd?.name === 'Cylinder') {
        structured.cylinders3d.push(this.parseCylinder3D(label, visible, style, cmd));
        return;
      }
      if (type === 'quadriclimited' && cmd?.name === 'Cone') {
        structured.cones3d.push(this.parseCone3D(label, visible, style, cmd));
        return;
      }
      if (type === 'quadric' && cmd?.name === 'Sphere') {
        structured.spheres3d.push(this.parseSphere3D(label, visible, style, cmd));
        return;
      }

      structured.others.push({
        type,
        label,
        visible,
        style,
        commandName: cmd?.name || null,
        commandInputs: (cmd?.inputs || []).map((x) => x.value),
        rawXML: el.outerHTML
      });
    });

    const semantics = this.buildSemantics(structured);
    const elements = [
      ...structured.points3d,
      ...structured.segments3d,
      ...structured.lines3d,
      ...structured.rays3d,
      ...structured.vectors3d,
      ...structured.polygons3d,
      ...structured.planes3d,
      ...structured.polyhedra3d,
      ...structured.cylinders3d,
      ...structured.cones3d,
      ...structured.spheres3d,
      ...structured.others
    ];

    return {
      elements,
      structured,
      semantics,
      expMap: this.expMap,
      cmdMap: this.cmdMap,
      stats,
      rawXML: this.construction.outerHTML
    };
  }

  buildExpMap() {
    this.construction.querySelectorAll('expression').forEach((exp) => {
      const label = String(exp.getAttribute('label') || '').trim();
      if (!label) return;
      this.expMap[label] = {
        exp: exp.getAttribute('exp'),
        type: exp.getAttribute('type')
      };
    });
  }

  buildCmdMap() {
    this.commandList = [];
    this.construction.querySelectorAll('command').forEach((cmd) => {
      const name = String(cmd.getAttribute('name') || '').trim();
      const inputEl = cmd.querySelector('input');
      const outputEl = cmd.querySelector('output');
      if (!name || !inputEl || !outputEl) return;

      const inputs = [];
      for (let i = 0; ; i += 1) {
        const v = inputEl.getAttribute(`a${i}`);
        if (v === null) break;
        inputs.push({
          index: i,
          value: v,
          isCoordinate: this.isCoordinate(v),
          coord: this.isCoordinate(v) ? this.parseCoordinate(v) : null,
          isNumber: this.isNumber(v)
        });
      }

      const outputs = [];
      for (let i = 0; ; i += 1) {
        const v = outputEl.getAttribute(`a${i}`);
        if (v === null) break;
        if (v !== '') outputs.push(v);
      }

      outputs.forEach((out) => {
        this.cmdMap[out] = { name, inputs, outputs, raw: cmd.outerHTML };
      });
      this.commandList.push({
        name,
        inputs: inputs.map((x) => x.value),
        outputs: [...outputs]
      });
    });
  }

  buildElementMap() {
    this.construction.querySelectorAll('element').forEach((el) => {
      const label = String(el.getAttribute('label') || '').trim();
      if (label) this.elementMap[label] = el;
    });
  }

  parseStyle(el) {
    const style = {};
    const objColor = el.querySelector('objColor');
    if (objColor) {
      style.color = this.rgbToHex(
        parseInt(objColor.getAttribute('r') || '0', 10),
        parseInt(objColor.getAttribute('g') || '0', 10),
        parseInt(objColor.getAttribute('b') || '0', 10)
      );
      const alpha = parseFloat(objColor.getAttribute('alpha'));
      if (Number.isFinite(alpha)) style.alpha = alpha;
    }
    const lineStyle = el.querySelector('lineStyle');
    if (lineStyle) {
      style.lineThickness = parseInt(lineStyle.getAttribute('thickness') || '5', 10);
      style.lineType = parseInt(lineStyle.getAttribute('type') || '0', 10);
      style.lineTypeHidden = parseInt(lineStyle.getAttribute('typeHidden') || '1', 10);
      style.opacity = parseInt(lineStyle.getAttribute('opacity') || '255', 10);
    }
    const pointSize = el.querySelector('pointSize');
    if (pointSize) style.pointSize = parseInt(pointSize.getAttribute('val') || '5', 10);
    return style;
  }

  rgbToHex(r, g, b) {
    return `#${[r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('')}`;
  }

  isNumber(v) {
    return /^-?\d+(\.\d+)?$/.test(String(v || '').trim());
  }

  parseNumericExpression(expr) {
    const raw = String(expr || '').trim();
    if (!raw) return null;
    if (this.isNumber(raw)) return Number(raw);

    const prepared = raw.replace(/\^/g, '**');
    if (!/^[0-9+\-*/().,\sA-Za-z_]+$/.test(prepared)) return null;

    const names = prepared.match(/[A-Za-z_][A-Za-z0-9_]*/g) || [];
    const allowed = new Set(['sqrt', 'pi', 'e', 'abs']);
    const ok = names.every((name) => allowed.has(String(name).toLowerCase()));
    if (!ok) return null;

    const jsExpr = prepared
      .replace(/\bpi\b/gi, 'Math.PI')
      .replace(/\be\b/gi, 'Math.E')
      .replace(/\bsqrt\s*\(/gi, 'Math.sqrt(')
      .replace(/\babs\s*\(/gi, 'Math.abs(');
    try {
      const value = Function(`"use strict"; return (${jsExpr});`)();
      return Number.isFinite(value) ? Number(value) : null;
    } catch (_e) {
      return null;
    }
  }

  parseNumericInput(input) {
    if (!input) return null;
    if (input.isNumber) return Number(input.value);
    const raw = String(input.value || '').trim();
    if (!raw) return null;
    const distMatch = raw.match(/^Distance\[\s*([^,\]]+)\s*,\s*([^\]]+)\s*\]$/i);
    if (distMatch) {
      const l0 = String(distMatch[1] || '').trim();
      const l1 = String(distMatch[2] || '').trim();
      const p0 = this.normalizeCoord(this.resolvePointByLabel(l0));
      const p1 = this.normalizeCoord(this.resolvePointByLabel(l1));
      if (p0 && p1) {
        const dx = p1.x - p0.x;
        const dy = p1.y - p0.y;
        const dz = p1.z - p0.z;
        const d = Math.hypot(dx, dy, dz);
        if (Number.isFinite(d)) return d;
      }
    }
    const fromExp = this.expMap[raw]?.exp;
    const v1 = this.parseNumericExpression(raw);
    if (Number.isFinite(v1)) return v1;
    const v2 = this.parseNumericExpression(fromExp);
    return Number.isFinite(v2) ? v2 : null;
  }

  isCoordinate(v) {
    return /^\s*\(\s*-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?(\s*,\s*-?\d+(\.\d+)?)?\s*\)\s*$/.test(String(v || ''));
  }

  parseCoordinate(v) {
    const match = String(v || '').match(/\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)(?:\s*,\s*(-?\d+(?:\.\d+)?))?\s*\)/);
    if (!match) return null;
    return {
      x: parseFloat(match[1]),
      y: parseFloat(match[2]),
      z: match[3] === undefined ? 0 : parseFloat(match[3])
    };
  }

  normalizeCoord(coord) {
    if (!coord) return null;
    const x = Number(coord.x);
    const y = Number(coord.y);
    const z = Number(coord.z);
    if (![x, y, z].every(Number.isFinite)) return null;
    return { x, y, z };
  }

  parsePointCoordFromElement(el, coordMode = 'cartesian3d') {
    const coords = el?.querySelector?.('coords');
    if (!coords) return null;
    const x = Number(coords.getAttribute('x'));
    const y = Number(coords.getAttribute('y'));
    const z = Number(coords.getAttribute('z'));
    const wRaw = coords.getAttribute('w');
    const w = wRaw === null ? NaN : Number(wRaw);
    if (![x, y, z].every(Number.isFinite)) return null;
    if (Number.isFinite(w) && Math.abs(w) > 1e-12) {
      return { x: x / w, y: y / w, z: z / w };
    }
    if (coordMode === 'homogeneous2d') {
      if (Math.abs(z) > 1e-12) {
        return { x: x / z, y: y / z, z: 0 };
      }
      return { x, y, z: 0 };
    }
    return { x, y, z };
  }

  resolvePointByLabel(label) {
    const key = String(label || '').trim();
    if (!key) return null;
    const el = this.elementMap[key];
    const type = String(el?.getAttribute?.('type') || '').trim();
    if (el && (type === 'point' || type === 'point3d')) {
      return this.parsePointCoordFromElement(
        el,
        type === 'point' ? 'homogeneous2d' : 'cartesian3d'
      );
    }
    const exp = this.expMap[key];
    if (exp?.exp && this.isCoordinate(exp.exp)) return this.parseCoordinate(exp.exp);
    return null;
  }

  normalizePointInput(input) {
    if (!input) return { label: null, coord: null };
    if (input.isCoordinate) return { label: null, coord: this.normalizeCoord(input.coord) };
    return {
      label: input.value || null,
      coord: this.normalizeCoord(this.resolvePointByLabel(input.value))
    };
  }

  getCmdOutputIndex(cmd, outputLabel) {
    if (!cmd || !Array.isArray(cmd.outputs)) return -1;
    return cmd.outputs.indexOf(outputLabel);
  }

  getCommandPointInputs(cmd) {
    if (!cmd) return [];
    const pts = [];
    (cmd.inputs || []).forEach((input) => {
      const p = this.normalizePointInput(input);
      if (!p.coord) return;
      pts.push({
        label: p.label || null,
        coord: p.coord
      });
    });
    return pts;
  }

  getPyramidStructure(cmd) {
    if (!cmd || cmd.name !== 'Pyramid') return null;
    const inputs = Array.isArray(cmd.inputs) ? cmd.inputs : [];
    const outputs = Array.isArray(cmd.outputs) ? cmd.outputs : [];
    const getOutputType = (label) => String(this.elementMap[label]?.getAttribute?.('type') || '').trim();
    const polygonOutputs = outputs.filter((label) => {
      const t = getOutputType(label);
      return t === 'polygon' || t === 'polygon3d';
    });
    const edgeOutputs = outputs.filter((label) => {
      const t = getOutputType(label);
      return t === 'segment' || t === 'segment3d';
    });

    const baseRef = String(inputs[0]?.value || '').trim();
    const baseRefType = String(this.elementMap[baseRef]?.getAttribute?.('type') || '').trim();
    const isPolygonBase = baseRefType === 'polygon' || baseRefType === 'polygon3d';
    if (isPolygonBase) {
      const baseCmd = this.cmdMap[baseRef];
      const base = this.getPolygonVertices(baseCmd);
      if (base.length < 3) return null;
      let apex = null;
      if (inputs.length >= 2) {
        const candidate = this.normalizePointInput(inputs[1]);
        if (candidate?.coord) {
          apex = {
            label: candidate.label || null,
            coord: candidate.coord
          };
        }
      }
      if (!apex && outputs[1]) {
        const apexCoord = this.normalizeCoord(this.resolvePointByLabel(outputs[1]));
        if (apexCoord) {
          apex = { label: outputs[1], coord: apexCoord };
        }
      }
      if (!apex?.coord) return null;
      const n = base.length;
      const hasBaseFaceOutput = polygonOutputs.length === n + 1;
      return {
        base,
        apex,
        mode: 'polygon-base',
        faceOutputs: polygonOutputs,
        edgeOutputs,
        hasBaseFaceOutput,
        hasBaseEdgeOutput: edgeOutputs.length >= 2 * n
      };
    }

    const pts = this.getCommandPointInputs(cmd);
    if (pts.length < 4) return null;
    const base = pts.slice(0, -1);
    const apex = pts[pts.length - 1];
    if (base.length < 3 || !apex) return null;
    const n = base.length;
    const hasBaseFaceOutput = polygonOutputs.length === n + 1;
    return {
      base,
      apex,
      mode: 'point-base',
      faceOutputs: polygonOutputs,
      edgeOutputs,
      hasBaseFaceOutput,
      hasBaseEdgeOutput: edgeOutputs.length >= 2 * n
    };
  }

  getVerticesForPyramidFace(cmd, outputLabel) {
    const s = this.getPyramidStructure(cmd);
    if (!s) return [];
    const idx = Array.isArray(s.faceOutputs) ? s.faceOutputs.indexOf(outputLabel) : -1;
    if (idx < 0) return [];
    const n = s.base.length;
    if (s.hasBaseFaceOutput && idx === 0) return s.base;
    const sideOffset = s.hasBaseFaceOutput ? 1 : 0;
    if (idx >= sideOffset && idx < sideOffset + n) {
      const i = idx - sideOffset;
      return [
        s.base[i],
        s.base[(i + 1) % n],
        s.apex
      ];
    }
    return [];
  }

  getEndpointsForPyramidEdge(cmd, outputLabel) {
    const s = this.getPyramidStructure(cmd);
    if (!s) return null;
    const idx = Array.isArray(s.edgeOutputs) ? s.edgeOutputs.indexOf(outputLabel) : -1;
    if (idx < 0) return null;
    const n = s.base.length;
    if (s.hasBaseEdgeOutput && idx < n) {
      return {
        p0: s.base[idx],
        p1: s.base[(idx + 1) % n]
      };
    }
    if (s.hasBaseEdgeOutput && idx < 2 * n) {
      const i = idx - n;
      return {
        p0: s.base[i],
        p1: s.apex
      };
    }
    if (!s.hasBaseEdgeOutput && idx < n) {
      const i = idx;
      return {
        p0: s.base[i],
        p1: s.apex
      };
    }
    return null;
  }

  getCubeStructure(cmd) {
    if (!cmd || cmd.name !== 'Cube') return null;
    if (!Array.isArray(cmd.inputs) || cmd.inputs.length < 3) return null;
    if (!Array.isArray(cmd.outputs) || cmd.outputs.length < 6) return null;

    const inA = this.normalizePointInput(cmd.inputs[0]);
    const inB = this.normalizePointInput(cmd.inputs[1]);
    const inC = this.normalizePointInput(cmd.inputs[2]);
    if (!inA.coord || !inB.coord || !inC.coord) return null;

    const getOutPoint = (idx) => {
      const label = cmd.outputs[idx];
      if (!label) return null;
      const coord = this.normalizeCoord(this.resolvePointByLabel(label));
      if (!coord) return null;
      return { label, coord };
    };

    const pD = getOutPoint(1);
    const pE = getOutPoint(2);
    const pF = getOutPoint(3);
    const pG = getOutPoint(4);
    const pH = getOutPoint(5);
    if (!pD || !pE || !pF || !pG || !pH) return null;

    return {
      A: { label: inA.label || cmd.inputs[0].value || null, coord: inA.coord },
      B: { label: inB.label || cmd.inputs[1].value || null, coord: inB.coord },
      C: { label: inC.label || cmd.inputs[2].value || null, coord: inC.coord },
      D: pD,
      E: pE,
      F: pF,
      G: pG,
      H: pH
    };
  }

  getVerticesForCubeFace(cmd, outputLabel) {
    const idx = this.getCmdOutputIndex(cmd, outputLabel);
    const s = this.getCubeStructure(cmd);
    if (!s || idx < 0) return [];
    const faceByIndex = {
      6: ['A', 'B', 'C', 'D'],
      7: ['A', 'D', 'H', 'E'],
      8: ['A', 'B', 'F', 'E'],
      9: ['B', 'C', 'G', 'F'],
      10: ['C', 'D', 'H', 'G'],
      11: ['E', 'F', 'G', 'H']
    };
    const roleList = faceByIndex[idx];
    if (!roleList) return [];
    const verts = roleList.map((k) => s[k]).filter((x) => x?.coord);
    return verts.length >= 3 ? verts : [];
  }

  getTetrahedronStructure(cmd) {
    if (!cmd || cmd.name !== 'Tetrahedron') return null;
    if (!Array.isArray(cmd.inputs) || cmd.inputs.length < 3) return null;
    if (!Array.isArray(cmd.outputs) || cmd.outputs.length < 2) return null;
    const inA = this.normalizePointInput(cmd.inputs[0]);
    const inB = this.normalizePointInput(cmd.inputs[1]);
    const inC = this.normalizePointInput(cmd.inputs[2]);
    if (!inA.coord || !inB.coord || !inC.coord) return null;
    const dLabel = cmd.outputs[1];
    const dCoord = this.normalizeCoord(this.resolvePointByLabel(dLabel));
    if (!dLabel || !dCoord) return null;
    return {
      A: { label: inA.label || cmd.inputs[0].value || null, coord: inA.coord },
      B: { label: inB.label || cmd.inputs[1].value || null, coord: inB.coord },
      C: { label: inC.label || cmd.inputs[2].value || null, coord: inC.coord },
      D: { label: dLabel, coord: dCoord }
    };
  }

  getVerticesForTetrahedronFace(cmd, outputLabel) {
    const idx = this.getCmdOutputIndex(cmd, outputLabel);
    const s = this.getTetrahedronStructure(cmd);
    if (!s || idx < 0) return [];
    const faceByIndex = {
      2: ['A', 'B', 'C'],
      3: ['A', 'C', 'D'],
      4: ['A', 'B', 'D'],
      5: ['B', 'C', 'D']
    };
    const roleList = faceByIndex[idx];
    if (!roleList) return [];
    const verts = roleList.map((k) => s[k]).filter((x) => x?.coord);
    return verts.length >= 3 ? verts : [];
  }

  getEndpointsForTetrahedronEdge(cmd, outputLabel) {
    const idx = this.getCmdOutputIndex(cmd, outputLabel);
    const s = this.getTetrahedronStructure(cmd);
    if (!s || idx < 0) return null;
    const edgeByIndex = {
      6: ['A', 'C'],
      7: ['A', 'B'],
      8: ['B', 'C'],
      9: ['A', 'D'],
      10: ['C', 'D'],
      11: ['B', 'D']
    };
    const pair = edgeByIndex[idx];
    if (!pair) return null;
    const p0 = s[pair[0]];
    const p1 = s[pair[1]];
    if (!p0?.coord || !p1?.coord) return null;
    return { p0, p1 };
  }

  getPrismStructure(cmd) {
    if (!cmd || cmd.name !== 'Prism') return null;
    const inputs = Array.isArray(cmd.inputs) ? cmd.inputs : [];
    const outputs = Array.isArray(cmd.outputs) ? cmd.outputs : [];

    const baseRef = String(inputs[0]?.value || '').trim();
    const baseRefType = String(this.elementMap[baseRef]?.getAttribute?.('type') || '').trim();
    const isPolygonBase = baseRefType === 'polygon' || baseRefType === 'polygon3d';
    if (isPolygonBase) {
      const baseCmd = this.cmdMap[baseRef];
      const base = this.getPolygonVertices(baseCmd);
      const n = base.length;
      if (n < 3) return null;
      const top = new Array(n).fill(null);
      for (let i = 0; i < n; i += 1) {
        const label = outputs[i + 1];
        if (!label) return null;
        const coord = this.normalizeCoord(this.resolvePointByLabel(label));
        if (!coord) return null;
        top[i] = { label, coord };
      }
      if (top.some((p) => !p?.coord)) return null;
      return { base, top, n, mode: 'polygon-base' };
    }

    const pts = this.getCommandPointInputs(cmd);
    if (pts.length < 4) return null;
    const n = pts.length - 1;
    if (n < 3) return null;

    const base = pts.slice(0, n);
    const top = new Array(n).fill(null);
    top[0] = pts[n]; // last input is the translated image of base[0]
    for (let i = 1; i < n; i += 1) {
      const label = outputs[i];
      if (!label) return null;
      const coord = this.normalizeCoord(this.resolvePointByLabel(label));
      if (!coord) return null;
      top[i] = { label, coord };
    }
    if (top.some((p) => !p?.coord)) return null;
    return { base, top, n, mode: 'point-base' };
  }

  getVerticesForPrismFace(cmd, outputLabel) {
    const idx = this.getCmdOutputIndex(cmd, outputLabel);
    const s = this.getPrismStructure(cmd);
    if (!s || idx < 0) return [];
    const { base, top, n } = s;
    const baseFaceIdx = n; // a_n (only point-base form has this explicit output)
    const sideFaceStart = n + 1; // a_{n+1} ... a_{2n}
    const topFaceIdx = 2 * n + 1; // a_{2n+1}

    if (s.mode === 'point-base' && idx === baseFaceIdx) return base;
    if (idx >= sideFaceStart && idx < sideFaceStart + n) {
      const i = idx - sideFaceStart;
      return [
        base[i],
        base[(i + 1) % n],
        top[(i + 1) % n],
        top[i]
      ];
    }
    if (idx === topFaceIdx) {
      return top.slice(1).concat(top[0]);
    }
    return [];
  }

  getEndpointsForPrismEdge(cmd, outputLabel) {
    const idx = this.getCmdOutputIndex(cmd, outputLabel);
    const s = this.getPrismStructure(cmd);
    if (!s || idx < 0) return null;
    const { base, top, n } = s;
    const edgeStart = 2 * n + 2; // a_{2n+2}
    if (s.mode === 'polygon-base') {
      if (idx < edgeStart || idx >= edgeStart + 2 * n) return null;
      const offset = idx - edgeStart;
      if (offset < n) {
        const i = offset;
        return { p0: base[i], p1: top[i] };
      }
      const i = offset - n;
      return { p0: top[i], p1: top[(i + 1) % n] };
    }
    if (idx < edgeStart || idx >= edgeStart + 3 * n) return null;
    const offset = idx - edgeStart;
    if (offset < n) {
      const i = offset;
      return { p0: base[i], p1: base[(i + 1) % n] };
    }
    if (offset < 2 * n) {
      const i = offset - n;
      return { p0: base[i], p1: top[i] };
    }
    const i = offset - 2 * n;
    return { p0: top[i], p1: top[(i + 1) % n] };
  }

  getEndpointsForCubeEdge(cmd, outputLabel) {
    const idx = this.getCmdOutputIndex(cmd, outputLabel);
    const s = this.getCubeStructure(cmd);
    if (!s || idx < 0) return null;
    const edgeByIndex = {
      12: ['A', 'D'],
      13: ['A', 'B'],
      14: ['B', 'C'],
      15: ['C', 'D'],
      16: ['A', 'E'],
      17: ['D', 'H'],
      18: ['E', 'H'],
      19: ['E', 'F'],
      20: ['B', 'F'],
      21: ['F', 'G'],
      22: ['C', 'G'],
      23: ['G', 'H']
    };
    const pair = edgeByIndex[idx];
    if (!pair) return null;
    const p0 = s[pair[0]];
    const p1 = s[pair[1]];
    if (!p0?.coord || !p1?.coord) return null;
    return { p0, p1 };
  }

  getEndpointsForPolygonEdge(cmd, outputLabel) {
    if (!cmd || cmd.name !== 'Polygon') return null;
    const idx = this.getCmdOutputIndex(cmd, outputLabel);
    if (idx < 1) return null; // a0 is polygon itself
    const verts = this.getPolygonVertices(cmd);
    const n = verts.length;
    if (n < 2 || idx > n) return null;
    const i = idx - 1;
    const p0 = verts[i];
    const p1 = verts[(i + 1) % n];
    if (!p0?.coord || !p1?.coord) return null;
    return { p0, p1 };
  }

  getPolygonVertices(cmd) {
    if (!cmd) return [];
    const verts = [];
    const seen = new Set();

    const pushVertex = (label, coord) => {
      const c = this.normalizeCoord(coord);
      if (!c) return;
      const key = label
        ? `L:${String(label).trim()}`
        : `C:${c.x.toFixed(8)},${c.y.toFixed(8)},${c.z.toFixed(8)}`;
      if (seen.has(key)) return;
      seen.add(key);
      verts.push({ label: label || null, coord: c });
    };

    (cmd.inputs || []).forEach((input) => {
      const p = this.normalizePointInput(input);
      if (!p.coord) return;
      pushVertex(p.label, p.coord);
    });

    // Regular polygon form Polygon[A,B,n] emits extra vertices in outputs.
    (cmd.outputs || []).forEach((label) => {
      const elType = String(this.elementMap[label]?.getAttribute?.('type') || '').trim();
      if (elType !== 'point' && elType !== 'point3d') return;
      pushVertex(label, this.resolvePointByLabel(label));
    });

    return verts;
  }

  parsePoint3D(el, label, visible, style, cmd) {
    const exp = this.expMap[label];
    const rawType = String(el?.getAttribute?.('type') || '').trim().toLowerCase();
    const coord = this.normalizeCoord(this.parsePointCoordFromElement(
      el,
      rawType === 'point' ? 'homogeneous2d' : 'cartesian3d'
    )) || { x: 0, y: 0, z: 0 };
    return {
      type: 'point3d',
      label,
      visible,
      x: coord.x,
      y: coord.y,
      z: coord.z,
      exp: exp?.exp || null,
      expType: exp?.type || null,
      commandName: cmd?.name || null,
      commandInputs: (cmd?.inputs || []).map((x) => x.value),
      ...style
    };
  }

  parseSegment3D(label, visible, style, cmd) {
    const out = {
      type: 'segment3d',
      label,
      visible,
      commandName: cmd?.name || null,
      commandInputs: (cmd?.inputs || []).map((x) => x.value),
      ...style
    };
    if (cmd?.name === 'Pyramid') {
      const pair = this.getEndpointsForPyramidEdge(cmd, label);
      if (pair) {
        out.startLabel = pair.p0?.label || null;
        out.endLabel = pair.p1?.label || null;
        out.startCoord = pair.p0?.coord || null;
        out.endCoord = pair.p1?.coord || null;
        return out;
      }
    }
    if (cmd?.name === 'Cube') {
      const pair = this.getEndpointsForCubeEdge(cmd, label);
      if (pair) {
        out.startLabel = pair.p0?.label || null;
        out.endLabel = pair.p1?.label || null;
        out.startCoord = pair.p0?.coord || null;
        out.endCoord = pair.p1?.coord || null;
        return out;
      }
    }
    if (cmd?.name === 'Prism') {
      const pair = this.getEndpointsForPrismEdge(cmd, label);
      if (pair) {
        out.startLabel = pair.p0?.label || null;
        out.endLabel = pair.p1?.label || null;
        out.startCoord = pair.p0?.coord || null;
        out.endCoord = pair.p1?.coord || null;
        return out;
      }
    }
    if (cmd?.name === 'Tetrahedron') {
      const pair = this.getEndpointsForTetrahedronEdge(cmd, label);
      if (pair) {
        out.startLabel = pair.p0?.label || null;
        out.endLabel = pair.p1?.label || null;
        out.startCoord = pair.p0?.coord || null;
        out.endCoord = pair.p1?.coord || null;
        return out;
      }
    }
    if (cmd?.name === 'Polygon') {
      const pair = this.getEndpointsForPolygonEdge(cmd, label);
      if (pair) {
        out.startLabel = pair.p0?.label || null;
        out.endLabel = pair.p1?.label || null;
        out.startCoord = pair.p0?.coord || null;
        out.endCoord = pair.p1?.coord || null;
        return out;
      }
    }
    if (cmd && cmd.inputs.length >= 2) {
      const p0 = this.normalizePointInput(cmd.inputs[0]);
      const p1 = this.normalizePointInput(cmd.inputs[1]);
      out.startLabel = p0.label;
      out.endLabel = p1.label;
      out.startCoord = p0.coord;
      out.endCoord = p1.coord;
    }
    return out;
  }

  parseLine3D(label, visible, style, cmd) {
    const out = {
      type: 'line3d',
      label,
      visible,
      commandName: cmd?.name || null,
      commandInputs: (cmd?.inputs || []).map((x) => x.value),
      ...style
    };
    if (cmd && cmd.inputs.length >= 2) {
      const p0 = this.normalizePointInput(cmd.inputs[0]);
      const p1 = this.normalizePointInput(cmd.inputs[1]);
      out.point1Label = p0.label;
      out.point2Label = p1.label;
      out.point1Coord = p0.coord;
      out.point2Coord = p1.coord;
    }
    return out;
  }

  parseRay3D(label, visible, style, cmd) {
    const out = {
      type: 'ray3d',
      label,
      visible,
      commandName: cmd?.name || null,
      commandInputs: (cmd?.inputs || []).map((x) => x.value),
      ...style
    };
    if (cmd && cmd.inputs.length >= 2) {
      const p0 = this.normalizePointInput(cmd.inputs[0]);
      const p1 = this.normalizePointInput(cmd.inputs[1]);
      out.startLabel = p0.label;
      out.throughLabel = p1.label;
      out.startCoord = p0.coord;
      out.throughCoord = p1.coord;
    }
    return out;
  }

  parseVector3D(el, label, visible, style, cmd) {
    const out = {
      type: 'vector3d',
      label,
      visible,
      commandName: cmd?.name || null,
      commandInputs: (cmd?.inputs || []).map((x) => x.value),
      ...style
    };
    const coords = el.querySelector('coords');
    if (coords) {
      out.vx = Number(coords.getAttribute('x'));
      out.vy = Number(coords.getAttribute('y'));
      out.vz = Number(coords.getAttribute('z'));
    }
    if (cmd && cmd.inputs.length >= 2) {
      const p0 = this.normalizePointInput(cmd.inputs[0]);
      const p1 = this.normalizePointInput(cmd.inputs[1]);
      out.startLabel = p0.label;
      out.endLabel = p1.label;
      out.startCoord = p0.coord;
      out.endCoord = p1.coord;
    }
    if (!out.endCoord && out.startCoord && [out.vx, out.vy, out.vz].every(Number.isFinite)) {
      out.endCoord = {
        x: out.startCoord.x + out.vx,
        y: out.startCoord.y + out.vy,
        z: out.startCoord.z + out.vz
      };
    }
    return out;
  }

  parsePolygon3D(label, visible, style, cmd) {
    const out = {
      type: 'polygon3d',
      label,
      visible,
      commandName: cmd?.name || null,
      commandInputs: (cmd?.inputs || []).map((x) => x.value),
      commandOutputs: cmd?.outputs || [],
      ...style
    };
    if (cmd?.name === 'Pyramid') {
      const faceVertices = this.getVerticesForPyramidFace(cmd, label);
      out.vertices = faceVertices.length >= 3 ? faceVertices : this.extractPolygonVertices(cmd);
    } else if (cmd?.name === 'Cube') {
      const faceVertices = this.getVerticesForCubeFace(cmd, label);
      out.vertices = faceVertices.length >= 3 ? faceVertices : this.extractPolygonVertices(cmd);
    } else if (cmd?.name === 'Prism') {
      const faceVertices = this.getVerticesForPrismFace(cmd, label);
      out.vertices = faceVertices.length >= 3 ? faceVertices : this.extractPolygonVertices(cmd);
    } else if (cmd?.name === 'Tetrahedron') {
      const faceVertices = this.getVerticesForTetrahedronFace(cmd, label);
      out.vertices = faceVertices.length >= 3 ? faceVertices : this.extractPolygonVertices(cmd);
    } else {
      out.vertices = this.extractPolygonVertices(cmd);
    }
    return out;
  }

  extractPolygonVertices(cmd) {
    return this.getPolygonVertices(cmd);
  }

  parsePlane3D(label, visible, style, cmd) {
    const out = {
      type: 'plane3d',
      label,
      visible,
      commandName: cmd?.name || null,
      commandInputs: (cmd?.inputs || []).map((x) => x.value),
      ...style
    };
    if (cmd) {
      out.points = (cmd.inputs || [])
        .map((input) => this.normalizePointInput(input))
        .filter((item) => item.coord);
    } else {
      out.points = [];
    }
    return out;
  }

  parsePolyhedron3D(label, visible, style, cmd) {
    const out = {
      type: 'polyhedron3d',
      label,
      visible,
      commandName: cmd?.name || null,
      commandInputs: (cmd?.inputs || []).map((x) => x.value),
      commandOutputs: cmd?.outputs || [],
      ...style
    };
    out.points = this.getCommandPointInputs(cmd);
    return out;
  }

  parseCylinder3D(label, visible, style, cmd) {
    const out = {
      type: 'cylinder3d',
      label,
      visible,
      commandName: cmd?.name || null,
      commandInputs: (cmd?.inputs || []).map((x) => x.value),
      commandOutputs: cmd?.outputs || [],
      ...style
    };
    if (!cmd || cmd.inputs.length < 3) return out;
    const p0 = this.normalizePointInput(cmd.inputs[0]);
    const p1 = this.normalizePointInput(cmd.inputs[1]);
    const rRaw = this.parseNumericInput(cmd.inputs[2]);
    out.baseLabel = p0.label;
    out.topLabel = p1.label;
    out.baseCoord = p0.coord || null;
    out.topCoord = p1.coord || null;
    out.radius = Number.isFinite(rRaw) && rRaw > 0 ? rRaw : null;
    return out;
  }

  parseCone3D(label, visible, style, cmd) {
    const out = {
      type: 'cone3d',
      label,
      visible,
      commandName: cmd?.name || null,
      commandInputs: (cmd?.inputs || []).map((x) => x.value),
      commandOutputs: cmd?.outputs || [],
      ...style
    };
    if (!cmd || cmd.inputs.length < 3) return out;
    const p0 = this.normalizePointInput(cmd.inputs[0]);
    const p1 = this.normalizePointInput(cmd.inputs[1]);
    const rRaw = this.parseNumericInput(cmd.inputs[2]);
    out.baseLabel = p0.label;
    out.apexLabel = p1.label;
    out.baseCoord = p0.coord || null;
    out.apexCoord = p1.coord || null;
    out.radius = Number.isFinite(rRaw) && rRaw > 0 ? rRaw : null;
    return out;
  }

  parseSphere3D(label, visible, style, cmd) {
    const out = {
      type: 'sphere3d',
      label,
      visible,
      commandName: cmd?.name || null,
      commandInputs: (cmd?.inputs || []).map((x) => x.value),
      commandOutputs: cmd?.outputs || [],
      ...style
    };
    if (!cmd || cmd.inputs.length < 2) return out;
    const center = this.normalizePointInput(cmd.inputs[0]);
    const second = this.normalizePointInput(cmd.inputs[1]);
    const rRaw = this.parseNumericInput(cmd.inputs[1]);

    out.centerLabel = center.label;
    out.centerCoord = center.coord || null;
    out.surfaceLabel = second.label;
    out.surfaceCoord = second.coord || null;

    let radius = null;
    if (out.centerCoord && out.surfaceCoord) {
      const dx = out.surfaceCoord.x - out.centerCoord.x;
      const dy = out.surfaceCoord.y - out.centerCoord.y;
      const dz = out.surfaceCoord.z - out.centerCoord.z;
      const d = Math.hypot(dx, dy, dz);
      if (Number.isFinite(d) && d > 0) radius = d;
    }
    if (!(Number.isFinite(radius) && radius > 0) && Number.isFinite(rRaw) && rRaw > 0) {
      radius = rRaw;
    }
    out.radius = Number.isFinite(radius) && radius > 0 ? radius : null;
    return out;
  }

  buildSemantics(structured) {
    return {
      mode: '3d-phase1',
      commandGraph: [...this.commandList],
      counts: {
        points3d: structured.points3d.length,
        segments3d: structured.segments3d.length,
        lines3d: structured.lines3d.length,
        rays3d: structured.rays3d.length,
        vectors3d: structured.vectors3d.length,
        polygons3d: structured.polygons3d.length,
        planes3d: structured.planes3d.length,
        polyhedra3d: structured.polyhedra3d.length,
        cylinders3d: structured.cylinders3d.length,
        cones3d: structured.cones3d.length,
        spheres3d: structured.spheres3d.length
      }
    };
  }
}

if (typeof window !== 'undefined') {
  window.GGB3DParser = GGB3DParser;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = GGB3DParser;
}
