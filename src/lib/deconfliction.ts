/** Local, finite-corridor reference model. Units: nautical miles, minutes, FL. */
export interface Point {
  x: number
  y: number
  fl: number
}
export interface Flight {
  id: string
  callsign: string
  points: Point[]
  entryMinute: number
}
export interface Scenario {
  id: string
  name: string
  description: string
  incoming: Flight
  traffic: Flight[]
}
export interface Settings {
  lateral: boolean
  vertical: boolean
  lateralStep: number
  separation: number
  buffer: number
  schedule: number
  wind: number
  lateralWeight: number
  verticalWeight: number
}
export const DEFAULT_SETTINGS: Settings = {
  lateral: true,
  vertical: true,
  lateralStep: 60,
  separation: 30,
  buffer: 3,
  schedule: 10,
  wind: 20,
  lateralWeight: 2,
  verticalWeight: 1,
}
export const LEGAL_LEVELS = [310, 330, 350, 370, 390, 410]
export interface Segment {
  a: Point
  b: Point
  start: number
  end: number
}
export interface Route {
  points: Point[]
  segments: Segment[]
  duration: number
  cost: number
  deviation: number
}
export interface Conflict {
  flight: string
  callsign: string
  x: number
  y: number
  minute: number
}
export interface Progress {
  phase: 'encoding' | 'search' | 'validation'
  message: string
  explored?: number
}
export interface SolveResult {
  status: 'feasible' | 'infeasible'
  scenarioId: string
  settings: Settings
  nominal: Route
  solution: Route | null
  conflicts: Conflict[]
  remaining: Conflict[]
  explored: number
  edges: number
  elapsedMs: number
  firstFeasibleMs: number | null
  method: string
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t
export function interpolate(a: Point, b: Point, t: number): Point {
  return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), fl: lerp(a.fl, b.fl, t) }
}
function pointDistance(p: Point, a: Point, b: Point) {
  const dx = b.x - a.x,
    dy = b.y - a.y
  const u = Math.max(
    0,
    Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)),
  )
  return Math.hypot(p.x - a.x - u * dx, p.y - a.y - u * dy)
}
function cross(a: Point, b: Point, c: Point) {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)
}
export function segmentDistance(a: Point, b: Point, c: Point, d: Point): number {
  const abC = cross(a, b, c),
    abD = cross(a, b, d),
    cdA = cross(c, d, a),
    cdB = cross(c, d, b)
  if (
    ((abC > 0 && abD < 0) || (abC < 0 && abD > 0)) &&
    ((cdA > 0 && cdB < 0) || (cdA < 0 && cdB > 0))
  )
    return 0
  return Math.min(
    pointDistance(a, c, d),
    pointDistance(b, c, d),
    pointDistance(c, a, b),
    pointDistance(d, a, b),
  )
}
function closeInSpace(a: Segment, b: Segment, separation: number) {
  // Conservative altitude envelopes over each subinterval; 10 FL = 1,000 ft.
  const verticalGap =
    Math.max(Math.min(a.a.fl, a.b.fl), Math.min(b.a.fl, b.b.fl)) -
    Math.min(Math.max(a.a.fl, a.b.fl), Math.max(b.a.fl, b.b.fl))
  return verticalGap < 10 && segmentDistance(a.a, a.b, b.a, b.b) <= separation
}
function edgeSegments(a: Point, b: Point, settings: Settings, start = 0): Segment[] {
  const segments: Segment[] = []
  let clock = start
  for (let k = 0; k < 8; k++) {
    const p = interpolate(a, b, k / 8),
      q = interpolate(a, b, (k + 1) / 8)
    // An explicit synthetic wind field; this is not ERA5 or an aircraft performance model.
    const tailwind =
      settings.wind *
      (0.55 * Math.sin((p.x + q.x) / 480) + 0.45 * Math.sin((p.fl + q.fl - 660) / 36))
    const speed = 450 + tailwind
    const duration = (Math.hypot(q.x - p.x, q.y - p.y) / speed) * 60
    segments.push({ a: p, b: q, start: clock, end: clock + duration })
    clock += duration
  }
  return segments
}
export function makeRoute(
  points: Point[],
  settings: Settings,
  entryMinute = 0,
  cost = 0,
  nominalDuration = 0,
): Route {
  const segments: Segment[] = []
  let clock = entryMinute
  for (let i = 1; i < points.length; i++) {
    const edge = edgeSegments(points[i - 1], points[i], settings, clock)
    segments.push(...edge)
    clock = edge[edge.length - 1].end
  }
  const duration = clock - entryMinute
  return {
    points,
    segments,
    duration,
    cost,
    deviation: nominalDuration ? duration - nominalDuration : 0,
  }
}
export function positionAt(route: Route, minute: number): Point | null {
  const s = route.segments.find((s) => minute >= s.start && minute <= s.end)
  return s ? interpolate(s.a, s.b, (minute - s.start) / (s.end - s.start || 1)) : null
}
export function detectConflicts(route: Route, traffic: Flight[], settings: Settings): Conflict[] {
  const conflicts: Conflict[] = []
  for (const flight of traffic) {
    const fixed = makeRoute(flight.points, settings, flight.entryMinute)
    const hit = route.segments.find((a) =>
      fixed.segments.some(
        (b) =>
          a.end + settings.buffer > b.start &&
          b.end + settings.buffer > a.start &&
          closeInSpace(a, b, settings.separation),
      ),
    )
    if (hit)
      conflicts.push({
        flight: flight.id,
        callsign: flight.callsign,
        x: (hit.a.x + hit.b.x) / 2,
        y: (hit.a.y + hit.b.y) / 2,
        minute: (hit.start + hit.end) / 2,
      })
  }
  return conflicts
}
export function validateSettings(s: Settings) {
  const bounds: [keyof Settings, number, number][] = [
    ['lateralStep', 30, 90],
    ['separation', 10, 60],
    ['buffer', 0, 10],
    ['schedule', 0, 20],
    ['wind', 0, 60],
    ['lateralWeight', 1, 5],
    ['verticalWeight', 1, 5],
  ]
  for (const [key, min, max] of bounds)
    if (
      typeof s[key] !== 'number' ||
      !Number.isFinite(s[key]) ||
      (s[key] as number) < min ||
      (s[key] as number) > max
    )
      throw new Error(`Invalid setting: ${key}`)
  if (typeof s.lateral !== 'boolean' || typeof s.vertical !== 'boolean')
    throw new Error('Manoeuvre permissions must be true or false.')
}
export function parseScenario(text: string): Scenario {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new Error('The scenario must be valid JSON.')
  }
  if (!raw || typeof raw !== 'object') throw new Error('Expected a scenario object.')
  const s = raw as Scenario
  if (
    !s.id ||
    typeof s.id !== 'string' ||
    typeof s.name !== 'string' ||
    typeof s.description !== 'string' ||
    !Array.isArray(s.traffic) ||
    s.traffic.length > 30
  )
    throw new Error(
      'A scenario needs id, name, description, incoming, and up to 30 traffic flights.',
    )
  const ids = new Set<string>()
  for (const f of [s.incoming, ...s.traffic]) {
    if (
      !f ||
      typeof f.id !== 'string' ||
      !f.id ||
      typeof f.callsign !== 'string' ||
      !Number.isFinite(f.entryMinute) ||
      Math.abs(f.entryMinute) > 360 ||
      !Array.isArray(f.points) ||
      f.points.length < 2 ||
      f.points.length > 10
    )
      throw new Error('Each flight needs id, callsign, entryMinute (−360 to 360), and 2–10 points.')
    if (ids.has(f.id)) throw new Error('Flight IDs must be unique.')
    ids.add(f.id)
    for (const p of f.points)
      if (
        !p ||
        !Number.isFinite(p.x) ||
        !Number.isFinite(p.y) ||
        Math.abs(p.x) > 3000 ||
        Math.abs(p.y) > 1500 ||
        !LEGAL_LEVELS.includes(p.fl)
      )
        throw new Error(
          'Points need x/y in nautical miles and a legal FL: 310, 330, 350, 370, 390 or 410.',
        )
    for (let i = 1; i < f.points.length; i++)
      if (f.points[i].x <= f.points[i - 1].x)
        throw new Error('This eastbound demonstrator requires strictly increasing x coordinates.')
  }
  if (s.incoming.points.length > 7)
    throw new Error('The local reference search supports at most 7 incoming waypoints.')
  return s
}

