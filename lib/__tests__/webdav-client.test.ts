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
      href: '/dav/file/user@example.com/my dir/report.txt',
      name: 'report.txt',
      contentType: 'text/plain',
      contentLength: 5,
    });
    expect(mockedFetch).toHaveBeenCalledWith('/api/webdav', expect.objectContaining({
      headers: expect.objectContaining({
        'X-WebDAV-Method': 'PROPFIND',
        'X-WebDAV-Path': '/my dir',
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
});
