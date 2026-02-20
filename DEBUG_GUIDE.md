# GeoGebra -> TikZ 调试指南

## 1. 目标
本项目采用“语义保留 + 坐标落地”策略：
- `structured`: 按点/线段/直线/圆锥等分类的解析结果。
- `semantics`: 面向 TikZ 与排查的关系数据（切线、垂线、派生点、未解析项）。

这样可以避免在 TikZ 中重复做复杂几何求交。

## 2. 导出调试包
在“画板元素”窗口点击：
- `📋 复制 JSON`
- `💾 下载 JSON`

现在导出的内容是完整调试包（不是仅 `structured`）：
- `meta`
- `stats`
- `structured`
- `semantics`
- `notes`

## 3. 关键字段说明

### 3.1 `structured`
- `points[]`: 点对象，包含 `label/x/y/visible`，并新增：
  - `sourceType`（`free_point_expression / free_point_coords / point_on_object / intersection_point / derived_point ...`）
  - `commandName/sourceInputs/sourceObjects`（点的来源命令与依赖对象）
- `lines[]`: 直线对象，包含：
  - `commandName/commandInputs`（原始构造命令）
  - `point1Label/point2Label` 或 `point1Coord/point2Coord`
  - `a/b/c`（一般式）
  - `tangentPointCoord`（切点，若可计算）
  - `orthogonalFootCoord`（垂足，若可计算）
- `conics[]`: 圆锥曲线，包含：
  - `equation`（来自 `<expression>`）
  - `matrix`（来自 `<element><matrix>`）
  - `conicType`
  - `normalized`（统一语义结果）
  - `semanticType/provenance`（构造语义与来源）

### 3.2 `semantics`
- `mode`: 固定 `semantic+resolved`
- `commandGraph[]`: 命令依赖图（按 XML 顺序），便于排查“同名对象被覆盖/重建”问题。
- `pointRelations[]`: 点来源关系的语义层镜像。
- `derivedPoints[]`: 解析阶段计算出的关键点
  - `kind = tangent_point | orthogonal_foot`
- `lineRelations[]`: 每条线的关系信息
  - `through`: 两点信息
  - `tangent`: 切线相关信息
  - `orthogonal`: 垂线相关信息
- `conicRelations[]`: 圆锥的语义信息
  - 重点看 `normalized.semanticType`：
    - `circle_by_center_radius`
    - `circle_by_center_point`
    - `circle_by_three_points`
    - `ellipse_by_foci_axis_length / ellipse_by_foci_point`
    - `hyperbola_by_foci_axis_length / hyperbola_by_foci_point`
    - `parabola_by_focus_directrix`
    - `*_by_equation / *_by_matrix`
- `unresolved[]`: 未能落地为关键点的对象（优先排查这里）

## 4. 推荐建图规范（非常重要）
为保证可复现与可转换：
1. 关键几何点尽量显式创建并命名：
   - `P = Intersect(l, c, 1)`
   - `H = Intersect(g, f)`
2. 对后续会引用的点，开启标签或至少命名。
3. 不要仅依赖“视觉构造结果”，应有对应命令对象。

## 5. 常见问题排查

### 5.1 切线缺少切点
检查：
- 直线是否由 `Tangent(...)` 构造。
- 被切对象是否是 `conic` 且有 `matrix`。
- `semantics.lineRelations[].tangent.tangentPointCoord` 是否为空。

### 5.2 垂线缺少垂足
当前实现稳定支持“点到直线/线段/射线”的垂足：
- 看 `orthogonal.targetType` 是否为 `line/segment/ray`。
- 看 `orthogonal.footCoord` / `intersectionPointCoord` 是否存在。

### 5.3 读取出的直线命令不可执行
当前优先输出原始命令（如 `Tangent(...)`、`AngularBisector(...)`），
只有缺失命令上下文时才回退到 `Line(...)`。
如仍有异常，请优先检查该对象的 `commandName/commandInputs`。

## 6. 面向 TikZ 的建议
1. TikZ 层尽量只画，不求交。
2. 交点/垂足/切点优先使用 `structured` 或 `semantics.derivedPoints` 中已解析坐标。
3. 若 `unresolved` 非空，优先回到 GGB 增加显式命令（`Intersect/Foot`）再导出。

## 7. 下一步可扩展
- 增加 `Intersect(...)` 输出点的统一索引（对象关系图）。
- 对 conic-line 的一般交点做解析器级数值求解（可选）。
- 导出 `tikz-ready.json`（仅保留 TikZ 所需字段）以减小体积。