interface State {
  theta: number
  chi: number
  point: Point
}
interface Edge {
  from: State
  to: State
  duration: number
  cost: number
  blocked: [number, number][]
}
export function solveScenario(
  scenario: Scenario,
  settings: Settings,
  progress?: (p: Progress) => void,
): SolveResult {
  validateSettings(settings)
  parseScenario(JSON.stringify(scenario))
  const started = performance.now()
  progress?.({
    phase: 'encoding',
    message: 'Building the trajectory-local corridor and conflict intervals…',
  })
  // Active-flight consistency is a premise of sequential insertion, not an assumption hidden in the output.
  for (let i = 0; i < scenario.traffic.length; i++) {
    if (
      detectConflicts(
        makeRoute(scenario.traffic[i].points, settings, scenario.traffic[i].entryMinute),
        scenario.traffic.slice(i + 1),
        settings,
      ).length
    )
      throw new Error(
        'The active flights conflict under these settings. Reduce the separation/buffer or load a deconflicted traffic set before inserting a flight.',
      )
  }
  const nominal = makeRoute(scenario.incoming.points, settings, scenario.incoming.entryMinute)
  const fixed = scenario.traffic.flatMap(
    (f) => makeRoute(f.points, settings, f.entryMinute).segments,
  )
  const layers = scenario.incoming.points.map((p, i, points) => {
    const states: State[] = []
    for (const theta of settings.lateral && i > 0 && i < points.length - 1 ? [-1, 0, 1] : [0]) {
      for (const chi of settings.vertical && i > 0 && i < points.length - 1 ? [-1, 0, 1] : [0]) {
        const point = { x: p.x, y: p.y + theta * settings.lateralStep, fl: p.fl + chi * 20 }
        if (LEGAL_LEVELS.includes(point.fl)) states.push({ theta, chi, point })
      }
    }
    return states
  })
  let edgeCount = 0
  const edges = layers.slice(0, -1).map((layer, i) =>
    layer.map((from) =>
      layers[i + 1]
        .map((to) => {
          edgeCount++
          const segments = edgeSegments(from.point, to.point, settings)
          const blocked: [number, number][] = []
          for (const a of segments)
            for (const b of fixed)
              if (closeInSpace(a, b, settings.separation))
                blocked.push([b.start - settings.buffer - a.end, b.end + settings.buffer - a.start])
          blocked.sort((a, b) => a[0] - b[0])
          const merged: [number, number][] = []
          for (const range of blocked) {
            const last = merged[merged.length - 1]
            // Keep touching open intervals separate: their shared boundary is legal.
            if (last && range[0] < last[1]) last[1] = Math.max(last[1], range[1])
            else merged.push([...range])
          }
          return {
            from,
            to,
            duration: segments[segments.length - 1].end,
            cost:
              settings.lateralWeight * (to.theta - from.theta) ** 2 +
              settings.verticalWeight * (to.chi - from.chi) ** 2,
            blocked: merged,
          } as Edge
        })
        .sort((a, b) => a.cost - b.cost),
    ),
  )
  let best: Route | null = null
  let explored = 0
  let firstFeasibleMs: number | null = null
  progress?.({
    phase: 'search',
    message: `Searching ${edgeCount} corridor edges with fixed active traffic…`,
    explored,
  })
  const visit = (layer: number, stateIndex: number, clock: number, cost: number, path: Point[]) => {
    explored++
    if (explored % 2000 === 0)
      progress?.({
        phase: 'search',
        message: `${explored.toLocaleString()} partial paths examined`,
        explored,
      })
    if (best && cost > best.cost) return
    if (clock - scenario.incoming.entryMinute > nominal.duration + settings.schedule + 1e-8) return
    if (layer === layers.length - 1) {
      const delta = clock - scenario.incoming.entryMinute - nominal.duration
      if (Math.abs(delta) > settings.schedule + 1e-8) return
      if (
        !best ||
        cost < best.cost ||
        (cost === best.cost && Math.abs(delta) < Math.abs(best.deviation))
      ) {
        best = makeRoute(path, settings, scenario.incoming.entryMinute, cost, nominal.duration)
        firstFeasibleMs ??= performance.now() - started
      }
      return
    }
    for (const edge of edges[layer][stateIndex]) {
      if (edge.blocked.some(([lo, hi]) => clock > lo + 1e-9 && clock < hi - 1e-9)) continue
      visit(
        layer + 1,
        layers[layer + 1].indexOf(edge.to),
        clock + edge.duration,
        cost + edge.cost,
        [...path, edge.to.point],
      )
    }
  }
  visit(0, 0, scenario.incoming.entryMinute, 0, [scenario.incoming.points[0]])
  progress?.({
    phase: 'validation',
    message: 'Checking the selected route against every fixed flight…',
    explored,
  })
  const remaining = best ? detectConflicts(best, scenario.traffic, settings) : []
  if (remaining.length)
    throw new Error('Independent route validation failed. No resolution has been accepted.')
  return {
    status: best ? 'feasible' : 'infeasible',
    scenarioId: scenario.id,
    settings: { ...settings },
    nominal,
    solution: best,
    conflicts: detectConflicts(nominal, scenario.traffic, settings),
    remaining,
    explored,
    edges: edgeCount,
    elapsedMs: performance.now() - started,
    firstFeasibleMs,
    method: 'Finite-corridor reference search',
  }
}
