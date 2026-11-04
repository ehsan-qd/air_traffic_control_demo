import { describe, expect, it } from 'vitest';
import type { PathView } from '../api/types.gen';
import { distanceNm, predictedEncounter } from './encounter';

const path = (lat: number, fl: number, start: number): PathView => ({
  points: [[-50, lat, fl], [-40, lat, fl], [-30, lat, fl]], times_s: [start, start + 2400, start + 4800],
  theta: [0, 0, 0], chi: [0, 0, 0],
});

describe('predicted encounter marker', () => {
  it('measures great-circle distance in nautical miles', () => {
    expect(distanceNm({ lon: 0, lat: 0 }, { lon: 0, lat: 1 })).toBeCloseTo(60.04, 1);
  });
  it('finds a same-level encounter inside the lateral minimum and time buffer', () => {
    const encounter = predictedEncounter(path(50, 370, 0), [{ id: 'B', path: path(50.2, 370, 60) }]);
    expect(encounter?.otherId).toBe('B');
    expect(encounter!.distanceNm).toBeLessThan(30);
    expect(encounter!.gapS).toBeLessThanOrEqual(180);
    expect(encounter!.levelFl).toBe(370);
  });
  it('ignores traffic separated vertically or in time', () => {
    expect(predictedEncounter(path(50, 370, 0), [{ id: 'B', path: path(50.2, 390, 60) }])).toBeNull();
    expect(predictedEncounter(path(50, 370, 0), [{ id: 'B', path: path(50.2, 370, 3600) }])).toBeNull();
  });
});
