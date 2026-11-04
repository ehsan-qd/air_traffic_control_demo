import type { PathView } from '../api/types.gen';
import { greatCircle } from '../geo/projection';

const EARTH_RADIUS_NM = 3440.065;
const radians = Math.PI / 180;

export interface Encounter { otherId: string; lon: number; lat: number; timeS: number; distanceNm: number; gapS: number; levelFl: number }
interface Sample { lon: number; lat: number; fl: number; t: number }

function samples(path: PathView, perEdge = 12): Sample[] {
  const out: Sample[] = [];
  path.points.forEach((point, i) => {
    if (i === 0) { out.push({ lon: point[0], lat: point[1], fl: point[2], t: path.times_s[0] }); return; }
    const previous = path.points[i - 1], from = path.times_s[i - 1], to = path.times_s[i];
    for (let j = 1; j <= perEdge; j++) {
      const f = j / perEdge, [lon, lat] = greatCircle(previous, point, f);
      out.push({ lon, lat, fl: previous[2] + (point[2] - previous[2]) * f, t: from + (to - from) * f });
    }
  });
  return out;
}

export function distanceNm(a: { lon: number; lat: number }, b: { lon: number; lat: number }) {
  const dLat = (b.lat - a.lat) * radians, dLon = (b.lon - a.lon) * radians;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * radians) * Math.cos(b.lat * radians) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_NM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Display estimate of the worst predicted encounter between the filed route and committed
 * traffic: sampled positions within the lateral minimum, the vertical minimum and the time
 * buffer. The backend verifier stays authoritative; this only places a marker on the map.
 */
export function predictedEncounter(nominal: PathView, others: { id: string; path: PathView }[], lateralNm = 30, bufferS = 180, verticalFt = 1000): Encounter | null {
  const own = samples(nominal);
  let best: Encounter | null = null;
  for (const other of others) {
    if (other.path.times_s.length !== other.path.points.length) continue;
    const theirs = samples(other.path);
    for (const a of own) for (const b of theirs) {
      const gapS = Math.abs(a.t - b.t);
      if (gapS > bufferS || Math.abs(a.fl - b.fl) * 100 >= verticalFt) continue;
      const d = distanceNm(a, b);
      if (d >= lateralNm) continue;
      if (!best || d < best.distanceNm - 1e-6 || (Math.abs(d - best.distanceNm) < 1e-6 && gapS < best.gapS)) {
        best = { otherId: other.id, lon: (a.lon + b.lon) / 2, lat: (a.lat + b.lat) / 2, timeS: a.t, distanceNm: d, gapS, levelFl: Math.round(a.fl) };
      }
    }
  }
  return best;
}

