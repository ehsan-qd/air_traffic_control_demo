import type { Flight, Scenario } from './deconfliction'

const points = (y: number, fl: number, slope = 0) =>
  Array.from({ length: 7 }, (_, i) => ({ x: i * 200, y: y + slope * (i * 200 - 600), fl }))
const flight = (id: string, y: number, fl: number, slope = 0, entryMinute = 0): Flight => ({
  id,
  callsign: id,
  points: points(y, fl, slope),
  entryMinute,
})
const incoming = flight('DEMO-101', 0, 350)
const crossing = (id: string, fl: number): Flight => ({
  id,
  callsign: id,
  entryMinute: 30,
  points: Array.from({ length: 7 }, (_, i) => ({ x: 400 + (i * 400) / 6, y: -300 + i * 100, fl })),
})
const exitFlight: Flight = {
  id: 'SYN-026',
  callsign: 'SYN-026',
  entryMinute: 0,
  points: points(0, 350).map((p, i) => ({ ...p, y: 300 * (1 - i / 6) })),
}
const background = [
  flight('SYN-216', -155, 390, 0.03, 8),
  flight('SYN-920', 160, 410, -0.02, -4),
  flight('SYN-007', 95, 310, 0.03, 16),
  flight('SYN-401', -110, 330, 0.02, -12),
]

export const SCENARIOS: Scenario[] = [
  {
    id: 'crossing',
    name: 'Crossing traffic',
    description:
      'An incoming flight crosses an occupied level. A simple vertical intervention can preserve its nominal track.',
    incoming,
    traffic: [crossing('SYN-004', 350), ...background],
  },
  {
    id: 'layered',
    name: 'Layered crossing',
    description:
      'Three flight levels are occupied at the crossing. Explore lateral manoeuvres and the cost of restricting the action space.',
    incoming,
    traffic: [
      crossing('SYN-004', 350),
      crossing('SYN-860', 330),
      crossing('SYN-100', 370),
      ...background.filter((f) => f.id !== 'SYN-401'),
    ],
  },
  {
    id: 'exit',
    name: 'Constrained exit',
    description:
      'A fixed flight occupies the shared exit. The available corridor may contain no feasible insertion; the demonstrator reports that explicitly.',
    incoming,
    traffic: [exitFlight, ...background],
  },
  {
    id: 'clear',
    name: 'Clear track',
    description:
      'No intervention is needed. The nominal trajectory should remain unchanged with zero complexity.',
    incoming,
    traffic: background,
  },
]
