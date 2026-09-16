/**
 * TikZ 3D generator
 * - Input: parsed output from GGB3DParser
 * - Output: exam-style 3D TikZ code
 */

class TikZ3DGenerator {
  constructor(options = {}) {
    const rawPreset = String(options.projectionPreset || '').trim().toLowerCase();
    const projectionPreset = (rawPreset === 'exam' || rawPreset === 'round') ? rawPreset : 'azimuth';
    const defaultScale = (projectionPreset === 'exam' || projectionPreset === 'round') ? 1.5 : 1.2;
    this.options = {
      outputMode: options.outputMode || 'figure', // standalone | figure | tikz
      tikzScale: Number.isFinite(options.tikzScale) ? options.tikzScale : defaultScale,
      tikzPictureOptions: options.tikzPictureOptions || '',
      projectionPreset,
      axis: options.axis !== false,
      axisThickness: options.axisThickness || 'semithick',
      lineStrokeThickness: options.lineStrokeThickness || 'semithick',
      segmentStrokeThickness: options.segmentStrokeThickness || 'thick',
      polygonStrokeThickness: options.polygonStrokeThickness || 'thick',
      planeStrokeThickness: options.planeStrokeThickness || 'semithick',
      pointRadiusPt: Number.isFinite(options.pointRadiusPt) ? options.pointRadiusPt : 0.25,
      lineExtension: Number.isFinite(options.lineExtension) ? Math.max(0, options.lineExtension) : 0.25,
      azimuthDeg: Number.isFinite(options.azimuthDeg) ? options.azimuthDeg : -60,
      depthScale: Number.isFinite(options.depthScale) ? options.depthScale : 0.55,
      showPointLabels: options.showPointLabels !== false,
      fillPolygons: options.fillPolygons === true,
      polygonFillOpacity: Number.isFinite(options.polygonFillOpacity)
        ? Math.max(0, Math.min(0.6, Number(options.polygonFillOpacity)))
        : 0.25,
      polygonFillColor: String(options.polygonFillColor || 'blue!55').trim() || 'blue!55',
      hiddenEdgeDetection: options.hiddenEdgeDetection !== false,
      hiddenEdgeStyle: options.hiddenEdgeStyle || 'dashed, gray',
      pointLabelPosition: options.pointLabelPosition || 'above right',
      planeFillColor: options.planeFillColor || 'blue!55',
      planeFillOpacity: Number.isFinite(options.planeFillOpacity)
        ? Math.max(0.05, Math.min(0.8, Number(options.planeFillOpacity)))
        : 0.28
    };
    this.definedCoordLabels = new Set();
    this.pointIndex3D = {};
    this.hasSegments = false;
    this.visibility = {
      faces: [],
      hiddenEdgeKeys: new Set()
    };
  }

  generate(parsedData) {
    const structured = parsedData?.structured || {};
    const points3d = Array.isArray(structured.points3d) ? structured.points3d : [];
    const segments3d = Array.isArray(structured.segments3d) ? structured.segments3d : [];
    const lines3d = Array.isArray(structured.lines3d) ? structured.lines3d : [];
    const rays3d = Array.isArray(structured.rays3d) ? structured.rays3d : [];
    const vectors3d = Array.isArray(structured.vectors3d) ? structured.vectors3d : [];
    const polygons3d = Array.isArray(structured.polygons3d) ? structured.polygons3d : [];
    const planes3d = Array.isArray(structured.planes3d) ? structured.planes3d : [];
    const cylinders3d = Array.isArray(structured.cylinders3d) ? structured.cylinders3d : [];
    const cones3d = Array.isArray(structured.cones3d) ? structured.cones3d : [];
    const spheres3d = Array.isArray(structured.spheres3d) ? structured.spheres3d : [];

    this.definedCoordLabels = new Set();
    this.pointIndex3D = {};
    points3d.forEach((p) => {
      if (!p?.label) return;
      if (!this.isFinite3D(p)) return;
      this.pointIndex3D[p.label] = { x: Number(p.x), y: Number(p.y), z: Number(p.z) };
    });

    this.hasSegments = segments3d.some((seg) => seg && seg.visible !== false);
    this.visibility = this.buildVisibilityContext(polygons3d, segments3d, cylinders3d, cones3d, spheres3d);

    let code = '';
    code += this.generatePreamble();
    code += this.generateBeginTikz();
    code += this.generatePointCoordinateDefs(points3d);
    if (this.options.axis) code += this.generateAxes(points3d);
    code += this.generatePolygons(polygons3d);
    code += this.generatePlanes(planes3d);
    code += this.generateCylinders(cylinders3d);
    code += this.generateCones(cones3d);
    code += this.generateSpheres(spheres3d);
    code += this.generateLines(lines3d);
    code += this.generateRays(rays3d);
    code += this.generateSegments(segments3d);
    code += this.generateVectors(vectors3d);
    code += this.generatePoints(points3d);
    code += this.generateEndTikz();
    return code;
  }

  generatePreamble() {
    if (this.options.outputMode !== 'standalone') {
      return '% Requires: \\usepackage{tikz} and \\usetikzlibrary{3d,arrows.meta}\n';
    }
    return `\\documentclass[tikz,border=5pt]{standalone}
\\usepackage{tikz}
\\usetikzlibrary{3d,arrows.meta}
\\begin{document}
`;
  }

  generateBeginTikz() {
    const basis = this.getProjectionBasis();
    const pictureOpts = [`scale=${this.fmt(this.options.tikzScale)}`];
    if (this.options.tikzPictureOptions) pictureOpts.push(this.options.tikzPictureOptions);
    if (this.options.projectionPreset === 'exam') {
      pictureOpts.push('x={({0.5*cos(225)}, {0.5*sin(225)})}');
      pictureOpts.push('y={(1cm,0cm)}');
      pictureOpts.push('z={(0cm,1cm)}');
    } else if (this.options.projectionPreset === 'round') {
      pictureOpts.push('x={({-0*cos(45)}, {-0.8*sin(45)})}');
      pictureOpts.push('y={(1cm,0cm)}');
      pictureOpts.push('z={(0cm,1cm)}');
    } else {
      pictureOpts.push(`x={(${this.fmt(basis.ex.x)}cm,${this.fmt(basis.ex.y)}cm)}`);
      pictureOpts.push(`y={(${this.fmt(basis.ey.x)}cm,${this.fmt(basis.ey.y)}cm)}`);
      pictureOpts.push(`z={(${this.fmt(basis.ez.x)}cm,${this.fmt(basis.ez.y)}cm)}`);
    }
    pictureOpts.push('>=Stealth');
    pictureOpts.push('line join=round');
    pictureOpts.push('line cap=round');

    let code = '';
    if (this.options.outputMode === 'figure') {
      code += '\\begin{figure}[htbp]\n\\centering\n';
    }
    code += '% 3D exam-style projection\n';
    code += `\\begin{tikzpicture}[${pictureOpts.join(', ')}]\n`;
    return code;
  }

