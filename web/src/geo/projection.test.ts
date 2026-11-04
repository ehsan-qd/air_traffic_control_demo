import { describe, expect, it } from 'vitest';
import { greatCircle, pathD, project } from './projection';
describe('spherical projection',()=>{
  it('centres the North Atlantic without flattening great-circle arcs',()=>{
    expect(project(-32,52)[0]).toBeCloseTo(500);expect(project(-32,52)[1]).toBeCloseTo(280);
    expect(greatCircle([-52,50],[-12,50],.5)[1]).toBeGreaterThan(50);
    expect(greatCircle([-52,50],[-12,50],.5)[0]).toBeCloseTo(-32);
  });
  it('handles identical and extremely close endpoints stably',()=>{
    expect(greatCircle([-32,52],[-32,52],.5)).toEqual([-32,52]);
    expect(pathD([[-32,52],[-32.00000001,52]])).not.toMatch(/NaN|Infinity/);
  });
  it('rejects ambiguous antipodal geometry',()=>expect(()=>greatCircle([0,0],[180,0],.5)).toThrow('Antipodal'));
});
