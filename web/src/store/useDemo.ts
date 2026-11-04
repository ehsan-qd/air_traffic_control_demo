import { create } from 'zustand';
import type { InsertionRecord, ProgressView, ServerEvent, SolveView, StepView, WorldView } from '../api/types.gen';

export type Screen = 'control' | 'inside' | 'deck';
/** `live`: the local backend. `replay`: the recorded walkthrough run, played in the browser. */
export type Source = 'live' | 'replay';
export interface SolveArchive { solve: SolveView | null; trace: ProgressView[]; captures: ProgressView[]; steps: StepView[] }
export interface DemoState extends SolveArchive {
  world: WorldView | null;
  history: InsertionRecord[];
  archives: Record<string, SolveArchive>;
  record: InsertionRecord | null;
  inspectionId: string | null;
  selectedFlight: string | null;
  screen: Screen;
  connection: 'connecting' | 'online' | 'offline';
  error: string | null;
  warmupMs: number | null;
  source: Source;
  setSource: (source: Source) => void;
  receive: (event: ServerEvent) => void;
  setScreen: (screen: Screen) => void;
  selectFlight: (id: string) => void;
  inspect: (id: string | null) => void;
}
const emptyArchive = (): SolveArchive => ({ solve: null, trace: [], captures: [], steps: [] });
export const useDemo = create<DemoState>((set) => ({
  ...emptyArchive(), world: null, history: [], archives: {}, record: null, inspectionId: null,
  selectedFlight: null, screen: 'control', connection: 'connecting', error: null, warmupMs: null, source: 'replay',
  // Switching source drops everything received from the other one.
  setSource: (source) => set({ ...emptyArchive(), source, world: null, history: [], archives: {}, record: null, inspectionId: null, selectedFlight: null, error: null }),
  setScreen: (screen) => set({ screen }), selectFlight: (selectedFlight) => set({ selectedFlight }),
  inspect: (inspectionId) => set({ inspectionId }),
  receive: (event) => set((state) => {
    const d = event.data;
    const next: Partial<DemoState> = {};
    if (d.world) next.world = d.world;
    if (d.jit_startup_ms != null) next.warmupMs = d.jit_startup_ms;
    if (event.type === 'hello') {
      Object.assign(next, emptyArchive(), { history: d.history ?? [], record: d.history?.at(-1) ?? null, error: null });
      if (!d.history?.length) Object.assign(next, { archives: {}, inspectionId: null, selectedFlight: null });
      next.solve = d.solve ?? null;
      next.trace = d.progress ? [d.progress] : [];
      next.captures = d.progress?.capture_beta != null ? [d.progress] : [];
      next.steps = d.step ? [d.step] : [];
    }
    if (event.type === 'solve_started' && d.solve) {
      Object.assign(next, { solve: d.solve, trace: [], captures: [], selectedFlight: d.solve.flight_id, record: null });
    }
    if (d.progress && event.type !== 'hello') {
      next.trace = [...state.trace, d.progress].slice(-256);
      if (d.progress.capture_beta != null) next.captures = [...state.captures.filter(p => p.capture_beta !== d.progress?.capture_beta), d.progress].slice(-3);
    }
    if (d.step && event.type !== 'hello') {
      const previous = d.step.name === 'Predict conflicts' ? [] : state.steps;
      next.steps = [...previous.filter(s => s.name !== d.step?.name), d.step].slice(-12);
    }
    if (d.record) {
      next.record = d.record;
      next.history = [...state.history.filter(r => r.id !== d.record?.id), d.record];
      next.archives = { ...state.archives, [d.record.id]: { solve: state.solve, trace: state.trace, captures: state.captures, steps: state.steps } };
    }
    if (event.type === 'error' || event.type === 'separation_alert') next.error = d.message ?? 'The backend reported an alert.';
    if (event.type === 'focus' && d.flight_ids?.length) next.selectedFlight = d.flight_ids[0];
    return next;
  }),
}));
export function getView(state: DemoState) {
  const inspected = state.inspectionId ? state.history.find(r => r.id === state.inspectionId) : null;
  const archive = inspected ? state.archives[inspected.id] ?? emptyArchive() : state;
  const world = inspected?.snapshot ?? state.world;
  const record = inspected ?? state.record;
  const flightId = inspected?.flight_id ?? state.selectedFlight ?? state.solve?.flight_id;
  return { ...archive, world, record, inspected, flight: world?.flights.find(f => f.id === flightId) ?? world?.flights.find(f => f.callsign === 'XAT208') ?? world?.flights[0] ?? null };
}