  generateEndTikz() {
    let code = '\\end{tikzpicture}\n';
    if (this.options.outputMode === 'figure') {
      code += '\\end{figure}\n';
    } else if (this.options.outputMode === 'standalone') {
      code += '\\end{document}\n';
    }
    return code;
  }

  generatePointCoordinateDefs(points3d) {
    let code = '% coordinates\n';
    let count = 0;
    points3d.forEach((p) => {
      if (!p || !p.label || p.visible === false) return;
      if (!this.isFinite3D(p)) return;
      if (!this.isValidTikzCoordName(p.label)) return;
      code += `\\coordinate (${p.label}) at ${this.coord3(p)};\n`;
      this.definedCoordLabels.add(p.label);
      count += 1;
    });
    return count > 0 ? code : '';
  }

  generateAxes(points3d) {
    const range = this.getAxisRange(points3d);
    const t = this.options.axisThickness;
    return `% axes
\\draw[->, ${t}] ${this.coord3({ x: 0, y: 0, z: 0 })} -- ${this.coord3({ x: range, y: 0, z: 0 })} node[right] {$x$};
\\draw[->, ${t}] ${this.coord3({ x: 0, y: 0, z: 0 })} -- ${this.coord3({ x: 0, y: range, z: 0 })} node[below right] {$y$};
\\draw[->, ${t}] ${this.coord3({ x: 0, y: 0, z: 0 })} -- ${this.coord3({ x: 0, y: 0, z: range })} node[above] {$z$};
`;
  }

  generatePolygons(polygons3d) {
    let code = '% faces\n';
    const thickness = this.options.polygonStrokeThickness;

    if (this.options.fillPolygons) {
      const faceByLabel = new Map();
      this.visibility.faces.forEach((face) => {
        if (face?.label) faceByLabel.set(face.label, face);
      });
      const fillColor = this.options.polygonFillColor;
      const alpha = this.options.polygonFillOpacity;
      const faces = (polygons3d || [])
        .filter((poly) => poly && poly.visible !== false)
        .map((poly) => {
          if (poly.commandName === 'Cube' || poly.commandName === 'Prism' || poly.commandName === 'Tetrahedron' || poly.commandName === 'Pyramid') return null;
          const face = faceByLabel.get(poly.label);
          const fromFace = Array.isArray(face?.vertices) && face.vertices.length >= 3;
          const verts = fromFace ? face.vertices : (Array.isArray(poly.vertices) ? poly.vertices : []);
          if (verts.length < 3) return null;
          const depth = Number.isFinite(face?.depth) ? face.depth : this.faceDepth(verts);
          const isPolyhedronFace = poly.commandName === 'Cube' || poly.commandName === 'Pyramid';
          const canFill = isPolyhedronFace ? (face?.visible !== false) : true;
          return canFill ? { verts, depth } : null;
        })
        .filter(Boolean)
        .sort((a, b) => a.depth - b.depth);
      faces.forEach((face) => {
        const refs = face.verts.map((v) => this.pointRef(v.coord, v.label)).filter(Boolean);
        if (refs.length < 3) return;
        code += `\\fill[${fillColor}, opacity=${this.fmt(alpha)}] ${refs.join(' -- ')} -- cycle;\n`;
      });
    }

    if (!this.hasSegments) {
      polygons3d.forEach((poly) => {
        if (!poly || poly.visible === false) return;
        const verts = Array.isArray(poly.vertices) ? poly.vertices : [];
        const refs = verts.map((v) => this.pointRef(v?.coord, v?.label)).filter(Boolean);
        if (refs.length < 3) return;
        code += `\\draw[${thickness}] ${refs.join(' -- ')} -- cycle;\n`;
      });
    }

    return code;
  }

  generatePlanes(planes3d) {
    let code = '% planes (3-point finite patch)\n';
    const thickness = this.options.planeStrokeThickness;
    const fillColor = String(this.options.planeFillColor || 'blue!55').trim() || 'blue!55';
    planes3d.forEach((plane) => {
      if (!plane || plane.visible === false) return;
      const pts = Array.isArray(plane.points) ? plane.points : [];
      if (pts.length < 3) return;
      const tri = pts.slice(0, 3);
      const refs = tri.map((p) => this.pointRef(p?.coord, p?.label)).filter(Boolean);
      if (refs.length < 3) return;
      const alphaRaw = Number(plane.alpha);
      const alpha = Number.isFinite(alphaRaw)
        ? Math.max(0.05, Math.min(0.8, alphaRaw))
        : this.options.planeFillOpacity;
      code += `\\fill[${fillColor}, opacity=${this.fmt(alpha)}] ${refs.join(' -- ')} -- cycle;\n`;
      code += `\\draw[${thickness}] ${refs.join(' -- ')} -- cycle;\n`;
    });
    return code;
  }

