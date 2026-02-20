export const GGB_COMMAND_COMPLETIONS = [
  { name: 'Point', insertText: 'Point()', detail: 'Point(object)' },
  { name: 'Intersect', insertText: 'Intersect(, )', detail: 'Intersect(obj1, obj2)' },
  { name: 'Segment', insertText: 'Segment(, )', detail: 'Segment(point1, point2)' },
  { name: 'Line', insertText: 'Line(, )', detail: 'Line(point1, point2)' },
  { name: 'Ray', insertText: 'Ray(, )', detail: 'Ray(startPoint, throughPoint)' },
  { name: 'Vector', insertText: 'Vector(, )', detail: 'Vector(point1, point2)' },
  { name: 'Polygon', insertText: 'Polygon(, )', detail: 'Polygon(points...)' },
  { name: 'RegularPolygon', insertText: 'RegularPolygon(, , )', detail: 'RegularPolygon(A, B, n)' },
  { name: 'RigidPolygon', insertText: 'RigidPolygon(, )', detail: 'RigidPolygon(points...)' },
  { name: 'VectorPolygon', insertText: 'VectorPolygon(, )', detail: 'VectorPolygon(points...)' },
  { name: 'Circle', insertText: 'Circle(, )', detail: 'Circle(center, point)' },
  { name: 'Incircle', insertText: 'Incircle(, , )', detail: 'Incircle(A, B, C)' },
  { name: 'Ellipse', insertText: 'Ellipse(, , )', detail: 'Ellipse(F1, F2, P)' },
  { name: 'Hyperbola', insertText: 'Hyperbola(, , )', detail: 'Hyperbola(F1, F2, P)' },
  { name: 'Parabola', insertText: 'Parabola(, )', detail: 'Parabola(Focus, Directrix)' },
  { name: 'Tangent', insertText: 'Tangent(, )', detail: 'Tangent(point/line, conic)' },
  { name: 'OrthogonalLine', insertText: 'OrthogonalLine(, )', detail: 'OrthogonalLine(point, line)' },
  { name: 'PerpendicularLine', insertText: 'PerpendicularLine(, )', detail: 'PerpendicularLine(point, line)' },
  { name: 'PerpendicularBisector', insertText: 'PerpendicularBisector(, )', detail: 'PerpendicularBisector(A, B)' },
  { name: 'AngularBisector', insertText: 'AngularBisector(, , )', detail: 'AngularBisector(A, B, C)' },
  { name: 'AngleBisector', insertText: 'AngularBisector(, , )', detail: 'AngleBisector alias -> AngularBisector' },
  { name: 'Semicircle', insertText: 'Semicircle(, )', detail: 'Semicircle(A, B)' },
  { name: 'CircleArc', insertText: 'CircleArc(, , )', detail: 'CircleArc(A, B, C)' },
  { name: 'CircleSector', insertText: 'CircleSector(, , )', detail: 'CircleSector(A, B, C)' },
  { name: 'CircumcircleArc', insertText: 'CircumcircleArc(, , )', detail: 'CircumcircleArc(A, B, C)' },
  { name: 'CircumcircleSector', insertText: 'CircumcircleSector(, , )', detail: 'CircumcircleSector(A, B, C)' },
  { name: 'Midpoint', insertText: 'Midpoint(, )', detail: 'Midpoint(A, B)' },
  { name: 'Center', insertText: 'Center()', detail: 'Center(conic)' }
];

export function searchGGBCompletions(prefix, limit = 10) {
  const q = String(prefix || '').trim().toLowerCase();
  if (!q) return [];
  return GGB_COMMAND_COMPLETIONS
    .filter((item) => item.name.toLowerCase().startsWith(q))
    .slice(0, limit);
}
