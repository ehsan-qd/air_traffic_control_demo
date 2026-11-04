'use client'

import {
  makeRoute,
  positionAt,
  type Conflict,
  type Point,
  type Route,
  type Scenario,
  type Settings,
} from '@/lib/deconfliction'

export default function AirspaceView({
  scenario,
  settings,
  route,
  conflicts,
  minute,
  resolved,
}: {
  scenario: Scenario
  settings: Settings
  route: Route
  conflicts: Conflict[]
  minute: number
  resolved: boolean
}) {
  const all = [
    ...scenario.incoming.points,
    ...scenario.traffic.flatMap((f) => f.points),
    ...route.points,
  ]
  const minX = Math.min(...all.map((p) => p.x)),
    maxX = Math.max(...all.map((p) => p.x))
  const extent = Math.max(350, ...all.map((p) => Math.abs(p.y)))
  const x = (n: number) => 68 + ((n - minX) / (maxX - minX || 1)) * 964
  const y = (n: number) => 221 - (n / extent) * 165
  const path = (points: Point[]) =>
    points.map((p, i) => `${i ? 'L' : 'M'}${x(p.x)},${y(p.y)}`).join(' ')
  const incoming = positionAt(route, minute)
  return (
    <svg
      viewBox="0 0 1100 440"
      role="img"
      aria-label={`Schematic airspace showing ${scenario.traffic.length} fixed flights and the ${resolved ? 'resolved' : 'nominal'} incoming route`}
      className="airspace-svg"
    >
      <defs>
        <pattern id="radar-grid" width="24" height="24" patternUnits="userSpaceOnUse">
          <path d="M24 0H0V24" fill="none" stroke="#89c2d9" strokeOpacity=".045" />
        </pattern>
        <radialGradient id="radar-glow">
          <stop stopColor="#89c2d9" stopOpacity=".055" />
          <stop offset="1" stopColor="#89c2d9" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="1100" height="440" fill="#080c10" />
      <rect width="1100" height="440" fill="url(#radar-grid)" />
      <ellipse cx="560" cy="220" rx="460" ry="200" fill="url(#radar-glow)" />
      <text x="28" y="28" fill="#8c9ba3" fontSize="10" letterSpacing="2">
        NORTH ATLANTIC · SCHEMATIC CORRIDOR
      </text>
      <text x="1072" y="28" textAnchor="end" fill="#53636d" fontSize="10">
        LOCAL DISTANCES IN NM
      </text>
      {[-1, 0, 1].map((k) => (
        <g key={k}>
          <line
            x1="68"
            x2="1032"
            y1={y(k * extent * 0.7)}
            y2={y(k * extent * 0.7)}
            stroke="#89c2d9"
            strokeOpacity=".1"
            strokeDasharray="4 7"
          />
          <text x="20" y={y(k * extent * 0.7) + 4} fill="#53636d" fontSize="9">
            {Math.round(k * extent * 0.7)}
          </text>
        </g>
      ))}
      {Array.from({ length: 7 }, (_, i) => (
        <g key={i}>
          <line
            x1={68 + (i * 964) / 6}
            x2={68 + (i * 964) / 6}
            y1="48"
            y2="389"
            stroke="#89c2d9"
            strokeOpacity=".07"
          />
          <text x={68 + (i * 964) / 6} y="416" textAnchor="middle" fill="#53636d" fontSize="10">
            {Math.round(minX + (i * (maxX - minX)) / 6)} NM
          </text>
        </g>
      ))}
      {scenario.traffic.map((f) => {
        const fixed = makeRoute(f.points, settings, f.entryMinute)
        const p = positionAt(fixed, minute)
        const nominalConflict = conflicts.some((c) => c.flight === f.id)
        const inConflict = nominalConflict && !resolved
        const group = p
          ? scenario.traffic.filter((other) => {
              const q = positionAt(makeRoute(other.points, settings, other.entryMinute), minute)
              return q && Math.hypot(q.x - p.x, q.y - p.y) < 10
            })
          : []
        const showLabel = group[0]?.id === f.id
        return (
          <g key={f.id}>
            <path
              d={path(f.points)}
              fill="none"
              stroke={inConflict ? '#a0786c' : '#516571'}
              strokeWidth="1.4"
              opacity=".55"
            >
              <title>{`${f.callsign} · fixed · FL${f.points[0].fl}`}</title>
            </path>
            {p && (
              <g transform={`translate(${x(p.x)},${y(p.y)})`}>
                <path d="M-5,-4L7,0L-5,4L-2,0Z" fill={inConflict ? '#d19a87' : '#718895'} />
                {showLabel && (
                  <>
                    <text x="10" y="-20" fill="#8f9fa8" fontSize="9">
                      {f.callsign}
                      {group.length > 1 ? ` +${group.length - 1}` : ''}
                    </text>
                    <text x="10" y="-8" fill="#5a6c77" fontSize="8">
                      FL
                      {group
                        .map((other) =>
                          Math.round(
                            positionAt(
                              makeRoute(other.points, settings, other.entryMinute),
                              minute,
                            )!.fl,
                          ),
                        )
                        .sort((a, b) => a - b)
                        .join(' / ')}
                    </text>
                  </>
                )}
              </g>
            )}
          </g>
        )
      })}
      <path
        d={path(scenario.incoming.points)}
        fill="none"
        stroke="#c6a477"
        strokeWidth="1.6"
        strokeDasharray="6 6"
        opacity={resolved ? 0.35 : 0.85}
      />
      {!resolved &&
        conflicts.map((c) => (
          <g key={c.flight}>
            <circle
              cx={x(c.x)}
              cy={y(c.y)}
              r="22"
              fill="#ef796c"
              fillOpacity=".06"
              stroke="#ef796c"
              strokeOpacity=".5"
              strokeDasharray="3 4"
            />
            <path
              d={`M${x(c.x) - 4},${y(c.y) - 4}l8,8m0,-8l-8,8`}
              stroke="#ef796c"
              strokeWidth="1.5"
            />
          </g>
        ))}
      {resolved && <path d={path(route.points)} fill="none" stroke="#89c2d9" strokeWidth="2.8" />}
      {route.points.map((p, i) => (
        <g key={i}>
          <circle
            cx={x(p.x)}
            cy={y(p.y)}
            r={i === 0 || i === route.points.length - 1 ? 4 : 3}
            fill="#080c10"
            stroke={resolved ? '#89c2d9' : '#c6a477'}
            strokeWidth="1.4"
          />
          <text x={x(p.x)} y={y(p.y) + 19} textAnchor="middle" fill="#6a7e89" fontSize="8">
            W{i}
          </text>
        </g>
      ))}
      {incoming && (
        <g transform={`translate(${x(incoming.x)},${y(incoming.y)})`}>
          <circle r="15" fill="#89c2d9" opacity=".07" />
          <path d="M-8,-6L11,0L-8,6L-3,0Z" fill="#bcecec" />
          <text x="13" y="18" fill="#bcecec" fontSize="11" fontWeight="600">
            {scenario.incoming.callsign}
          </text>
          <text x="13" y="31" fill="#89c2d9" fontSize="9">
            FL{Math.round(incoming.fl)} · incoming
          </text>
        </g>
      )}
      <text x="68" y="391" fill="#667b87" fontSize="9">
        NAT ENTRY
      </text>
      <text x="1032" y="391" textAnchor="end" fill="#667b87" fontSize="9">
        NAT EXIT
      </text>
    </svg>
  )
}