  generateCylinders(cylinders3d) {
    let code = '% cylinders\n';
    const thickness = this.options.segmentStrokeThickness;
    const view = this.getViewVector();

    (cylinders3d || []).forEach((cyl) => {
      if (!cyl || cyl.visible === false) return;
      const base = this.resolveCoord3D(cyl.baseCoord, cyl.baseLabel);
      const top = this.resolveCoord3D(cyl.topCoord, cyl.topLabel);
      const radius = Number(cyl.radius);
      if (!base || !top) return;
      if (!Number.isFinite(radius) || radius <= 1e-9) return;

      const axisRaw = this.sub3(top, base);
      const axisLen = this.len3(axisRaw);
      if (!Number.isFinite(axisLen) || axisLen <= 1e-9) return;
      const axis = this.scale3(axisRaw, 1 / axisLen);

      const frame = this.makePerpFrame(axis);
      if (!frame) return;
      const { u, w } = frame;

      const vpRaw = this.sub3(view, this.scale3(axis, this.dot3(view, axis)));
      const vpLen = this.len3(vpRaw);
      const vp = vpLen > 1e-9 ? this.scale3(vpRaw, 1 / vpLen) : u;
      const phi = Math.atan2(this.dot3(vp, w), this.dot3(vp, u));
      const silhouette = this.normalize3(this.cross3(axis, vp)) || u;

      const dBase = this.dot3(base, view);
      const dTop = this.dot3(top, view);
      const nearIsBase = dBase >= dTop;
      const nearCenter = nearIsBase ? base : top;
      const farCenter = nearIsBase ? top : base;
      const phiDeg = (phi * 180) / Math.PI;
      const farFrontStart = phiDeg - 90;
      const farFrontEnd = phiDeg + 90;
      const farBackStart = phiDeg + 90;
      const farBackEnd = phiDeg + 270;

      code += this.drawCircleArcByPlot(nearCenter, u, w, radius, 0, 360, `thick, samples=60`);
      code += this.drawCircleArcByPlot(farCenter, u, w, radius, farFrontStart, farFrontEnd, `thick, samples=40`);
      code += this.drawCircleArcByPlot(farCenter, u, w, radius, farBackStart, farBackEnd, `dashed, samples=40`);

      const g0a = this.add3(base, this.scale3(silhouette, radius));
      const g0b = this.add3(top, this.scale3(silhouette, radius));
      const g1a = this.add3(base, this.scale3(silhouette, -radius));
      const g1b = this.add3(top, this.scale3(silhouette, -radius));
      code += `\\draw[${thickness}] ${this.coord3(g0a)} -- ${this.coord3(g0b)};\n`;
      code += `\\draw[${thickness}] ${this.coord3(g1a)} -- ${this.coord3(g1b)};\n`;
      code += `\\draw[dashed] ${this.coord3(base)} -- ${this.coord3(top)};\n`;
    });

    return code;
  }

  generateCones(cones3d) {
    let code = '% cones\n';
    const thickness = this.options.segmentStrokeThickness;
    const view = this.getViewVector();

    (cones3d || []).forEach((cone) => {
      if (!cone || cone.visible === false) return;
      const base = this.resolveCoord3D(cone.baseCoord, cone.baseLabel);
      const apex = this.resolveCoord3D(cone.apexCoord, cone.apexLabel);
      const radius = Number(cone.radius);
      if (!base || !apex) return;
      if (!Number.isFinite(radius) || radius <= 1e-9) return;

      const axisRaw = this.sub3(apex, base);
      const axisLen = this.len3(axisRaw);
      if (!Number.isFinite(axisLen) || axisLen <= 1e-9) return;
      const axis = this.scale3(axisRaw, 1 / axisLen);

      const frame = this.makePerpFrame(axis);
      if (!frame) return;
      const { u, w } = frame;

      const vpRaw = this.sub3(view, this.scale3(axis, this.dot3(view, axis)));
      const vpLen = this.len3(vpRaw);
      const vp = vpLen > 1e-9 ? this.scale3(vpRaw, 1 / vpLen) : u;
      const phi = Math.atan2(this.dot3(vp, w), this.dot3(vp, u));
      const phiDeg = (phi * 180) / Math.PI;
      const frontStart = phiDeg - 90;
      const frontEnd = phiDeg + 90;
      const backStart = phiDeg + 90;
      const backEnd = phiDeg + 270;

      code += this.drawCircleArcByPlot(base, u, w, radius, frontStart, frontEnd, 'thick, samples=40');
      code += this.drawCircleArcByPlot(base, u, w, radius, backStart, backEnd, 'dashed, samples=40');

      const silhouette = this.normalize3(this.cross3(axis, vp)) || u;
      const g0 = this.add3(base, this.scale3(silhouette, radius));
      const g1 = this.add3(base, this.scale3(silhouette, -radius));
      code += `\\draw[${thickness}] ${this.coord3(apex)} -- ${this.coord3(g0)};\n`;
      code += `\\draw[${thickness}] ${this.coord3(apex)} -- ${this.coord3(g1)};\n`;
      code += `\\draw[dashed] ${this.coord3(base)} -- ${this.coord3(apex)};\n`;
    });

    return code;
  }

  generateSpheres(spheres3d) {
    let code = '% spheres\n';
    const view = this.getViewVector();
    const viewUnit = this.normalize3(view) || { x: 0, y: 0, z: 1 };

    (spheres3d || []).forEach((sphere) => {
      if (!sphere || sphere.visible === false) return;
      const center = this.resolveCoord3D(sphere.centerCoord, sphere.centerLabel);
      const surface = this.resolveCoord3D(sphere.surfaceCoord, sphere.surfaceLabel);
      const radius = Number(sphere.radius);
      if (!center || !Number.isFinite(radius) || radius <= 1e-9) return;

      // Silhouette: circle in plane normal to view direction.
      const silFrame = this.makePerpFrame(viewUnit);
      if (!silFrame) return;
      code += this.drawCircleArcByPlot(center, silFrame.u, silFrame.w, radius, 0, 360, 'thick, samples=72');

      // Default: draw one latitude line, no meridians.
      let north = null;
      if (surface) north = this.normalize3(this.sub3(surface, center));
      const axisCandidates = [north, { x: 0, y: 0, z: 1 }, { x: 0, y: 1, z: 0 }, { x: 1, y: 0, z: 0 }];
      let latAxis = axisCandidates.find((v) => v && Math.abs(this.dot3(v, viewUnit)) < 0.97) || null;
      if (!latAxis) latAxis = north || { x: 0, y: 0, z: 1 };
      latAxis = this.normalize3(latAxis);
      if (!latAxis) return;

      const latFrame = this.makePerpFrame(latAxis);
      if (!latFrame) return;
      const latOffset = 0.35 * radius;
      const latRadius = Math.sqrt(Math.max(0, radius * radius - latOffset * latOffset));
      if (!(Number.isFinite(latRadius) && latRadius > 1e-9)) return;
      const latCenter = this.add3(center, this.scale3(latAxis, latOffset));

      const vpRaw = this.sub3(viewUnit, this.scale3(latAxis, this.dot3(viewUnit, latAxis)));
      const vpLen = this.len3(vpRaw);
      if (vpLen <= 1e-9) {
        code += this.drawCircleArcByPlot(latCenter, latFrame.u, latFrame.w, latRadius, 0, 360, 'thick, samples=56');
      } else {
        const vp = this.scale3(vpRaw, 1 / vpLen);
        const phi = Math.atan2(this.dot3(vp, latFrame.w), this.dot3(vp, latFrame.u));
        const phiDeg = (phi * 180) / Math.PI;
        const frontStart = phiDeg - 90;
        const frontEnd = phiDeg + 90;
        const backStart = phiDeg + 90;
        const backEnd = phiDeg + 270;
        code += this.drawCircleArcByPlot(latCenter, latFrame.u, latFrame.w, latRadius, frontStart, frontEnd, 'thick, samples=56');
        code += this.drawCircleArcByPlot(latCenter, latFrame.u, latFrame.w, latRadius, backStart, backEnd, 'dashed, samples=56');
      }
    });

    return code;
  }

