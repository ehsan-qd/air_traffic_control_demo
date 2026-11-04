import type { FlightView, PathView } from '../api/types.gen';
import { greatCircle, pathD, project } from '../geo/projection';
export const LEVEL_COLOURS = ['#7dbed6','#63d4dd','#91e0b5','#c3cd8a','#c7a5e7','#a9baff'];
export function levelColour(level: number): string {
  return LEVEL_COLOURS[Math.max(0, Math.min(5, Math.round((level - 310) / 20)))];
}
/** An actual sub-route ending at simulation time, not an invented particle trail. */
export function routeBetween(path: PathView, from: number, to: number): number[][] {
  if (!path.points.length || path.times_s.length !== path.points.length || to <= path.times_s[0] || from >= path.times_s.at(-1)!) return [];
  const points: number[][] = [];
  for (let i = 1; i < path.points.length; i++) {
    const start = path.times_s[i - 1], end = path.times_s[i];
    if (end < from || start > to || end <= start) continue;
    const a = Math.max(0, (from - start) / (end - start)), b = Math.min(1, (to - start) / (end - start));
    if (b < a) continue;
    const point = (t: number) => [...greatCircle(path.points[i - 1], path.points[i], t), path.points[i - 1][2] + (path.points[i][2] - path.points[i - 1][2]) * t];
    if (!points.length) points.push(point(a));
    points.push(point(b));
  }
  return points;
}
export function fleetRoute(flight: FlightView) { return pathD(flight.trajectory?.points ?? flight.route); }
/** Greedy screen-space decluttering preserves focused/conflicting labels first. */
export function visibleLabels(flights: FlightView[], priority: Set<string>, max = 20): Set<string> {
  const sorted = [...flights].sort((a,b) => Number(priority.has(b.id)) - Number(priority.has(a.id)));
  const boxes: [number,number][] = [], visible = new Set<string>();
  for (const flight of sorted) {
    const [x,y] = project(flight.position.lon,flight.position.lat);
    if (priority.has(flight.id) || (boxes.every(([xx,yy]) => Math.abs(xx-x) > 85 || Math.abs(yy-y) > 26) && visible.size < max)) {
      visible.add(flight.id); boxes.push([x,y]);
    }
  }
  return visible;
}
