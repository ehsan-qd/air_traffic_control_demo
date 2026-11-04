import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { replay } from '../replay/player';
import { chapterAt, chapters, STUDY_DURATION_MS } from './chapters';
import { useStudyLoop } from './useStudyLoop';

vi.mock('../replay/player', () => {
  const replay = { control: vi.fn() };
  return { replay, activePlayer: () => replay };
});
const control = vi.mocked(replay.control);
async function advance(milliseconds: number) { await act(async () => { await vi.advanceTimersByTimeAsync(milliseconds); }); }

beforeEach(() => {
  vi.useFakeTimers({ toFake:['setInterval', 'clearInterval', 'performance'] });
  control.mockReset().mockResolvedValue(true);
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('guided walkthrough director', () => {
  it('autoplays seven scenes for 160 seconds and automatically starts a fresh second loop', async () => {
    const { result } = renderHook(useStudyLoop);
    await act(async () => { await result.current.start('auto'); });
    await advance(250);
    expect(result.current.status).toBe('running');
    expect(result.current.cycle).toBe(1);
    expect(control).toHaveBeenCalledWith({ action:'reset' });
    expect(control).toHaveBeenLastCalledWith({ action:'play' });
    await advance(62_000);
    expect(chapterAt(result.current.elapsedMs)).toBe(3);
    expect(result.current.scene).toBe(3);
    await advance(STUDY_DURATION_MS - 62_000);
    expect(result.current.status).toBe('restarting');
    await advance(250);
    expect(result.current.cycle).toBe(2);
    expect(result.current.elapsedMs).toBe(0);
    expect(result.current.status).toBe('running');
  });
  it('pauses the presentation clock and playback, then resumes without skipping scenes', async () => {
    const { result } = renderHook(useStudyLoop);
    await act(async () => { await result.current.start('auto'); });
    await advance(20_250);
    await act(async () => { await result.current.togglePause(); });
    expect(control).toHaveBeenLastCalledWith({ action:'pause' });
    const elapsed = result.current.elapsedMs;
    await advance(60_000);
    expect(result.current.elapsedMs).toBe(elapsed);
    await act(async () => { await result.current.togglePause(); });
    expect(control).toHaveBeenLastCalledWith({ action:'play' });
    await advance(1000);
    expect(result.current.elapsedMs).toBe(elapsed + 1000);
  });
  it('restarts at once, with no backend to wait for', async () => {
    const { result } = renderHook(useStudyLoop);
    await act(async () => { await result.current.start('present'); });
    await advance(250);
    act(() => { result.current.goTo(4); });
    await act(async () => { await result.current.start(); });
    await advance(250);
    expect(result.current.status).toBe('running');
    expect(result.current.scene).toBe(0);
    expect(result.current.cycle).toBe(1);
  });
  it('exits without a later timer reset or restart', async () => {
    const { result } = renderHook(useStudyLoop);
    await act(async () => { await result.current.start('auto'); });
    await advance(250);
    await act(async () => { await result.current.stop(); });
    const calls = control.mock.calls.length;
    await advance(STUDY_DURATION_MS * 2);
    expect(result.current.active).toBe(false);
    expect(control.mock.calls.length).toBe(calls);
  });
  it('lets a presenter step through scenes without a clock or automatic restart', async () => {
    const { result } = renderHook(useStudyLoop);
    await act(async () => { await result.current.start('present'); });
    await advance(250);
    expect(result.current.status).toBe('running');
    expect(result.current.scene).toBe(0);
    await advance(STUDY_DURATION_MS * 2);
    expect(result.current.scene).toBe(0);
    expect(result.current.cycle).toBe(1);
    act(() => { result.current.next(); result.current.next(); });
    expect(result.current.scene).toBe(2);
    act(() => { result.current.previous(); });
    expect(result.current.scene).toBe(1);
    act(() => { result.current.goTo(99); });
    expect(result.current.scene).toBe(chapters.length - 1);
    act(() => { result.current.next(); });
    expect(result.current.scene).toBe(chapters.length - 1);
  });
  it('seeks the autoplay clock when jumping scenes and keeps the scene when switching modes', async () => {
    const { result } = renderHook(useStudyLoop);
    await act(async () => { await result.current.start('present'); });
    await advance(250);
    act(() => { result.current.goTo(4); });
    act(() => { result.current.setMode('auto'); });
    expect(result.current.elapsedMs).toBe(chapters[4].start * 1000);
    await advance(1000);
    expect(result.current.scene).toBe(4);
    act(() => { result.current.goTo(1); });
    expect(result.current.elapsedMs).toBe(chapters[1].start * 1000);
    await advance(250);
    expect(result.current.scene).toBe(1);
  });
  it('surfaces a recording that cannot be loaded without claiming a loop started', async () => {
    const { result } = renderHook(useStudyLoop);
    await act(async () => { await result.current.start(); });
    control.mockResolvedValue(false);
    await advance(250);
    expect(result.current.status).toBe('error');
    expect(result.current.cycle).toBe(0);
    expect(control).not.toHaveBeenCalledWith({ action:'play' });
  });
});