  generateSegments(segments3d) {
    let code = '% edges\n';
    const thickness = this.options.segmentStrokeThickness;

    segments3d.forEach((seg) => {
      if (!seg || seg.visible === false) return;
      const c0 = this.resolveCoord3D(seg.startCoord, seg.startLabel);
      const c1 = this.resolveCoord3D(seg.endCoord, seg.endLabel);
      if (!c0 || !c1) return;
      const p1 = this.pointRef(c0, seg.startLabel);
      const p2 = this.pointRef(c1, seg.endLabel);
      if (!p1 || !p2) return;

      const key = this.edgeKeyFromEndpoints(c0, c1, seg.startLabel, seg.endLabel);
      const hidden = this.visibility.hiddenEdgeKeys.has(key);
      const visibleLineType = this.mapVisibleLineType(seg.lineType);
      const visibleStyle = visibleLineType ? `${visibleLineType}, ${thickness}` : thickness;
      const hiddenLineType = this.mapHiddenLineType(seg.lineTypeHidden);
      const hiddenStyle = hiddenLineType ? `${hiddenLineType}, ${thickness}` : this.options.hiddenEdgeStyle;
      const style = hidden ? hiddenStyle : visibleStyle;
      code += `\\draw[${style}] ${p1} -- ${p2};\n`;
    });
    return code;
  }

  generateLines(lines3d) {
    let code = '% lines\n';
    lines3d.forEach((line) => {
      if (!line || line.visible === false) return;
      const p1 = this.resolveCoord3D(line.point1Coord, line.point1Label);
      const p2 = this.resolveCoord3D(line.point2Coord, line.point2Label);
      if (!p1 || !p2) return;
      const ex = this.extendLine3D(p1, p2, this.options.lineExtension);
      if (!ex) return;
      const thickness = this.options.lineStrokeThickness;
      code += `\\draw[${thickness}] ${this.coord3(ex.a)} -- ${this.coord3(ex.b)};\n`;
    });
    return code;
  }

  generateRays(rays3d) {
    let code = '% rays\n';
    rays3d.forEach((ray) => {
      if (!ray || ray.visible === false) return;
      const p0 = this.resolveCoord3D(ray.startCoord, ray.startLabel);
      const p1 = this.resolveCoord3D(ray.throughCoord, ray.throughLabel);
      if (!p0 || !p1) return;
      const dx = p1.x - p0.x;
      const dy = p1.y - p0.y;
      const dz = p1.z - p0.z;
      const norm = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (!Number.isFinite(norm) || norm < 1e-9) return;
      const k = 1 + this.options.lineExtension * 4;
      const end = {
        x: p0.x + dx * k,
        y: p0.y + dy * k,
        z: p0.z + dz * k
      };
      const thickness = this.options.lineStrokeThickness;
      code += `\\draw[${thickness}] ${this.coord3(p0)} -- ${this.coord3(end)};\n`;
    });
    return code;
  }

  generateVectors(vectors3d) {
    let code = '% vectors\n';
    vectors3d.forEach((vec) => {
      if (!vec || vec.visible === false) return;
      const p0 = this.resolveCoord3D(vec.startCoord, vec.startLabel) || { x: 0, y: 0, z: 0 };
      const p1 = this.resolveCoord3D(vec.endCoord, vec.endLabel);
      if (!p1) return;
      const thickness = this.options.segmentStrokeThickness;
      code += `\\draw[->, ${thickness}] ${this.coord3(p0)} -- ${this.coord3(p1)};\n`;
    });
    return code;
  }

  generatePoints(points3d) {
    let code = '% points\n';
    const radius = Math.max(0.05, Number(this.options.pointRadiusPt || 0.25));
    points3d.forEach((p) => {
      if (!p || p.visible === false) return;
      if (!this.isFinite3D(p)) return;
      const ref = this.pointRef({ x: p.x, y: p.y, z: p.z }, p.label);
      if (!ref) return;
      code += `\\fill ${ref} circle (${this.fmt(radius)}pt);\n`;
      if (this.options.showPointLabels && p.label) {
        code += `\\node[${this.options.pointLabelPosition}] at ${ref} {$${this.escapeLatex(p.label)}$};\n`;
      }
    });
    return code;
  }

  buildVisibilityContext(polygons3d, segments3d, cylinders3d, cones3d, spheres3d) {
    const facesRaw = [];
    (polygons3d || []).forEach((poly) => {
      if (!poly || poly.visible === false) return;
      const verts = Array.isArray(poly.vertices) ? poly.vertices : [];
      const v = verts
        .map((it) => {
          const coord = this.resolveCoord3D(it?.coord, it?.label);
          if (!coord) return null;
          return { label: it?.label || null, coord };
        })
        .filter(Boolean);
      if (v.length < 3) return;
      facesRaw.push({ label: poly.label || '', vertices: v, source: poly });
    });
    const viewVector = this.getViewVector();
    let faces = [];
    const edgeToFace = new Map();

    if (facesRaw.length > 0) {
      const center = this.getModelCenter(facesRaw, segments3d);
      faces = facesRaw.map((f) => {
        const oriented = this.orientFaceOutward(f.vertices, center);
        const facing = this.dot3(oriented.normal, viewVector);
        const depth = this.dot3(oriented.centroid, viewVector);
        return {
          label: f.label,
          vertices: oriented.vertices,
          centroid: oriented.centroid,
          normal: oriented.normal,
          visible: facing > 1e-9,
          depth,
          source: f.source
        };
      });

      faces.forEach((face, faceIdx) => {
        const n = face.vertices.length;
        for (let i = 0; i < n; i += 1) {
          const a = face.vertices[i];
          const b = face.vertices[(i + 1) % n];
          const key = this.edgeKeyFromEndpoints(a.coord, b.coord, a.label, b.label);
          if (!edgeToFace.has(key)) edgeToFace.set(key, []);
          edgeToFace.get(key).push(faceIdx);
        }
      });
    }

    const hiddenEdgeKeys = new Set();
    if (this.options.hiddenEdgeDetection !== false) {
      (segments3d || []).forEach((seg) => {
        if (!seg || seg.visible === false) return;
        const p0 = this.resolveCoord3D(seg.startCoord, seg.startLabel);
        const p1 = this.resolveCoord3D(seg.endCoord, seg.endLabel);
        if (!p0 || !p1) return;
        const key = this.edgeKeyFromEndpoints(p0, p1, seg.startLabel, seg.endLabel);
        if (this.isSegmentOccludedByFaces(seg, faces, viewVector, key)) {
          hiddenEdgeKeys.add(key);
          return;
        }
        if (this.isSegmentOccludedByQuadrics(seg, cylinders3d, cones3d, spheres3d, viewVector)) {
          hiddenEdgeKeys.add(key);
        }
      });
    }

    return { faces, hiddenEdgeKeys };
  }

