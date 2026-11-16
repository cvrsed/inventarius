/**
 * Indica si una IP pertenece a loopback o a rangos privados (RFC 1918 / ULA).
 * Se usa para restringir `/api/metrics` a la red interna de Compose.
 */
export function isInternalAddress(ip: string): boolean {
  const addr = ip.startsWith('::ffff:') ? ip.slice(7) : ip;
  if (addr === '::1' || /^fd[0-9a-f]{2}:/i.test(addr)) return true;
  const m = /^(\d{1,3})\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/.exec(addr);
  if (!m) return false;
  const a = Number(m[1]);
  const b = Number(m[2]);
  return a === 127 || a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}
