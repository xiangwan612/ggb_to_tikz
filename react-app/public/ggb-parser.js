/**
 * GeoGebra XML 解析器 (优化版)
 */

class GGBParser {
    constructor(xmlString) {
        this.parser = new DOMParser();
        this.doc = this.parser.parseFromString(xmlString, 'text/xml');
        this.construction = this.doc.querySelector('construction');
        
        // 映射表
        this.expMap = {};  // label -> {exp, type}
        this.cmdMap = {};  // outputLabel -> {name, inputs}
        this.commandList = []; // 保留命令顺序，便于调试与语义重建
        this.elementMap = {}; // label -> element DOM
    }

    parse() {
        if (!this.construction) {
            return { elements: [], stats: {}, rawXML: this.doc.outerHTML };
        }

        this.buildExpMap();
        this.buildCmdMap();
        this.buildElementMap();

        const result = {
            points: [],
            functions: [],
            segments: [],
            polygons: [],
            vectors: [],
            lines: [],
            rays: [],
            angles: [],
            conics: [],
            conicparts: [],
            others: []
        };

        const stats = { total: 0, visible: 0, byType: {} };

        this.construction.querySelectorAll('element').forEach(el => {
            const type = el.getAttribute('type');
            const label = el.getAttribute('label');
            const visible = el.querySelector('show') ? el.querySelector('show').getAttribute('object') !== 'false' : true;

            stats.total++;
            if (visible) stats.visible++;
            stats.byType[type] = (stats.byType[type] || 0) + 1;

            const cmd = this.cmdMap[label];
            const style = this.parseStyle(el);

            switch (type) {
                case 'point':
                    result.points.push(this.parsePoint(el, label, visible, style));
                    break;
                case 'function':
                    result.functions.push(this.parseFunction(el, label, visible, style));
                    break;
                case 'segment':
                    result.segments.push(this.parseSegment(el, label, visible, style, cmd));
                    break;
                case 'polygon':
                    result.polygons.push(this.parsePolygon(el, label, visible, style, cmd));
                    break;
                case 'vector':
                    result.vectors.push(this.parseVector(el, label, visible, style, cmd));
                    break;
                case 'line':
                    result.line = this.parseLine(el, label, visible, style, cmd);
                    result.lines.push(result.line);
                    break;
                case 'ray':
                    result.rays.push(this.parseRay(el, label, visible, style, cmd));
                    break;
                case 'angle':
                    result.angles.push(this.parseAngle(el, label, visible, style, cmd));
                    break;
                case 'conic':
                    const conic = this.parseConic(el, label, visible, style, cmd);
                    if (conic) result.conics.push(conic);
                    break;
                case 'conicpart':
                    result.conicparts.push(this.parseConicPart(el, label, visible, style, cmd));
                    break;
                default:
                    result.others.push({ type, label, visible, style, cmd, rawXML: el.outerHTML });
            }
        });

        const semantics = this.buildSemantics(result);

        return {
            elements: [...result.points, ...result.functions, ...result.segments, ...result.polygons, ...result.vectors, ...result.lines, ...result.rays, ...result.angles, ...result.conics, ...result.conicparts, ...result.others],
            structured: result,
            semantics,
            expMap: this.expMap,
            cmdMap: this.cmdMap,
            stats,
            rawXML: this.construction.outerHTML
        };
    }

    buildExpMap() {
        this.construction.querySelectorAll('expression').forEach(exp => {
            const label = exp.getAttribute('label');
            if (label) {
                this.expMap[label] = {
                    exp: exp.getAttribute('exp'),
                    type: exp.getAttribute('type')
                };
            }
        });
    }

    buildCmdMap() {
        this.commandList = [];
        this.construction.querySelectorAll('command').forEach(cmd => {
            const name = cmd.getAttribute('name');
            const outputEl = cmd.querySelector('output');
            const inputEl = cmd.querySelector('input');
            
            if (!outputEl || !inputEl) return;

            // 关键修改：解析 a0, a1, a2 ... 等所有输入属性
            const inputs = [];
            for (let i = 0; ; i++) {
                const attrVal = inputEl.getAttribute('a' + i);
                if (attrVal === null) break;
                
                inputs.push({
                    index: i,
                    value: attrVal,
                    isCoordinate: this.isCoordinate(attrVal),
                    isEquation: this.isEquation(attrVal),
                    isNumber: this.isNumber(attrVal),
                    coord: this.isCoordinate(attrVal) ? this.parseCoordinate(attrVal) : null
                });
            }

            // 支持一个命令产生多个输出（如 AngularBisector 的 a0/a1）
            const outputs = [];
            for (let i = 0; ; i++) {
                const outVal = outputEl.getAttribute('a' + i);
                if (outVal === null) break;
                if (outVal !== '') outputs.push(outVal);
            }
            outputs.forEach(outputLabel => {
                this.cmdMap[outputLabel] = { name, inputs, outputs, raw: cmd.outerHTML };
            });
            this.commandList.push({ name, inputs, outputs, raw: cmd.outerHTML });
        });
    }

    buildElementMap() {
        this.construction.querySelectorAll('element').forEach(el => {
            const label = el.getAttribute('label');
            if (label) this.elementMap[label] = el;
        });
    }

    isCoordinate(str) {
        return /^\s*\(\s*-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?\s*\)\s*$/.test(str);
    }

    isEquation(str) {
        return str && str.includes('=');
    }

    isNumber(str) {
        return /^-?\d+(\.\d+)?$/.test(str);
    }

