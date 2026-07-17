import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/auth/active-account-slot', () => ({
  getActiveAccountSlotHeaders: () => ({ 'X-JMAP-Cookie-Slot': '0' }),
}));
vi.mock('@/lib/browser-navigation', () => ({
  apiFetch: vi.fn(),
  withBasePath: (path: string) => path,
}));

import { apiFetch } from '@/lib/browser-navigation';
import { WebDAVClient } from '@/lib/webdav/client';

const mockedFetch = vi.mocked(apiFetch);

function multistatus(hrefs: string[]): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<D:multistatus xmlns:D="DAV:">
${hrefs.map((href) => `<D:response>
  <D:href>${href}</D:href>
  <D:propstat>
    <D:prop>
      <D:displayname>${href.split('/').filter(Boolean).pop() ?? ''}</D:displayname>
      <D:resourcetype/>
      <D:getcontenttype>text/plain</D:getcontenttype>
      <D:getcontentlength>5</D:getcontentlength>
    </D:prop>
    <D:status>HTTP/1.1 200 OK</D:status>
  </D:propstat>
</D:response>`).join('\n')}
</D:multistatus>`;
}

beforeEach(() => {
  mockedFetch.mockReset();
});

describe('WebDAVClient metadata parsing', () => {
  it('uses the safe account-relative request path to skip the listed directory', async () => {
    mockedFetch.mockResolvedValue(new Response(multistatus([
      '/dav/file/user%40example.com/my%20dir/',
      '/dav/file/user%40example.com/my%20dir/report.txt',
    ]), {
      status: 207,
      headers: { 'X-WebDAV-Request-Path': '/my%20dir' },
    }));

    const resources = await new WebDAVClient().list('/my dir');

    expect(resources).toHaveLength(1);
    expect(resources[0]).toMatchObject({
      path: '/my%20dir/report.txt',
      href: '/my%20dir/report.txt',
      name: 'report.txt',
      contentType: 'text/plain',
      contentLength: 5,
    });
    expect(JSON.stringify(resources)).not.toContain('user@example.com');
    expect(mockedFetch).toHaveBeenCalledWith('/api/webdav', expect.objectContaining({
      headers: expect.objectContaining({
        'X-WebDAV-Method': 'PROPFIND',
        'X-WebDAV-Path': '/my%20dir',
      }),
    }));
  });

  it('skips the shallowest account root without needing the upstream URL', async () => {
    mockedFetch.mockResolvedValue(new Response(multistatus([
      '/dav/file/user%40example.com/',
      '/dav/file/user%40example.com/inbox/',
      '/dav/file/user%40example.com/readme.txt',
    ]), {
      status: 207,
      headers: { 'X-WebDAV-Request-Path': '/' },
    }));

    const resources = await new WebDAVClient().list('/');

    expect(resources.map((resource) => resource.name)).toEqual(['inbox', 'readme.txt']);
  });

  it('stats exactly one resource without exposing its upstream href', async () => {
    mockedFetch.mockResolvedValue(new Response(multistatus([
      '/dav/file/user%40example.com/my%20dir/report.txt',
    ]), {
      status: 207,
      headers: { 'X-WebDAV-Request-Path': '/my%20dir/report.txt' },
    }));

    const resource = await new WebDAVClient().stat('/my dir/report.txt');

    expect(resource).toMatchObject({
      path: '/my%20dir/report.txt',
      href: '/my%20dir/report.txt',
      name: 'report.txt',
    });
  });

  it('returns coded and sanitized HTTP, network, and response errors', async () => {
    mockedFetch
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockRejectedValueOnce(
        new Error('fetch failed at https://private.example?token=secret'),
      )
      .mockResolvedValueOnce(new Response('<not-xml', { status: 207 }));
    const client = new WebDAVClient();

    await expect(client.checkSupport()).rejects.toMatchObject({
      name: 'WebDAVClientError',
      code: 'http',
      status: 401,
      message: 'WebDAV PROPFIND failed.',
    });
    await expect(client.list('/')).rejects.toMatchObject({
      name: 'WebDAVClientError',
      code: 'network',
      status: 0,
      message: 'WebDAV PROPFIND failed.',
    });
    await expect(client.list('/')).rejects.toMatchObject({
      name: 'WebDAVClientError',
      code: 'invalid-response',
      status: 502,
      message: 'WebDAV PROPFIND failed.',
    });
  });

  it('rejects ambiguous encoded names and unsafe input paths', async () => {
    mockedFetch.mockResolvedValueOnce(new Response(multistatus([
      '/dav/file/user%40example.com/',
      '/dav/file/user%40example.com/report%2Fsecret.txt',
    ]), {
      status: 207,
      headers: { 'X-WebDAV-Request-Path': '/' },
    }));
    const client = new WebDAVClient();

    await expect(client.list('/')).rejects.toMatchObject({
      code: 'invalid-response',
      status: 502,
    });
    await expect(client.list('/safe/../secret')).rejects.toMatchObject({
      code: 'invalid-response',
      status: 400,
    });
    expect(mockedFetch).toHaveBeenCalledTimes(1);
  });

  it('uses coded HTTP errors for mutations too', async () => {
    mockedFetch.mockResolvedValue(new Response(null, { status: 409 }));

    await expect(new WebDAVClient().createDirectory('/existing'))
      .rejects.toMatchObject({
        name: 'WebDAVClientError',
        code: 'http',
        status: 409,
        method: 'MKCOL',
      });
  });

  it('stops before I/O when the request is already cancelled', async () => {
    const controller = new AbortController();
    controller.abort('test');

    await expect(new WebDAVClient().list('/', controller.signal))
      .rejects.toMatchObject({ name: 'AbortError' });
    expect(mockedFetch).not.toHaveBeenCalled();
  });
});
