import type { ControlRequest, ServerEvent, WindGrid } from './types.gen';
import { useDemo } from '../store/useDemo';
import { activePlayer } from '../replay/player';
import { apiUrl, liveEnabled, socketUrl } from './runtime';

export async function control(body: ControlRequest): Promise<boolean> {
  try {
    const response = await fetch(apiUrl('/api/control'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!response.ok) {
      const error = await response.json() as { detail?: string };
      throw new Error(error.detail ?? `Request failed (${response.status})`);
    }
    useDemo.setState({ error: null });
    return true;
  } catch (error) {
    useDemo.setState({ error: error instanceof Error ? error.message : 'Backend request failed.' });
    return false;
  }
}
export async function loadWind(time: number, signal: AbortSignal): Promise<WindGrid> {
  if (useDemo.getState().source === 'replay') {
    const grid = activePlayer().wind(time);
    if (!grid) throw new Error('Wind field unavailable');
    return grid;
  }
  const response = await fetch(apiUrl(`/api/wind/grid?t=${time}`), { signal });
  if (!response.ok) throw new Error('Wind field unavailable');
  return response.json() as Promise<WindGrid>;
}
let reopen: (() => void) | null = null;
/** Reconnect at once so the backend's hello resynchronises the store. */
export function resync() { reopen?.(); }

export function connect() {
  if (!liveEnabled) return () => {};
  let stopped = false;
  let immediate = false;
  let retry: ReturnType<typeof setTimeout>;
  let socket: WebSocket;
  let failures = 0;
  const open = () => {
    useDemo.setState({ connection: 'connecting' });
    socket = new WebSocket(socketUrl());
    socket.onopen = () => { failures = 0; useDemo.setState({ connection: 'online' }); };
    socket.onmessage = (message) => {
      if (useDemo.getState().source !== 'live') return;
      try { useDemo.getState().receive(JSON.parse(message.data as string) as ServerEvent); }
      catch { useDemo.setState({ error: 'Could not read a backend update. Reconnect to resynchronise.' }); }
    };
    socket.onerror = () => socket.close();
    socket.onclose = () => {
      useDemo.setState({ connection: 'offline' });
      if (!stopped) retry = setTimeout(open, immediate ? 0 : Math.min(1000 * 2 ** failures++, 10000));
      immediate = false;
    };
  };
  open();
  reopen = () => {
    if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) { immediate = true; socket.close(); }
    else { clearTimeout(retry); open(); }
  };
  return () => { stopped = true; reopen = null; clearTimeout(retry); socket.close(); };
}
