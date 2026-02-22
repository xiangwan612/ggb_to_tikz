/**
 * TikZ 代码生成器
 * 根据 GGBParser 解析的数据生成 LaTeX/TikZ 代码
 */

class TikZGenerator {
    constructor(options = {}) {
        this.options = {
            scale: options.scale || 1,
            axis: options.axis !== false,  // 默认显示坐标轴
            grid: options.grid !== false,  // 默认显示网格
            xmin: options.xmin ?? -10,
            xmax: options.xmax ?? 10,
            ymin: options.ymin ?? -10,
            ymax: options.ymax ?? 10,
            width: options.width || '12cm',
            height: options.height || '12cm',
            semanticFirst: options.semanticFirst !== false,
            strictStatic: options.strictStatic !== false, // 默认开启：仅依赖数值结果
            useSourceStyle: options.useSourceStyle === true, // 默认不使用 GGB 样式
            defaultStrokeColor: options.defaultStrokeColor || 'black',
            defaultStrokeThickness: options.defaultStrokeThickness || 'thick',
            defaultPointColor: options.defaultPointColor || 'black',
            axisThickness: options.axisThickness || 'semithick',
            conicStrokeThickness: options.conicStrokeThickness || '',
            functionStrokeThickness: options.functionStrokeThickness || '',
            lineStrokeThickness: options.lineStrokeThickness || '',
            segmentStrokeThickness: options.segmentStrokeThickness || '',
            polygonStrokeThickness: options.polygonStrokeThickness || '',
            pointRadiusPt: Number.isFinite(options.pointRadiusPt) ? options.pointRadiusPt : null,
            polygonFillColor: typeof options.polygonFillColor === 'string' ? options.polygonFillColor : '',
            lineExtensionStart: Number.isFinite(options.lineExtensionStart) ? options.lineExtensionStart : 0.25,
            lineExtensionEnd: Number.isFinite(options.lineExtensionEnd) ? options.lineExtensionEnd : 0.25,
            definePointCoordinates: options.definePointCoordinates !== false,
            drawDerivedPoints: options.drawDerivedPoints === true,
            outputMode: options.outputMode || 'standalone', // standalone | figure | tikz
            tikzScale: options.tikzScale ?? 1,
            tikzPictureOptions: options.tikzPictureOptions || '>=Stealth',
            figureCaption: options.figureCaption || '图片标题',
            figureLabel: options.figureLabel || 'fig:标签',
            smartBounds: options.smartBounds !== false
        };
        this.options.lineLineAngleSelector = ['auto', 'left', 'right', 'above', 'below'].includes(options.lineLineAngleSelector)
            ? options.lineLineAngleSelector
            : 'auto';

        const hasOwn = (k) => Object.prototype.hasOwnProperty.call(options, k);
        this.boundsOverrides = {
            xmin: hasOwn('xmin'),
            xmax: hasOwn('xmax'),
            ymin: hasOwn('ymin'),
            ymax: hasOwn('ymax')
        };
    }

    resolveStrokeColor(obj, fallback = 'black') {
        if (this.options.useSourceStyle && obj && obj.color) return obj.color;
        return this.options.defaultStrokeColor || fallback;
    }

    resolveStrokeThickness(obj) {
        if (this.options.useSourceStyle) {
            return this.convertThickness(obj ? obj.lineThickness : undefined);
        }
        return this.options.defaultStrokeThickness || 'thick';
    }

    resolvePointColor(obj) {
        if (this.options.useSourceStyle && obj && obj.color) return obj.color;
        return this.options.defaultPointColor || 'black';
    }

    resolveLinePattern(obj) {
        const t = Number(obj?.lineType);
        if (!Number.isFinite(t)) return '';
        // GeoGebra 常见线型映射（SetLineStyle）
        if (t === 10) return 'dashed';
        if (t === 15) return 'dash pattern=on 8pt off 4pt';
        if (t === 20) return 'dotted';
        if (t === 30) return 'dash dot';
        if (t === 40) return 'dash dot dot';
        return '';
    }

    composeLineStyle(thickness, obj) {
        const pattern = this.resolveLinePattern(obj);
        return pattern ? `${thickness}, ${pattern}` : `${thickness}`;
    }

    resolveCategoryThickness(kind, obj) {
        if (kind === 'axis' && this.options.axisThickness) return this.options.axisThickness;
        if (kind === 'conic' && this.options.conicStrokeThickness) return this.options.conicStrokeThickness;
        if (kind === 'function' && this.options.functionStrokeThickness) return this.options.functionStrokeThickness;
        if (kind === 'line' && this.options.lineStrokeThickness) return this.options.lineStrokeThickness;
        if (kind === 'segment' && this.options.segmentStrokeThickness) return this.options.segmentStrokeThickness;
        if (kind === 'polygon' && this.options.polygonStrokeThickness) return this.options.polygonStrokeThickness;
        return this.resolveStrokeThickness(obj);
    }

    /**
     * 主生成函数
     * @param {Object} parsedData - GGBParser.parse() 的输出
     * @returns {string} 完整 TikZ 代码
     */
    generate(parsedData) {
        const { structured, semantics } = parsedData;
        this.bounds = this.computeSmartBounds(parsedData);
        this.pointIndex = this.buildPointIndex(structured.points || []);
        this.scenePoints = (structured.points || []).filter(p => p && p.visible);
        this.definedCoordLabels = new Set();
        
        let code = this.generatePreamble();
        code += this.generateBeginTikz();

        if (this.options.definePointCoordinates && structured.points?.length > 0) {
            code += this.generatePointCoordinateDefs(structured.points);
        }
        
        // 按类型生成
        if (structured.functions?.length > 0) {
            code += this.generateFunctions(structured.functions);
        }
        
        if (structured.conics?.length > 0) {
            code += this.generateConics(structured.conics);
        }

        if (structured.conicparts?.length > 0) {
            code += this.generateConicParts(structured.conicparts);
        }
        
        if (structured.lines?.length > 0 || semantics?.lineRelations?.length > 0) {
            const rels = this.options.strictStatic ? [] : (semantics?.lineRelations || []);
            code += this.generateLines(structured.lines || [], rels);
        }

        if (structured.rays?.length > 0) {
            code += this.generateRays(structured.rays);
        }

        if (structured.polygons?.length > 0) {
            code += this.generatePolygons(structured.polygons);
        }

        if (structured.vectors?.length > 0) {
            code += this.generateVectors(structured.vectors);
        }
        
        if (structured.segments?.length > 0) {
            code += this.generateSegments(structured.segments);
        }

        if (structured.angles?.length > 0) {
            code += this.generateAngles(structured.angles, structured.lines || []);
        }
        
        if (structured.points?.length > 0) {
            code += this.generatePoints(structured.points);
        }

        if (this.options.drawDerivedPoints && semantics?.derivedPoints?.length > 0) {
            code += this.generateDerivedPoints(semantics.derivedPoints);
        }
        
        code += this.generateEndTikz();
        
        return code;
    }

    getBounds() {
        if (this.bounds) return this.bounds;
        return {
            xmin: this.options.xmin,
            xmax: this.options.xmax,
            ymin: this.options.ymin,
            ymax: this.options.ymax
        };
    }

    /**
     * 使用当前坐标轴边界包裹 clip，避免曲线超出画幅
     */
    wrapWithBoundsClip(content, note = '') {
        const body = String(content || '').trim();
        if (!body) return '';
        const { xmin, xmax, ymin, ymax } = this.getBounds();
        const lines = [];
        lines.push('\\begin{scope}');
        if (note) lines.push(`% ${note}`);
        lines.push(`\\clip (${xmin},${ymin}) rectangle (${xmax},${ymax});`);
        lines.push(body);
        lines.push('\\end{scope}');
        return `${lines.join('\n')}\n`;
    }

    computeSmartBounds(parsedData) {
        const fallback = {
            xmin: this.options.xmin,
            xmax: this.options.xmax,
            ymin: this.options.ymin,
            ymax: this.options.ymax
        };
        if (!this.options.smartBounds) return fallback;

        const structured = parsedData?.structured || {};
        const points = structured.points || [];
        const xs = [];
        const ys = [];
        const push = (x, y) => {
            const nx = Number(x);
            const ny = Number(y);
            if (!Number.isFinite(nx) || !Number.isFinite(ny)) return;
            xs.push(nx);
            ys.push(ny);
        };

        // 对齐旧版：优先仅使用“可见点”估计范围
        points.forEach((p) => {
            if (!p || !p.visible) return;
            push(p.x, p.y);
        });
        if (xs.length === 0 || ys.length === 0) return fallback;

        let xmin = Math.min(...xs);
        let xmax = Math.max(...xs);
        let ymin = Math.min(...ys);
        let ymax = Math.max(...ys);
        let dx = xmax - xmin;
        let dy = ymax - ymin;
        if (dx < 1e-6) dx = 2;
        if (dy < 1e-6) dy = 2;
        const padX = Math.max(0.8, dx * 0.2);
        const padY = Math.max(0.8, dy * 0.2);

        const out = {
            xmin: Number((xmin - padX).toFixed(2)),
            xmax: Number((xmax + padX).toFixed(2)),
            ymin: Number((ymin - padY).toFixed(2)),
            ymax: Number((ymax + padY).toFixed(2))
        };

        // 显式设置优先
        if (this.boundsOverrides.xmin) out.xmin = this.options.xmin;
        if (this.boundsOverrides.xmax) out.xmax = this.options.xmax;
        if (this.boundsOverrides.ymin) out.ymin = this.options.ymin;
        if (this.boundsOverrides.ymax) out.ymax = this.options.ymax;
        return out;
    }

    buildPointIndex(points) {
        const map = {};
        (points || []).forEach(p => {
            if (!p || !p.label) return;
            const x = Number(p.x);
            const y = Number(p.y);
            if (!Number.isFinite(x) || !Number.isFinite(y)) return;
            map[p.label] = { x, y };
        });
        return map;
    }

    generatePointCoordinateDefs(points) {
        let code = '% 点坐标定义\n';
        let count = 0;
        (points || []).forEach(p => {
            if (!p || !p.label) return;
            if (!this.isValidTikzCoordName(p.label)) return;
            const x = Number(p.x);
            const y = Number(p.y);
            if (!Number.isFinite(x) || !Number.isFinite(y)) return;
            code += `\\coordinate (${p.label}) at (${x.toFixed(2)},${y.toFixed(2)});\n`;
            this.definedCoordLabels.add(p.label);
            count++;
        });
        return count > 0 ? code : '';
    }

    isValidTikzCoordName(name) {
        return typeof name === 'string' && /^[A-Za-z][A-Za-z0-9_]*$/.test(name);
    }

    resolveLabelByCoord(coord, tol = 5e-3) {
        if (!coord) return null;
        const x = Number(coord.x);
        const y = Number(coord.y);
        if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
        let best = null;
        let bestD2 = Infinity;
        Object.keys(this.pointIndex || {}).forEach(label => {
            const p = this.pointIndex[label];
            if (!p) return;
            const dx = p.x - x;
            const dy = p.y - y;
            const d2 = dx * dx + dy * dy;
            if (d2 < bestD2) {
                bestD2 = d2;
                best = label;
            }
        });
        return best && Math.sqrt(bestD2) <= tol ? best : null;
    }

    pointRef(coord, preferredLabel = null) {
        if (this.options.definePointCoordinates) {
            if (
                preferredLabel &&
                this.isValidTikzCoordName(preferredLabel) &&
                this.pointIndex[preferredLabel] &&
                this.definedCoordLabels &&
                this.definedCoordLabels.has(preferredLabel)
            ) {
                return `(${preferredLabel})`;
            }
            const inferred = this.resolveLabelByCoord(coord);
            if (
                inferred &&
                this.isValidTikzCoordName(inferred) &&
                this.definedCoordLabels &&
                this.definedCoordLabels.has(inferred)
            ) {
                return `(${inferred})`;
            }
        }
        return `(${Number(coord.x).toFixed(2)},${Number(coord.y).toFixed(2)})`;
    }

