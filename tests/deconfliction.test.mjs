import test from 'node:test'
import assert from 'node:assert/strict'
import {
  DEFAULT_SETTINGS,
  detectConflicts,
  makeRoute,
  parseScenario,
  positionAt,
  segmentDistance,
  solveScenario,
} from '../src/lib/deconfliction.ts'
import { SCENARIOS } from '../src/lib/scenarios.ts'

test('crossing traffic resolves with a simple level change and fixed endpoints', () => {
  const scenario = structuredClone(SCENARIOS[0])
  const before = JSON.stringify(scenario)
  const result = solveScenario(scenario, DEFAULT_SETTINGS)
  assert.equal(result.status, 'feasible')
  assert.equal(result.conflicts.length, 1)
  assert.equal(result.solution.cost, 2)
  assert.deepEqual(result.solution.points[0], scenario.incoming.points[0])
  assert.deepEqual(result.solution.points.at(-1), scenario.incoming.points.at(-1))
  assert.ok(Math.abs(result.solution.deviation) <= DEFAULT_SETTINGS.schedule)
  assert.deepEqual(detectConflicts(result.solution, scenario.traffic, DEFAULT_SETTINGS), [])
  assert.equal(JSON.stringify(scenario), before)
})

test('layered crossing produces a lateral intervention within the scheduling envelope', () => {
  const r = solveScenario(SCENARIOS[1], DEFAULT_SETTINGS)
  assert.equal(r.status, 'feasible')
  assert.ok(r.solution.points.some((p) => p.y !== 0))
  assert.ok(r.solution.cost > 2)
  assert.ok(Math.abs(r.solution.deviation) <= DEFAULT_SETTINGS.schedule)
  assert.equal(r.remaining.length, 0)
})

test('a zero arrival allowance can render the layered corridor infeasible', () => {
  const r = solveScenario(SCENARIOS[1], { ...DEFAULT_SETTINGS, schedule: 0 })
  assert.equal(r.status, 'infeasible')
  assert.equal(r.solution, null)
})

test('a fixed conflicting exit is reported as infeasible', () => {
  const r = solveScenario(SCENARIOS[2], DEFAULT_SETTINGS)
  assert.equal(r.status, 'infeasible')
  assert.equal(r.solution, null)
  assert.equal(r.firstFeasibleMs, null)
})

test('clear traffic retains the zero-cost nominal route', () => {
  const r = solveScenario(SCENARIOS[3], DEFAULT_SETTINGS)
  assert.equal(r.solution.cost, 0)
  assert.equal(r.solution.deviation, 0)
  assert.deepEqual(r.solution.points, SCENARIOS[3].incoming.points)
})

test('disallowing both interventions cannot resolve the crossing', () => {
  assert.equal(
    solveScenario(SCENARIOS[0], { ...DEFAULT_SETTINGS, lateral: false, vertical: false }).status,
    'infeasible',
  )
})

test('reference search matches independent exhaustive enumeration for a small corridor', () => {
  const incoming = {
    id: 'incoming',
    callsign: 'TEST01',
    entryMinute: 0,
    points: [
      { x: 0, y: 0, fl: 350 },
      { x: 600, y: 0, fl: 350 },
      { x: 1200, y: 0, fl: 350 },
    ],
  }
  const scenario = {
    id: 'small',
    name: 'Small corridor',
    description: 'Exhaustive verification',
    incoming,
    traffic: SCENARIOS[0].traffic,
  }
  const costs = []
  for (const theta of [-1, 0, 1])
    for (const chi of [-1, 0, 1]) {
      const points = [
        incoming.points[0],
        { x: 600, y: theta * DEFAULT_SETTINGS.lateralStep, fl: 350 + chi * 20 },
        incoming.points[2],
      ]
      const nominal = makeRoute(incoming.points, DEFAULT_SETTINGS)
      const route = makeRoute(
        points,
        DEFAULT_SETTINGS,
        0,
        4 * theta ** 2 + 2 * chi ** 2,
        nominal.duration,
      )
      if (
        Math.abs(route.deviation) <= DEFAULT_SETTINGS.schedule &&
        !detectConflicts(route, scenario.traffic, DEFAULT_SETTINGS).length
      )
        costs.push(route.cost)
    }
  const result = solveScenario(scenario, DEFAULT_SETTINGS)
  assert.equal(result.solution?.cost ?? Infinity, Math.min(...costs))
})

