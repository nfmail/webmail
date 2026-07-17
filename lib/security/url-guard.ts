import { lookup } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';

const blockedAddressRanges = new BlockList();
blockedAddressRanges.addSubnet('0.0.0.0', 8);
blockedAddressRanges.addSubnet('100.64.0.0', 10);
blockedAddressRanges.addSubnet('127.0.0.0', 8);
blockedAddressRanges.addSubnet('10.0.0.0', 8);
blockedAddressRanges.addSubnet('172.16.0.0', 12);
blockedAddressRanges.addSubnet('192.168.0.0', 16);
blockedAddressRanges.addSubnet('169.254.0.0', 16);
blockedAddressRanges.addSubnet('192.0.0.0', 24);
blockedAddressRanges.addSubnet('192.0.2.0', 24);
blockedAddressRanges.addSubnet('198.18.0.0', 15);
blockedAddressRanges.addSubnet('198.51.100.0', 24);
blockedAddressRanges.addSubnet('203.0.113.0', 24);
blockedAddressRanges.addSubnet('224.0.0.0', 4);
blockedAddressRanges.addSubnet('240.0.0.0', 4);
blockedAddressRanges.addAddress('::', 'ipv6');
blockedAddressRanges.addAddress('::1', 'ipv6');
blockedAddressRanges.addSubnet('100::', 64, 'ipv6');
blockedAddressRanges.addSubnet('2001:db8::', 32, 'ipv6');
blockedAddressRanges.addSubnet('fc00::', 7, 'ipv6');
blockedAddressRanges.addSubnet('fe80::', 10, 'ipv6');
blockedAddressRanges.addSubnet('ff00::', 8, 'ipv6');

const BLOCKED_HOSTNAMES = new Set(['localhost']);
const BLOCKED_HOSTNAME_SUFFIXES = ['.localhost', '.local', '.internal', '.arpa', '.localdomain'];

export function normalizeHttpHostname(hostname: string): string {
  return hostname.replace(/^\[(.*)\]$/, '$1').toLowerCase();
}

export function isBlockedIpAddress(hostname: string): boolean {
  const normalized = normalizeHttpHostname(hostname);
  // Node's BlockList treats IPv4 checks as IPv4-mapped IPv6 internally, so
  // adding ::ffff:0:0/96 to the list would accidentally block every IPv4
  // address. Reject mapped literals explicitly instead.
  if (normalized.startsWith('::ffff:')) return true;
  const family = isIP(normalized);
  if (family === 4) return blockedAddressRanges.check(normalized, 'ipv4');
  if (family === 6) return blockedAddressRanges.check(normalized, 'ipv6');
  return false;
}

export function isBlockedHttpHostname(hostname: string): boolean {
  const normalized = normalizeHttpHostname(hostname);
  return !normalized
    || BLOCKED_HOSTNAMES.has(normalized)
    || BLOCKED_HOSTNAME_SUFFIXES.some((suffix) => normalized.endsWith(suffix));
}

/**
 * Returns true only when the URL targets a public host reachable over http(s).
 * Rejects loopback / RFC-1918 / link-local / ULA addresses, special hostname
 * suffixes (.local, .internal, .arpa, ...), URLs with embedded credentials,
 * and any hostname whose DNS resolves to a blocked address.
 *
 * Note: there is a TOCTOU window between this lookup and the eventual fetch().
 * Callers that need rebinding-safe behavior must additionally pin the resolved
 * IP at connect time (e.g. via a custom undici dispatcher).
 */
export async function isPublicHttpUrl(urlString: string): Promise<boolean> {
  let url: URL;
  try {
    url = new URL(urlString);
  } catch {
    return false;
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
  if (url.username || url.password) return false;

  const hostname = normalizeHttpHostname(url.hostname);
  if (isBlockedHttpHostname(hostname)) return false;

  if (isBlockedIpAddress(hostname)) return false;
  if (isIP(hostname)) return true;

  try {
    const records = await lookup(hostname, { all: true, verbatim: true });
    if (records.length === 0) return false;
    return records.every((record) => !isBlockedIpAddress(record.address));
  } catch {
    return false;
  }
}