  isSegmentOccludedByQuadrics(seg, cylinders3d, cones3d, spheres3d, viewVector) {
    const p0 = this.resolveCoord3D(seg.startCoord, seg.startLabel);
    const p1 = this.resolveCoord3D(seg.endCoord, seg.endLabel);
    if (!p0 || !p1) return false;
    const mid = {
      x: (p0.x + p1.x) * 0.5,
      y: (p0.y + p1.y) * 0.5,
      z: (p0.z + p1.z) * 0.5
    };
    if (this.isPointOccludedByCylinder(mid, cylinders3d, viewVector)) return true;
    if (this.isPointOccludedByCone(mid, cones3d, viewVector)) return true;
    if (this.isPointOccludedBySphere(mid, spheres3d, viewVector)) return true;
    return false;
  }

  isSegmentOccludedByFaces(seg, faces, viewVector, segmentKey = '') {
    const p0 = this.resolveCoord3D(seg.startCoord, seg.startLabel);
    const p1 = this.resolveCoord3D(seg.endCoord, seg.endLabel);
    if (!p0 || !p1) return false;
    const mid = {
      x: (p0.x + p1.x) * 0.5,
      y: (p0.y + p1.y) * 0.5,
      z: (p0.z + p1.z) * 0.5
    };
    return this.isPointOccludedByFaces(mid, faces, viewVector, segmentKey);
  }

  isPointOccludedByFaces(point, faces, viewVector, segmentKey = '') {
    const dir = this.normalize3(viewVector);
    if (!dir) return false;
    const p = this.resolveCoord3D(point);
    if (!p) return false;
    const list = Array.isArray(faces) ? faces : [];
    for (const face of list) {
      if (!face || face.visible === false) continue;
      if (this.faceContainsEdge(face, segmentKey)) continue;
      const hit = this.intersectRayFace(p, dir, face, 1e-5);
      if (hit) return true;
    }
    return false;
  }

  faceContainsEdge(face, segmentKey) {
    if (!segmentKey) return false;
    const verts = Array.isArray(face?.vertices) ? face.vertices : [];
    const n = verts.length;
    if (n < 2) return false;
    for (let i = 0; i < n; i += 1) {
      const a = verts[i];
      const b = verts[(i + 1) % n];
      const key = this.edgeKeyFromEndpoints(a?.coord, b?.coord, a?.label, b?.label);
      if (key === segmentKey) return true;
    }
    return false;
  }

  intersectRayFace(origin, dir, face, minT = 1e-5) {
    const verts = Array.isArray(face?.vertices) ? face.vertices : [];
    if (verts.length < 3) return null;
    const normal = this.normalize3(face.normal || this.faceNormal(verts));
    if (!normal) return null;
    const planePoint = this.resolveCoord3D(verts[0]?.coord);
    if (!planePoint) return null;

    const denom = this.dot3(normal, dir);
    if (Math.abs(denom) <= 1e-9) return null;

    const rel = this.sub3(planePoint, origin);
    const t = this.dot3(normal, rel) / denom;
    if (!Number.isFinite(t) || t <= minT) return null;

    const hit = this.add3(origin, this.scale3(dir, t));
    const distPlane = Math.abs(this.dot3(normal, this.sub3(hit, planePoint)));
    if (distPlane > 1e-5) return null;
    if (!this.isPointInsideFacePolygon(hit, verts)) return null;
    return { t, point: hit };
  }

  isPointInsideFacePolygon(point, verts) {
    if (!Array.isArray(verts) || verts.length < 3) return false;
    const p = this.resolveCoord3D(point);
    const v0 = this.resolveCoord3D(verts[0]?.coord);
    if (!p || !v0) return false;
    for (let i = 1; i < verts.length - 1; i += 1) {
      const v1 = this.resolveCoord3D(verts[i]?.coord);
      const v2 = this.resolveCoord3D(verts[i + 1]?.coord);
      if (!v1 || !v2) continue;
      if (this.isPointInTriangle3D(p, v0, v1, v2)) return true;
    }
    return false;
  }

  isPointInTriangle3D(p, a, b, c) {
    const v0 = this.sub3(c, a);
    const v1 = this.sub3(b, a);
    const v2 = this.sub3(p, a);

    const dot00 = this.dot3(v0, v0);
    const dot01 = this.dot3(v0, v1);
    const dot02 = this.dot3(v0, v2);
    const dot11 = this.dot3(v1, v1);
    const dot12 = this.dot3(v1, v2);

    const denom = dot00 * dot11 - dot01 * dot01;
    if (Math.abs(denom) <= 1e-12) return false;
    const inv = 1 / denom;
    const u = (dot11 * dot02 - dot01 * dot12) * inv;
    const v = (dot00 * dot12 - dot01 * dot02) * inv;
    const eps = 1e-6;
    return u >= -eps && v >= -eps && (u + v) <= 1 + eps;
  }

  isPointOccludedByCylinder(point, cylinders3d, viewVector) {
    const dir = this.normalize3(viewVector);
    if (!dir) return false;
    for (const cyl of (cylinders3d || [])) {
      if (!cyl || cyl.visible === false) continue;
      const base = this.resolveCoord3D(cyl.baseCoord, cyl.baseLabel);
      const top = this.resolveCoord3D(cyl.topCoord, cyl.topLabel);
      const radius = Number(cyl.radius);
      if (!base || !top || !Number.isFinite(radius) || radius <= 1e-9) continue;
      if (this.lineIntersectsFiniteCylinder(point, dir, base, top, radius, 1e-5)) return true;
    }
    return false;
  }