    /**
     * 生成导言区
     */
    generatePreamble() {
        if (this.options.outputMode !== 'standalone') return '';
        return `% 由 GeoGebra 生成的 TikZ 代码
\\documentclass[tikz,border=5pt]{standalone}
\\usepackage{tikz}
\\usetikzlibrary{arrows.meta,calc,intersections}
\\usepackage{tkz-euclide}

\\begin{document}
`;
    }

    /**
     * 开始 tikzpicture 环境
     */
    generateBeginTikz() {
        const { xmin, xmax, ymin, ymax } = this.getBounds();
        const pictureOpts = [`scale=${this.options.tikzScale}`];
        if (this.options.tikzPictureOptions) {
            pictureOpts.push(this.options.tikzPictureOptions);
        }

        let code = '';
        if (this.options.outputMode === 'figure') {
            code += `\\begin{figure}[htbp]
\\centering
`;
        }

        code += `\\begin{tikzpicture}[${pictureOpts.join(', ')}]
`;
        if (this.options.axis) {
            const axisThickness = this.resolveCategoryThickness('axis');
            code += `    % 坐标轴
    \\draw[->, ${axisThickness}] (${xmin},0) -- (${xmax},0) node[right] {$x$};
    \\draw[->, ${axisThickness}] (0,${ymin}) -- (0,${ymax}) node[above] {$y$};
`;
        }
        return code;
    }

    /**
     * 生成函数
     */
    generateFunctions(functions) {
        const { xmin, xmax, ymin, ymax } = this.getBounds();
        let code = '% 函数\n';
        let clippedPlots = '';
        
        functions.forEach(f => {
            if (!f.visible || !f.exp) return;
            
            // 提取函数表达式 (f(x) = ... → ...)
            let rawExpr = f.exp;
            const match = rawExpr.match(/^\s*[A-Za-z][A-Za-z0-9_]*\s*\(\s*x\s*\)\s*=\s*(.+)$/);
            if (match) {
                rawExpr = match[1];
            }
            
            // 转换 GeoGebra 语法到 TikZ 语法
            const expr = this.convertExpression(rawExpr);
            
            const color = this.resolveStrokeColor(f, 'black');
            const thickness = this.resolveCategoryThickness('function', f);
            const lineStyle = this.composeLineStyle(thickness, f);
            const domains = this.splitFunctionDomains(rawExpr, xmin, xmax, ymin, ymax);

            if (domains.length === 0) {
                code += `% 函数 ${f.label || ''}: 未找到可绘制区间\n`;
                return;
            }

            domains.forEach((d) => {
                clippedPlots += `\\draw[${color}, ${lineStyle}, smooth, domain=${d.start}:${d.end}, samples=100] plot (\\x,{${expr}});\n`;
            });
        });

        if (clippedPlots.trim()) {
            code += this.wrapWithBoundsClip(clippedPlots, '按坐标轴边界裁剪函数');
        }
        return code;
    }

