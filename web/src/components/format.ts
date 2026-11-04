export const number = (value: number | null | undefined, digits = 0) => value == null ? '—' : value.toLocaleString('en-GB', { maximumFractionDigits: digits, minimumFractionDigits: digits });
export const ms = (value: number | null | undefined) => value == null ? '—' : `${number(value, 1)} ms`;
export const utc = (start: string, seconds: number) => new Date(Date.parse(start) + seconds * 1000).toISOString().slice(11, 19);
export const readable = (value: string) => value.replaceAll('_', ' ');
