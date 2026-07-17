import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from 'vitest';
import {
  WEBDAV_MAX_CONCURRENT_REQUESTS,
  WEBDAV_DNS_TIMEOUT_MS,
  WEBDAV_MAX_FILE_BYTES,
  WEBDAV_MAX_PROPFIND_REQUEST_BYTES,
  WEBDAV_MAX_PROPFIND_RESPONSE_BYTES,
  WEBDAV_REQUEST_TIMEOUT_MS,
} from '@/lib/webdav/proxy-security';

const mocks = vi.hoisted(() => ({
  configGet: vi.fn(),
  dnsLookup: vi.fn(),
  loggerError: vi.fn(),
  agentOptions: [] as unknown[],
}));

vi.mock('next/server', () => {
  class NextResponse {
    body: unknown;
    status: number;
    headers: Headers;

    constructor(body: unknown, init?: { status?: number; headers?: HeadersInit }) {
      this.body = body;
      this.status = init?.status ?? 200;
      this.headers = new Headers(init?.headers);
    }

    static json(data: unknown, init?: { status?: number; headers?: HeadersInit }) {
      return {
        status: init?.status ?? 200,
        headers: new Headers(init?.headers),
        json: async () => data,
      };
    }
  }

  return { NextResponse, NextRequest: class {} };
});
vi.mock('undici', () => ({
  Agent: class {
    constructor(readonly options: unknown) {
      mocks.agentOptions.push(options);
    }
    close() { return Promise.resolve(); }
  },
}));
vi.mock('node:dns/promises', () => ({
  default: { lookup: mocks.dnsLookup },
  lookup: mocks.dnsLookup,
}));
vi.mock('@/lib/logger', () => ({
  logger: { error: mocks.loggerError, debug: vi.fn() },
}));
vi.mock('@/lib/admin/config-manager', () => ({
  configManager: {
    ensureLoaded: vi.fn(),
    get: mocks.configGet,
  },
}));
vi.mock('@/lib/stalwart/credentials', () => ({ getStalwartCredentials: vi.fn() }));

import { POST } from '@/app/api/webdav/route';
import { getStalwartCredentials } from '@/lib/stalwart/credentials';

const mockCreds = getStalwartCredentials as unknown as Mock;
const DEFAULT_CREDS = {
  serverUrl: 'https://mail.example.com',
  username: 'user@example.com',
  authHeader: 'Basic super-secret',
};

type RouteResult = {
  status: number;
  headers: Headers;
  body?: unknown;
  json?: () => Promise<unknown>;
};

let fetchSpy: Mock;

function makeReq(
  headers: Record<string, string> = {},
  body: BodyInit | null = null,
  origin = 'https://webmail.example',
  requestOrigin = origin,
): Parameters<typeof POST>[0] {
  const requestHeaders = new Headers({
    'Sec-Fetch-Site': 'same-origin',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Dest': 'empty',
    Origin: origin,
    ...headers,
  });
  const abortController = new AbortController();

  return {
    headers: requestHeaders,
    body: body === null ? null : new Response(body).body,
    signal: abortController.signal,
    nextUrl: new URL(`${requestOrigin}/api/webdav`),
  } as unknown as Parameters<typeof POST>[0];
}

function read(result: unknown): RouteResult {
  return result as RouteResult;
}

async function bodyText(result: RouteResult): Promise<string> {
  if (result.body === null || result.body === undefined) return '';
  if (typeof result.body === 'string') return result.body;
  return new Response(result.body as BodyInit).text();
}

function configure(values: {
  serverUrl?: string;
  allowCustom?: boolean;
  servers?: unknown[];
} = {}) {
  mocks.configGet.mockImplementation((key: string, fallback: unknown) => {
    if (key === 'jmapServerUrl') return values.serverUrl ?? DEFAULT_CREDS.serverUrl;
    if (key === 'jmapServers') return values.servers ?? [];
    if (key === 'allowCustomJmapEndpoint') return values.allowCustom ?? false;
    return fallback;
  });
}

