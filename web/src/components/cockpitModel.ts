import type { InsertionRecord, PathView, WorldView } from '../api/types.gen';
import type { DemoState } from '../store/useDemo';
import { greatCircle } from '../geo/projection';

const RAD = Math.PI / 180;
const EARTH_NM = 6371008.8 / 1852;
export interface RoutePosition { lon:number; lat:number; level:number; heading:number; groundSpeedKt:number; segment:number; time:number }

export function isDeviating(record: InsertionRecord) {
  return record.verified && !!record.trajectory && (
    [...record.trajectory.theta, ...record.trajectory.chi].some(value => Math.abs(value) > 1e-7)
    || (record.metrics.c_n ?? 0) > 0
    || record.outcome === 'cleared_after_fallback'
  );
}

export function distanceNm(a: number[], b: number[]) {
  const lat = (b[1] - a[1]) * RAD, lon = (b[0] - a[0]) * RAD;
  const h = Math.sin(lat / 2) ** 2 + Math.cos(a[1] * RAD) * Math.cos(b[1] * RAD) * Math.sin(lon / 2) ** 2;
  return 2 * EARTH_NM * Math.asin(Math.sqrt(Math.max(0, Math.min(1, h))));
}

export function bearing(a: number[], b: number[]) {
  const lon = (b[0] - a[0]) * RAD, latA = a[1] * RAD, latB = b[1] * RAD;
  return (Math.atan2(Math.sin(lon) * Math.cos(latB), Math.cos(latA) * Math.sin(latB) - Math.sin(latA) * Math.cos(latB) * Math.cos(lon)) / RAD + 360) % 360;
}

/** Interpolate the transmitted waypoint geometry and times; do not invent flight dynamics. */
export function routePosition(path: PathView, time: number): RoutePosition | null {
  if (path.points.length < 2 || path.points.length !== path.times_s.length || !Number.isFinite(time)) return null;
  if (path.points.some(p => p.length < 3 || !p.every(Number.isFinite)) || path.times_s.some((t,i) => !Number.isFinite(t) || (i > 0 && t <= path.times_s[i - 1]))) return null;
  const clock = Math.max(path.times_s[0], Math.min(path.times_s.at(-1)!, time));
  const next = path.times_s.findIndex(t => t > clock);
  const segment = next < 0 ? path.points.length - 2 : Math.max(0, next - 1);
  const a = path.points[segment], b = path.points[segment + 1];
  const duration = path.times_s[segment + 1] - path.times_s[segment];
  const fraction = (clock - path.times_s[segment]) / duration;
  const [lon, lat] = greatCircle(a, b, fraction);
  // Use the local great-circle tangent, rather than a constant start bearing.
  const after = greatCircle(a, b, Math.min(1, fraction + .001));
  const before = greatCircle(a, b, Math.max(0, fraction - .001));
  return { lon, lat, level:a[2] + (b[2] - a[2]) * fraction, heading:bearing(before, after), groundSpeedKt:distanceNm(a,b) / duration * 3600, segment, time:clock };
}

export function relativePoint(own: RoutePosition, point: number[]) {
  const origin = [own.lon, own.lat];
  const distance = distanceNm(origin, point);
  const angle = (bearing(origin, point) - own.heading) * RAD;
  return { right:Math.sin(angle) * distance, ahead:Math.cos(angle) * distance, aboveFt:(point[2] - own.level) * 100, distance };
}

export function routePhase(path: PathView, time: number) {
  const changed = path.points.map((_,i) => Math.abs(path.theta[i] ?? 0) + Math.abs(path.chi[i] ?? 0) > 1e-7 ? i : -1).filter(i => i >= 0);
  if (!changed.length) return 'Following cleared route';
  const begin = Math.max(0, changed[0] - 1), rejoin = Math.min(path.points.length - 1, changed.at(-1)! + 1);
  if (time < path.times_s[begin]) return 'Approaching the manoeuvre';
  if (time >= path.times_s[rejoin]) return 'Filed route rejoined';
  return 'Following cleared deviation';
}

export function committedTraffic(world: WorldView, ownId: string, time: number) {
  return world.flights.flatMap(flight => {
    const path = flight.trajectory;
    if (flight.id === ownId || !path || !['active','cleared','exited'].includes(flight.status) || time < path.times_s[0] || time > path.times_s.at(-1)!) return [];
    const position = routePosition(path, time);
    return position ? [{ id:flight.id, callsign:flight.callsign, position }] : [];
  });
}

/** A selected older flight must retain its own clearance, rather than the newest solve's. */
export function cockpitContext(state: DemoState, selectedFlight = state.selectedFlight) {
  const inspected = state.inspectionId ? state.history.find(r => r.id === state.inspectionId) : null;
  const deviations = [...state.history].reverse().filter(isDeviating);
  const selected = [...state.history].reverse().find(r => r.flight_id === selectedFlight);
  const record = inspected ?? selected ?? deviations[0] ?? state.record;
  const world = inspected?.snapshot ?? state.world;
  const archived = record ? state.archives[record.id]?.solve : null;
  const solve = archived?.flight_id === record?.flight_id ? archived : state.solve?.flight_id === record?.flight_id ? state.solve : null;
  const flight = world?.flights.find(f => f.id === record?.flight_id) ?? null;
  return { world, deviations, record, solve, flight };
}