export function AltitudeProfile({ nominal, route }: { nominal: Route; route: Route }) {
  const minX = nominal.points[0].x,
    span = nominal.points[nominal.points.length - 1].x - minX
  const x = (p: Point) => 58 + ((p.x - minX) / span) * 974
  const y = (fl: number) => 120 - ((fl - 310) / 100) * 94
  return (
    <svg
      viewBox="0 0 1100 155"
      className="altitude-svg"
      role="img"
      aria-label="Incoming flight level profile"
    >
      {[310, 330, 350, 370, 390, 410].map((fl) => (
        <g key={fl}>
          <line x1="58" x2="1032" y1={y(fl)} y2={y(fl)} stroke="#ffffff" strokeOpacity=".06" />
          <text x="12" y={y(fl) + 3} fill="#5f737f" fontSize="9">
            FL{fl}
          </text>
        </g>
      ))}
      <path
        d={nominal.points.map((p, i) => `${i ? 'L' : 'M'}${x(p)},${y(p.fl)}`).join(' ')}
        stroke="#c6a477"
        strokeOpacity=".5"
        strokeDasharray="5 5"
        fill="none"
      />
      <path
        d={route.points.map((p, i) => `${i ? 'L' : 'M'}${x(p)},${y(p.fl)}`).join(' ')}
        stroke="#89c2d9"
        strokeWidth="2"
        fill="none"
      />
      {route.points.map((p, i) => (
        <g key={i}>
          <circle cx={x(p)} cy={y(p.fl)} r="3" fill="#89c2d9" />
          <text x={x(p)} y="143" fill="#5f737f" fontSize="9" textAnchor="middle">
            W{i}
          </text>
        </g>
      ))}
    </svg>
  )
}
