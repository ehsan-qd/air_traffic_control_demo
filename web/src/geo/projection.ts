import atlanticLand from './atlantic-land.json';
const radians = Math.PI / 180;
/** Orthographic projection of the sphere, centred on the North Atlantic. */
export function project(lon: number, lat: number): [number, number] {
  const lambda = (lon + 32) * radians;
  const phi = lat * radians;
  const centre = 52 * radians;
  return [500 + 1250 * Math.cos(phi) * Math.sin(lambda), 280 - 1250 * (Math.cos(centre) * Math.sin(phi) - Math.sin(centre) * Math.cos(phi) * Math.cos(lambda))];
}
export function greatCircle(a: number[], b: number[], t: number): [number, number] {
  const vector = (p: number[]) => [Math.cos(p[1] * radians) * Math.cos(p[0] * radians), Math.cos(p[1] * radians) * Math.sin(p[0] * radians), Math.sin(p[1] * radians)];
  const u = vector(a), v = vector(b);
  const cross = [u[1]*v[2]-u[2]*v[1], u[2]*v[0]-u[0]*v[2], u[0]*v[1]-u[1]*v[0]];
  const angle = Math.atan2(Math.hypot(...cross), u.reduce((s, n, i) => s + n * v[i], 0));
  if (angle < 1e-10) return [a[0], a[1]];
  if (Math.PI - angle < 1e-10) throw new Error('Antipodal endpoints have no unique great-circle route.');
  const p = u.map((n, i) => (Math.sin((1 - t) * angle) * n + Math.sin(t * angle) * v[i]) / Math.sin(angle));
  return [Math.atan2(p[1], p[0]) / radians, Math.atan2(p[2], Math.hypot(p[0], p[1])) / radians];
}
export function pathD(points: number[][], curved = true): string {
  if (!points.length) return '';
  const dense = points.flatMap((p, i) => i && curved ? Array.from({ length: 8 }, (_, j) => greatCircle(points[i - 1], p, (j + 1) / 8)) : [p]);
  return dense.map((p, i) => `${i ? 'L' : 'M'}${project(p[0], p[1]).map(n => n.toFixed(2)).join(',')}`).join(' ');
}
export const coasts: number[][][] = atlanticLand;
