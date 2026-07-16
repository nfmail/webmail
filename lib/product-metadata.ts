import metadata from '@/product.json';

export const PRODUCT = metadata;

export const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION || '0.0.0';
export const BUILD_COMMIT = process.env.NEXT_PUBLIC_GIT_COMMIT || 'unknown';

export function sourceUrlForCommit(commit: string): string {
  const normalized = commit.trim();
  if (/^[0-9a-f]{7,40}$/i.test(normalized)) {
    return `${PRODUCT.repositoryUrl}/tree/${normalized}`;
  }
  return PRODUCT.repositoryUrl;
}

export const CORRESPONDING_SOURCE_URL = sourceUrlForCommit(BUILD_COMMIT);
