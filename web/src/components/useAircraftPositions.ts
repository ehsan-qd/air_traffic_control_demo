import { useEffect, useRef, useState } from 'react';
import type { FlightView, WorldView } from '../api/types.gen';
import { greatCircle } from '../geo/projection';

/** Interpolate received positions at the simulation's cadence; never extrapolate. */
export function useAircraftPositions(world: WorldView): FlightView[] {
  const [displayed, setDisplayed] = useState(world.flights);
  const latest = useRef(world.flights);
  const clock = useRef(world.sim_time_s);
  const frame = useRef<number | null>(null);
  const transition = useRef({ from:new Map(world.flights.map(f=>[f.id,f])), to:world.flights, start:0, duration:100 });

  useEffect(() => () => {
    if (frame.current != null) cancelAnimationFrame(frame.current);
    frame.current = null;
  }, []);

  useEffect(() => {
    const delta = world.sim_time_s - clock.current;
    clock.current = world.sim_time_s;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduced || delta < 0 || !world.running || world.frozen_for_solve || !world.flights.some(f=>f.status==='active')) {
      if (frame.current != null) cancelAnimationFrame(frame.current);
      frame.current = null;
      latest.current = world.flights;
      setDisplayed(world.flights);
      return;
    }
    if (delta === 0) {
      // UI snapshots arrive more often than the fixed simulation clock advances.
      // Refresh metadata without cancelling an interpolation already in flight.
      transition.current.to = world.flights;
      if (frame.current == null) {
        latest.current = world.flights;
        setDisplayed(world.flights);
      }
      return;
    }
    transition.current = {
      from:new Map(latest.current.map(f=>[f.id,f])),
      to:world.flights,
      start:performance.now(),
      duration:Math.max(80,Math.min(5000,delta/world.speed*1000)),
    };
    if (frame.current != null) return;
    const draw = (now:number) => {
      const {from,to,start,duration} = transition.current;
      const t = Math.min(1,Math.max(0,(now-start)/duration));
      const positions = to.map(f => {
        const old = from.get(f.id);
        if (!old || old.status !== f.status || f.status !== 'active') return f;
        const [lon,lat] = greatCircle([old.position.lon,old.position.lat],[f.position.lon,f.position.lat],t);
        const altitude_m = old.position.altitude_m+(f.position.altitude_m-old.position.altitude_m)*t;
        const turn = ((f.position.heading_deg-old.position.heading_deg+540)%360)-180;
        const heading_deg = (old.position.heading_deg+turn*t+360)%360;
        const ground_speed_ms = old.position.ground_speed_ms+(f.position.ground_speed_ms-old.position.ground_speed_ms)*t;
        return {...f,position:{...f.position,lon,lat,altitude_m,heading_deg,ground_speed_ms}};
      });
      latest.current = positions;
      setDisplayed(positions);
      frame.current = t < 1 ? requestAnimationFrame(draw) : null;
    };
    frame.current = requestAnimationFrame(draw);
  }, [world.flights,world.sim_time_s,world.speed,world.running,world.frozen_for_solve]);
  return displayed;
}
