import { CheckCircle2, Eye, MessageSquare, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { useDemo } from '../store/useDemo';
import { Cockpit } from '../components/Cockpit';
import { cockpitContext } from '../components/cockpitModel';
import { Profile } from '../components/Profile';
import { SolveMetrics } from '../components/Telemetry';
import { resolutionDescription } from '../components/ResolutionFeed';
import { number, utc } from '../components/format';

export function FlightDeck() {
  const state = useDemo();
  const [selectedCockpit, setSelectedCockpit] = useState<string | null>(null);
  const { world, record, solve, flight, deviations } = cockpitContext(state, selectedCockpit ?? state.selectedFlight);
  if (!world) return null;
  const received = record?.verified ? record : null;
  return <div className="deck-screen">
    <div className="screen-intro"><div><span className="eyebrow">THE FLIGHT DECK</span><h2>Through the pilot’s eyes.</h2><p>Follow the independently verified deviation, then rejoin the filed route. The cockpit preview uses this flight’s actual cleared waypoints and times.</p></div><span className="tiny-tag">SYNTHETIC COCKPIT · SIMULATED DATALINK</span></div>
    <section className="cockpit-flight-selector" aria-label="Flights with deconfliction deviations"><div><Eye size={16}/><strong>DECONFLICTED FLIGHTS</strong><span>{deviations.length} changed clearances</span></div><div className="cockpit-flight-list">{deviations.length ? deviations.map(item => <button key={item.id} aria-label={`View ${item.callsign} cockpit`} aria-pressed={record?.id === item.id} disabled={!!state.inspectionId} onClick={() => { setSelectedCockpit(item.flight_id); state.selectFlight(item.flight_id); }}><strong>{item.callsign}</strong><span>{resolutionDescription(item)}</span></button>) : <p>Resolve a crossing request to add its changed clearance here.</p>}</div></section>
    {received?.trajectory ? <Cockpit key={received.id} world={world} record={received} solve={solve} flight={flight} liveAvailable={!state.inspectionId}/> : <section className="panel cockpit-empty"><Eye size={32}/><h3>{record ? 'Flight held. No cockpit clearance.' : 'The next verified deviation appears here.'}</h3><p>{record ? 'This request has not passed independent verification.' : 'File a crossing flight from the control room or start the fleet demo.'}</p></section>}
    <div className="cockpit-followup"><section className="panel cockpit-profile"><div className="panel-heading"><span><ShieldCheck size={15}/> {solve ? 'FILED VS CLEARED ALTITUDE' : 'CLEARED ALTITUDE PROFILE'}</span><span className="tiny-tag">{record?.callsign ?? 'WAITING'}</span></div><Profile solve={solve} flight={flight} record={received}/><div className="cockpit-profile-key"><span><i/> Cleared waypoint levels</span>{solve && <span className="filed"><i/> Filed waypoint levels</span>}</div><p>Climbs and descents come from the cleared trajectory. The final route returns to the nominal exit.</p></section>
      <section className="panel cpdlc-panel"><div className="panel-heading"><span><MessageSquare size={15}/> DATALINK</span><span className="tiny-tag">NO EXTERNAL TRANSMISSION</span></div><div className="cpdlc-display"><div className="cpdlc-top"><span>ATC UPLINK</span><span>{received ? utc(world.start_utc,received.cleared_at_s) : '--:--:--'} Z</span></div><h3>{received?.callsign ?? 'NO NEW CLEARANCE'}</h3>{received ? <>{received.message.map((line,i) => <p className="cpdlc-line" key={i}>{line}</p>)}<div className="cpdlc-received"><CheckCircle2 size={15}/> VERIFIED MESSAGE RECEIVED</div></> : <p className="cpdlc-empty">{record ? 'No verified candidate. Flight held for controller attention.' : 'Waiting for an insertion to pass the independent verifier.'}</p>}<div className="cpdlc-bottom"><span>END OF MESSAGE</span><span>{received ? 'UPLINK' : 'STANDBY'}</span></div></div><div className="cpdlc-note"><ShieldCheck size={18}/><p>A preview never issues a clearance. This message comes from the selected flight’s independently verified path.</p></div></section>
    </div>
    <div className="behind-heading"><span className="eyebrow">BEHIND THE MANOEUVRE</span><p>{received ? `${number(received.metrics.n_frozen)} frozen flights considered · ${number(received.metrics.n_conflict_pairs)} conflicting sub-arc pairs · ${received.attempts.length} recorded attempts` : 'Measured insertion statistics appear after the next solve.'}</p></div><SolveMetrics metrics={record?.metrics}/>
  </div>;
}
