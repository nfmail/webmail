import { readFileSync, existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PRODUCT, sourceUrlForCommit } from '@/lib/product-metadata';

const packageJson = JSON.parse(readFileSync('package.json', 'utf8')) as {
  name: string;
  version: string;
  description: string;
  license: string;
  repository: { url: string };
  homepage: string;
  bugs: { url: string };
};

describe('NF Mail product metadata', () => {
  it('keeps package and release identity aligned with the canonical metadata', () => {
    const version = readFileSync('VERSION', 'utf8').trim();

    expect(packageJson.name).toBe('nf-mail');
    expect(packageJson.version).toBe(version);
    expect(version).toMatch(new RegExp(`^${PRODUCT.upstream.version.replaceAll('.', '\\.')}-nf\\.\\d+$`));
    expect(packageJson.description).toContain(PRODUCT.name);
    expect(packageJson.license).toBe(PRODUCT.license);
    expect(packageJson.repository.url).toBe(`git+${PRODUCT.repositoryUrl}.git`);
    expect(packageJson.homepage).toBe(PRODUCT.repositoryUrl);
    expect(packageJson.bugs.url).toBe(PRODUCT.issuesUrl);
  });

  it('keeps OCI labels aligned with the public product identity', () => {
    const dockerfile = readFileSync('Dockerfile', 'utf8');

    expect(dockerfile).toContain(`org.opencontainers.image.title="${PRODUCT.name}"`);
    expect(dockerfile).toContain(`org.opencontainers.image.source="${PRODUCT.repositoryUrl}"`);
    expect(dockerfile).toContain(`org.opencontainers.image.licenses="${PRODUCT.license}"`);
    expect(dockerfile).toContain('org.opencontainers.image.revision="$GIT_COMMIT"');
  });

  it('preserves upstream attribution and records the NF downstream notice', () => {
    for (const filename of ['LICENSE', 'NOTICE']) {
      const notice = readFileSync(filename, 'utf8');
      expect(notice).toContain('# NF Mail downstream notice');
      expect(notice).toContain('# Bulwark Webmail fork notice');
      expect(notice).toContain(PRODUCT.repositoryUrl);
      expect(notice).toContain(PRODUCT.upstream.repositoryUrl);
      expect(notice).toContain('Copyright (c) 2025 Matthieu MALVACHE');
    }

    const packager = readFileSync('scripts/package-release.mjs', 'utf8');
    expect(packager).toContain('["LICENSE", "NOTICE", "VERSION", "product.json"]');
    expect(packager).toContain('product.upstream.repositoryUrl');
  });

  it('ships every canonical branding asset', () => {
    for (const asset of Object.values(PRODUCT.branding)) {
      expect(asset.startsWith('/branding/')).toBe(true);
      expect(existsSync(`public${asset}`)).toBe(true);
    }
  });

  it('links known builds to exact corresponding source', () => {
    expect(sourceUrlForCommit('53e0615')).toBe(`${PRODUCT.repositoryUrl}/tree/53e0615`);
    expect(sourceUrlForCommit(PRODUCT.upstream.commit)).toBe(
      `${PRODUCT.repositoryUrl}/tree/${PRODUCT.upstream.commit}`,
    );
    expect(sourceUrlForCommit('unknown')).toBe(PRODUCT.repositoryUrl);
  });
});