  isPointOccludedByCone(point, cones3d, viewVector) {
    const dir = this.normalize3(viewVector);
    if (!dir) return false;
    for (const cone of (cones3d || [])) {
      if (!cone || cone.visible === false) continue;
      const base = this.resolveCoord3D(cone.baseCoord, cone.baseLabel);
      const apex = this.resolveCoord3D(cone.apexCoord, cone.apexLabel);
      const radius = Number(cone.radius);
      if (!base || !apex || !Number.isFinite(radius) || radius <= 1e-9) continue;
      if (this.lineIntersectsFiniteCone(point, dir, apex, base, radius, 1e-5)) return true;
    }
    return false;
  }

  isPointOccludedBySphere(point, spheres3d, viewVector) {
    const dir = this.normalize3(viewVector);
    if (!dir) return false;
    for (const sphere of (spheres3d || [])) {
      if (!sphere || sphere.visible === false) continue;
      const center = this.resolveCoord3D(sphere.centerCoord, sphere.centerLabel);
      const radius = Number(sphere.radius);
      if (!center || !Number.isFinite(radius) || radius <= 1e-9) continue;
      if (this.lineIntersectsSphere(point, dir, center, radius, 1e-5)) return true;
    }
    return false;
  }

  lineIntersectsFiniteCylinder(point, dir, base, top, radius, eps = 1e-5) {
    const axisVec = this.sub3(top, base);
    const height = this.len3(axisVec);
    if (!Number.isFinite(height) || height <= 1e-9) return false;
    const axis = this.scale3(axisVec, 1 / height);

    const w0 = this.sub3(point, base);
    const s0 = this.dot3(w0, axis);
    const wPerp = this.sub3(w0, this.scale3(axis, s0));

    const sv = this.dot3(dir, axis);
    const dPerp = this.sub3(dir, this.scale3(axis, sv));

    const a = this.dot3(dPerp, dPerp);
    const b = 2 * this.dot3(wPerp, dPerp);
    const c = this.dot3(wPerp, wPerp) - radius * radius;

    const sideTs = this.getPositiveQuadraticRoots(a, b, c, eps);
    for (const t of sideTs) {
      const q = this.add3(point, this.scale3(dir, t));
      const s = this.dot3(this.sub3(q, base), axis);
      if (s >= -1e-7 && s <= height + 1e-7) return true;
    }

    if (Math.abs(sv) <= 1e-9) return false;
    const capTs = [(-s0) / sv, (height - s0) / sv];
    for (const t of capTs) {
      if (!(Number.isFinite(t) && t > eps)) continue;
      const q = this.add3(point, this.scale3(dir, t));
      const s = this.dot3(this.sub3(q, base), axis);
      if (s < -1e-7 || s > height + 1e-7) continue;
      const radial = this.sub3(this.sub3(q, base), this.scale3(axis, s));
      if (this.len3(radial) <= radius + 1e-7) return true;
    }
    return false;
  }

  lineIntersectsFiniteCone(point, dir, apex, baseCenter, baseRadius, eps = 1e-5) {
    const axisVec = this.sub3(baseCenter, apex);
    const height = this.len3(axisVec);
    if (!Number.isFinite(height) || height <= 1e-9) return false;
    const axis = this.scale3(axisVec, 1 / height);
    const k = baseRadius / height;

    const w = this.sub3(point, apex);
    const s0 = this.dot3(w, axis);
    const wPerp = this.sub3(w, this.scale3(axis, s0));
    const sv = this.dot3(dir, axis);
    const dPerp = this.sub3(dir, this.scale3(axis, sv));

    const a = this.dot3(dPerp, dPerp) - (k * k) * (sv * sv);
    const b = 2 * (this.dot3(wPerp, dPerp) - (k * k) * s0 * sv);
    const c = this.dot3(wPerp, wPerp) - (k * k) * (s0 * s0);

    const sideTs = this.getPositiveQuadraticRoots(a, b, c, eps);
    for (const t of sideTs) {
      const s = s0 + t * sv;
      if (s >= -1e-7 && s <= height + 1e-7) return true;
    }

    if (Math.abs(sv) <= 1e-9) return false;
    const tCap = (height - s0) / sv;
    if (Number.isFinite(tCap) && tCap > eps) {
      const q = this.add3(point, this.scale3(dir, tCap));
      const qc = this.sub3(q, baseCenter);
      const radial = this.sub3(qc, this.scale3(axis, this.dot3(qc, axis)));
      if (this.len3(radial) <= baseRadius + 1e-7) return true;
    }
    return false;
  }

  lineIntersectsSphere(point, dir, center, radius, eps = 1e-5) {
    const p = this.resolveCoord3D(point);
    const c = this.resolveCoord3D(center);
    const r = Number(radius);
    if (!p || !c || !Number.isFinite(r) || r <= 1e-9) return false;

    const m = this.sub3(p, c);
    const dist = this.len3(m);
    // On-surface points are considered not occluded to avoid false positives.
    if (Number.isFinite(dist) && Math.abs(dist - r) <= 1e-5) return false;

    const a = this.dot3(dir, dir);
    const b = 2 * this.dot3(m, dir);
    const c0 = this.dot3(m, m) - r * r;
    const roots = this.getPositiveQuadraticRoots(a, b, c0, eps);
    return roots.length > 0;
  }

  getPositiveQuadraticRoots(a, b, c, eps = 1e-5) {
    const roots = [];
    if (Math.abs(a) <= 1e-12) {
      if (Math.abs(b) <= 1e-12) return roots;
      const t = -c / b;
      if (Number.isFinite(t) && t > eps) roots.push(t);
      return roots;
    }
    const disc = b * b - 4 * a * c;
    if (disc < 0) return roots;
    const sd = Math.sqrt(Math.max(0, disc));
    const t1 = (-b - sd) / (2 * a);
    const t2 = (-b + sd) / (2 * a);
    if (Number.isFinite(t1) && t1 > eps) roots.push(t1);
    if (Number.isFinite(t2) && t2 > eps) roots.push(t2);
    roots.sort((x, y) => x - y);
    return roots;
  }

