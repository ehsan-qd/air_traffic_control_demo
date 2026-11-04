'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import AirspaceView, { AltitudeProfile } from './AirspaceView'
import { detectConflicts, makeRoute, parseScenario, type Settings } from '@/lib/deconfliction'
import { SCENARIOS } from '@/lib/scenarios'
import {
  cancelSolve,
  changeSettings,
  downloadJson,
  selectScenario,
  solve,
  useDemo,
} from '@/lib/demoStore'

function Range({
  label,
  value,
  min,
  max,
  step = 1,
  unit,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step?: number
  unit: string
  onChange: (n: number) => void
}) {
  return (
    <label className="control-range">
      <span>
        {label}
        <strong>
          {value} {unit}
        </strong>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  )
}

export default function DeconflictionDemo({ standalone = false }: { standalone?: boolean }) {
  const { scenario, settings, result, progress, running, error } = useDemo()
  const [tab, setTab] = useState<'airspace' | 'plan' | 'model'>('airspace')
  const [view, setView] = useState<'nominal' | 'resolved'>('resolved')
  const [minute, setMinute] = useState(80)
  const [playing, setPlaying] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const nominal = useMemo(
    () => makeRoute(scenario.incoming.points, settings, scenario.incoming.entryMinute),
    [scenario, settings],
  )
  const conflicts = useMemo(
    () => detectConflicts(nominal, scenario.traffic, settings),
    [nominal, scenario, settings],
  )
  const resolved = view === 'resolved' && !!result?.solution
  const route = resolved && result?.solution ? result.solution : nominal
  const startTime = Math.min(0, scenario.incoming.entryMinute)
  const endTime = Math.ceil(
    Math.max(
      scenario.incoming.entryMinute + nominal.duration + 10,
      ...scenario.traffic.map((f) => f.entryMinute + makeRoute(f.points, settings).duration),
    ),
  )
  const displayMinute = Math.max(startTime, Math.min(endTime, minute))
  useEffect(() => {
    if (!playing) return
    const interval = setInterval(
      () => setMinute((t) => (t >= endTime ? startTime : Math.min(endTime, t + 1))),
      80,
    )
    return () => clearInterval(interval)
  }, [playing, endTime, startTime])
  const set = (patch: Partial<Settings>) => {
    setPlaying(false)
    changeSettings({ ...settings, ...patch })
  }
  return (
    <div className={`demo-workspace ${standalone ? 'standalone-workspace' : ''}`}>
      <div className="demo-heading">
        <div>
          <div className="eyebrow">PROBABILISTIC AIR TRAFFIC MANAGEMENT</div>
          <h2>
            <span className="orbit-trademark">ORBIT</span> Deconfliction Lab
          </h2>
          <p>Insert one flight. Preserve the flow.</p>
        </div>
        <div className="demo-heading-actions">
          <span className="mode-label">
            <i />
            Local reference model
          </span>
          {!standalone && (
            <a className="quiet-button" href="/demo" target="_blank" rel="noreferrer">
              Open full screen ↗
            </a>
          )}
        </div>
      </div>
      <div className="demo-body">
        <aside className="demo-controls dashboard-scroll">
          <div className="control-section">
            <div className="eyebrow">01 / TRAFFIC SCENARIO</div>
            <label htmlFor="scenario" className="sr-only">
              Traffic scenario
            </label>
            <select
              id="scenario"
              value={SCENARIOS.some((s) => s.id === scenario.id) ? scenario.id : 'custom'}
              onChange={(e) => {
                const s = SCENARIOS.find((s) => s.id === e.target.value)
                if (s) {
                  selectScenario(s)
                  setPlaying(false)
                  setMinute(80)
                  setUploadError(null)
                }
              }}
            >
              {SCENARIOS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
              {!SCENARIOS.some((s) => s.id === scenario.id) && (
                <option value="custom">{scenario.name}</option>
              )}
            </select>
            <p className="control-description">{scenario.description}</p>
            <div className="scenario-summary">
              <span>
                <strong>{scenario.traffic.length}</strong> fixed flights
              </span>
              <span>
                <strong>1</strong> incoming
              </span>
            </div>
            <div className="upload-actions">
              <button onClick={() => fileInput.current?.click()}>Upload JSON ↑</button>
              <button onClick={() => downloadJson(scenario, `${scenario.id}-scenario.json`)}>
                Download scenario ↓
              </button>
            </div>
            <input
              ref={fileInput}
              type="file"
              accept=".json,application/json"
              className="sr-only"
              aria-label="Upload traffic scenario JSON"
              onChange={async (e) => {
                const file = e.target.files?.[0]
                if (!file) return
                try {
                  if (file.size > 250_000)
                    throw new Error('Please use a scenario file smaller than 250 KB.')
                  const s = parseScenario(await file.text())
                  s.id = `custom-${s.id}`
                  selectScenario(s)
                  setMinute(Math.max(0, s.incoming.entryMinute + 60))
                  setPlaying(false)
                  setUploadError(null)
                } catch (err) {
                  setUploadError(err instanceof Error ? err.message : 'Could not load scenario.')
                }
                e.target.value = ''
              }}
            />
            {uploadError && (
              <p className="error-message" role="alert">
                {uploadError}
              </p>
            )}
          </div>
          <div className="control-section">
            <div className="eyebrow">02 / PERMITTED INTERVENTIONS</div>
            <label className="toggle-control">
              <span>
                Flight-level changes
                <small>J = {settings.vertical ? 1 : 0} · adjacent legal levels</small>
              </span>
              <input
                type="checkbox"
                checked={settings.vertical}
                onChange={(e) => set({ vertical: e.target.checked })}
              />
            </label>
            <label className="toggle-control">
              <span>
                Lateral deviations
                <small>K = {settings.lateral ? 1 : 0} · trajectory-local corridor</small>
              </span>
              <input
                type="checkbox"
                checked={settings.lateral}
                onChange={(e) => set({ lateral: e.target.checked })}
              />
            </label>
            <Range
              label="Lateral step"
              value={settings.lateralStep}
              min={30}
              max={90}
              step={5}
              unit="NM"
              onChange={(n) => set({ lateralStep: n })}
            />
            <Range
              label="Arrival allowance"
              value={settings.schedule}
              min={0}
              max={20}
              unit="min ±"
              onChange={(n) => set({ schedule: n })}
            />
          </div>
          <details className="control-section advanced-controls">
            <summary>Separation & model settings</summary>
            <Range
              label="Horizontal separation"
              value={settings.separation}
              min={10}
              max={60}
              step={5}
              unit="NM"
              onChange={(n) => set({ separation: n })}
            />
            <Range
              label="Time buffer"
              value={settings.buffer}
              min={0}
              max={10}
              unit="min"
              onChange={(n) => set({ buffer: n })}
            />
            <Range
              label="Synthetic wind amplitude"
              value={settings.wind}
              min={0}
              max={60}
              step={5}
              unit="kt"
              onChange={(n) => set({ wind: n })}
            />
            <Range
              label="Lateral weight"
              value={settings.lateralWeight}
              min={1}
              max={5}
              unit=""
              onChange={(n) => set({ lateralWeight: n })}
            />
            <Range
              label="Vertical weight"
              value={settings.verticalWeight}
              min={1}
              max={5}
              unit=""
              onChange={(n) => set({ verticalWeight: n })}
            />
            <button
              className="text-action"
              onClick={() =>
                set({
                  lateral: true,
                  vertical: true,
                  lateralStep: 60,
                  separation: 30,
                  buffer: 3,
                  schedule: 10,
                  wind: 20,
                  lateralWeight: 2,
                  verticalWeight: 1,
                })
              }
            >
              Restore defaults
            </button>
          </details>
          <div className="solve-actions">
            <button
              className="primary-button"
              onClick={() => {
                setView('resolved')
                setPlaying(false)
                running ? cancelSolve() : solve()
              }}
            >
              {running ? 'Cancel search' : result ? 'Run again ↗' : 'Find a resolution ↗'}
            </button>
            <p>Active flight plans remain fixed.</p>
          </div>
        </aside>
        <section className="demo-main">
          <div className="demo-tabs" role="tablist" aria-label="Demonstrator views">
            {(['airspace', 'plan', 'model'] as const).map((t) => (
              <button
                key={t}
                id={`tab-${t}`}
                role="tab"
                aria-controls={`panel-${t}`}
                aria-selected={tab === t}
                onClick={() => setTab(t)}
              >
                {t === 'airspace'
                  ? 'Airspace'
                  : t === 'plan'
                    ? 'Flight plan'
                    : 'Model & provenance'}
              </button>
            ))}
            <span className="synthetic-label">SYNTHETIC SCENARIO</span>
          </div>
          <div
            className="demo-main-scroll dashboard-scroll"
            id={`panel-${tab}`}
            role="tabpanel"
            aria-labelledby={`tab-${tab}`}
          >
            <div className="demo-status" aria-live="polite">
              <span
                className={`status-dot ${error || result?.status === 'infeasible' ? 'warning' : result?.solution ? 'success' : 'pending'}`}
              />
              <div>
                <strong>
                  {running
                    ? 'Searching the local corridor'
                    : error
                      ? 'Scenario needs attention'
                      : result?.status === 'infeasible'
                        ? 'No feasible insertion in this corridor'
                        : result?.solution
                          ? 'Feasible insertion found'
                          : `${conflicts.length} predicted ${conflicts.length === 1 ? 'conflict' : 'conflicts'} on the nominal route`}
                </strong>
                <p>
                  {running
                    ? progress?.message
                    : (error ??
                      (result?.status === 'infeasible'
                        ? 'The fixed endpoints, available actions and arrival allowance cannot be satisfied together. Review the scenario or constraints.'
                        : result?.solution
                          ? `Complexity ${result.solution.cost} · arrival ${result.solution.deviation >= 0 ? '+' : ''}${result.solution.deviation.toFixed(2)} min · ${result.elapsedMs.toFixed(1)} ms measured · validated in the local model`
                          : 'Configure the permitted actions, then search for the simplest valid intervention.'))}
                </p>
              </div>
            </div>
            {tab === 'airspace' && (
              <>
                <div className="map-toolbar">
                  <div className="map-legend">
                    <span>
                      <i className="legend-fixed" />
                      Fixed traffic
                    </span>
                    <span>
                      <i className="legend-nominal" />
                      Nominal
                    </span>
                    <span>
                      <i className="legend-resolved" />
                      Resolution
                    </span>
                  </div>
                  <div className="segmented-control">
                    <button aria-pressed={!resolved} onClick={() => setView('nominal')}>
                      Nominal
                    </button>
                    <button
                      aria-pressed={resolved}
                      disabled={!result?.solution}
                      onClick={() => setView('resolved')}
                    >
                      Resolved
                    </button>
                  </div>
                </div>
                <div className="map-frame">
                  <AirspaceView
                    scenario={scenario}
                    settings={settings}
                    route={route}
                    conflicts={conflicts}
                    minute={displayMinute}
                    resolved={resolved}
                  />
                </div>
                <div className="playback-controls">
                  <button
                    onClick={() => setPlaying((p) => !p)}
                    aria-label={playing ? 'Pause playback' : 'Play playback'}
                  >
                    {playing ? 'Ⅱ' : '▶'}
                  </button>
                  <button
                    onClick={() => {
                      setPlaying(false)
                      setMinute(startTime)
                    }}
                    aria-label="Reset playback"
                  >
                    ↺
                  </button>
                  <label className="sr-only" htmlFor="playback">
                    Playback time in minutes
                  </label>
                  <input
                    id="playback"
                    type="range"
                    min={startTime}
                    max={endTime}
                    value={displayMinute}
                    onChange={(e) => {
                      setMinute(Number(e.target.value))
                      setPlaying(false)
                    }}
                  />
                  <output>
                    T{displayMinute >= 0 ? '+' : ''}
                    {String(Math.floor(displayMinute)).padStart(3, '0')} min
                  </output>
                </div>
                <div className="profile-heading">
                  <span className="eyebrow">INCOMING FLIGHT / VERTICAL PROFILE</span>
                  <span>FL = hundreds of feet</span>
                </div>
                <AltitudeProfile nominal={nominal} route={route} />
                <div className="demo-metrics">
                  <div>
                    <span>Conflict flights</span>
                    <strong>
                      {result?.solution ? `0 / ${result.conflicts.length}` : conflicts.length}
                      <small>{result?.solution ? 'remaining / nominal' : 'nominal'}</small>
                    </strong>
                  </div>
                  <div>
                    <span>Intervention cost</span>
                    <strong>
                      {result?.solution?.cost ?? '—'}
                      <small>weighted complexity</small>
                    </strong>
                  </div>
                  <div>
                    <span>Arrival deviation</span>
                    <strong>
                      {result?.solution
                        ? `${result.solution.deviation >= 0 ? '+' : ''}${result.solution.deviation.toFixed(2)}`
                        : '—'}
                      <small>minutes · allowance ±{settings.schedule}</small>
                    </strong>
                  </div>
                  <div>
                    <span>Active flights changed</span>
                    <strong>
                      0<small>first-filed, first-served</small>
                    </strong>
                  </div>
                </div>
              </>
            )}
            {tab === 'plan' && (
              <div className="flight-plan-panel">
                <div className="panel-intro">
                  <h3>{scenario.incoming.callsign} · waypoint instructions</h3>
                  <p>
                    {result?.solution
                      ? 'Selected resolution compared with the nominal plan.'
                      : 'Nominal plan. Run the search to produce a resolution.'}
                  </p>
                </div>
                <div className="table-scroll">
                  <table className="nats-table">
                    <thead>
                      <tr>
                        <th>Waypoint</th>
                        <th>Along track</th>
                        <th>Nominal FL</th>
                        <th>Selected FL</th>
                        <th>Lateral offset</th>
                        <th>Instruction</th>
                      </tr>
                    </thead>
                    <tbody>
                      {route.points.map((p, i) => {
                        const prev = route.points[i - 1]
                        const offset = p.y - nominal.points[i].y
                        const changedLevel = prev && p.fl !== prev.fl,
                          changedLateral =
                            prev && Math.abs(offset - (prev.y - nominal.points[i - 1].y)) > 0.1
                        return (
                          <tr key={i}>
                            <td>W{i}</td>
                            <td>{Math.round(p.x)} NM</td>
                            <td>FL{nominal.points[i].fl}</td>
                            <td className={p.fl !== nominal.points[i].fl ? 'changed-cell' : ''}>
                              FL{p.fl}
                            </td>
                            <td>
                              {offset > 0 ? '+' : ''}
                              {Math.round(offset)} NM
                            </td>
                            <td>
                              {i === 0
                                ? 'Enter at nominal profile'
                                : [
                                    changedLevel ? (p.fl > prev.fl ? 'Climb' : 'Descend') : '',
                                    changedLateral ? 'Adjust lateral track' : '',
                                  ]
                                    .filter(Boolean)
                                    .join(' · ') || 'Maintain'}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
                <h3 className="traffic-heading">
                  Fixed traffic · {scenario.traffic.length} flights
                </h3>
                <div className="fixed-flight-list">
                  {scenario.traffic.map((f) => (
                    <div key={f.id}>
                      <strong>{f.callsign}</strong>
                      <span>FL{f.points[0].fl}</span>
                      <span>
                        {conflicts.some((c) => c.flight === f.id)
                          ? 'Conflicts with nominal route'
                          : 'Clear of nominal route'}
                      </span>
                      <span>Locked</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {tab === 'model' && (
              <div className="model-panel">
                <div className="panel-intro">
                  <h3>Research formulation, transparent local execution</h3>
                  <p>
                    The supplied papers motivate the operational model. This browser demonstrator
                    uses a bounded reference search; ORBIT hardware is not connected.
                  </p>
                </div>
                <div className="model-grid">
                  <div>
                    <span className="eyebrow">PRIMARY OBJECTIVE</span>
                    <div className="model-formula">C = Σ [wθ(Δθ)² + wχ(Δχ)²]</div>
                    <p>
                      Minimise changes in lateral and vertical instructions. Arrival deviation is a
                      constraint, rather than the quantity being minimised.
                    </p>
                  </div>
                  <div>
                    <span className="eyebrow">FEASIBILITY ENVELOPE</span>
                    <ul>
                      <li>Fixed nominal entry and exit points</li>
                      <li>Legal levels FL310, 330, 350, 370, 390, 410</li>
                      <li>Horizontal separation {settings.separation} NM</li>
                      <li>Vertical separation 1,000 ft in the local model</li>
                      <li>Buffered occupancy intervals: {settings.buffer} minutes</li>
                      <li>Arrival within ±{settings.schedule} minutes of nominal</li>
                    </ul>
                  </div>
                </div>
                <div className="model-note">
                  <strong>Local model assumptions</strong>
                  <p>
                    Eastbound routes use a local plane in nautical miles, eight subintervals per
                    edge, 450 kt nominal speed, and a synthetic wind field. Altitude envelopes are
                    checked conservatively. Aircraft dynamics, real weather, genuine traffic data
                    and the papers’ full QUBO slack-variable encoding are outside this first
                    demonstrator.
                  </p>
                </div>
                <div className="paper-links">
                  <a href="/api/papers/sesar" target="_blank" rel="noreferrer">
                    Read the SESAR paper ↗
                  </a>
                  <a href="/api/papers/formulation" target="_blank" rel="noreferrer">
                    Read the formulation notes ↗
                  </a>
                </div>
              </div>
            )}
          </div>
          <div className="demo-footer">
            <span>
              {result
                ? `${result.method} · ${result.edges} corridor edges`
                : 'Reference search · reproducible synthetic scenarios'}
            </span>
            <button
              disabled={!result}
              onClick={() =>
                result &&
                downloadJson(
                  { scenario, ...result, exportedAt: new Date().toISOString() },
                  `${scenario.id}-resolution.json`,
                )
              }
            >
              Export result ↓
            </button>
          </div>
        </section>
      </div>
    </div>
  )
}
