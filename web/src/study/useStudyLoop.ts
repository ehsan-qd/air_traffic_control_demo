import { useEffect, useRef, useState } from 'react';
import { activePlayer, replay } from '../replay/player';
import { useDemo } from '../store/useDemo';
import { chapterAt, chapters, STUDY_DURATION_MS } from './chapters';

type Status = 'idle' | 'starting' | 'running' | 'paused' | 'restarting' | 'error';
/** `present`: a presenter steps through scenes. `auto`: timed scenes that loop. */
export type StudyMode = 'present' | 'auto';
interface LoopState { status: Status; elapsedMs: number; cycle: number; busy: boolean; mode: StudyMode; scene: number }

const lastScene = chapters.length - 1;

/** Directs the walkthrough over the recorded run; it never touches the live backend. */
export function useStudyLoop() {
  const [view, setView] = useState<LoopState>({ status: 'idle', elapsedMs: 0, cycle: 0, busy: false, mode: 'present', scene: 0 });
  const runtime = useRef({ ...view, lastAt: 0 });
  const mounted = useRef(true);

  function update(patch: Partial<LoopState>) {
    Object.assign(runtime.current, patch);
    if (mounted.current) setView(({ status, elapsedMs, cycle, busy, mode, scene }) => ({ status, elapsedMs, cycle, busy, mode, scene, ...patch }));
  }

  async function pauseFor(status: Status, reset = false) {
    if (runtime.current.busy) return;
    update({ status, busy: true, ...(reset ? { elapsedMs: 0, cycle: 0, scene: 0 } : {}) });
    const ok = await activePlayer().control({ action: 'pause' });
    runtime.current.lastAt = performance.now();
    update({ busy: false, ...(!ok ? { status: 'error' as const } : {}) });
  }

  async function start(mode: StudyMode = runtime.current.mode) {
    useDemo.getState().inspect(null);
    update({ mode });
    await pauseFor('starting', true);
  }

  async function togglePause() {
    const current = runtime.current;
    if (current.busy || !['running', 'paused'].includes(current.status)) return;
    if (current.status === 'running') {
      if (current.mode === 'auto') update({ elapsedMs: Math.min(STUDY_DURATION_MS, current.elapsedMs + performance.now() - current.lastAt) });
      await pauseFor('paused');
    } else {
      update({ busy: true });
      const ok = await activePlayer().control({ action: 'play' });
      current.lastAt = performance.now();
      update({ status: ok ? 'running' : 'error', busy: false });
    }
  }

  /** In autoplay, jumping to a scene seeks the presentation clock to its cue. */
  function goTo(scene: number) {
    const target = Math.max(0, Math.min(lastScene, scene));
    if (runtime.current.mode === 'auto') {
      runtime.current.lastAt = performance.now();
      update({ scene: target, elapsedMs: chapters[target].start * 1000 });
    } else update({ scene: target });
  }

  function setMode(mode: StudyMode) {
    if (mode === runtime.current.mode) return;
    runtime.current.lastAt = performance.now();
    update(mode === 'auto' ? { mode, elapsedMs: chapters[runtime.current.scene].start * 1000 } : { mode });
  }

  useEffect(() => {
    mounted.current = true;
    const timer = window.setInterval(() => {
      const current = runtime.current;
      const now = performance.now();
      const delta = now - current.lastAt;
      current.lastAt = now;
      if (current.status === 'idle' || current.status === 'error' || current.busy) return;
      if (current.status === 'running') {
        if (current.mode !== 'auto') return;
        const elapsedMs = Math.min(STUDY_DURATION_MS, current.elapsedMs + delta);
        update({ elapsedMs, scene: chapterAt(elapsedMs) });
        if (elapsedMs >= STUDY_DURATION_MS) void pauseFor('restarting');
      } else if (current.status === 'starting' || current.status === 'restarting') {
        update({ busy: true });
        void (async () => {
          const playing = await replay.control({ action: 'reset' }) && mounted.current && await replay.control({ action: 'play' });
          current.lastAt = performance.now();
          update(playing ? { status: 'running', elapsedMs: 0, scene: 0, cycle: current.cycle + 1, busy: false } : { status: 'error', busy: false });
        })();
      }
    }, 250);
    return () => { mounted.current = false; window.clearInterval(timer); };
    // The director reads the latest runtime state on every tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    ...view, active: view.status !== 'idle', start, togglePause, goTo, setMode,
    next: () => goTo(runtime.current.scene + 1), previous: () => goTo(runtime.current.scene - 1),
    stop: () => pauseFor('idle'),
  };
}