  getModelCenter(facesRaw, segments3d) {
    const pts = [];
    Object.values(this.pointIndex3D || {}).forEach((p) => {
      if (this.isFinite3D(p)) pts.push({ x: Number(p.x), y: Number(p.y), z: Number(p.z) });
    });
    facesRaw.forEach((f) => {
      (f.vertices || []).forEach((v) => {
        if (this.isFinite3D(v.coord)) pts.push(v.coord);
      });
    });
    (segments3d || []).forEach((seg) => {
      const p0 = this.resolveCoord3D(seg.startCoord, seg.startLabel);
      const p1 = this.resolveCoord3D(seg.endCoord, seg.endLabel);
      if (p0) pts.push(p0);
      if (p1) pts.push(p1);
    });

    if (pts.length === 0) return { x: 0, y: 0, z: 0 };
    const sum = pts.reduce((acc, p) => ({
      x: acc.x + p.x,
      y: acc.y + p.y,
      z: acc.z + p.z
    }), { x: 0, y: 0, z: 0 });
    return {
      x: sum.x / pts.length,
      y: sum.y / pts.length,
      z: sum.z / pts.length
    };
  }

  orientFaceOutward(vertices, modelCenter) {
    const v = Array.isArray(vertices) ? vertices.slice() : [];
    if (v.length < 3) {
      return {
        vertices: v,
        centroid: { x: 0, y: 0, z: 0 },
        normal: { x: 0, y: 0, z: 1 }
      };
    }

    let normal = this.faceNormal(v);
    let centroid = this.faceCentroid(v);
    const toFace = {
      x: centroid.x - modelCenter.x,
      y: centroid.y - modelCenter.y,
      z: centroid.z - modelCenter.z
    };
    if (this.dot3(normal, toFace) < 0) {
      v.reverse();
      normal = this.faceNormal(v);
      centroid = this.faceCentroid(v);
    }

    return { vertices: v, centroid, normal };
  }

  faceCentroid(vertices) {
    const n = Math.max(1, vertices.length);
    let x = 0;
    let y = 0;
    let z = 0;
    vertices.forEach((it) => {
      x += Number(it.coord.x);
      y += Number(it.coord.y);
      z += Number(it.coord.z);
    });
    return { x: x / n, y: y / n, z: z / n };
  }

  faceDepth(vertices) {
    const c = this.faceCentroid(vertices);
    const v = this.getViewVector();
    return this.dot3(c, v);
  }

  faceNormal(vertices) {
    if (!Array.isArray(vertices) || vertices.length < 3) return { x: 0, y: 0, z: 1 };
    const p0 = vertices[0].coord;
    for (let i = 1; i < vertices.length - 1; i += 1) {
      const p1 = vertices[i].coord;
      const p2 = vertices[i + 1].coord;
      const a = { x: p1.x - p0.x, y: p1.y - p0.y, z: p1.z - p0.z };
      const b = { x: p2.x - p0.x, y: p2.y - p0.y, z: p2.z - p0.z };
      const n = {
        x: a.y * b.z - a.z * b.y,
        y: a.z * b.x - a.x * b.z,
        z: a.x * b.y - a.y * b.x
      };
      const len = Math.hypot(n.x, n.y, n.z);
      if (len > 1e-12) {
        return { x: n.x / len, y: n.y / len, z: n.z / len };
      }
    }
    return { x: 0, y: 0, z: 1 };
  }

  dot3(a, b) {
    return Number(a.x) * Number(b.x) + Number(a.y) * Number(b.y) + Number(a.z) * Number(b.z);
  }

  add3(a, b) {
    return {
      x: Number(a.x) + Number(b.x),
      y: Number(a.y) + Number(b.y),
      z: Number(a.z) + Number(b.z)
    };
  }

  sub3(a, b) {
    return {
      x: Number(a.x) - Number(b.x),
      y: Number(a.y) - Number(b.y),
      z: Number(a.z) - Number(b.z)
    };
  }

  scale3(a, k) {
    return {
      x: Number(a.x) * Number(k),
      y: Number(a.y) * Number(k),
      z: Number(a.z) * Number(k)
    };
  }

  len3(a) {
    return Math.hypot(Number(a.x), Number(a.y), Number(a.z));
  }

  cross3(a, b) {
    return {
      x: Number(a.y) * Number(b.z) - Number(a.z) * Number(b.y),
      y: Number(a.z) * Number(b.x) - Number(a.x) * Number(b.z),
      z: Number(a.x) * Number(b.y) - Number(a.y) * Number(b.x)
    };
  }

  normalize3(a) {
    const len = this.len3(a);
    if (!Number.isFinite(len) || len <= 1e-12) return null;
    return this.scale3(a, 1 / len);
  }

  makePerpFrame(axisUnit) {
    const axis = this.normalize3(axisUnit);
    if (!axis) return null;
    const helper = Math.abs(axis.z) < 0.9
      ? { x: 0, y: 0, z: 1 }
      : { x: 1, y: 0, z: 0 };
    const u = this.normalize3(this.cross3(axis, helper));
    if (!u) return null;
    const w = this.normalize3(this.cross3(axis, u));
    if (!w) return null;
    return { u, w };
  }

  drawCircleArcByPlot(center, u, w, radius, startDeg, endDeg, style) {
    const c = this.resolveCoord3D(center);
    if (!c) return '';
    const r = Number(radius);
    if (!Number.isFinite(r) || r <= 1e-9) return '';
    const ux = this.fmt(u.x);
    const uy = this.fmt(u.y);
    const uz = this.fmt(u.z);
    const wx = this.fmt(w.x);
    const wy = this.fmt(w.y);
    const wz = this.fmt(w.z);
    const cx = this.fmt(c.x);
    const cy = this.fmt(c.y);
    const cz = this.fmt(c.z);
    const rr = this.fmt(r);
    const s = this.fmt(startDeg);
    const e = this.fmt(endDeg);
    const px = `{${cx}+${rr}*(${ux}*cos(\\x)+${wx}*sin(\\x))}`;
    const py = `{${cy}+${rr}*(${uy}*cos(\\x)+${wy}*sin(\\x))}`;
    const pz = `{${cz}+${rr}*(${uz}*cos(\\x)+${wz}*sin(\\x))}`;
    return `\\draw[${style}] plot[domain=${s}:${e}] (${px}, ${py}, ${pz});\n`;
  }

