import { afterEach, expect, it, vi } from 'vitest';

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

it('uses a separate HTTPS backend for both HTTP and secure WebSocket traffic', async () => {
  vi.stubEnv('VITE_NAT_BACKEND_URL', 'https://simulation.example.com/');
  const runtime = await import('./runtime');
  expect(runtime.apiUrl('/api/control')).toBe('https://simulation.example.com/api/control');
  expect(runtime.socketUrl()).toBe('wss://simulation.example.com/ws');
});

it('disables live mode for the hosted recorded build', async () => {
  vi.stubEnv('VITE_RECORDED_ONLY', 'true');
  const { liveEnabled } = await import('./runtime');
  expect(liveEnabled).toBe(false);
});