test('segment geometry detects interior crossings and collinear gaps', () => {
  const p = (x, y) => ({ x, y, fl: 350 })
  assert.equal(segmentDistance(p(0, 0), p(10, 10), p(0, 10), p(10, 0)), 0)
  assert.equal(segmentDistance(p(0, 0), p(10, 0), p(20, 0), p(30, 0)), 10)
  assert.equal(segmentDistance(p(0, 0), p(10, 0), p(0, 5), p(10, 5)), 5)
})

test('conflict detection includes interval interiors, timing buffer and altitude', () => {
  const p = (x, y, fl = 350) => ({ x, y, fl })
  const settings = { ...DEFAULT_SETTINGS, separation: 10, wind: 0, buffer: 0 }
  const candidate = makeRoute([p(0, 0), p(100, 0)], settings)
  const active = { id: 'fixed', callsign: 'FIXED', entryMinute: 0, points: [p(45, -50), p(55, 50)] }
  assert.equal(detectConflicts(candidate, [active], settings).length, 1)
  assert.equal(
    detectConflicts(
      candidate,
      [{ ...active, points: active.points.map((p) => ({ ...p, fl: 370 })) }],
      settings,
    ).length,
    0,
  )
  const trailing = { ...active, entryMinute: 9, points: [p(0, 0), p(100, 0)] }
  assert.equal(detectConflicts(candidate, [trailing], settings).length, 0)
  assert.equal(detectConflicts(candidate, [trailing], { ...settings, buffer: 10 }).length, 1)
})

test('conflicting active traffic is rejected rather than treated as a valid premise', () => {
  const scenario = structuredClone(SCENARIOS[0])
  scenario.traffic.push({ ...scenario.traffic[0], id: 'duplicate-route' })
  assert.throws(() => solveScenario(scenario, DEFAULT_SETTINGS), /active flights conflict/)
})

test('scenario import round trips and rejects malformed or unbounded inputs', () => {
  assert.deepEqual(parseScenario(JSON.stringify(SCENARIOS[0])), SCENARIOS[0])
  assert.throws(() => parseScenario('{'), /valid JSON/)
  assert.throws(() => parseScenario('{}'), /scenario needs/)
  const s = structuredClone(SCENARIOS[0])
  s.incoming.points[0].fl = 340
  assert.throws(() => parseScenario(JSON.stringify(s)), /legal FL/)
  s.incoming.points[0].fl = 350
  s.incoming.points[1].x = -1
  assert.throws(() => parseScenario(JSON.stringify(s)), /increasing x/)
  s.incoming.points[1].x = 200
  s.traffic[0].id = s.incoming.id
  assert.throws(() => parseScenario(JSON.stringify(s)), /unique/)
})

test('invalid settings are rejected before searching', () => {
  assert.throws(
    () => solveScenario(SCENARIOS[0], { ...DEFAULT_SETTINGS, wind: NaN }),
    /Invalid setting/,
  )
  assert.throws(
    () => solveScenario(SCENARIOS[0], { ...DEFAULT_SETTINGS, buffer: -1 }),
    /Invalid setting/,
  )
})

test('playback respects trajectory bounds and interpolates position', () => {
  const r = makeRoute(SCENARIOS[0].incoming.points, { ...DEFAULT_SETTINGS, wind: 0 }, 10)
  assert.equal(positionAt(r, 9), null)
  assert.equal(positionAt(r, 171), null)
  assert.ok(Math.abs(positionAt(r, 90).x - 600) < 1e-8)
})