    convertEulerPowerToExp(expr) {
        const src = String(expr ?? '');
        const isWord = (ch) => /[A-Za-z0-9_\\]/.test(ch || '');
        const parseGrouped = (s, start) => {
            const open = s[start];
            const close = open === '(' ? ')' : (open === '{' ? '}' : '');
            if (!close) return null;
            let depth = 0;
            for (let i = start; i < s.length; i++) {
                const ch = s[i];
                if (ch === open) depth++;
                else if (ch === close) {
                    depth--;
                    if (depth === 0) {
                        return { inner: s.slice(start + 1, i), end: i + 1 };
                    }
                }
            }
            return null;
        };

        let out = '';
        let i = 0;
        while (i < src.length) {
            const ch = src[i];
            const isEuler = ch === 'ℯ' || ch === 'e';
            if (!isEuler) {
                out += ch;
                i++;
                continue;
            }

            const prev = i > 0 ? src[i - 1] : '';
            if (ch === 'e' && isWord(prev)) {
                out += ch;
                i++;
                continue;
            }

            let j = i + 1;
            while (j < src.length && /\s/.test(src[j])) j++;
            if (src[j] !== '^') {
                out += (ch === 'ℯ' ? 'e' : ch);
                i++;
                continue;
            }

            j++;
            while (j < src.length && /\s/.test(src[j])) j++;
            let sign = '';
            if (src[j] === '+' || src[j] === '-') {
                sign = src[j];
                j++;
                while (j < src.length && /\s/.test(src[j])) j++;
            }

            let inner = '';
            let end = -1;
            if (src[j] === '(' || src[j] === '{') {
                const grouped = parseGrouped(src, j);
                if (grouped) {
                    inner = grouped.inner;
                    end = grouped.end;
                }
            } else {
                let k = j;
                while (k < src.length && !/[,\s+\-*/^)\]}]/.test(src[k])) k++;
                if (k > j) {
                    inner = src.slice(j, k);
                    end = k;
                }
            }

            if (end > -1) {
                out += `exp(${sign}${inner})`;
                i = end;
                continue;
            }

            out += (ch === 'ℯ' ? 'e' : ch);
            i++;
        }
        return out;
    }

    toJsExpression(expr) {
        if (typeof expr !== 'string') return null;
        let js = this.convertEulerPowerToExp(expr).trim();
        if (!js) return null;
        js = js
            .replace(/\^/g, '**')
            .replace(/π/g, 'pi')
            .replace(/\blog\s*\(/gi, 'ln(')
            .replace(/(^|[^.\w])ln\s*\(/gi, '$1Math.log(')
            .replace(/(^|[^.\w])sqrt\s*\(/gi, '$1Math.sqrt(')
            .replace(/(^|[^.\w])sin\s*\(/gi, '$1Math.sin(')
            .replace(/(^|[^.\w])cos\s*\(/gi, '$1Math.cos(')
            .replace(/(^|[^.\w])tan\s*\(/gi, '$1Math.tan(')
            .replace(/(^|[^.\w])asin\s*\(/gi, '$1Math.asin(')
            .replace(/(^|[^.\w])acos\s*\(/gi, '$1Math.acos(')
            .replace(/(^|[^.\w])atan\s*\(/gi, '$1Math.atan(')
            .replace(/(^|[^.\w])abs\s*\(/gi, '$1Math.abs(')
            .replace(/(^|[^.\w])exp\s*\(/gi, '$1Math.exp(')
            .replace(/\bpi\b/gi, 'Math.PI')
            .replace(/\be\b/g, 'Math.E')
            .replace(/\bx\b/g, '(x)');
        return js;
    }

    buildExprEvaluator(expr) {
        const js = this.toJsExpression(expr);
        if (!js) return null;
        try {
            const fn = new Function('x', `"use strict"; return (${js});`);
            return fn;
        } catch {
            return null;
        }
    }

    hasPotentialDiscontinuity(expr) {
        const s = String(expr || '').toLowerCase();
        if (!s) return false;
        // 这些函数常见定义域/间断风险，保留分段逻辑
        if (/\b(tan|cot|sec|csc|ln|log|sqrt|asin|acos)\s*\(/i.test(s)) return true;
        // 含除法时通常也应保守处理，避免跨越极点连线
        if (s.includes('/')) return true;
        return false;
    }

    splitFunctionDomains(expr, xmin, xmax, ymin = null, ymax = null, samples = 240) {
        const x0 = Number(xmin);
        const x1 = Number(xmax);
        if (!Number.isFinite(x0) || !Number.isFinite(x1) || x1 <= x0) return [];
        const conservative = this.hasPotentialDiscontinuity(expr);
        // 默认策略：有 clip 时函数直接整段绘制，避免被“畏手畏脚”地切碎。
        if (!conservative) {
            return [{ start: Number(x0.toFixed(2)), end: Number(x1.toFixed(2)) }];
        }
        const y0 = Number(ymin);
        const y1 = Number(ymax);
        const useYLimit = Number.isFinite(y0) && Number.isFinite(y1) && y1 > y0;
        const yMin = useYLimit ? y0 : -Infinity;
        const yMax = useYLimit ? y1 : Infinity;

        const evalFn = this.buildExprEvaluator(expr);
        // 若表达式无法 JS 评估，回退旧行为，保持可用性
        if (!evalFn) {
            return [{ start: Number(x0.toFixed(4)), end: Number(x1.toFixed(4)) }];
        }

        const step = (x1 - x0) / samples;
        const minSpan = Math.max(step * 1.5, (x1 - x0) * 0.01);
        const segments = [];
        let runStart = null;
        let prevX = x0;

        for (let i = 0; i <= samples; i++) {
            const x = x0 + step * i;
            let ok = false;
            try {
                const y = evalFn(x);
                ok = Number.isFinite(y) && y >= yMin && y <= yMax;
            } catch {
                ok = false;
            }
            if (ok) {
                if (runStart === null) runStart = x;
            } else if (runStart !== null) {
                const end = prevX;
                if (end - runStart >= minSpan) {
                    segments.push({
                        start: Number(runStart.toFixed(2)),
                        end: Number(end.toFixed(2))
                    });
                }
                runStart = null;
            }
            prevX = x;
        }

        if (runStart !== null) {
            const end = x1;
            if (end - runStart >= minSpan) {
                segments.push({
                    start: Number(runStart.toFixed(2)),
                    end: Number(end.toFixed(2))
                });
            }
        }

        if (segments.length === 0) {
            return [{ start: Number(x0.toFixed(2)), end: Number(x1.toFixed(2)) }];
        }

        return segments
            .filter(s => Number.isFinite(s.start) && Number.isFinite(s.end) && s.end > s.start)
            .map(s => ({
                start: Math.max(Number(x0.toFixed(2)), s.start),
                end: Math.min(Number(x1.toFixed(2)), s.end)
            }));
    }

    isPointInBounds(x, y, eps = 1e-9) {
        const { xmin, xmax, ymin, ymax } = this.getBounds();
        return Number.isFinite(x) && Number.isFinite(y)
            && x >= xmin - eps && x <= xmax + eps
            && y >= ymin - eps && y <= ymax + eps;
    }

    findVisibleParamSegments(evalXY, tMin, tMax, samples = 360) {
        const a = Number(tMin);
        const b = Number(tMax);
        if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a || typeof evalXY !== 'function') return [];

        const step = (b - a) / samples;
        const minSpan = Math.max(step * 1.5, (b - a) * 0.01);
        const segments = [];
        let runStart = null;
        let prevT = a;

        for (let i = 0; i <= samples; i++) {
            const t = a + step * i;
            let ok = false;
            try {
                const p = evalXY(t);
                if (p && this.isPointInBounds(Number(p.x), Number(p.y), 1e-6)) ok = true;
            } catch {
                ok = false;
            }
            if (ok) {
                if (runStart === null) runStart = t;
            } else if (runStart !== null) {
                const end = prevT;
                if (end - runStart >= minSpan) {
                    segments.push({
                        start: Number(runStart.toFixed(2)),
                        end: Number(end.toFixed(2))
                    });
                }
                runStart = null;
            }
            prevT = t;
        }

        if (runStart !== null) {
            const end = b;
            if (end - runStart >= minSpan) {
                segments.push({
                    start: Number(runStart.toFixed(2)),
                    end: Number(end.toFixed(2))
                });
            }
        }

        return segments.filter(s => Number.isFinite(s.start) && Number.isFinite(s.end) && s.end > s.start);
    }

    /**
     * 生成圆锥曲线
     */
    generateConics(conics) {
        let code = '% 圆锥曲线\n';
        let clippedPlots = '';
        
        conics.forEach(c => {
            if (!c.visible) return;
            
            const color = this.resolveStrokeColor(c, 'black');
            const thickness = this.resolveCategoryThickness('conic', c);
            const lineStyle = this.composeLineStyle(thickness, c);
            
            switch (c.conicType) {
                case 'circle':
                    code += this.generateCircle(c, color, lineStyle);
                    break;
                case 'ellipse':
                    code += this.generateEllipse(c, color, lineStyle);
                    break;
                case 'parabola':
                    clippedPlots += this.generateParabola(c, color, lineStyle);
                    break;
                case 'hyperbola':
                    clippedPlots += this.generateHyperbola(c, color, lineStyle);
                    break;
            }
        });

        if (clippedPlots.trim()) {
            code += this.wrapWithBoundsClip(clippedPlots, '按坐标轴边界裁剪抛物线/双曲线');
        }
        return code;
    }

    generateConicParts(parts) {
        let code = '% 圆弧/扇形\n';
        parts.forEach(p => {
            if (!p.visible) return;
            const color = this.resolveStrokeColor(p, 'black');
            const thickness = this.resolveCategoryThickness('conic', p);
            const lineStyle = this.composeLineStyle(thickness, p);
            if (p.commandName === 'Semicircle') {
                code += this.generateSemicirclePart(p, color, lineStyle);
            } else if (p.commandName === 'CircleSector') {
                code += this.generateCircleSectorPart(p, color, lineStyle);
            } else if (p.commandName === 'CircleArc') {
                code += this.generateCircleArcPart(p, color, lineStyle);
            } else if (p.commandName === 'CircumcircleArc') {
                code += this.generateCircumcircleArcPart(p, color, lineStyle);
            } else if (p.commandName === 'CircumcircleSector') {
                code += this.generateCircumcircleSectorPart(p, color, lineStyle);
            }
        });
        return code;
    }

    getCoordByLabelOrCoord(label, coord) {
        if (coord && Number.isFinite(Number(coord.x)) && Number.isFinite(Number(coord.y))) {
            return { x: Number(coord.x), y: Number(coord.y) };
        }
        if (label && this.pointIndex[label]) return this.pointIndex[label];
        return null;
    }

    angleDeg(center, p) {
        return Math.atan2(p.y - center.y, p.x - center.x) * 180 / Math.PI;
    }

    circumcenter(a, b, c) {
        const x1 = a.x, y1 = a.y;
        const x2 = b.x, y2 = b.y;
        const x3 = c.x, y3 = c.y;
        const d = 2 * (x1 * (y2 - y3) + x2 * (y3 - y1) + x3 * (y1 - y2));
        if (!Number.isFinite(d) || Math.abs(d) < 1e-12) return null;
        const ux = (
            (x1 * x1 + y1 * y1) * (y2 - y3) +
            (x2 * x2 + y2 * y2) * (y3 - y1) +
            (x3 * x3 + y3 * y3) * (y1 - y2)
        ) / d;
        const uy = (
            (x1 * x1 + y1 * y1) * (x3 - x2) +
            (x2 * x2 + y2 * y2) * (x1 - x3) +
            (x3 * x3 + y3 * y3) * (x2 - x1)
        ) / d;
        return { x: ux, y: uy };
    }

    normalizeAngleDeg(a) {
        let x = a % 360;
        if (x < 0) x += 360;
        return x;
    }

    isAngleBetweenCCW(start, end, mid) {
        const s = this.normalizeAngleDeg(start);
        const e = this.normalizeAngleDeg(end);
        const m = this.normalizeAngleDeg(mid);
        const span = (e - s + 360) % 360;
        const at = (m - s + 360) % 360;
        return at <= span + 1e-9;
    }

    endAngleThroughMid(start, end, mid) {
        let e = end;
        while (e < start) e += 360;
        if (!this.isAngleBetweenCCW(start, e, mid)) {
            e += 360;
        }
        return e;
    }

    generateSemicirclePart(p, color, thickness) {
        const a = this.getCoordByLabelOrCoord(p.point1Label, p.point1Coord);
        const b = this.getCoordByLabelOrCoord(p.point2Label, p.point2Coord);
        if (!a || !b) return `% 半圆 ${p.label}: 端点缺失\n`;
        const ax = a.x, ay = a.y, bx = b.x, by = b.y;
        const cx = (ax + bx) / 2;
        const cy = (ay + by) / 2;
        const r = Math.hypot(bx - ax, by - ay) / 2;
        const start = this.angleDeg({ x: cx, y: cy }, { x: ax, y: ay });
        // GeoGebra Semicircle(A,B) 使用有向线段 AB 的“左侧”半圆
        const delta = -180;
        const aRef = this.pointRef({ x: ax, y: ay }, p.point1Label || null);
        return `\\draw[${color}, ${thickness}] ${aRef} arc[start angle=${start.toFixed(2)}, delta angle=${delta.toFixed(2)}, radius=${r.toFixed(2)}];${p.label ? ` % ${p.label}` : ''}\n`;
    }

    generateCircleSectorPart(p, color, thickness) {
        const c = this.getCoordByLabelOrCoord(p.centerLabel, p.centerCoord);
        const s = this.getCoordByLabelOrCoord(p.startLabel, p.startCoord);
        const e = this.getCoordByLabelOrCoord(p.endLabel, p.endCoord);
        if (!c || !s || !e) return `% 扇形 ${p.label}: 点信息缺失\n`;
        const r = Math.hypot(s.x - c.x, s.y - c.y);
        if (!Number.isFinite(r) || r < 1e-8) return `% 扇形 ${p.label}: 半径无效\n`;
        const start = this.angleDeg(c, s);
        let end = this.angleDeg(c, e);
        while (end < start) end += 360;
        const cRef = this.pointRef(c, p.centerLabel || null);
        const sRef = this.pointRef(s, p.startLabel || null);
        const alpha = Number.isFinite(Number(p.alpha)) ? Number(p.alpha) : 0.12;
        return `\\draw[${color}, ${thickness}, fill=${color}, fill opacity=${alpha.toFixed(2)}] ${cRef} -- ${sRef} arc[start angle=${start.toFixed(2)}, end angle=${end.toFixed(2)}, radius=${r.toFixed(2)}] -- cycle;${p.label ? ` % ${p.label}` : ''}\n`;
    }

    generateCircleArcPart(p, color, thickness) {
        const c = this.getCoordByLabelOrCoord(p.centerLabel, p.centerCoord);
        const s = this.getCoordByLabelOrCoord(p.startLabel, p.startCoord);
        const e = this.getCoordByLabelOrCoord(p.endLabel, p.endCoord);
        if (!c || !s || !e) return `% 圆弧 ${p.label}: 点信息缺失\n`;
        const r = Math.hypot(s.x - c.x, s.y - c.y);
        if (!Number.isFinite(r) || r < 1e-8) return `% 圆弧 ${p.label}: 半径无效\n`;
        const start = this.angleDeg(c, s);
        let end = this.angleDeg(c, e);
        while (end < start) end += 360;
        const sRef = this.pointRef(s, p.startLabel || null);
        return `\\draw[${color}, ${thickness}] ${sRef} arc[start angle=${start.toFixed(2)}, end angle=${end.toFixed(2)}, radius=${r.toFixed(2)}];${p.label ? ` % ${p.label}` : ''}\n`;
    }

    generateCircumcircleArcPart(p, color, thickness) {
        const a = this.getCoordByLabelOrCoord(p.p1Label, p.p1Coord);
        const b = this.getCoordByLabelOrCoord(p.p2Label, p.p2Coord);
        const c = this.getCoordByLabelOrCoord(p.p3Label, p.p3Coord);
        if (!a || !b || !c) return `% 外接圆弧 ${p.label}: 点信息缺失\n`;
        const o = this.circumcenter(a, b, c);
        if (!o) return `% 外接圆弧 ${p.label}: 三点近共线\n`;
        const r = Math.hypot(a.x - o.x, a.y - o.y);
        if (!Number.isFinite(r) || r < 1e-8) return `% 外接圆弧 ${p.label}: 半径无效\n`;
        const start = this.angleDeg(o, a);
        const mid = this.angleDeg(o, b);
        const end0 = this.angleDeg(o, c);
        const end = this.endAngleThroughMid(start, end0, mid);
        const aRef = this.pointRef(a, p.p1Label || null);
        return `\\draw[${color}, ${thickness}] ${aRef} arc[start angle=${start.toFixed(2)}, end angle=${end.toFixed(2)}, radius=${r.toFixed(2)}];${p.label ? ` % ${p.label}` : ''}\n`;
    }

    generateCircumcircleSectorPart(p, color, thickness) {
        const a = this.getCoordByLabelOrCoord(p.p1Label, p.p1Coord);
        const b = this.getCoordByLabelOrCoord(p.p2Label, p.p2Coord);
        const c = this.getCoordByLabelOrCoord(p.p3Label, p.p3Coord);
        if (!a || !b || !c) return `% 外接扇形 ${p.label}: 点信息缺失\n`;
        const o = this.circumcenter(a, b, c);
        if (!o) return `% 外接扇形 ${p.label}: 三点近共线\n`;
        const r = Math.hypot(a.x - o.x, a.y - o.y);
        if (!Number.isFinite(r) || r < 1e-8) return `% 外接扇形 ${p.label}: 半径无效\n`;
        const start = this.angleDeg(o, a);
        const mid = this.angleDeg(o, b);
        const end0 = this.angleDeg(o, c);
        const end = this.endAngleThroughMid(start, end0, mid);
        const oRef = this.pointRef(o);
        const aRef = this.pointRef(a, p.p1Label || null);
        const alpha = Number.isFinite(Number(p.alpha)) ? Number(p.alpha) : 0.12;
        return `\\draw[${color}, ${thickness}, fill=${color}, fill opacity=${alpha.toFixed(2)}] ${oRef} -- ${aRef} arc[start angle=${start.toFixed(2)}, end angle=${end.toFixed(2)}, radius=${r.toFixed(2)}] -- cycle;${p.label ? ` % ${p.label}` : ''}\n`;
    }

    /**
     * 生成圆
     */
    generateCircle(c, color, thickness) {
        // 如果有圆心坐标
        if (c.centerCoord) {
            const { x, y } = c.centerCoord;
            const centerRef = this.pointRef(c.centerCoord, c.centerLabel || null);
            
            // 如果有过点，计算半径
            if (c.passCoord) {
                const dx = c.passCoord.x - x;
                const dy = c.passCoord.y - y;
                const r = Math.sqrt(dx*dx + dy*dy).toFixed(2);
                return `\\draw[${color}, ${thickness}] ${centerRef} circle[radius=${r}];\n`;
            }
            
            // 如果有半径值
            if (c.radius) {
                return `\\draw[${color}, ${thickness}] ${centerRef} circle[radius=${c.radius}];\n`;
            }
        }

        // 数值回退：matrix -> 圆心半径
        const byMatrix = this.circleFromMatrix(c.matrix);
        if (byMatrix) {
            const centerRef = this.pointRef({ x: byMatrix.h, y: byMatrix.k });
            return `\\draw[${color}, ${thickness}] ${centerRef} circle[radius=${byMatrix.r.toFixed(2)}];${c.label ? ` % ${c.label}` : ''}\n`;
        }

        return `% 圆 ${c.label}: 参数不完整\n`;
    }

    /**
     * 生成椭圆
     * 使用标准方程: (x-h)²/a² + (y-k)²/b² = 1
     */
    generateEllipse(c, color, thickness) {
        const f1 = this.getCoordByLabelOrCoord(c.focus1Label, c.focus1Coord);
        const f2 = this.getCoordByLabelOrCoord(c.focus2Label, c.focus2Coord);
        const p0 = this.getCoordByLabelOrCoord(c.passLabel, c.passCoord);

        // 如果已知两个焦点和长轴长度
        if (f1 && f2 && c.majorAxisLength) {
            const a = c.majorAxisLength / 2;  // 半长轴
            
            // 中心点
            const h = (f1.x + f2.x) / 2;
            const k = (f1.y + f2.y) / 2;
            
            // 焦距
            const c_dist = Math.sqrt((f2.x - f1.x)**2 + (f2.y - f1.y)**2) / 2;
            
            // 半短轴
            const b = Math.sqrt(Math.abs(a*a - c_dist*c_dist));
            
            // 旋转角度
            const angle = Math.atan2(f2.y - f1.y, f2.x - f1.x) * 180 / Math.PI;
            
            return `\\draw[${color}, ${thickness}, rotate around={${angle.toFixed(1)}:(${h.toFixed(2)},${k.toFixed(2)})}] (${h},${k}) ellipse[x radius=${a.toFixed(2)}, y radius=${b.toFixed(2)}];\n`;
        }
        
        // 两焦点 + 过点：严格计算椭圆参数（支持旋转）
        if (f1 && f2 && p0) {
            const s = Math.hypot(p0.x - f1.x, p0.y - f1.y) + Math.hypot(p0.x - f2.x, p0.y - f2.y);
            const a = s / 2;
            const h = (f1.x + f2.x) / 2;
            const k = (f1.y + f2.y) / 2;
            const cdist = Math.hypot(f2.x - f1.x, f2.y - f1.y) / 2;
            const b2 = a * a - cdist * cdist;
            if (a > 1e-9 && b2 > 1e-9) {
                const b = Math.sqrt(b2);
                const angle = Math.atan2(f2.y - f1.y, f2.x - f1.x) * 180 / Math.PI;
                return `\\draw[${color}, ${thickness}, rotate around={${angle.toFixed(2)}:(${h.toFixed(2)},${k.toFixed(2)})}] (${h.toFixed(2)},${k.toFixed(2)}) ellipse[x radius=${a.toFixed(2)}, y radius=${b.toFixed(2)}];${c.label ? ` % ${c.label}` : ''}\n`;
            }
        }

        // 数值回退：matrix
        const byMatrix = this.ellipseFromMatrix(c.matrix);
        if (byMatrix) {
            const h = byMatrix.h.toFixed(2);
            const k = byMatrix.k.toFixed(2);
            const a = byMatrix.a.toFixed(2);
            const b = byMatrix.b.toFixed(2);
            if (Number.isFinite(byMatrix.thetaDeg) && Math.abs(byMatrix.thetaDeg) > 1e-6) {
                return `\\draw[${color}, ${thickness}, rotate around={${byMatrix.thetaDeg.toFixed(2)}:(${h},${k})}] (${h},${k}) ellipse[x radius=${a}, y radius=${b}];${c.label ? ` % ${c.label}` : ''}\n`;
            }
            return `\\draw[${color}, ${thickness}] (${h},${k}) ellipse[x radius=${a}, y radius=${b}];${c.label ? ` % ${c.label}` : ''}\n`;
        }

        return `% 椭圆 ${c.label}: 参数不完整\n`;
    }

    /**
     * 生成抛物线
     * 标准方程: y² = 4px 或 x² = 4py
     */
    generateParabola(c, color, thickness) {
        const { xmin, xmax, ymin, ymax } = this.getBounds();
        if (!c.focusCoord) {
            const byMatrix = this.parabolaFromMatrix(c.matrix);
            if (byMatrix) {
                if (byMatrix.mode === 'x_of_y') {
                    const segs = this.findVisibleParamSegments((t) => ({
                        x: byMatrix.a * t * t + byMatrix.b * t + byMatrix.c,
                        y: t
                    }), ymin, ymax, 320);
                    const domains = segs.length ? segs : [{ start: Number(ymin.toFixed(2)), end: Number(ymax.toFixed(2)) }];
                    return domains.map((d, idx) =>
                        `\\draw[${color}, ${thickness}, samples=120, domain=${d.start}:${d.end}, variable=\\t] plot ({${byMatrix.a.toFixed(6)}*\\t*\\t + ${byMatrix.b.toFixed(6)}*\\t + ${byMatrix.c.toFixed(6)}}, {\\t});${c.label && idx === domains.length - 1 ? ` % ${c.label}` : ''}`
                    ).join('\n') + '\n';
                }
                const segs = this.findVisibleParamSegments((t) => ({
                    x: t,
                    y: byMatrix.a * t * t + byMatrix.b * t + byMatrix.c
                }), xmin, xmax, 320);
                const domains = segs.length ? segs : [{ start: Number(xmin.toFixed(2)), end: Number(xmax.toFixed(2)) }];
                return domains.map((d, idx) =>
                    `\\draw[${color}, ${thickness}, samples=120, domain=${d.start}:${d.end}, variable=\\t] plot ({\\t}, {${byMatrix.a.toFixed(6)}*\\t*\\t + ${byMatrix.b.toFixed(6)}*\\t + ${byMatrix.c.toFixed(6)}});${c.label && idx === domains.length - 1 ? ` % ${c.label}` : ''}`
                ).join('\n') + '\n';
            }
            return `% 抛物线 ${c.label}: 缺少焦点\n`;
        }
        
        const { x: fx, y: fy } = c.focusCoord;
        
        // 解析准线方程
        if (c.directrix) {
            const directrixMatch = c.directrix.match(/([xy])\s*=\s*(-?\d+(?:\.\d+)?)/);
            if (directrixMatch) {
                const varName = directrixMatch[1];
                const value = parseFloat(directrixMatch[2]);
                
                if (varName === 'x') {
                    // 准线是 x = 常数，抛物线开口向左或右
                    // 顶点在 (fx + value)/2, fy
                    const vx = (fx + value) / 2;
                    const p = Math.abs(fx - vx);  // 焦距
                    const direction = fx > vx ? 1 : -1;
                    
                    const coeff = direction * p;
                    const segs = this.findVisibleParamSegments((yy) => ({
                        x: vx + coeff * (yy / 2) * (yy / 2),
                        y: yy
                    }), ymin, ymax, 320);
                    const domains = segs.length ? segs : [{ start: Number(ymin.toFixed(2)), end: Number(ymax.toFixed(2)) }];
                    return domains.map((d, idx) =>
                        `\\draw[${color}, ${thickness}, samples=100, domain=${d.start}:${d.end}, variable=\\y] plot ({${vx.toFixed(2)} + ${coeff.toFixed(2)}*(\\y/2)^2}, {\\y});${c.label && idx === domains.length - 1 ? ` % 抛物线 ${c.label}` : ''}`
                    ).join('\n') + '\n';
                } else {
                    // 准线是 y = 常数，抛物线开口向上或下
                    const vy = (fy + value) / 2;
                    const p = Math.abs(fy - vy);
                    const direction = fy > vy ? 1 : -1;
                    
                    const coeff = direction * p;
                    const segs = this.findVisibleParamSegments((xx) => ({
                        x: xx,
                        y: vy + coeff * (xx / 2) * (xx / 2)
                    }), xmin, xmax, 320);
                    const domains = segs.length ? segs : [{ start: Number(xmin.toFixed(2)), end: Number(xmax.toFixed(2)) }];
                    return domains.map((d, idx) =>
                        `\\draw[${color}, ${thickness}, samples=100, domain=${d.start}:${d.end}] plot (\\x,{${vy.toFixed(2)} + ${coeff.toFixed(2)}*(\\x/2)^2});${c.label && idx === domains.length - 1 ? ` % 抛物线 ${c.label}` : ''}`
                    ).join('\n') + '\n';
                }
            }
        }
        
        return `% 抛物线 ${c.label}: 准线格式不支持\n`;
    }

    /**
     * 生成双曲线（简化版）
     */
    generateHyperbola(c, color, thickness) {
        // 优先：matrix 数值回退（支持旋转双曲线）
        const byMatrix = this.hyperbolaFromMatrix(c.matrix);
        if (byMatrix) {
            const h = byMatrix.h;
            const k = byMatrix.k;
            const a = byMatrix.a;
            const b = byMatrix.b;
            const cosT = Math.cos(byMatrix.theta);
            const sinT = Math.sin(byMatrix.theta);

            const drawBranch = (signExpr) => {
                if (byMatrix.mainAxis === 'u') {
                    const uExpr = `${signExpr}${a.toFixed(6)}*cosh(\\t)`;
                    const vExpr = `${b.toFixed(6)}*sinh(\\t)`;
                    const sign = signExpr === '-' ? -1 : 1;
                    const segs = this.findVisibleParamSegments((t) => {
                        const u = sign * a * Math.cosh(t);
                        const v = b * Math.sinh(t);
                        return {
                            x: h + u * cosT - v * sinT,
                            y: k + u * sinT + v * cosT
                        };
                    }, -4, 4, 420);
                    const domains = segs.length ? segs : [{ start: -2, end: 2 }];
                    return domains.map((d) =>
                        `\\draw[${color}, ${thickness}, samples=140, variable=\\t, domain=${d.start}:${d.end}] plot ({${h.toFixed(6)} + (${uExpr})*${cosT.toFixed(6)} - (${vExpr})*${sinT.toFixed(6)}}, {${k.toFixed(6)} + (${uExpr})*${sinT.toFixed(6)} + (${vExpr})*${cosT.toFixed(6)}});`
                    ).join('\n') + '\n';
                }
                const uExpr = `${b.toFixed(6)}*sinh(\\t)`;
                const vExpr = `${signExpr}${a.toFixed(6)}*cosh(\\t)`;
                const sign = signExpr === '-' ? -1 : 1;
                const segs = this.findVisibleParamSegments((t) => {
                    const u = b * Math.sinh(t);
                    const v = sign * a * Math.cosh(t);
                    return {
                        x: h + u * cosT - v * sinT,
                        y: k + u * sinT + v * cosT
                    };
                }, -4, 4, 420);
                const domains = segs.length ? segs : [{ start: -2, end: 2 }];
                return domains.map((d) =>
                    `\\draw[${color}, ${thickness}, samples=140, variable=\\t, domain=${d.start}:${d.end}] plot ({${h.toFixed(6)} + (${uExpr})*${cosT.toFixed(6)} - (${vExpr})*${sinT.toFixed(6)}}, {${k.toFixed(6)} + (${uExpr})*${sinT.toFixed(6)} + (${vExpr})*${cosT.toFixed(6)}});`
                ).join('\n') + '\n';
            };

            return `${drawBranch('')}${drawBranch('-')}${c.label ? `% ${c.label}\n` : ''}`;
        }

        // 次选：焦点近似（仍可生成形状，避免“参数不完整”）
        if (c.focus1Coord && c.focus2Coord) {
            const f1 = c.focus1Coord;
            const f2 = c.focus2Coord;
            const h = (f1.x + f2.x) / 2;
            const k = (f1.y + f2.y) / 2;
            const theta = Math.atan2(f2.y - f1.y, f2.x - f1.x);
            const a = 1.0;
            const cdist = Math.hypot(f2.x - f1.x, f2.y - f1.y) / 2;
            const b = Math.sqrt(Math.max(cdist * cdist - a * a, 0.2));
            const cosT = Math.cos(theta);
            const sinT = Math.sin(theta);
            const drawApproxBranch = (sign) => {
                const segs = this.findVisibleParamSegments((t) => {
                    const u = sign * a * Math.cosh(t);
                    const v = b * Math.sinh(t);
                    return {
                        x: h + u * cosT - v * sinT,
                        y: k + u * sinT + v * cosT
                    };
                }, -4, 4, 420);
                const domains = segs.length ? segs : [{ start: -2, end: 2 }];
                const aSign = sign < 0 ? `-${a.toFixed(6)}` : `${a.toFixed(6)}`;
                return domains.map((d) =>
                    `\\draw[${color}, ${thickness}, samples=120, variable=\\t, domain=${d.start}:${d.end}] plot ({${h.toFixed(6)} + (${aSign}*cosh(\\t))*${cosT.toFixed(6)} - (${b.toFixed(6)}*sinh(\\t))*${sinT.toFixed(6)}}, {${k.toFixed(6)} + (${aSign}*cosh(\\t))*${sinT.toFixed(6)} + (${b.toFixed(6)}*sinh(\\t))*${cosT.toFixed(6)}});`
                ).join('\n');
            };
            return `${drawApproxBranch(1)}
${drawApproxBranch(-1)}${c.label ? ` % ${c.label}` : ''}\n`;
        }
        
        return `% 双曲线 ${c.label}: 参数不完整\n`;
    }

    parseMatrix(matrix) {
        if (!matrix) return null;
        const A = Number(matrix.A0);
        const C = Number(matrix.A1);
        const F = Number(matrix.A2);
        // GeoGebra matrix form:
        // A0*x^2 + A1*y^2 + A2 + 2*A3*x*y + 2*A4*x + 2*A5*y = 0
        // Canonical form:
        // A*x^2 + B*x*y + C*y^2 + D*x + E*y + F = 0
        const B = Number(matrix.A3) * 2;
        const D = Number(matrix.A4) * 2;
        const E = Number(matrix.A5) * 2;
        if (![A, B, C, D, E, F].every(Number.isFinite)) return null;
        return { A, B, C, D, E, F };
    }

    circleFromMatrix(matrix) {
        const m = this.parseMatrix(matrix);
        if (!m) return null;
        if (Math.abs(m.B) > 1e-8) return null;
        if (Math.abs(m.A - m.C) > 1e-8 || Math.abs(m.A) < 1e-12) return null;
        const h = -m.D / (2 * m.A);
        const k = -m.E / (2 * m.C);
        const K = m.F - (m.D * m.D) / (4 * m.A) - (m.E * m.E) / (4 * m.C);
        const r2 = -K / m.A;
        if (!Number.isFinite(r2) || r2 <= 0) return null;
        return { h, k, r: Math.sqrt(r2) };
    }

    ellipseFromMatrix(matrix) {
        const m = this.parseMatrix(matrix);
        if (!m) return null;
        const eps = 1e-10;
        const det = 4 * m.A * m.C - m.B * m.B;
        if (Math.abs(det) < eps) return null;

        // 中心
        const h = (m.B * m.E - 2 * m.C * m.D) / det;
        const k = (m.B * m.D - 2 * m.A * m.E) / det;
        if (!Number.isFinite(h) || !Number.isFinite(k)) return null;

        const Fc = m.A * h * h + m.B * h * k + m.C * k * k + m.D * h + m.E * k + m.F;

        // 主轴方向
        const theta = 0.5 * Math.atan2(m.B, m.A - m.C);
        const cosT = Math.cos(theta);
        const sinT = Math.sin(theta);
        const lambdaU = m.A * cosT * cosT + m.B * cosT * sinT + m.C * sinT * sinT;
        const lambdaV = m.A * sinT * sinT - m.B * cosT * sinT + m.C * cosT * cosT;
        if (!Number.isFinite(lambdaU) || !Number.isFinite(lambdaV)) return null;
        if (!(lambdaU * lambdaV > eps)) return null; // 必须同号（椭圆）

        const a2 = -Fc / lambdaU;
        const b2 = -Fc / lambdaV;
        if (!(a2 > eps && b2 > eps)) return null;

        return {
            h,
            k,
            a: Math.sqrt(a2),
            b: Math.sqrt(b2),
            thetaDeg: theta * 180 / Math.PI
        };
    }

    hyperbolaFromMatrix(matrix) {
        const m = this.parseMatrix(matrix);
        if (!m) return null;
        const eps = 1e-10;
        const det = 4 * m.A * m.C - m.B * m.B;
        if (Math.abs(det) < eps) return null; // parabola or degenerate

        // Solve center: [2A B; B 2C] [h k]^T = [-D -E]^T
        const h = (m.B * m.E - 2 * m.C * m.D) / det;
        const k = (m.B * m.D - 2 * m.A * m.E) / det;
        if (!Number.isFinite(h) || !Number.isFinite(k)) return null;

        // Constant after translation to center
        const Fc = m.A * h * h + m.B * h * k + m.C * k * k + m.D * h + m.E * k + m.F;

        // Rotate to principal axes
        const theta = 0.5 * Math.atan2(m.B, m.A - m.C);
        const cosT = Math.cos(theta);
        const sinT = Math.sin(theta);
        const lambdaU = m.A * cosT * cosT + m.B * cosT * sinT + m.C * sinT * sinT;
        const lambdaV = m.A * sinT * sinT - m.B * cosT * sinT + m.C * cosT * cosT;
        if (!Number.isFinite(lambdaU) || !Number.isFinite(lambdaV)) return null;
        if (!(lambdaU * lambdaV < -eps)) return null; // not hyperbola

        // lambdaU*u^2 + lambdaV*v^2 + Fc = 0
        const rhs = -Fc;
        const u2 = rhs / lambdaU;
        const v2 = rhs / lambdaV;

        let a2 = NaN;
        let b2 = NaN;
        let mainAxis = null;
        if (u2 > eps && v2 < -eps) {
            a2 = u2;
            b2 = -v2;
            mainAxis = 'u';
        } else if (u2 < -eps && v2 > eps) {
            a2 = v2;
            b2 = -u2;
            mainAxis = 'v';
        } else {
            return null;
        }

        if (!(a2 > eps && b2 > eps)) return null;
        const a = Math.sqrt(a2);
        const b = Math.sqrt(b2);
        if (!Number.isFinite(a) || !Number.isFinite(b)) return null;

        return { h, k, a, b, theta, mainAxis };
    }

    parabolaFromMatrix(matrix) {
        const m = this.parseMatrix(matrix);
        if (!m) return null;
        if (Math.abs(m.B) > 1e-8) return null;
        // A x^2 + C y^2 + D x + E y + F = 0
        // x = a y^2 + b y + c  (A ~ 0), or y = a x^2 + b x + c (C ~ 0)
        if (Math.abs(m.A) < 1e-10 && Math.abs(m.D) > 1e-12 && Math.abs(m.C) > 1e-12) {
            return {
                mode: 'x_of_y',
                a: -m.C / m.D,
                b: -m.E / m.D,
                c: -m.F / m.D
            };
        }
        if (Math.abs(m.C) < 1e-10 && Math.abs(m.E) > 1e-12 && Math.abs(m.A) > 1e-12) {
            return {
                mode: 'y_of_x',
                a: -m.A / m.E,
                b: -m.D / m.E,
                c: -m.F / m.E
            };
        }
        return null;
    }

    normalizeCoord(coord) {
        if (!coord) return null;
        const x = Number(coord.x);
        const y = Number(coord.y);
        if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
        return { x, y };
    }

    lineFromTwoPointsToBounds(p1, p2) {
        const a = p1.y - p2.y;
        const b = p2.x - p1.x;
        const c = p1.x * p2.y - p2.x * p1.y;
        const { xmin, xmax, ymin, ymax } = this.getBounds();
        return this.lineFromABCToBounds(a, b, c, xmin, xmax, ymin, ymax);
    }

    lineFromABCToBounds(a, b, c, xmin, xmax, ymin, ymax) {
        const points = [];
        const eps = 1e-10;

        if (Math.abs(b) > eps) {
            const yLeft = -(a * xmin + c) / b;
            if (yLeft >= ymin && yLeft <= ymax) points.push({ x: xmin, y: yLeft });
            const yRight = -(a * xmax + c) / b;
            if (yRight >= ymin && yRight <= ymax) points.push({ x: xmax, y: yRight });
        }
        if (Math.abs(a) > eps) {
            const xBottom = -(b * ymin + c) / a;
            if (xBottom >= xmin && xBottom <= xmax) points.push({ x: xBottom, y: ymin });
            const xTop = -(b * ymax + c) / a;
            if (xTop >= xmin && xTop <= xmax) points.push({ x: xTop, y: ymax });
        }

        const uniq = [];
        points.forEach(p => {
            if (!uniq.some(q => Math.abs(q.x - p.x) < 1e-8 && Math.abs(q.y - p.y) < 1e-8)) uniq.push(p);
        });
        return uniq.length >= 2 ? [uniq[0], uniq[1]] : null;
    }

    rayToBounds(start, through) {
        if (!start || !through) return null;
        const vx = through.x - start.x;
        const vy = through.y - start.y;
        const eps = 1e-10;
        if (Math.abs(vx) < eps && Math.abs(vy) < eps) return null;

        const { xmin, xmax, ymin, ymax } = this.getBounds();
        const candidates = [];
        const pushIfValid = (t) => {
            if (!Number.isFinite(t) || t < 0) return;
            const x = start.x + t * vx;
            const y = start.y + t * vy;
            if (x >= xmin - 1e-8 && x <= xmax + 1e-8 && y >= ymin - 1e-8 && y <= ymax + 1e-8) {
                candidates.push({ t, x, y });
            }
        };

        if (Math.abs(vx) > eps) {
            pushIfValid((xmin - start.x) / vx);
            pushIfValid((xmax - start.x) / vx);
        }
        if (Math.abs(vy) > eps) {
            pushIfValid((ymin - start.y) / vy);
            pushIfValid((ymax - start.y) / vy);
        }

        if (candidates.length === 0) return null;
        candidates.sort((a, b) => b.t - a.t);
        return [start, { x: candidates[0].x, y: candidates[0].y }];
    }

    getLineStyleByLabel(lines, label) {
        const found = lines.find(l => l.label === label) || {};
        const thickness = this.resolveCategoryThickness('line', found);
        return {
            color: this.resolveStrokeColor(found, 'black'),
            thickness,
            lineStyle: this.composeLineStyle(thickness, found)
        };
    }

    formatPointPairComment(p1Label, p2Label, p1Coord, p2Coord) {
        if (p1Label && p2Label) return `过点 ${p1Label}, ${p2Label}`;
        if (p1Label && p2Coord) return `过点 ${p1Label}, (${Number(p2Coord.x).toFixed(2)},${Number(p2Coord.y).toFixed(2)})`;
        if (p2Label && p1Coord) return `过点 (${Number(p1Coord.x).toFixed(2)},${Number(p1Coord.y).toFixed(2)}), ${p2Label}`;
        if (p1Coord && p2Coord) return `过点 (${Number(p1Coord.x).toFixed(2)},${Number(p1Coord.y).toFixed(2)}), (${Number(p2Coord.x).toFixed(2)},${Number(p2Coord.y).toFixed(2)})`;
        return '';
    }

    formatAngularBisectorComment(point1Label, vertexLabel, point2Label) {
        if (point1Label && vertexLabel && point2Label) {
            return `角${point1Label}${vertexLabel}${point2Label}的角分线`;
        }
        return '';
    }

    formatExtendedSegment(coord1, coord2, e1, e2) {
        const p1 = `(${Number(coord1.x).toFixed(2)},${Number(coord1.y).toFixed(2)})`;
        const p2 = `(${Number(coord2.x).toFixed(2)},${Number(coord2.y).toFixed(2)})`;
        return `($${p1}!-${e1}!${p2}$) -- ($${p2}!-${e2}!${p1}$)`;
    }

    toLineABC(line) {
        if (line && Number.isFinite(Number(line.a)) && Number.isFinite(Number(line.b)) && Number.isFinite(Number(line.c))) {
            return { a: Number(line.a), b: Number(line.b), c: Number(line.c) };
        }
        const p1 = line?.point1Coord || (line?.point1Label ? this.pointIndex[line.point1Label] : null);
        const p2 = line?.point2Coord || (line?.point2Label ? this.pointIndex[line.point2Label] : null);
        if (!p1 || !p2) return null;
        const a = p1.y - p2.y;
        const b = p2.x - p1.x;
        const c = p1.x * p2.y - p2.x * p1.y;
        if (![a, b, c].every(Number.isFinite)) return null;
        return { a, b, c };
    }

    intersectLines(line1, line2) {
        const l1 = this.toLineABC(line1);
        const l2 = this.toLineABC(line2);
        if (!l1 || !l2) return null;
        const det = l1.a * l2.b - l2.a * l1.b;
        if (!Number.isFinite(det) || Math.abs(det) < 1e-12) return null;
        const x = (l1.b * l2.c - l2.b * l1.c) / det;
        const y = (l2.a * l1.c - l1.a * l2.c) / det;
        if (![x, y].every(Number.isFinite)) return null;
        return { x, y };
    }

    lineDirectionAngle(line) {
        const p1 = line?.point1Coord || (line?.point1Label ? this.pointIndex[line.point1Label] : null);
        const p2 = line?.point2Coord || (line?.point2Label ? this.pointIndex[line.point2Label] : null);
        if (p1 && p2) {
            return Math.atan2(p2.y - p1.y, p2.x - p1.x) * 180 / Math.PI;
        }
        const a = Number(line?.a);
        const b = Number(line?.b);
        if (Number.isFinite(a) && Number.isFinite(b)) {
            return Math.atan2(-a, b) * 180 / Math.PI; // 方向向量 (b, -a)
        }
        return null;
    }

    normalizeDeltaByValue(deltaDeg) {
        if (!Number.isFinite(deltaDeg)) return null;
        let d = deltaDeg % 360;
        if (d < 0) d += 360;
        if (Math.abs(d) < 1e-6) d = 360;
        return d;
    }

    shortestSignedDelta(startDeg, endDeg) {
        if (!Number.isFinite(startDeg) || !Number.isFinite(endDeg)) return null;
        let d = (endDeg - startDeg) % 360;
        if (d > 180) d -= 360;
        if (d <= -180) d += 360;
        return d;
    }

    toLatexMathLabel(labelText) {
        const raw = String(labelText || '').trim();
        if (!raw) return '';
        const greekMap = {
            'α': '\\alpha',
            'β': '\\beta',
            'γ': '\\gamma',
            'δ': '\\delta',
            'ε': '\\varepsilon',
            'ζ': '\\zeta',
            'η': '\\eta',
            'θ': '\\theta',
            'ι': '\\iota',
            'κ': '\\kappa',
            'λ': '\\lambda',
            'μ': '\\mu',
            'ν': '\\nu',
            'ξ': '\\xi',
            'ο': 'o',
            'π': '\\pi',
            'ρ': '\\rho',
            'σ': '\\sigma',
            'τ': '\\tau',
            'υ': '\\upsilon',
            'φ': '\\varphi',
            'χ': '\\chi',
            'ψ': '\\psi',
            'ω': '\\omega',
            'Α': 'A',
            'Β': 'B',
            'Γ': '\\Gamma',
            'Δ': '\\Delta',
            'Ε': 'E',
            'Ζ': 'Z',
            'Η': 'H',
            'Θ': '\\Theta',
            'Ι': 'I',
            'Κ': 'K',
            'Λ': '\\Lambda',
            'Μ': 'M',
            'Ν': 'N',
            'Ξ': '\\Xi',
            'Ο': 'O',
            'Π': '\\Pi',
            'Ρ': 'P',
            'Σ': '\\Sigma',
            'Τ': 'T',
            'Υ': '\\Upsilon',
            'Φ': '\\Phi',
            'Χ': 'X',
            'Ψ': '\\Psi',
            'Ω': '\\Omega'
        };

        let out = '';
        for (const ch of raw) {
            if (greekMap[ch]) {
                out += greekMap[ch];
                continue;
            }
            if (/^[A-Za-z0-9]$/.test(ch)) {
                out += ch;
                continue;
            }
            if (ch === '_') {
                out += '\\_';
                continue;
            }
            if (ch === '-') {
                out += '-';
                continue;
            }
        }
        return out || '';
    }

    resolveAngleRadius(angleObj) {
        const raw = Number(angleObj?.arcSize);
        if (!Number.isFinite(raw)) return 0.75;
        return Math.max(0.35, Math.min(1.6, raw / 40));
    }

    generateAngleArc(center, startDeg, deltaDeg, radius, drawStyle, labelText) {
        if (!center || !Number.isFinite(startDeg) || !Number.isFinite(deltaDeg)) return '';
        const cx = Number(center.x).toFixed(2);
        const cy = Number(center.y).toFixed(2);
        const s = Number(startDeg).toFixed(2);
        const d = Number(deltaDeg).toFixed(2);
        const r = Number(radius).toFixed(2);
        const latexLabel = this.toLatexMathLabel(labelText);
        const label = latexLabel ? ` node[midway, fill=white, inner sep=1pt] {$${latexLabel}$}` : '';
        return `\\draw[${drawStyle}] (${cx},${cy}) ++(${s}:${r}) arc[start angle=${s}, delta angle=${d}, radius=${r}]${label};\n`;
    }

    generateTkzAngleByLabels(p1Label, vLabel, p2Label, radius, labelText) {
        const p1 = String(p1Label || '').trim();
        const v = String(vLabel || '').trim();
        const p2 = String(p2Label || '').trim();
        if (!p1 || !v || !p2) return '';
        if (!this.isValidTikzCoordName(p1) || !this.isValidTikzCoordName(v) || !this.isValidTikzCoordName(p2)) return '';
        if (!this.pointIndex[p1] || !this.pointIndex[v] || !this.pointIndex[p2]) return '';

        const size = Number(radius).toFixed(2);
        // tkzMarkAngle 按逆时针解释点序；为保持与 GeoGebra 三点角显示一致，
        // 当几何方向为顺时针时交换首尾点，避免方向反转。
        let first = p1;
        let third = p2;
        const pv = this.pointIndex[v];
        const pp1 = this.pointIndex[p1];
        const pp2 = this.pointIndex[p2];
        const s = this.angleDeg(pv, pp1);
        const e = this.angleDeg(pv, pp2);
        const d = this.shortestSignedDelta(s, e);
        if (Number.isFinite(d) && d < 0) {
            first = p2;
            third = p1;
        }

        const latexLabel = this.toLatexMathLabel(labelText);
        let code = `\\tkzMarkAngle[size=${size}](${first},${v},${third})\n`;
        if (latexLabel) {
            const pos = Number(radius) <= 0.45 ? '0.55' : '0.95';
            code += `\\tkzLabelAngle[pos=${pos}](${first},${v},${third}){$${latexLabel}$}\n`;
        }
        return code;
    }

    isRightAngleByValue(valueDeg) {
        const v = Number(valueDeg);
        if (!Number.isFinite(v)) return false;
        const d = Math.abs(v - 90);
        return d <= 1.2;
    }

    chooseLinePointLabel(line, vertexLabel) {
        const v = String(vertexLabel || '').trim();
        const a = String(line?.point1Label || '').trim();
        const b = String(line?.point2Label || '').trim();
        if (a && a !== v && this.pointIndex[a]) return a;
        if (b && b !== v && this.pointIndex[b]) return b;
        return '';
    }

    getLineEndpointLabels(line) {
        const a = String(line?.point1Label || '').trim();
        const b = String(line?.point2Label || '').trim();
        const out = [];
        if (a && this.pointIndex[a]) out.push(a);
        if (b && b !== a && this.pointIndex[b]) out.push(b);
        return out;
    }

    findSharedVertexLabel(line1, line2) {
        const s1 = this.getLineEndpointLabels(line1);
        const s2 = new Set(this.getLineEndpointLabels(line2));
        for (const label of s1) {
            if (s2.has(label)) return label;
        }
        return '';
    }

    candidateDirectionAngles(line, vertexCoord) {
        const out = [];
        const push = (ang) => {
            if (!Number.isFinite(ang)) return;
            let a = ((ang % 360) + 360) % 360;
            if (out.some(v => Math.abs(v - a) < 1e-6 || Math.abs(Math.abs(v - a) - 360) < 1e-6)) return;
            out.push(a);
        };

        const v = vertexCoord;
        const p1 = line?.point1Coord || (line?.point1Label ? this.pointIndex[line.point1Label] : null);
        const p2 = line?.point2Coord || (line?.point2Label ? this.pointIndex[line.point2Label] : null);
        [p1, p2].forEach((p) => {
            if (!p || !v) return;
            const dx = Number(p.x) - Number(v.x);
            const dy = Number(p.y) - Number(v.y);
            if (!Number.isFinite(dx) || !Number.isFinite(dy)) return;
            if (Math.hypot(dx, dy) < 1e-9) return;
            push(Math.atan2(dy, dx) * 180 / Math.PI);
        });

        const dir = this.lineDirectionAngle(line);
        if (Number.isFinite(dir)) {
            push(dir);
            push(dir + 180);
        }
        return out;
    }

    preferredLineDirection(line) {
        const p1 = line?.point1Coord || (line?.point1Label ? this.pointIndex[line.point1Label] : null);
        const p2 = line?.point2Coord || (line?.point2Label ? this.pointIndex[line.point2Label] : null);
        if (p1 && p2) {
            return this.normalizeAngleDeg(Math.atan2(p2.y - p1.y, p2.x - p1.x) * 180 / Math.PI);
        }
        const d = this.lineDirectionAngle(line);
        return Number.isFinite(d) ? this.normalizeAngleDeg(d) : null;
    }

    angleDiffSigned(a, b) {
        let d = (b - a) % 360;
        if (d > 180) d -= 360;
        if (d <= -180) d += 360;
        return d;
    }

    angleDiffAbs(a, b) {
        return Math.abs(this.angleDiffSigned(a, b));
    }

    regionTargetAngle(selector) {
        if (selector === 'right') return 0;
        if (selector === 'above') return 90;
        if (selector === 'left') return 180;
        if (selector === 'below') return 270;
        return null;
    }

    regionPenalty(selector, startDeg, deltaDeg) {
        const target = this.regionTargetAngle(selector);
        if (!Number.isFinite(target)) return 0;
        const mid = this.normalizeAngleDeg(Number(startDeg) + Number(deltaDeg) / 2);
        return this.angleDiffAbs(mid, target);
    }

    chooseBestLineLineDirections(line1, line2, vertexCoord, targetDegRaw) {
        const cand1 = this.candidateDirectionAngles(line1, vertexCoord);
        const cand2 = this.candidateDirectionAngles(line2, vertexCoord);
        if (!cand1.length || !cand2.length) return null;

        let targetSigned = null;
        let targetMag = null;
        if (Number.isFinite(targetDegRaw)) {
            let d = ((targetDegRaw % 360) + 360) % 360;
            targetSigned = d <= 180 ? d : d - 360; // 例如 252° -> -108°
            targetMag = Math.abs(targetSigned);
        }

        const pref1 = this.preferredLineDirection(line1);
        const pref2 = this.preferredLineDirection(line2);

        let best = null;
        let bestScore = Infinity;
        cand1.forEach((d1) => {
            cand2.forEach((d2) => {
                const sd = this.angleDiffSigned(d1, d2);
                const mag = Math.abs(sd);
                if (mag < 1e-6 || mag > 180 + 1e-6) return;
                let score = 0;
                if (Number.isFinite(targetMag)) {
                    score += Math.abs(mag - targetMag);
                } else {
                    // 未给目标时，默认偏向较小夹角，避免跑到反角。
                    score += mag;
                }
                if (Number.isFinite(pref1)) {
                    score += 0.2 * this.angleDiffAbs(d1, pref1);
                }
                if (Number.isFinite(pref2)) {
                    score += 0.2 * this.angleDiffAbs(d2, pref2);
                }
                score += 0.6 * this.regionPenalty(this.options.lineLineAngleSelector, d1, sd);
                if (score < bestScore) {
                    bestScore = score;
                    best = { d1, d2, delta: sd };
                }
            });
        });
        return best;
    }

    formatLineReadableName(lineObj, fallbackLabel = '') {
        const labels = this.findPointsOnLineByABC(lineObj, this.scenePoints, 1e-4);
        const uniq = Array.from(new Set((labels || []).filter(Boolean)));
        if (uniq.length > 0) {
            return `直线${uniq.join('')}`;
        }
        const p1 = String(lineObj?.point1Label || '').trim();
        const p2 = String(lineObj?.point2Label || '').trim();
        if (p1 && p2 && p1 !== p2) return `直线${p1}${p2}`;
        if (p1) return `直线${p1}`;
        if (p2) return `直线${p2}`;
        return fallbackLabel ? `直线${fallbackLabel}` : '直线';
    }

    formatAngleComment(angleObj, vertexLabel = '', lineMap = {}) {
        const parts = [];
        if (angleObj?.line1Label && angleObj?.line2Label) {
            const l1 = lineMap[angleObj.line1Label];
            const l2 = lineMap[angleObj.line2Label];
            const n1 = this.formatLineReadableName(l1, angleObj.line1Label);
            const n2 = this.formatLineReadableName(l2, angleObj.line2Label);
            parts.push(`由${n1}与${n2}形成`);
        }
        if (vertexLabel) {
            parts.push(`顶点 ${vertexLabel}`);
        }
        if (!parts.length && angleObj?.point1Label && angleObj?.vertexLabel && angleObj?.point2Label) {
            parts.push(`角${angleObj.point1Label}${angleObj.vertexLabel}${angleObj.point2Label}`);
        }
        return parts.join('，');
    }

    safeAngleTempName(base, suffix) {
        const core = String(base || 'ang').replace(/[^A-Za-z0-9_]/g, '');
        const head = /^[A-Za-z]/.test(core) ? core : `A${core || 'ng'}`;
        return `${head}${suffix}`;
    }

    generateAngles(angles, lines = []) {
        let code = '% 角度\n';
        const lineMap = {};
        (lines || []).forEach((l) => {
            if (l && l.label) lineMap[l.label] = l;
        });

        angles.forEach((a, idx) => {
            if (!a || !a.visible) return;
            const color = this.resolveStrokeColor(a, 'black');
            const thickness = this.resolveCategoryThickness('line', a);
            const drawStyle = `${color}, ${this.composeLineStyle(thickness, a)}`;
            const radius = this.resolveAngleRadius(a);
            const label = a.label || '';
            const deltaByValue = this.normalizeDeltaByValue(Number(a.valueDeg));

            // Angle(A,B,C) 或 InteriorAngles 反推到三点
            const p1 = this.getCoordByLabelOrCoord(a.point1Label, a.point1Coord);
            const v = this.getCoordByLabelOrCoord(a.vertexLabel, a.vertexCoord);
            const p2 = this.getCoordByLabelOrCoord(a.point2Label, a.point2Coord);
            if (p1 && v && p2) {
                const start = this.angleDeg(v, p1);
                const end = this.angleDeg(v, p2);
                // 三点角优先画“最短有向角”，与 GeoGebra 常见显示一致，避免把 90° 画成 270°。
                let delta = this.shortestSignedDelta(start, end);
                if (!Number.isFinite(delta) || Math.abs(delta) < 1e-6) {
                    delta = Number.isFinite(deltaByValue) ? deltaByValue : ((end - start + 360) % 360);
                }
                if (!Number.isFinite(delta) || Math.abs(delta) < 1e-6) return;
                const isRight = this.isRightAngleByValue(Math.abs(delta)) || this.isRightAngleByValue(Number(a.valueDeg));
                const tkz = this.generateTkzAngleByLabels(a.point1Label, a.vertexLabel, a.point2Label, radius, label);
                if (tkz) {
                    const comment = this.formatAngleComment(a, a.vertexLabel || '', lineMap);
                    if (comment) code += `% ${comment}\n`;
                    if (isRight) {
                        const p1l = String(a.point1Label || '').trim();
                        const vl = String(a.vertexLabel || '').trim();
                        const p2l = String(a.point2Label || '').trim();
                        const latexLabel = this.toLatexMathLabel(label);
                        code += `\\tkzMarkRightAngle[draw,size=0.25](${p1l},${vl},${p2l})\n`;
                        if (latexLabel) code += `\\tkzLabelAngle[pos=0.6](${p1l},${vl},${p2l}){$${latexLabel}$}\n`;
                    } else {
                        code += tkz;
                    }
                    return;
                }
                code += this.generateAngleArc(v, start, delta, radius, drawStyle, label);
                return;
            }

            // Angle(l1, l2)
            if (a.line1Label && a.line2Label) {
                const l1 = lineMap[a.line1Label];
                const l2 = lineMap[a.line2Label];
                const o = this.intersectLines(l1, l2);
                if (!o) return;

                // 兜底：构造临时点，也使用 tkz 语法（避免回退到 draw arc）
                const chosen = this.chooseBestLineLineDirections(l1, l2, o, Number(a.valueDeg));
                if (!chosen) return;
                const vertexLabel =
                    this.findSharedVertexLabel(l1, l2) ||
                    this.resolveLabelByCoord(o, 5e-3) ||
                    '';
                const comment = this.formatAngleComment(a, vertexLabel, lineMap);
                if (comment) code += `% ${comment}\n`;
                const base = this.safeAngleTempName(a.label || `ang${idx}`, `${idx}`);
                const vName = this.safeAngleTempName(base, 'V');
                const pName = this.safeAngleTempName(base, 'P');
                const qName = this.safeAngleTempName(base, 'Q');
                const rAux = 1.0;
                const t1 = chosen.d1 * Math.PI / 180;
                const t2 = chosen.d2 * Math.PI / 180;
                const px = o.x + rAux * Math.cos(t1);
                const py = o.y + rAux * Math.sin(t1);
                const qx = o.x + rAux * Math.cos(t2);
                const qy = o.y + rAux * Math.sin(t2);
                code += `\\coordinate (${vName}) at (${o.x.toFixed(2)},${o.y.toFixed(2)});\n`;
                code += `\\coordinate (${pName}) at (${px.toFixed(2)},${py.toFixed(2)});\n`;
                code += `\\coordinate (${qName}) at (${qx.toFixed(2)},${qy.toFixed(2)});\n`;
                const latexLabel = this.toLatexMathLabel(label);
                const size = Number(radius).toFixed(2);
                const isRight = this.isRightAngleByValue(Math.abs(chosen.delta)) || this.isRightAngleByValue(Number(a.valueDeg));
                if (isRight) {
                    code += `\\tkzMarkRightAngle[draw,size=0.25](${pName},${vName},${qName})\n`;
                    if (latexLabel) code += `\\tkzLabelAngle[pos=0.6](${pName},${vName},${qName}){$${latexLabel}$}\n`;
                } else {
                    code += `\\tkzMarkAngle[size=${size}](${pName},${vName},${qName})\n`;
                    if (latexLabel) {
                        const pos = Number(radius) <= 0.45 ? '0.55' : '0.95';
                        code += `\\tkzLabelAngle[pos=${pos}](${pName},${vName},${qName}){$${latexLabel}$}\n`;
                    }
                }
            }
        });

        return code;
    }

    findPointsOnLineByABC(line, points, tol = 1e-4) {
        const a = Number(line?.a);
        const b = Number(line?.b);
        const c = Number(line?.c);
        if (![a, b, c].every(Number.isFinite)) return [];
        const norm = Math.sqrt(a * a + b * b) || 1;
        const labels = [];
        (points || []).forEach(p => {
            if (!p || !p.label) return;
            const x = Number(p.x), y = Number(p.y);
            if (!Number.isFinite(x) || !Number.isFinite(y)) return;
            const d = Math.abs(a * x + b * y + c) / norm;
            if (d <= tol) labels.push(p.label);
        });
        return labels;
    }

    findPointsOnRay(ray, points, tol = 1e-4) {
        const labels = this.findPointsOnLineByABC(ray, points, tol);
        const start = ray.startCoord || (ray.startLabel ? this.pointIndex[ray.startLabel] : null);
        const through = ray.throughCoord || (ray.throughLabel ? this.pointIndex[ray.throughLabel] : null);
        if (!start || !through) return labels;
        const vx = through.x - start.x;
        const vy = through.y - start.y;
        const vv = vx * vx + vy * vy;
        if (vv < 1e-12) return labels;
        return labels.filter(label => {
            const p = this.pointIndex[label];
            if (!p) return false;
            const t = ((p.x - start.x) * vx + (p.y - start.y) * vy) / vv;
            return t >= -1e-6;
        });
    }

    chooseLabelPair(labels) {
        const uniq = Array.from(new Set((labels || []).filter(l => this.pointIndex[l])));
        if (uniq.length < 2) return null;
        let best = [uniq[0], uniq[1]];
        let bestD2 = -1;
        for (let i = 0; i < uniq.length; i++) {
            for (let j = i + 1; j < uniq.length; j++) {
                const p1 = this.pointIndex[uniq[i]];
                const p2 = this.pointIndex[uniq[j]];
                const d2 = (p1.x - p2.x) ** 2 + (p1.y - p2.y) ** 2;
                if (d2 > bestD2) {
                    bestD2 = d2;
                    best = [uniq[i], uniq[j]];
                }
            }
        }
        return best;
    }

    formatPassingLabelsComment(labels) {
        const uniq = Array.from(new Set(labels || []));
        if (uniq.length === 0) return '';
        return `过点 ${uniq.join(', ')}`;
    }

    /**
     * 生成直线
     */
    generateLines(lines, lineRelations = []) {
        let code = '% 直线\n';

        const drawn = new Set();
        if (this.options.semanticFirst && lineRelations.length > 0) {
            lineRelations.forEach(rel => {
                const label = rel.label || '';
                const style = this.getLineStyleByLabel(lines, label);
                const p1 = this.normalizeCoord(rel?.through?.p1Coord) ||
                    this.normalizeCoord(rel?.tangent?.throughPointCoord) ||
                    this.normalizeCoord(rel?.orthogonal?.fromPointCoord);
                const p2 = this.normalizeCoord(rel?.through?.p2Coord) ||
                    this.normalizeCoord(rel?.tangent?.tangentPointCoord) ||
                    this.normalizeCoord(rel?.orthogonal?.footCoord) ||
                    this.normalizeCoord(rel?.orthogonal?.intersectionPointCoord);

                if (p1 && p2) {
                    const ends = this.lineFromTwoPointsToBounds(p1, p2);
                    if (ends) {
                        const cmtBisector = this.formatAngularBisectorComment(
                            rel?.angularBisector?.point1Label || null,
                            rel?.angularBisector?.vertexLabel || null,
                            rel?.angularBisector?.point2Label || null
                        );
                        const cmtThrough = this.formatPointPairComment(
                            rel?.through?.p1Label || null,
                            rel?.through?.p2Label || null,
                            rel?.through?.p1Coord || p1,
                            rel?.through?.p2Coord || p2
                        );
                        const cmt = cmtBisector || cmtThrough;
                        const e1 = Number(this.options.lineExtensionStart || 0);
                        const e2 = Number(this.options.lineExtensionEnd || 0);
                        code += `\\draw[${style.lineStyle}] ${this.formatExtendedSegment(ends[0], ends[1], e1, e2)};${cmt ? ` % ${cmt}` : ''}\n`;
                        drawn.add(label);
                    }
                }
            });
        }

        lines.forEach(l => {
            if (!l.visible || drawn.has(l.label)) return;

            const color = this.resolveStrokeColor(l, 'black');
            const thickness = this.resolveCategoryThickness('line', l);
            const lineStyle = this.composeLineStyle(thickness, l);
            let ends = null;

            const p1 = l.point1Coord || (l.point1Label ? this.pointIndex[l.point1Label] : null);
            const p2 = l.point2Coord || (l.point2Label ? this.pointIndex[l.point2Label] : null);
            if (p1 && p2) {
                ends = this.lineFromTwoPointsToBounds(p1, p2);
            } else if (l.a !== undefined && l.b !== undefined && l.c !== undefined) {
                const b = this.getBounds();
                ends = this.lineFromABCToBounds(l.a, l.b, l.c, b.xmin, b.xmax, b.ymin, b.ymax);
            }

            if (ends) {
                const cmtBisector = this.formatAngularBisectorComment(
                    l.bisectorPoint1Label,
                    l.bisectorVertexLabel,
                    l.bisectorPoint2Label
                );
                const labelsOnLine = this.findPointsOnLineByABC(l, this.scenePoints);
                const pair = this.chooseLabelPair(labelsOnLine);
                const cmtThrough = this.formatPassingLabelsComment(labelsOnLine) ||
                    this.formatPointPairComment(l.point1Label, l.point2Label, p1, p2);
                const cmt = cmtBisector || cmtThrough;
                const e1 = Number(this.options.lineExtensionStart || 0);
                const e2 = Number(this.options.lineExtensionEnd || 0);
                if (this.options.definePointCoordinates && pair && this.isValidTikzCoordName(pair[0]) && this.isValidTikzCoordName(pair[1])) {
                    code += `\\draw[${lineStyle}] ($(${pair[0]})!-${e1}!(${pair[1]})$) -- ($(${pair[1]})!-${e2}!(${pair[0]})$);${cmt ? ` % ${cmt}` : ''}\n`;
                } else {
                    code += `\\draw[${lineStyle}] ${this.formatExtendedSegment(ends[0], ends[1], e1, e2)};${cmt ? ` % ${cmt}` : ''}\n`;
                }
            }
        });
        
        return code;
    }

    /**
     * 生成线段
     */
    generateSegments(segments) {
        let code = '% 线段\n';
        
        segments.forEach(s => {
            if (!s.visible) return;
            if (s.fromPolygon) return; // polygon 的边由 polygon 本体统一绘制，避免重复
            
            const color = this.resolveStrokeColor(s, 'black');
            const thickness = this.resolveCategoryThickness('segment', s);
            const lineStyle = this.composeLineStyle(thickness, s);
            
            // 有坐标直接用
            const start = s.startCoord || (s.startLabel ? this.pointIndex[s.startLabel] : null);
            const end = s.endCoord || (s.endLabel ? this.pointIndex[s.endLabel] : null);
            if (start && end) {
                const startRef = this.pointRef(start, s.startLabel || null);
                const endRef = this.pointRef(end, s.endLabel || null);
                code += `\\draw[${color}, ${lineStyle}] ${startRef} -- ${endRef};\n`;
            }
        });
        
        return code;
    }

    generatePolygons(polygons) {
        let code = '% 多边形\n';
        polygons.forEach(poly => {
            if (!poly.visible) return;
            const verts = Array.isArray(poly.vertices) ? poly.vertices : [];
            if (verts.length < 3) return;
            const refs = verts.map(v => {
                const coord = v.coord || (v.label ? this.pointIndex[v.label] : null);
                if (!coord) return null;
                return this.pointRef(coord, v.label || null);
            }).filter(Boolean);
            if (refs.length < 3) return;
            const color = this.resolveStrokeColor(poly, 'black');
            const thickness = this.resolveCategoryThickness('polygon', poly);
            const lineStyle = this.composeLineStyle(thickness, poly);
            const alpha = Number.isFinite(Number(poly.alpha)) ? Number(poly.alpha) : 0.12;
            const fillColor = String(this.options.polygonFillColor || color).trim() || color;
            if (fillColor.toLowerCase() === 'none') {
                code += `\\draw[${color}, ${lineStyle}] ${refs.join(' -- ')} -- cycle;${poly.label ? ` % ${poly.label}` : ''}\n`;
            } else {
                code += `\\draw[${color}, ${lineStyle}, fill=${fillColor}, fill opacity=${alpha.toFixed(2)}] ${refs.join(' -- ')} -- cycle;${poly.label ? ` % ${poly.label}` : ''}\n`;
            }
        });
        return code;
    }

    generateVectors(vectors) {
        let code = '% 向量\n';
        vectors.forEach(v => {
            if (!v.visible) return;
            const start = v.startCoord || (v.startLabel ? this.pointIndex[v.startLabel] : null);
            let end = v.endCoord || (v.endLabel ? this.pointIndex[v.endLabel] : null);
            if (!end && start && Number.isFinite(v.vx) && Number.isFinite(v.vy)) {
                end = { x: start.x + Number(v.vx), y: start.y + Number(v.vy) };
            }
            if (!start || !end) return;
            const sRef = this.pointRef(start, v.startLabel || null);
            const eRef = this.pointRef(end, v.endLabel || null);
            const thickness = this.resolveCategoryThickness('line', v);
            const lineStyle = this.composeLineStyle(thickness, v);
            code += `\\draw[->, ${lineStyle}] ${sRef} -- ${eRef};${v.label ? ` % 向量 ${v.label}` : ''}\n`;
        });
        return code;
    }

    generateRays(rays) {
        let code = '% 射线\n';
        rays.forEach(r => {
            if (!r.visible) return;
            const start = r.startCoord || (r.startLabel ? this.pointIndex[r.startLabel] : null);
            const through = r.throughCoord || (r.throughLabel ? this.pointIndex[r.throughLabel] : null);
            if (!start || !through) return;
            const ends = this.rayToBounds(start, through);
            if (!ends) return;
            const e1 = Number(this.options.lineExtensionStart || 0);
            const e2 = Number(this.options.lineExtensionEnd || 0);
            const thickness = this.resolveCategoryThickness('line', r);
            const lineStyle = this.composeLineStyle(thickness, r);
            const labelsOnRay = this.findPointsOnRay(r, this.scenePoints);
            const cmt = this.formatPassingLabelsComment(labelsOnRay) || ((r.startLabel && r.throughLabel) ? `射线${r.startLabel}${r.throughLabel}` : '');
            if (this.options.definePointCoordinates && r.startLabel && r.throughLabel &&
                this.isValidTikzCoordName(r.startLabel) && this.isValidTikzCoordName(r.throughLabel) &&
                this.pointIndex[r.startLabel] && this.pointIndex[r.throughLabel]) {
                code += `\\draw[${lineStyle}] ($(${r.startLabel})!-${e1}!(${r.throughLabel})$) -- ($(${r.throughLabel})!-${e2}!(${r.startLabel})$);${cmt ? ` % ${cmt}` : ''}\n`;
            } else {
                code += `\\draw[${lineStyle}] ${this.formatExtendedSegment(ends[0], ends[1], e1, e2)};${cmt ? ` % ${cmt}` : ''}\n`;
            }
        });
        return code;
    }

    /**
     * 生成点
     */
    generatePoints(points) {
        let code = '% 点\n';
        let hasLabelO = false;
        
        points.forEach(p => {
            if (!p.visible) return;
            if (String(p.label || '').trim() === 'O') hasLabelO = true;
            
            const color = this.resolvePointColor(p);
            const size = p.pointSize || 2;
            const radiusPt = Number.isFinite(Number(this.options.pointRadiusPt))
                ? Number(this.options.pointRadiusPt)
                : (size / 20);
            
            const pRef = this.pointRef({ x: p.x, y: p.y }, p.label || null);
            code += `\\fill[${color}] ${pRef} circle[radius=${radiusPt}pt]`;
            
            if (p.label) {
                code += ` node[above right, xshift=0pt, yshift=0pt] {$${p.label}$}`;
            }
            
            code += `;\n`;
        });

        // 仅在显示坐标轴时自动补一个原点标签点，便于和普通点一样微调标签位置
        if (this.options.axis && !hasLabelO) {
            const radiusPt = Number.isFinite(Number(this.options.pointRadiusPt))
                ? Number(this.options.pointRadiusPt)
                : 0.25;
            code += `\\fill[black] (0.00,0.00) circle[radius=${radiusPt}pt] node[above right, xshift=0pt, yshift=0pt] {$O$}; % axis-origin\n`;
        }
        
        return code;
    }

    generateDerivedPoints(points) {
        let code = '% 语义派生点（调试）\n';
        points.forEach(p => {
            if (!p || !p.coord) return;
            const x = Number(p.coord.x);
            const y = Number(p.coord.y);
            if (!Number.isFinite(x) || !Number.isFinite(y)) return;
            code += `\\fill[orange!80!black] (${x.toFixed(2)},${y.toFixed(2)}) circle[radius=0.8pt] node[below right] {$${p.label || ''}$};\n`;
        });
        return code;
    }

    /**
     * 结束 tikzpicture
     */
    generateEndTikz() {
        let code = `\\end{tikzpicture}
`;
        if (this.options.outputMode === 'figure') {
            code += `\\caption{${this.options.figureCaption}}
\\label{${this.options.figureLabel}}
\\end{figure}
`;
        } else if (this.options.outputMode === 'standalone') {
            code += `\\end{document}
`;
        }
        return code;
    }

    /**
     * 转换 GeoGebra 表达式到 TikZ
     */
    convertTrigToRadianTikz(expr) {
        const src = String(expr ?? '');
        const isWord = (ch) => /[A-Za-z0-9_]/.test(ch);
        const walk = (s) => {
            let out = '';
            let i = 0;
            while (i < s.length) {
                const sub = s.slice(i);
                const m = sub.match(/^(sin|cos|tan)\s*\(/i);
                const prev = i > 0 ? s[i - 1] : '';
                if (m && !isWord(prev)) {
                    const full = m[0];
                    const fn = m[1];
                    const openRel = full.indexOf('(');
                    const open = i + openRel;
                    let depth = 0;
                    let close = -1;
                    for (let k = open; k < s.length; k++) {
                        const ch = s[k];
                        if (ch === '(') depth++;
                        else if (ch === ')') {
                            depth--;
                            if (depth === 0) {
                                close = k;
                                break;
                            }
                        }
                    }
                    if (close === -1) {
                        out += s.slice(i);
                        break;
                    }

                    const innerRaw = s.slice(open + 1, close);
                    const inner = walk(innerRaw);
                    const hasRadianSuffix = /\br\s*$/i.test(inner.trim());
                    out += `${fn}(${hasRadianSuffix ? inner : `${inner} r`})`;
                    i = close + 1;
                    continue;
                }
                out += s[i];
                i++;
            }
            return out;
        };
        return walk(src);
    }

    convertExpression(expr) {
        const converted = this.convertEulerPowerToExp(expr)
            // GeoGebra 常见写法：x^(2) -> (x)^2，避免在 trig 参数中歧义
            .replace(/\bx\^\(([^()]+)\)/g, '(x)^$1')
            .replace(/\bx\b/g, '\\x')
            .replace(/ln\(/g, 'ln(')  // ln
            .replace(/log\(/g, 'ln(')  // log → ln
            .replace(/exp\(/g, 'exp(')
            .replace(/sqrt\(/g, 'sqrt(')
            .replace(/pi/g, '3.14159');
        return this.convertTrigToRadianTikz(converted)
            // PGF 的反三角函数返回角度，这里统一转回弧度，便于与其他弧度制函数混用
            .replace(/\b(asin|acos|atan)\s*\(([^()]+)\)/g, 'rad($1($2))');
    }

    /**
     * 转换线宽
     */
    convertThickness(thickness) {
        const t = parseInt(thickness) || 2;
        if (t <= 1) return 'very thin';
        if (t <= 2) return 'thin';
        if (t <= 3) return 'thick';
        if (t <= 5) return 'very thick';
        return 'ultra thick';
    }
}

// 导出
if (typeof window !== 'undefined') {
    window.TikZGenerator = TikZGenerator;
}
if (typeof module !== 'undefined' && module.exports) {
    module.exports = TikZGenerator;
}