    parseCoordinate(str) {
        const match = str.match(/\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\)/);
        return match ? { x: parseFloat(match[1]), y: parseFloat(match[2]) } : null;
    }

    getElementType(label) {
        const el = this.elementMap[label];
        return el ? el.getAttribute('type') : null;
    }

    getConicMatrixByLabel(label) {
        const el = this.elementMap[label];
        if (!el || el.getAttribute('type') !== 'conic') return null;
        const matrix = el.querySelector('matrix');
        if (!matrix) return null;
        const toNum = v => parseFloat(v || '0');
        return {
            A0: toNum(matrix.getAttribute('A0')),
            A1: toNum(matrix.getAttribute('A1')),
            A2: toNum(matrix.getAttribute('A2')),
            A3: toNum(matrix.getAttribute('A3')),
            A4: toNum(matrix.getAttribute('A4')),
            A5: toNum(matrix.getAttribute('A5'))
        };
    }

    getLineCoeffsByLabel(label) {
        const el = this.elementMap[label];
        if (!el) return null;
        const type = el.getAttribute('type');
        if (!['line', 'segment', 'ray'].includes(type)) return null;
        const coords = el.querySelector('coords');
        if (!coords) return null;
        const a = parseFloat(coords.getAttribute('x'));
        const b = parseFloat(coords.getAttribute('y'));
        const c = parseFloat(coords.getAttribute('z'));
        if (![a, b, c].every(Number.isFinite)) return null;
        return { a, b, c };
    }

    projectPointToLine(point, line) {
        if (!point || !line) return null;
        const { x, y } = point;
        const { a, b, c } = line;
        const denom = a * a + b * b;
        if (!Number.isFinite(denom) || denom < 1e-12) return null;
        const d = (a * x + b * y + c) / denom;
        return {
            x: x - a * d,
            y: y - b * d
        };
    }

    // 解 line 与 conic 的切点（或近似重根）
    solveTangentPoint(line, matrix) {
        if (!line || !matrix) return null;
        const a = line.a, b = line.b, c = line.c;
        if (![a, b, c].every(Number.isFinite)) return null;

        const A0 = matrix.A0, A1 = matrix.A1, A2 = matrix.A2, A3 = matrix.A3, A4 = matrix.A4, A5 = matrix.A5;
        const eps = 1e-10;

        // 优先消元 y，避免除零
        if (Math.abs(b) > eps) {
            const m = -a / b;
            const k = -c / b;
            const qa = A0 + A1 * m * m + A3 * m;
            const qb = 2 * A1 * m * k + A3 * k + 2 * A4 + 2 * A5 * m;
            const qc = A1 * k * k + 2 * A5 * k + A2;

            let x;
            if (Math.abs(qa) > eps) {
                x = -qb / (2 * qa);
            } else if (Math.abs(qb) > eps) {
                x = -qc / qb;
            } else {
                return null;
            }
            const y = m * x + k;
            return { x, y };
        }

        // 否则消元 x
        if (Math.abs(a) > eps) {
            const m = -b / a;
            const k = -c / a; // x = m y + k
            const qa = A1 + A0 * m * m + A3 * m;
            const qb = 2 * A0 * m * k + A3 * k + 2 * A5 + 2 * A4 * m;
            const qc = A0 * k * k + 2 * A4 * k + A2;

            let y;
            if (Math.abs(qa) > eps) {
                y = -qb / (2 * qa);
            } else if (Math.abs(qb) > eps) {
                y = -qc / qb;
            } else {
                return null;
            }
            const x = m * y + k;
            return { x, y };
        }

        return null;
    }

    resolvePointByLabel(label) {
        if (!label) return null;
        const el = this.elementMap[label];
        if (el && el.getAttribute('type') === 'point') {
            const coords = el.querySelector('coords');
            if (coords) {
                const x = parseFloat(coords.getAttribute('x'));
                const y = parseFloat(coords.getAttribute('y'));
                const z = parseFloat(coords.getAttribute('z'));
                // GeoGebra 点坐标可能是齐次坐标，需做归一化： (x/z, y/z)
                if (Number.isFinite(z) && Math.abs(z) > 1e-12) {
                    return { x: x / z, y: y / z };
                }
                return {
                    x,
                    y
                };
            }
        }
        const exp = this.expMap[label];
        if (exp && exp.exp && this.isCoordinate(exp.exp)) {
            return this.parseCoordinate(exp.exp);
        }
        return null;
    }

    normalizeInputPoint(input) {
        if (!input) return { label: null, coord: null };
        if (input.isCoordinate) return { label: null, coord: input.coord };
        const coord = this.resolvePointByLabel(input.value);
        return { label: input.value, coord };
    }

    classifyPointSource(label, cmd) {
        const exp = this.expMap[label];
        const base = {
            sourceType: 'unknown',
            commandName: cmd ? cmd.name : null,
            sourceInputs: cmd ? (cmd.inputs || []).map(i => i.value) : [],
            sourceObjects: []
        };

        if (cmd) {
            const name = cmd.name || '';
            const inputLabels = (cmd.inputs || []).map(i => i.value).filter(Boolean);
            base.sourceObjects = inputLabels;

            if (name === 'Point') {
                // Point(对象) => 在对象上的点；Point((x,y)) => 坐标点
                const objectInput = (cmd.inputs || []).find(i => !i.isCoordinate);
                if (objectInput) {
                    return { ...base, sourceType: 'point_on_object', sourceObjects: [objectInput.value] };
                }
                return { ...base, sourceType: 'point_by_coordinate_command' };
            }
            if (name === 'Intersect' || name === 'IntersectPath') {
                return { ...base, sourceType: 'intersection_point' };
            }
            if (name === 'Midpoint') {
                return { ...base, sourceType: 'midpoint' };
            }
            if (name === 'Center') {
                return { ...base, sourceType: 'center_point' };
            }
            return { ...base, sourceType: 'derived_point' };
        }

        if (exp && exp.exp && this.isCoordinate(exp.exp)) {
            return { ...base, sourceType: 'free_point_expression' };
        }
        return { ...base, sourceType: 'free_point_coords' };
    }

    parseStyle(el) {
        const style = {};
        const objColor = el.querySelector('objColor');
        if (objColor) {
            style.color = this.rgbToHex(
                parseInt(objColor.getAttribute('r') || '0'),
                parseInt(objColor.getAttribute('g') || '0'),
                parseInt(objColor.getAttribute('b') || '0')
            );
            const alpha = parseFloat(objColor.getAttribute('alpha'));
            if (Number.isFinite(alpha)) style.alpha = alpha;
        }

        // 关键修改：GGB 5.0 线宽在 lineStyle 标签中
        const lineStyle = el.querySelector('lineStyle');
        if (lineStyle) {
            style.lineThickness = parseInt(lineStyle.getAttribute('thickness') || '5');
            style.lineType = parseInt(lineStyle.getAttribute('type') || '0');
            style.opacity = parseInt(lineStyle.getAttribute('opacity') || '255');
        }

        const pointSize = el.querySelector('pointSize');
        if (pointSize) style.pointSize = parseInt(pointSize.getAttribute('val') || '5');

        return style;
    }

    rgbToHex(r, g, b) {
        return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
    }

    parsePoint(el, label, visible, style) {
        const coords = el.querySelector('coords');
        const cmd = this.cmdMap[label];
        const exp = this.expMap[label];
        const source = this.classifyPointSource(label, cmd);
        let x = 0;
        let y = 0;
        if (coords) {
            const rawX = parseFloat(coords.getAttribute('x'));
            const rawY = parseFloat(coords.getAttribute('y'));
            const rawZ = parseFloat(coords.getAttribute('z'));
            if (Number.isFinite(rawZ) && Math.abs(rawZ) > 1e-12) {
                x = rawX / rawZ;
                y = rawY / rawZ;
            } else {
                x = rawX;
                y = rawY;
            }
        }
        return {
            type: 'point',
            label,
            visible,
            x,
            y,
            exp: exp ? exp.exp : null,
            expType: exp ? exp.type : null,
            ...source,
            ...style
        };
    }

    parseFunction(el, label, visible, style) {
        const exp = this.expMap[label];
        return {
            type: 'function',
            label,
            visible,
            exp: exp ? exp.exp : null,
            ...style
        };
    }

    parseSegment(el, label, visible, style, cmd) {
        const res = { type: 'segment', label, visible, ...style };
        const polygonCmds = new Set(['Polygon', 'RigidPolygon', 'RegularPolygon', 'VectorPolygon']);
        if (cmd && polygonCmds.has(cmd.name) && Array.isArray(cmd.outputs) && cmd.outputs.length >= 1) {
            res.fromPolygon = true;
            res.polygonLabel = cmd.outputs[0] || null;

            // 普通/刚体多边形可按输入点顺序恢复边端点
            if (cmd.name !== 'RegularPolygon') {
                const edgeIndex = cmd.outputs.indexOf(label) - 1; // outputs[0] 是 polygon 本体
                const n = cmd.inputs.length;
                if (edgeIndex >= 0 && n >= 2) {
                    const i0 = edgeIndex % n;
                    const i1 = (edgeIndex + 1) % n;
                    const p0 = this.normalizeInputPoint(cmd.inputs[i0]);
                    const p1 = this.normalizeInputPoint(cmd.inputs[i1]);
                    if (p0.label) res.startLabel = p0.label;
                    if (p1.label) res.endLabel = p1.label;
                    if (p0.coord) res.startCoord = p0.coord;
                    if (p1.coord) res.endCoord = p1.coord;
                }
            }
        } else if (cmd && cmd.inputs.length >= 2) {
            const p0 = this.normalizeInputPoint(cmd.inputs[0]);
            const p1 = this.normalizeInputPoint(cmd.inputs[1]);
            if (p0.label) res.startLabel = p0.label;
            if (p1.label) res.endLabel = p1.label;
            if (p0.coord) res.startCoord = p0.coord;
            if (p1.coord) res.endCoord = p1.coord;
        }
        return res;
    }

    parsePolygon(el, label, visible, style, cmd) {
        const res = { type: 'polygon', label, visible, ...style };
        if (cmd) {
            res.commandName = cmd.name;
            res.commandInputs = (cmd.inputs || []).map(i => i.value);
            res.commandOutputs = cmd.outputs || [];
            res.edgeLabels = (cmd.outputs || []).slice(1).filter(Boolean);
            res.vertices = this.extractPolygonVertices(cmd);
        }
        return res;
    }

    parseVector(el, label, visible, style, cmd) {
        const res = { type: 'vector', label, visible, ...style };
        const coords = el.querySelector('coords');
        if (coords) {
            res.vx = parseFloat(coords.getAttribute('x'));
            res.vy = parseFloat(coords.getAttribute('y'));
        }
        const startPoint = el.querySelector('startPoint');
        if (startPoint) {
            res.startLabel = startPoint.getAttribute('exp') || null;
            const p = this.resolvePointByLabel(res.startLabel);
            if (p) res.startCoord = p;
        }
        if (cmd) {
            res.commandName = cmd.name;
            res.commandInputs = (cmd.inputs || []).map(i => i.value);
            if (cmd.name === 'Vector' && cmd.inputs.length >= 2) {
                const p0 = this.normalizeInputPoint(cmd.inputs[0]);
                const p1 = this.normalizeInputPoint(cmd.inputs[1]);
                if (p0.label) res.startLabel = p0.label;
                if (p1.label) res.endLabel = p1.label;
                if (p0.coord) res.startCoord = p0.coord;
                if (p1.coord) res.endCoord = p1.coord;
            }
        }
        // 兜底：由起点+向量分量得到终点
        if (!res.endCoord && res.startCoord && Number.isFinite(res.vx) && Number.isFinite(res.vy)) {
            res.endCoord = { x: res.startCoord.x + res.vx, y: res.startCoord.y + res.vy };
        }
        return res;
    }

    extractPolygonVertices(cmd) {
        // 1) 先吃输入里可解析为点的项（适配 Polygon / RigidPolygon）
        const inputVerts = [];
        (cmd.inputs || []).forEach(i => {
            const p = this.normalizeInputPoint(i);
            if (p.label || p.coord) {
                inputVerts.push({ label: p.label || null, coord: p.coord || null });
            }
        });

        // 2) 对 RegularPolygon，再从 outputs 里提取点对象（通常是新增顶点）
        const outputPointLabels = (cmd.outputs || []).filter(o => this.getElementType(o) === 'point');
        const mergedLabels = [];
        inputVerts.forEach(v => { if (v.label) mergedLabels.push(v.label); });
        outputPointLabels.forEach(l => mergedLabels.push(l));

        // 去重且保序
        const uniqLabels = [];
        mergedLabels.forEach(l => {
            if (!l) return;
            if (!uniqLabels.includes(l)) uniqLabels.push(l);
        });

        // 3) 优先按标签组装顶点
        const vertsByLabel = uniqLabels
            .map(l => ({ label: l, coord: this.resolvePointByLabel(l) }))
            .filter(v => v.coord);

        const isRegularPolygonByPolygonCommand =
            cmd &&
            cmd.name === 'Polygon' &&
            Array.isArray(cmd.inputs) &&
            cmd.inputs.length >= 3 &&
            cmd.inputs.some(i => i && i.isNumber);

        // 正多边形（Polygon(A,B,n)）保持输入/输出给出的顶点顺序，避免角索引错位
        if (isRegularPolygonByPolygonCommand && vertsByLabel.length >= 3) {
            return vertsByLabel;
        }

        // 4) 若顶点 >= 3，按几何中心角排序（适配正多边形输出点顺序不稳定）
        if (vertsByLabel.length >= 3) {
            const cx = vertsByLabel.reduce((s, v) => s + v.coord.x, 0) / vertsByLabel.length;
            const cy = vertsByLabel.reduce((s, v) => s + v.coord.y, 0) / vertsByLabel.length;
            vertsByLabel.sort((a, b) =>
                Math.atan2(a.coord.y - cy, a.coord.x - cx) - Math.atan2(b.coord.y - cy, b.coord.x - cx)
            );
            return vertsByLabel;
        }

        // 5) 回退到输入点
        return inputVerts;
    }

    parseRay(el, label, visible, style, cmd) {
        const coords = el.querySelector('coords');
        const res = { type: 'ray', label, visible, ...style };
        if (cmd) {
            res.commandName = cmd.name;
            res.commandInputs = (cmd.inputs || []).map(i => i.value);
        }
        if (coords) {
            res.a = parseFloat(coords.getAttribute('x'));
            res.b = parseFloat(coords.getAttribute('y'));
            res.c = parseFloat(coords.getAttribute('z'));
        }
        if (cmd && cmd.name === 'Ray' && cmd.inputs.length >= 2) {
            const p0 = this.normalizeInputPoint(cmd.inputs[0]);
            const p1 = this.normalizeInputPoint(cmd.inputs[1]);
            if (p0.label) res.startLabel = p0.label;
            if (p1.label) res.throughLabel = p1.label;
            if (p0.coord) res.startCoord = p0.coord;
            if (p1.coord) res.throughCoord = p1.coord;
        }
        return res;
    }

    parseLine(el, label, visible, style, cmd) {
        const coords = el.querySelector('coords');
        const res = { type: 'line', label, visible, ...style };
        if (cmd) {
            res.commandName = cmd.name;
            res.commandInputs = (cmd.inputs || []).map(i => i.value);
            res.commandOutputs = cmd.outputs || [];
        }
        if (coords) {
            res.a = parseFloat(coords.getAttribute('x'));
            res.b = parseFloat(coords.getAttribute('y'));
            res.c = parseFloat(coords.getAttribute('z'));
        }
        // 仅对真正“由两点确定直线”的命令做通用两点解析，避免误判 AngularBisector 等命令
        if (cmd && cmd.name === 'Line' && cmd.inputs.length >= 2) {
            const p0 = this.normalizeInputPoint(cmd.inputs[0]);
            const p1 = this.normalizeInputPoint(cmd.inputs[1]);
            if (p0.label) res.point1Label = p0.label;
            if (p1.label) res.point2Label = p1.label;
            if (p0.coord) res.point1Coord = p0.coord;
            if (p1.coord) res.point2Coord = p1.coord;
        }

        // 兜底：若没有两点信息，按一般式构造两点（便于 TikZ 统一处理）
        if ((!res.point1Coord || !res.point2Coord) && Number.isFinite(res.a) && Number.isFinite(res.b) && Number.isFinite(res.c)) {
            const eps = 1e-10;
            if (Math.abs(res.b) > eps) {
                res.point1Coord = { x: 0, y: -res.c / res.b };
                res.point2Coord = { x: 1, y: -(res.a + res.c) / res.b };
            } else if (Math.abs(res.a) > eps) {
                res.point1Coord = { x: -res.c / res.a, y: 0 };
                res.point2Coord = { x: -res.c / res.a, y: 1 };
            }
        }

        // 切线增强：记录“过点 + 被切圆锥 + 切点坐标”
        if (cmd && cmd.name === 'Tangent' && Array.isArray(cmd.inputs)) {
            const conicInput = cmd.inputs.find(i => this.getElementType(i.value) === 'conic');
            const pointInput = cmd.inputs.find(i => i.isCoordinate || this.getElementType(i.value) === 'point');

            if (conicInput) {
                res.tangentConicLabel = conicInput.value;
                const matrix = this.getConicMatrixByLabel(conicInput.value);
                if (matrix) {
                    const tangentPoint = this.solveTangentPoint(res, matrix);
                    if (tangentPoint) {
                        res.tangentPointCoord = tangentPoint;
                    }
                }
            }
            if (pointInput) {
                if (pointInput.isCoordinate) {
                    res.throughPointCoord = pointInput.coord;
                } else {
                    res.throughPointLabel = pointInput.value;
                    const p = this.resolvePointByLabel(pointInput.value);
                    if (p) res.throughPointCoord = p;
                }
            }
        }

        // 角平分线增强：记录三点定义（如 AngularBisector(E, D, F)）
        if (cmd && cmd.name === 'AngularBisector' && Array.isArray(cmd.inputs) && cmd.inputs.length >= 3) {
            const p0 = this.normalizeInputPoint(cmd.inputs[0]);
            const p1 = this.normalizeInputPoint(cmd.inputs[1]);
            const p2 = this.normalizeInputPoint(cmd.inputs[2]);
            if (p0.label) res.bisectorPoint1Label = p0.label;
            if (p1.label) res.bisectorVertexLabel = p1.label;
            if (p2.label) res.bisectorPoint2Label = p2.label;
            if (p0.coord) res.bisectorPoint1Coord = p0.coord;
            if (p1.coord) res.bisectorVertexCoord = p1.coord;
            if (p2.coord) res.bisectorPoint2Coord = p2.coord;
        }

        // 垂线增强：记录“过点 + 目标对象 + 垂足(交点)”
        if (cmd && (cmd.name === 'OrthogonalLine' || cmd.name === 'PerpendicularLine') && Array.isArray(cmd.inputs)) {
            const pointInput = cmd.inputs.find(i => i.isCoordinate || this.getElementType(i.value) === 'point');
            const targetInput = cmd.inputs.find(i => i !== pointInput);

            if (pointInput) {
                if (pointInput.isCoordinate) {
                    res.orthogonalFromPointCoord = pointInput.coord;
                } else {
                    res.orthogonalFromPointLabel = pointInput.value;
                    const p = this.resolvePointByLabel(pointInput.value);
                    if (p) res.orthogonalFromPointCoord = p;
                }
            }

            if (targetInput) {
                res.orthogonalTargetLabel = targetInput.value;
                res.orthogonalTargetType = this.getElementType(targetInput.value);
            }

            // 当前先稳定支持“点到直线/线段/射线”的垂足
            if (res.orthogonalFromPointCoord && res.orthogonalTargetLabel) {
                const targetLine = this.getLineCoeffsByLabel(res.orthogonalTargetLabel);
                if (targetLine) {
                    const foot = this.projectPointToLine(res.orthogonalFromPointCoord, targetLine);
                    if (foot) {
                        res.orthogonalFootCoord = foot;
                        // 通用字段，便于后续统一处理各种“交点”
                        res.intersectionPointCoord = foot;
                    }
                }
            }
        }
        return res;
    }

    parseConic(el, label, visible, style, cmd) {
        const res = { type: 'conic', label, visible, ...style };
        const exp = this.expMap[label];
        if (exp && exp.exp) {
            res.equation = exp.exp;
        }
        // 补充矩阵信息，方便还原方程
        const matrix = el.querySelector('matrix');
        if (matrix) {
            res.matrix = {
                A0: matrix.getAttribute('A0'), A1: matrix.getAttribute('A1'),
                A2: matrix.getAttribute('A2'), A3: matrix.getAttribute('A3'),
                A4: matrix.getAttribute('A4'), A5: matrix.getAttribute('A5')
            };
        }

        if (!cmd) {
            if (res.matrix) {
                res.conicType = this.inferConicTypeFromMatrix(res.matrix);
            }
            res.normalized = this.normalizeConic(res);
            res.semanticType = res.normalized.semanticType;
            res.provenance = res.normalized.provenance;
            if (!res.conicType && res.normalized.canonicalType) {
                res.conicType = res.normalized.canonicalType;
            }
            return res;
        }
        res.commandName = cmd.name;
        res.commandInputs = (cmd.inputs || []).map(i => i.value);
        res.conicType = this.normalizeConicTypeByCommand(cmd.name);

        const ins = cmd.inputs || [];
        if (cmd.name === 'Circle') {
            if (ins[0]) {
                ins[0].isCoordinate ? res.centerCoord = ins[0].coord : res.centerLabel = ins[0].value;
            }
            if (ins[1]) {
                if (ins[1].isNumber) res.radius = parseFloat(ins[1].value);
                else ins[1].isCoordinate ? res.passCoord = ins[1].coord : res.passLabel = ins[1].value;
            }
            if (ins[2]) {
                ins[2].isCoordinate ? res.thirdPointCoord = ins[2].coord : res.thirdPointLabel = ins[2].value;
            }
        }
        else if (cmd.name === 'Ellipse' || cmd.name === 'Hyperbola') {
            // 焦点1
            if (ins[0]) ins[0].isCoordinate ? res.focus1Coord = ins[0].coord : res.focus1Label = ins[0].value;
            // 焦点2
            if (ins[1]) ins[1].isCoordinate ? res.focus2Coord = ins[1].coord : res.focus2Label = ins[1].value;
            // 第三参数：数字(轴长) 或 点(过某点)
            if (ins[2]) {
                if (ins[2].isNumber) res.majorAxisLength = parseFloat(ins[2].value);
                else ins[2].isCoordinate ? res.passCoord = ins[2].coord : res.passLabel = ins[2].value;
            }
        } 
        else if (cmd.name === 'Parabola') {
            if (ins[0]) ins[0].isCoordinate ? res.focusCoord = ins[0].coord : res.focusLabel = ins[0].value;
            if (ins[1]) res.directrix = ins[1].value; // 准线方程
        }
        res.normalized = this.normalizeConic(res);
        res.semanticType = res.normalized.semanticType;
        res.provenance = res.normalized.provenance;
        if (!res.conicType && res.normalized.canonicalType) {
            res.conicType = res.normalized.canonicalType;
        }
        return res;
    }

    parseConicPart(el, label, visible, style, cmd) {
        const res = { type: 'conicpart', label, visible, ...style };
        const matrix = el.querySelector('matrix');
        if (matrix) {
            res.matrix = {
                A0: matrix.getAttribute('A0'), A1: matrix.getAttribute('A1'),
                A2: matrix.getAttribute('A2'), A3: matrix.getAttribute('A3'),
                A4: matrix.getAttribute('A4'), A5: matrix.getAttribute('A5')
            };
        }
        if (cmd) {
            res.commandName = cmd.name;
            res.commandInputs = (cmd.inputs || []).map(i => i.value);

            if (cmd.name === 'Semicircle' && cmd.inputs.length >= 2) {
                const p0 = this.normalizeInputPoint(cmd.inputs[0]);
                const p1 = this.normalizeInputPoint(cmd.inputs[1]);
                if (p0.label) res.point1Label = p0.label;
                if (p1.label) res.point2Label = p1.label;
                if (p0.coord) res.point1Coord = p0.coord;
                if (p1.coord) res.point2Coord = p1.coord;
            }

            if (cmd.name === 'CircleSector' && cmd.inputs.length >= 3) {
                const c = this.normalizeInputPoint(cmd.inputs[0]);
                const s = this.normalizeInputPoint(cmd.inputs[1]);
                const e = this.normalizeInputPoint(cmd.inputs[2]);
                if (c.label) res.centerLabel = c.label;
                if (s.label) res.startLabel = s.label;
                if (e.label) res.endLabel = e.label;
                if (c.coord) res.centerCoord = c.coord;
                if (s.coord) res.startCoord = s.coord;
                if (e.coord) res.endCoord = e.coord;
            }

            if (cmd.name === 'CircleArc' && cmd.inputs.length >= 3) {
                const c = this.normalizeInputPoint(cmd.inputs[0]);
                const s = this.normalizeInputPoint(cmd.inputs[1]);
                const e = this.normalizeInputPoint(cmd.inputs[2]);
                if (c.label) res.centerLabel = c.label;
                if (s.label) res.startLabel = s.label;
                if (e.label) res.endLabel = e.label;
                if (c.coord) res.centerCoord = c.coord;
                if (s.coord) res.startCoord = s.coord;
                if (e.coord) res.endCoord = e.coord;
            }

            if ((cmd.name === 'CircumcircleArc' || cmd.name === 'CircumcircleSector') && cmd.inputs.length >= 3) {
                const p0 = this.normalizeInputPoint(cmd.inputs[0]);
                const p1 = this.normalizeInputPoint(cmd.inputs[1]);
                const p2 = this.normalizeInputPoint(cmd.inputs[2]);
                if (p0.label) res.p1Label = p0.label;
                if (p1.label) res.p2Label = p1.label;
                if (p2.label) res.p3Label = p2.label;
                if (p0.coord) res.p1Coord = p0.coord;
                if (p1.coord) res.p2Coord = p1.coord;
                if (p2.coord) res.p3Coord = p2.coord;
            }
        }
        return res;
    }

    parseAngle(el, label, visible, style, cmd) {
        const res = { type: 'angle', label, visible, ...style };
        const valueEl = el.querySelector('value');
        const angleStyleEl = el.querySelector('angleStyle');
        const arcSizeEl = el.querySelector('arcSize');

        if (valueEl) {
            const rad = parseFloat(valueEl.getAttribute('val'));
            if (Number.isFinite(rad)) {
                res.valueRad = rad;
                res.valueDeg = rad * 180 / Math.PI;
            }
        }
        if (angleStyleEl) {
            const v = parseInt(angleStyleEl.getAttribute('val') || '0', 10);
            if (Number.isFinite(v)) res.angleStyle = v;
        }
        if (arcSizeEl) {
            const v = parseFloat(arcSizeEl.getAttribute('val'));
            if (Number.isFinite(v)) res.arcSize = v;
        }

        if (!cmd) return res;
        res.commandName = cmd.name;
        res.commandInputs = (cmd.inputs || []).map(i => i.value);
        res.commandOutputs = cmd.outputs || [];

        if (cmd.name === 'Angle') {
            if (cmd.inputs.length >= 3) {
                const p0 = this.normalizeInputPoint(cmd.inputs[0]);
                const p1 = this.normalizeInputPoint(cmd.inputs[1]);
                const p2 = this.normalizeInputPoint(cmd.inputs[2]);
                if (p0.label) res.point1Label = p0.label;
                if (p1.label) res.vertexLabel = p1.label;
                if (p2.label) res.point2Label = p2.label;
                if (p0.coord) res.point1Coord = p0.coord;
                if (p1.coord) res.vertexCoord = p1.coord;
                if (p2.coord) res.point2Coord = p2.coord;
            } else if (cmd.inputs.length >= 2) {
                const l1 = cmd.inputs[0];
                const l2 = cmd.inputs[1];
                res.line1Label = l1.value;
                res.line2Label = l2.value;
            }
        }

        if (cmd.name === 'InteriorAngles' && cmd.inputs.length >= 1) {
            res.polygonLabel = cmd.inputs[0].value;
            const idx = (cmd.outputs || []).indexOf(label);
            if (idx >= 0) res.outputIndex = idx;

            // 尝试从多边形命令恢复对应顶点三元组（含 Regular Polygon 变体）
            const polyCmd = this.cmdMap[res.polygonLabel];
            if (polyCmd && Number.isFinite(idx)) {
                const verts = this.extractPolygonVertices(polyCmd) || [];
                const n = verts.length;
                if (n >= 3) {
                const i = ((idx % n) + n) % n;
                const prev = verts[(i - 1 + n) % n];
                const cur = verts[i];
                const next = verts[(i + 1) % n];
                if (prev.label) res.point1Label = prev.label;
                if (cur.label) res.vertexLabel = cur.label;
                if (next.label) res.point2Label = next.label;
                if (prev.coord) res.point1Coord = prev.coord;
                if (cur.coord) res.vertexCoord = cur.coord;
                if (next.coord) res.point2Coord = next.coord;
                }
            }
        }

        return res;
    }

    normalizeConicTypeByCommand(commandName) {
        const name = String(commandName || '').toLowerCase();
        if (['circle', 'incircle', 'circumcircle', 'excircle'].includes(name)) return 'circle';
        if (name === 'ellipse') return 'ellipse';
        if (name === 'hyperbola') return 'hyperbola';
        if (name === 'parabola') return 'parabola';
        return name || 'conic';
    }

    inferConicTypeFromMatrix(matrix) {
        const A = parseFloat(matrix.A0 || '0');
        const C = parseFloat(matrix.A1 || '0');
        const B = parseFloat(matrix.A3 || '0');
        const eps = 1e-10;
        const disc = B * B - 4 * A * C;

        if (Math.abs(disc) <= eps) return 'parabola';
        if (disc > eps) return 'hyperbola';
        if (Math.abs(B) <= eps && Math.abs(A - C) <= eps) return 'circle';
        return 'ellipse';
    }

    normalizeEquation(eq) {
        if (!eq) return null;
        return String(eq)
            .replace(/\^\(\s*([^)]+?)\s*\)/g, '^$1')
            .replace(/\s+/g, '')
            .replace(/\*/g, '');
    }

    inferConicTypeFromEquation(eq) {
        const n = this.normalizeEquation(eq);
        if (!n) return null;
        const hasX2 = /x\^2/.test(n);
        const hasY2 = /y\^2/.test(n);
        if (hasX2 && hasY2) {
            if (n.includes('-y^2') || n.includes('-x^2')) return 'hyperbola';
            if (/x\^2\+y\^2=/.test(n) || /y\^2\+x\^2=/.test(n)) return 'circle';
            return 'ellipse';
        }
        if ((hasY2 && !hasX2) || (hasX2 && !hasY2)) return 'parabola';
        return null;
    }

    normalizeConic(res) {
        const provenance = [];
        if (res.commandName) provenance.push('command');
        if (res.equation) provenance.push('expression');
        if (res.matrix) provenance.push('element_matrix');

        const equation = this.normalizeEquation(res.equation);
        const typeFromCommand = res.conicType || null;
        const typeFromEquation = this.inferConicTypeFromEquation(equation);
        const typeFromMatrix = res.matrix ? this.inferConicTypeFromMatrix(res.matrix) : null;
        const canonicalType = typeFromCommand || typeFromEquation || typeFromMatrix || 'conic';

        let semanticType = 'conic_inferred';
        const params = {};

        if (res.commandName === 'Circle') {
            if (res.centerCoord && Number.isFinite(res.radius)) {
                semanticType = 'circle_by_center_radius';
                params.center = this.toCoord(res.centerCoord);
                params.radius = Number(res.radius);
            } else if (res.centerCoord && res.passCoord && (res.thirdPointCoord || res.thirdPointLabel)) {
                semanticType = 'circle_by_three_points';
                params.p1 = this.toCoord(res.centerCoord);
                params.p2 = this.toCoord(res.passCoord);
                params.p3 = this.toCoord(res.thirdPointCoord);
                if (!params.p1 && res.centerLabel) params.p1Label = res.centerLabel;
                if (!params.p2 && res.passLabel) params.p2Label = res.passLabel;
                if (!params.p3 && res.thirdPointLabel) params.p3Label = res.thirdPointLabel;
            } else if (res.centerCoord && res.passCoord) {
                semanticType = 'circle_by_center_point';
                params.center = this.toCoord(res.centerCoord);
                params.passPoint = this.toCoord(res.passCoord);
            } else if (res.centerLabel && res.passLabel) {
                if (res.thirdPointLabel) {
                    semanticType = 'circle_by_three_points_label';
                    params.p1Label = res.centerLabel;
                    params.p2Label = res.passLabel;
                    params.p3Label = res.thirdPointLabel;
                } else {
                    semanticType = 'circle_by_center_point_label';
                    params.centerLabel = res.centerLabel;
                    params.passLabel = res.passLabel;
                }
            } else {
                semanticType = 'circle_generic';
            }
        } else if (res.commandName === 'Ellipse') {
            semanticType = Number.isFinite(res.majorAxisLength)
                ? 'ellipse_by_foci_axis_length'
                : 'ellipse_by_foci_point';
            params.focus1 = this.toCoord(res.focus1Coord);
            params.focus2 = this.toCoord(res.focus2Coord);
            if (Number.isFinite(res.majorAxisLength)) params.majorAxisLength = Number(res.majorAxisLength);
            if (res.passCoord) params.passPoint = this.toCoord(res.passCoord);
        } else if (res.commandName === 'Hyperbola') {
            semanticType = Number.isFinite(res.majorAxisLength)
                ? 'hyperbola_by_foci_axis_length'
                : 'hyperbola_by_foci_point';
            params.focus1 = this.toCoord(res.focus1Coord);
            params.focus2 = this.toCoord(res.focus2Coord);
            if (Number.isFinite(res.majorAxisLength)) params.majorAxisLength = Number(res.majorAxisLength);
            if (res.passCoord) params.passPoint = this.toCoord(res.passCoord);
        } else if (res.commandName === 'Parabola') {
            semanticType = 'parabola_by_focus_directrix';
            params.focus = this.toCoord(res.focusCoord);
            params.directrix = res.directrix || null;
        } else if (equation) {
            semanticType = `${canonicalType}_by_equation`;
            params.equation = equation;
        } else if (res.matrix) {
            semanticType = `${canonicalType}_by_matrix`;
            params.matrix = {
                A0: Number(res.matrix.A0),
                A1: Number(res.matrix.A1),
                A2: Number(res.matrix.A2),
                A3: Number(res.matrix.A3),
                A4: Number(res.matrix.A4),
                A5: Number(res.matrix.A5)
            };
        }

        return {
            canonicalType,
            semanticType,
            provenance,
            equation,
            params
        };
    }

    toCoord(coord) {
        if (!coord || !Number.isFinite(coord.x) || !Number.isFinite(coord.y)) return null;
        return {
            x: Number(coord.x.toFixed(8)),
            y: Number(coord.y.toFixed(8))
        };
    }

    buildSemantics(result) {
        const derivedPoints = [];
        const lineRelations = [];
        const conicRelations = [];
        const unresolved = [];

        (result.lines || []).forEach(line => {
            const rel = {
                label: line.label,
                commandName: line.commandName || null,
                commandInputs: Array.isArray(line.commandInputs) ? line.commandInputs : [],
                through: {
                    p1Label: line.point1Label || null,
                    p1Coord: this.toCoord(line.point1Coord),
                    p2Label: line.point2Label || null,
                    p2Coord: this.toCoord(line.point2Coord)
                },
                tangent: {
                    throughPointLabel: line.throughPointLabel || null,
                    throughPointCoord: this.toCoord(line.throughPointCoord),
                    conicLabel: line.tangentConicLabel || null,
                    tangentPointCoord: this.toCoord(line.tangentPointCoord)
                },
                orthogonal: {
                    fromPointLabel: line.orthogonalFromPointLabel || null,
                    fromPointCoord: this.toCoord(line.orthogonalFromPointCoord),
                    targetLabel: line.orthogonalTargetLabel || null,
                    targetType: line.orthogonalTargetType || null,
                    footCoord: this.toCoord(line.orthogonalFootCoord),
                    intersectionPointCoord: this.toCoord(line.intersectionPointCoord)
                },
                angularBisector: {
                    point1Label: line.bisectorPoint1Label || null,
                    vertexLabel: line.bisectorVertexLabel || null,
                    point2Label: line.bisectorPoint2Label || null,
                    point1Coord: this.toCoord(line.bisectorPoint1Coord),
                    vertexCoord: this.toCoord(line.bisectorVertexCoord),
                    point2Coord: this.toCoord(line.bisectorPoint2Coord)
                }
            };
            lineRelations.push(rel);

            if (rel.tangent.tangentPointCoord) {
                derivedPoints.push({
                    label: `${line.label}_T`,
                    kind: 'tangent_point',
                    ownerLine: line.label,
                    coord: rel.tangent.tangentPointCoord
                });
            }
            if (rel.orthogonal.footCoord) {
                derivedPoints.push({
                    label: `${line.label}_H`,
                    kind: 'orthogonal_foot',
                    ownerLine: line.label,
                    coord: rel.orthogonal.footCoord
                });
            }

            if (!rel.through.p1Coord && !rel.through.p2Coord && !rel.tangent.tangentPointCoord && !rel.orthogonal.footCoord) {
                unresolved.push({
                    label: line.label,
                    type: 'line',
                    reason: 'missing_resolved_points'
                });
            }
        });

        (result.conics || []).forEach(c => {
            conicRelations.push({
                label: c.label,
                conicType: c.conicType || null,
                semanticType: c.semanticType || null,
                provenance: c.provenance || [],
                equation: c.equation || null,
                commandName: c.commandName || null,
                commandInputs: Array.isArray(c.commandInputs) ? c.commandInputs : [],
                matrix: c.matrix || null,
                normalized: c.normalized || null
            });
        });

        const pointRelations = (result.points || []).map(p => ({
            label: p.label,
            sourceType: p.sourceType || null,
            commandName: p.commandName || null,
            sourceInputs: Array.isArray(p.sourceInputs) ? p.sourceInputs : [],
            sourceObjects: Array.isArray(p.sourceObjects) ? p.sourceObjects : [],
            coord: this.toCoord({ x: p.x, y: p.y }),
            exp: p.exp || null
        }));

        return {
            mode: 'semantic+resolved',
            commandGraph: this.commandList.map(c => ({
                name: c.name,
                inputs: (c.inputs || []).map(i => i.value),
                outputs: c.outputs || []
            })),
            derivedPoints,
            lineRelations,
            conicRelations,
            pointRelations,
            unresolved
        };
    }
}


// 导出（浏览器环境）
if (typeof window !== 'undefined') {
    window.GGBParser = GGBParser;
}

// 导出（Node.js 环境）
if (typeof module !== 'undefined' && module.exports) {
    module.exports = GGBParser;
}