beforeEach(() => {
  configure();
  mocks.dnsLookup.mockReset();
  mocks.dnsLookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
  mocks.loggerError.mockClear();
  mocks.agentOptions.length = 0;
  mockCreds.mockResolvedValue(DEFAULT_CREDS);
  fetchSpy = vi.fn(async () => new Response('<xml/>', {
    status: 207,
    headers: { 'Content-Type': 'application/xml' },
  }));
  vi.stubGlobal('fetch', fetchSpy);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('POST /api/webdav — request boundary', () => {
  it('rejects cross-site requests before reading credentials', async () => {
    const request = makeReq(
      { 'X-WebDAV-Method': 'GET', 'Sec-Fetch-Site': 'cross-site' },
      null,
      'https://attacker.example',
      'https://webmail.example',
    );

    const result = read(await POST(request));

    expect(result.status).toBe(403);
    expect(mockCreds).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('returns 401 without credentials and never exposes an upstream challenge', async () => {
    mockCreds.mockResolvedValue(null);

    const result = read(await POST(makeReq({ 'X-WebDAV-Method': 'GET' })));

    expect(result.status).toBe(401);
    await expect(result.json!()).resolves.toEqual({ error: 'Not authenticated' });
    expect(result.headers.get('Cache-Control')).toBe('no-store');
  });

  it('rejects missing and unsupported methods', async () => {
    expect(read(await POST(makeReq())).status).toBe(400);
    const result = read(await POST(makeReq({ 'X-WebDAV-Method': 'BOGUS' })));
    expect(result.status).toBe(400);
    await expect(result.json!()).resolves.toEqual({ error: 'Invalid WebDAV method' });
  });

  it.each([
    ['../etc', 'Invalid WebDAV path segment'],
    ['%2e%2e/etc', 'Invalid WebDAV path segment'],
    ['dir/%2fetc', 'Invalid WebDAV path segment'],
    ['%zz', 'Invalid WebDAV path encoding'],
    ['dir?secret=value', 'Invalid WebDAV path'],
  ])('rejects unsafe path %s', async (path, message) => {
    const result = read(await POST(makeReq({
      'X-WebDAV-Method': 'PROPFIND',
      'X-WebDAV-Path': path,
    })));

    expect(result.status).toBe(400);
    await expect(result.json!()).resolves.toEqual({ error: message });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('allows only bounded Depth and MOVE/COPY destination headers', async () => {
    const depth = read(await POST(makeReq({
      'X-WebDAV-Method': 'PROPFIND',
      Depth: 'infinity',
    })));
    expect(depth.status).toBe(400);

    const destination = read(await POST(makeReq({
      'X-WebDAV-Method': 'MOVE',
      'X-WebDAV-Path': 'old.txt',
    })));
    expect(destination.status).toBe(400);

    const unexpected = read(await POST(makeReq({
      'X-WebDAV-Method': 'GET',
      'X-WebDAV-Destination': 'other.txt',
    })));
    expect(unexpected.status).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('POST /api/webdav — upstream policy', () => {
  it('blocks a custom endpoint that resolves to a private address', async () => {
    configure({ serverUrl: '', allowCustom: true });
    mockCreds.mockResolvedValue({
      ...DEFAULT_CREDS,
      serverUrl: 'https://rebind.example',
    });
    mocks.dnsLookup.mockResolvedValue([{ address: '169.254.169.254', family: 4 }]);

    const result = read(await POST(makeReq({ 'X-WebDAV-Method': 'GET' })));

    expect(result.status).toBe(403);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('blocks custom plaintext HTTP even when DNS is public', async () => {
    configure({ serverUrl: '', allowCustom: true });
    mockCreds.mockResolvedValue({
      ...DEFAULT_CREDS,
      serverUrl: 'http://public.example',
    });

    const result = read(await POST(makeReq({ 'X-WebDAV-Method': 'GET' })));

    expect(result.status).toBe(403);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('permits an explicitly configured private HTTP server', async () => {
    configure({ serverUrl: 'http://10.0.0.5' });
    mockCreds.mockResolvedValue({
      ...DEFAULT_CREDS,
      serverUrl: 'http://10.0.0.5',
    });

    const result = read(await POST(makeReq({ 'X-WebDAV-Method': 'MKCOL' })));

    expect(result.status).toBe(207);
    expect(fetchSpy).toHaveBeenCalledWith(
      'http://10.0.0.5/dav/file/user%40example.com/',
      expect.objectContaining({ redirect: 'manual' }),
    );
  });

  it('denies redirects without replaying credentials', async () => {
    fetchSpy.mockResolvedValue(new Response(null, {
      status: 302,
      headers: { Location: 'http://169.254.169.254/latest/meta-data/' },
    }));

    const result = read(await POST(makeReq({ 'X-WebDAV-Method': 'GET' })));

    expect(result.status).toBe(502);
    await expect(result.json!()).resolves.toEqual({ error: 'WebDAV server redirect was denied' });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('pins the validated DNS answer into the socket lookup', async () => {
    await POST(makeReq({ 'X-WebDAV-Method': 'MKCOL' }));
    expect(mocks.dnsLookup).toHaveBeenCalledTimes(1);

    const options = mocks.agentOptions[0] as {
      connect: {
        lookup: (
          hostname: string,
          options: { all?: boolean; family?: number },
          callback: (error: NodeJS.ErrnoException | null, address: string, family: number) => void,
        ) => void;
      };
    };
    mocks.dnsLookup.mockResolvedValue([{ address: '10.0.0.1', family: 4 }]);

    const pinned = await new Promise<{ address: string; family: number }>((resolve, reject) => {
      options.connect.lookup('mail.example.com', {}, (error, address, family) => {
        if (error) reject(error);
        else resolve({ address, family });
      });
    });

    expect(pinned).toEqual({ address: '93.184.216.34', family: 4 });
    expect(mocks.dnsLookup).toHaveBeenCalledTimes(1);
  });

  it('bounds DNS resolution time', async () => {
    vi.useFakeTimers();
    mocks.dnsLookup.mockImplementation(() => new Promise(() => undefined));

    const pending = POST(makeReq({ 'X-WebDAV-Method': 'GET' }));
    await vi.advanceTimersByTimeAsync(WEBDAV_DNS_TIMEOUT_MS);
    const result = read(await pending);

    expect(result.status).toBe(502);
    await expect(result.json!()).resolves.toEqual({ error: 'WebDAV server is unavailable' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('does not return the upstream URL, username, or authorization secret', async () => {
    fetchSpy.mockResolvedValue(new Response('file contents', {
      status: 200,
      headers: { 'Content-Type': 'text/plain', 'Content-Length': '13' },
    }));

    const result = read(await POST(makeReq({
      'X-WebDAV-Method': 'GET',
      'X-WebDAV-Path': 'report.txt',
    })));

    expect(await bodyText(result)).toBe('file contents');
    expect(result.headers.get('X-WebDAV-Request-URI')).toBeNull();
    expect([...result.headers.entries()].join(' ')).not.toContain('user@example.com');
    expect([...result.headers.entries()].join(' ')).not.toContain('super-secret');
  });

  it('logs only a sanitized failure code', async () => {
    fetchSpy.mockRejectedValue(new Error(
      'connect failed: Authorization Basic super-secret to https://mail.example.com',
    ));

    const result = read(await POST(makeReq({ 'X-WebDAV-Method': 'GET' })));

    expect(result.status).toBe(502);
    const logged = JSON.stringify(mocks.loggerError.mock.calls);
    expect(logged).toContain('upstream_failure');
    expect(logged).not.toContain('super-secret');
    expect(logged).not.toContain('mail.example.com');
  });
});

describe('POST /api/webdav — proxying', () => {
  it('pins GET to the account server, forwards auth, and streams the body', async () => {
    fetchSpy.mockResolvedValue(new Response('UPSTREAM-BODY', {
      status: 200,
      headers: { 'Content-Type': 'text/plain', 'Content-Length': '13' },
    }));

    const result = read(await POST(makeReq({
      'X-WebDAV-Method': 'get',
      'X-WebDAV-Path': 'file.txt',
    })));

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://mail.example.com/dav/file/user%40example.com/file.txt',
      expect.objectContaining({
        method: 'GET',
        redirect: 'manual',
        dispatcher: expect.anything(),
        headers: expect.objectContaining({ Authorization: 'Basic super-secret' }),
      }),
    );
    expect(result.status).toBe(200);
    expect(await bodyText(result)).toBe('UPSTREAM-BODY');
    expect(result.headers.get('Content-Type')).toBe('text/plain');
    expect(result.headers.get('Cache-Control')).toBe('no-store');
  });

  it('forwards bounded PROPFIND metadata and returns only a safe request path', async () => {
    const xml = '<D:multistatus xmlns:D="DAV:"/>';
    fetchSpy.mockResolvedValue(new Response(xml, { status: 207 }));

    const result = read(await POST(makeReq(
      {
        'X-WebDAV-Method': 'PROPFIND',
        'X-WebDAV-Path': 'my dir',
        Depth: '1',
        'Content-Type': 'application/xml; charset=utf-8',
      },
      '<D:propfind xmlns:D="DAV:"/>',
    )));

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://mail.example.com/dav/file/user%40example.com/my%20dir',
      expect.objectContaining({
        method: 'PROPFIND',
        headers: expect.objectContaining({
          Authorization: 'Basic super-secret',
          Depth: '1',
        }),
      }),
    );
    expect(result.status).toBe(207);
    expect(await bodyText(result)).toBe(xml);
    expect(result.headers.get('X-WebDAV-Request-Path')).toBe('/my%20dir');
  });

  it('rebuilds MOVE Destination inside the same account root', async () => {
    await POST(makeReq({
      'X-WebDAV-Method': 'MOVE',
      'X-WebDAV-Path': 'old.txt',
      'X-WebDAV-Destination': 'sub/new.txt',
      Overwrite: 'F',
    }));

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://mail.example.com/dav/file/user%40example.com/old.txt',
      expect.objectContaining({
        method: 'MOVE',
        headers: expect.objectContaining({
          Destination: 'https://mail.example.com/dav/file/user%40example.com/sub/new.txt',
          Overwrite: 'F',
        }),
      }),
    );
  });
});

describe('POST /api/webdav — resource exhaustion', () => {
  it('rejects an oversized upload from Content-Length before proxying', async () => {
    const result = read(await POST(makeReq({
      'X-WebDAV-Method': 'PUT',
      'Content-Length': String(WEBDAV_MAX_FILE_BYTES + 1),
    })));

    expect(result.status).toBe(413);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('enforces the PROPFIND request limit even without Content-Length', async () => {
    const result = read(await POST(makeReq(
      { 'X-WebDAV-Method': 'PROPFIND' },
      new Uint8Array(WEBDAV_MAX_PROPFIND_REQUEST_BYTES + 1),
    )));

    expect(result.status).toBe(413);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('rejects an oversized metadata response by declared and actual size', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(null, {
      status: 207,
      headers: { 'Content-Length': String(WEBDAV_MAX_PROPFIND_RESPONSE_BYTES + 1) },
    }));
    const declared = read(await POST(makeReq({ 'X-WebDAV-Method': 'PROPFIND' })));
    expect(declared.status).toBe(502);
    expect(fetchSpy).toHaveBeenLastCalledWith(
      expect.any(String),
      expect.objectContaining({ headers: expect.objectContaining({ Depth: '0' }) }),
    );

    fetchSpy.mockResolvedValueOnce(new Response(
      new Uint8Array(WEBDAV_MAX_PROPFIND_RESPONSE_BYTES + 1),
      { status: 207 },
    ));
    const actual = read(await POST(makeReq({ 'X-WebDAV-Method': 'PROPFIND' })));
    expect(actual.status).toBe(502);
  });

  it('aborts an upstream request at the fixed deadline', async () => {
    vi.useFakeTimers();
    fetchSpy.mockImplementation((_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => {
        reject(new DOMException('aborted', 'AbortError'));
      });
    }));

    const pending = POST(makeReq({ 'X-WebDAV-Method': 'GET' }));
    await vi.advanceTimersByTimeAsync(WEBDAV_REQUEST_TIMEOUT_MS);
    const result = read(await pending);

    expect(result.status).toBe(504);
  });

  it('caps concurrent upstream work', async () => {
    const resolvers: Array<(response: Response) => void> = [];
    fetchSpy.mockImplementation(() => new Promise<Response>((resolve) => {
      resolvers.push(resolve);
    }));

    const pending = Array.from(
      { length: WEBDAV_MAX_CONCURRENT_REQUESTS },
      () => POST(makeReq({ 'X-WebDAV-Method': 'MKCOL' })),
    );
    await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(WEBDAV_MAX_CONCURRENT_REQUESTS));

    const busy = read(await POST(makeReq({ 'X-WebDAV-Method': 'MKCOL' })));
    expect(busy.status).toBe(429);

    for (const resolve of resolvers) resolve(new Response(null, { status: 204 }));
    await Promise.all(pending);
  });
});
