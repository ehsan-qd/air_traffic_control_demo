import { useMemo } from 'react';
import { ArrowRight, LoaderCircle, Presentation } from 'lucide-react';
import { Airspace, type MapZoom } from '../components/Airspace';
import { project } from '../geo/projection';
import { useDemo } from '../store/useDemo';
import { simpleFixes, STUDY } from './StudyFigures';
import type { StudyMode } from './useStudyLoop';
import './story.css';

export function Intro({ onStart, disabled }: { onStart: (mode: StudyMode) => void; disabled: boolean }) {
  const { world, selectFlight } = useDemo();
  const zoom = useMemo<MapZoom | null>(() => {
    const xs = world?.tracks.flatMap(t => t.points.map(p => project(p[0], p[1])[0])) ?? [];
    if (!xs.length) return null;
    // Push the traffic towards the right so the headline sits over open ocean.
    const w = 760, centre = (Math.min(...xs) + Math.max(...xs)) / 2 - 150;
    return { w, x: Math.max(0, Math.min(1000 - w, centre - w / 2)), y: 40 };
  }, [world?.scenario, world?.seed, world?.tracks]); // eslint-disable-line react-hooks/exhaustive-deps
  return <section className="intro" aria-label="Demonstrator overview">
    <div className="intro-map" aria-hidden="true">{world && <Airspace world={world} solve={null} record={null} selected={null} onSelect={selectFlight} zoom={zoom} initialLabels={false}/>}</div>
    <div className="intro-copy">
      <span className="story-kicker">PAM-I · Probabilistic Air-traffic Modelling Initiative</span>
      <h1>Insert a flight.<br/>Don’t rock the boat.</h1>
      <p>Real-time en-route deconfliction that leaves every cleared flight untouched and keeps the newcomer on schedule.</p>
      <div className="intro-actions">
        <button className="intro-primary" disabled={disabled} onClick={() => onStart('present')}><Presentation size={17}/>Start the walkthrough<ArrowRight size={17}/></button>
      </div>
      {!world && <p className="intro-connecting"><LoaderCircle size={15}/>Loading the simulation…</p>}
    </div>
    <div className="intro-proof">
      <span className="intro-proof-tag"><b className="tag-study">STUDY</b>ORBIT hardware · {STUDY.scenarios} Atlantic scenarios</span>
      <div><strong>≈{STUDY.timing[0].seconds} s</strong><span>to the first safe route</span></div>
      <div><strong>{simpleFixes} / {STUDY.scenarios}</strong><span>fixed with at most one level change and one offset</span></div>
      <div><strong>±{STUDY.arrival.envelopeMin} min</strong><span>arrival envelope held throughout</span></div>
    </div>
    <p className="intro-credit">Research by the University of Oxford, Quantum Dice and NATS Project Bluebird · Synthetic traffic in this demonstrator</p>
  </section>;
}
