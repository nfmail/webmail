import { render, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Characterization tests for the hand-rolled Avatar. This component has real
 * custom logic (initials derivation, deterministic color, image-source priority
 * and favicon fallback), so these lock the observable public behavior via its
 * actual props API.
 *
 * The surrounding stores/hooks are mocked so behavior is deterministic and
 * independent of app state. Mutable knobs let individual tests drive
 * senderFavicons / devMode.
 */
const mockState = {
  senderFavicons: true,
  devMode: false,
};

vi.mock('@/stores/settings-store', () => ({
  useSettingsStore: (selector: (s: { senderFavicons: boolean }) => unknown) =>
    selector({ senderFavicons: mockState.senderFavicons }),
}));

vi.mock('@/stores/contact-store', () => ({
  useContactStore: (selector: (s: { contacts: unknown[] }) => unknown) =>
    selector({ contacts: [] }),
  getContactPhotoUri: () => undefined,
}));

vi.mock('@/hooks/use-config', () => ({
  useConfig: () => ({ devMode: mockState.devMode }),
}));

vi.mock('@/lib/plugin-hooks', () => ({
  avatarHooks: { onAvatarResolve: { size: 0 } },
}));

vi.mock('@/lib/browser-navigation', () => ({
  withBasePath: (url: string) => url,
}));

import { Avatar } from '../avatar';

describe('Avatar (characterization)', () => {
  beforeEach(() => {
    mockState.senderFavicons = true;
    mockState.devMode = false;
  });

  describe('initials derivation', () => {
    it('uses first+last initial for a multi-word name', () => {
      const { container } = render(<Avatar name="Alice Smith" />);
      expect(container.textContent).toBe('AS');
    });

    it('uses first+last initial across 3+ words (first and LAST word)', () => {
      const { container } = render(<Avatar name="Mary Jane Watson" />);
      expect(container.textContent).toBe('MW');
    });

    it('takes first two letters of a single-word name, uppercased', () => {
      const { container } = render(<Avatar name="bob" />);
      expect(container.textContent).toBe('BO');
    });

    it('strips leading non-alphanumeric characters before deriving initials', () => {
      const { container } = render(<Avatar name="  *Alice  #Bob" />);
      expect(container.textContent).toBe('AB');
    });

    it('falls back to first letter of email when no name', () => {
      const { container } = render(<Avatar email="zoe@gmail.com" />);
      expect(container.textContent).toBe('Z');
    });

    it('renders "?" when neither name nor email is provided', () => {
      const { container } = render(<Avatar />);
      expect(container.textContent).toBe('?');
    });
  });

  describe('background color', () => {
    it('is deterministic for the same input', () => {
      const a = render(<Avatar name="Consistent" />).container.firstChild as HTMLElement;
      const b = render(<Avatar name="Consistent" />).container.firstChild as HTMLElement;
      expect(a.style.backgroundColor).toBe(b.style.backgroundColor);
    });

    it('differs for different inputs (hash-based hue)', () => {
      const a = render(<Avatar name="Alpha" />).container.firstChild as HTMLElement;
      const b = render(<Avatar name="Zeta" />).container.firstChild as HTMLElement;
      expect(a.style.backgroundColor).not.toBe(b.style.backgroundColor);
    });

    it('honors an explicit fallbackColor over the hash default', () => {
      const el = render(<Avatar name="Alice" fallbackColor="rgb(1, 2, 3)" />)
        .container.firstChild as HTMLElement;
      expect(el.style.backgroundColor).toBe('rgb(1, 2, 3)');
    });
  });

  describe('title / tooltip', () => {
    it('uses the name as the title when present', () => {
      const el = render(<Avatar name="Alice" email="a@gmail.com" />)
        .container.firstChild as HTMLElement;
      expect(el.getAttribute('title')).toBe('Alice');
    });

    it('falls back to the email as title when no name', () => {
      const el = render(<Avatar email="a@gmail.com" />).container.firstChild as HTMLElement;
      expect(el.getAttribute('title')).toBe('a@gmail.com');
    });
  });

  describe('image source resolution', () => {
    it('renders a contact photo image when contactPhotoUri is provided', () => {
      const { container } = render(
        <Avatar name="Alice" contactPhotoUri="https://example.test/p.png" />
      );
      const img = container.querySelector('img');
      expect(img).not.toBeNull();
      expect(img).toHaveAttribute('src', 'https://example.test/p.png');
      // Decorative image: empty alt so it is not announced separately.
      expect(img).toHaveAttribute('alt', '');
    });

    it('renders initials (no image) when disableImages is set, even with a photo', () => {
      const { container } = render(
        <Avatar name="Alice Smith" contactPhotoUri="https://example.test/p.png" disableImages />
      );
      expect(container.querySelector('img')).toBeNull();
      expect(container.textContent).toBe('AS');
    });

    it('renders a domain favicon for a non-personal sender domain when senderFavicons is on', () => {
      const { container } = render(<Avatar email="press@char-corp-a.test" />);
      const img = container.querySelector('img');
      expect(img).not.toBeNull();
      expect(img?.getAttribute('src')).toContain('/api/favicon?domain=char-corp-a.test');
    });

    it('does NOT render a favicon for personal mail domains (renders initials)', () => {
      const { container } = render(<Avatar email="someone@gmail.com" />);
      expect(container.querySelector('img')).toBeNull();
      expect(container.textContent).toBe('S');
    });

    it('does NOT render a favicon when disableFavicon is set', () => {
      const { container } = render(<Avatar email="press@char-corp-b.test" disableFavicon />);
      expect(container.querySelector('img')).toBeNull();
    });

    it('does NOT render a favicon when senderFavicons setting is off', () => {
      mockState.senderFavicons = false;
      const { container } = render(<Avatar email="press@char-corp-c.test" />);
      expect(container.querySelector('img')).toBeNull();
    });
  });

  describe('broken-image fallback (all sources, not just favicons)', () => {
    // Improvement over the original: the hand-rolled Avatar only ever fell back
    // to initials for a broken *favicon*. A broken contact photo / plugin /
    // custom image kept rendering the broken <img> forever. The Radix-composed
    // rewrite tracks every failed source, so ANY broken image now falls through
    // to initials. This assertion would fail against the old favicon-only logic.
    it('falls back to initials when a contact photo fails to load (onError)', () => {
      const { container } = render(
        <Avatar name="Alice Smith" contactPhotoUri="https://example.test/broken.png" />,
      );
      const img = container.querySelector('img');
      expect(img).not.toBeNull();
      fireEvent.error(img!);
      expect(container.querySelector('img')).toBeNull();
      expect(container.textContent).toBe('AS');
    });
  });

  describe('favicon load/error fallback', () => {
    it('falls back to initials when the favicon fails to load (onError)', () => {
      const { container } = render(<Avatar name="News Bot" email="press@char-corp-d.test" />);
      const img = container.querySelector('img');
      expect(img).not.toBeNull();
      fireEvent.error(img!);
      expect(container.querySelector('img')).toBeNull();
      expect(container.textContent).toBe('NB');
    });

    it('treats a 1x1 sentinel favicon (naturalWidth<=1 onLoad) as no favicon', () => {
      const { container } = render(<Avatar name="News Bot" email="press@char-corp-e.test" />);
      const img = container.querySelector('img');
      expect(img).not.toBeNull();
      // jsdom images report naturalWidth 0, which the component treats as the
      // /api/favicon transparent sentinel and falls back to initials.
      fireEvent.load(img!);
      expect(container.querySelector('img')).toBeNull();
      expect(container.textContent).toBe('NB');
    });
  });
});