  getViewVector() {
    if (this.options.projectionPreset === 'exam' || this.options.projectionPreset === 'round') {
      return this.getViewVectorFromBasis();
    }
    const az = (Number(this.options.azimuthDeg) * Math.PI) / 180;
    const depth = Math.max(0.05, Number(this.options.depthScale));
    const vx = -Math.sin(az);
    const vy = Math.cos(az);
    const vz = depth;
    const len = Math.hypot(vx, vy, vz);
    if (!Number.isFinite(len) || len < 1e-9) return { x: 0, y: 0, z: 1 };
    return { x: vx / len, y: vy / len, z: vz / len };
  }

  resolveFaceFillOpacity(poly) {
    const xmlAlpha = Number(poly?.alpha);
    if (Number.isFinite(xmlAlpha)) {
      const scaled = Math.max(0.05, Math.min(0.35, xmlAlpha * 0.4));
      return Number(scaled.toFixed(4));
    }
    return this.options.polygonFillOpacity;
  }

  coord3(coord) {
    const c = this.resolveCoord3D(coord);
    if (!c) return '(0,0,0)';
    return `(${this.fmt(c.x)},${this.fmt(c.y)},${this.fmt(c.z)})`;
  }

  pointRef(coord, preferredLabel) {
    if (
      preferredLabel
      && this.isValidTikzCoordName(preferredLabel)
      && this.definedCoordLabels.has(preferredLabel)
    ) {
      return `(${preferredLabel})`;
    }
    return this.coord3(coord);
  }

  resolveCoord3D(coord, label = '') {
    if (coord && this.isFinite3D(coord)) {
      return { x: Number(coord.x), y: Number(coord.y), z: Number(coord.z) };
    }
    if (label && this.pointIndex3D[label]) {
      return this.pointIndex3D[label];
    }
    return null;
  }

  edgeKeyFromEndpoints(c0, c1, l0, l1) {
    const a = String(l0 || '').trim();
    const b = String(l1 || '').trim();
    if (a && b) {
      const pair = [a, b].sort();
      return `L:${pair[0]}|${pair[1]}`;
    }
    const p0 = this.resolveCoord3D(c0) || { x: 0, y: 0, z: 0 };
    const p1 = this.resolveCoord3D(c1) || { x: 0, y: 0, z: 0 };
    const s0 = `${this.fmt(p0.x)},${this.fmt(p0.y)},${this.fmt(p0.z)}`;
    const s1 = `${this.fmt(p1.x)},${this.fmt(p1.y)},${this.fmt(p1.z)}`;
    const pair = [s0, s1].sort();
    return `C:${pair[0]}|${pair[1]}`;
  }

  extendLine3D(a, b, extra) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dz = b.z - a.z;
    const norm = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (!Number.isFinite(norm) || norm < 1e-9) return null;
    return {
      a: { x: a.x - dx * extra, y: a.y - dy * extra, z: a.z - dz * extra },
      b: { x: b.x + dx * extra, y: b.y + dy * extra, z: b.z + dz * extra }
    };
  }

  getProjectionBasis() {
    if (this.options.projectionPreset === 'exam') {
      const a = (225 * Math.PI) / 180;
      return {
        ex: { x: 0.5 * Math.cos(a), y: 0.5 * Math.sin(a) },
        ey: { x: 1, y: 0 },
        ez: { x: 0, y: 1 }
      };
    }
    if (this.options.projectionPreset === 'round') {
      const a = (45 * Math.PI) / 180;
      return {
        ex: { x: -0 * Math.cos(a), y: -0.8 * Math.sin(a) },
        ey: { x: 1, y: 0 },
        ez: { x: 0, y: 1 }
      };
    }
    const az = (Number(this.options.azimuthDeg) * Math.PI) / 180;
    const cos = Math.cos(az);
    const sin = Math.sin(az);
    const depth = Math.max(0, Math.min(2, Number(this.options.depthScale)));
    return {
      ex: { x: cos, y: depth * sin },
      ey: { x: -sin, y: depth * cos },
      ez: { x: 0, y: 1 }
    };
  }

  getViewVectorFromBasis() {
    const b = this.getProjectionBasis();
    const u = { x: b.ex.x, y: b.ey.x, z: b.ez.x };
    const v = { x: b.ex.y, y: b.ey.y, z: b.ez.y };
    const n = {
      x: u.y * v.z - u.z * v.y,
      y: u.z * v.x - u.x * v.z,
      z: u.x * v.y - u.y * v.x
    };
    const len = Math.hypot(n.x, n.y, n.z);
    if (!Number.isFinite(len) || len < 1e-9) return { x: 0, y: 0, z: 1 };
    return { x: n.x / len, y: n.y / len, z: n.z / len };
  }

  getAxisRange(points3d) {
    let m = 2;
    points3d.forEach((p) => {
      if (!p) return;
      const vals = [Math.abs(Number(p.x)), Math.abs(Number(p.y)), Math.abs(Number(p.z))];
      vals.forEach((v) => {
        if (Number.isFinite(v)) m = Math.max(m, v);
      });
    });
    return Number((m * 1.2 + 0.6).toFixed(2));
  }

  mapVisibleLineType(lineType) {
    const t = Number(lineType);
    if (!Number.isFinite(t)) return '';
    if (t === 0) return '';
    if (t === 10 || t === 15) return 'dashed';
    if (t === 20 || t === 25) return 'dotted';
    if (t === 30 || t === 35) return 'dash dot';
    return '';
  }

  mapHiddenLineType(lineTypeHidden) {
    const t = Number(lineTypeHidden);
    if (!Number.isFinite(t)) return 'dashed';
    if (t === 0) return '';
    if (t === 1 || t === 10 || t === 15) return 'dashed';
    if (t === 2 || t === 20 || t === 25) return 'dotted';
    if (t === 3 || t === 30 || t === 35) return 'dash dot';
    return 'dashed';
  }

  escapeLatex(text) {
    return String(text || '').replace(/_/g, '\\\\_');
  }

  isValidTikzCoordName(name) {
    return typeof name === 'string' && /^[A-Za-z][A-Za-z0-9_]*$/.test(name);
  }

  isFinite3D(coord) {
    return coord && [coord.x, coord.y, coord.z].every((v) => Number.isFinite(Number(v)));
  }

  fmt(num) {
    const n = Number(num);
    if (!Number.isFinite(n)) return '0';
    const z = Number(n.toFixed(4));
    return Number.isFinite(z) ? String(z) : '0';
  }
}

if (typeof window !== 'undefined') {
  window.TikZ3DGenerator = TikZ3DGenerator;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = TikZ3DGenerator;
}
