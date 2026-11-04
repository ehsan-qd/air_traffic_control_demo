const backend = (import.meta.env.VITE_NAT_BACKEND_URL ?? '').replace(/\/+$/, '');
export const liveEnabled = import.meta.env.VITE_RECORDED_ONLY !== 'true';

export function apiUrl(path: string): string {
  return `${backend}${path}`;
}

export function socketUrl(): string {
  const url = new URL('/ws', backend || location.origin);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return url.toString();
}
