"use client";

import * as React from "react";
import { useState, useCallback, useMemo, useEffect } from "react";
import { Avatar as AvatarPrimitive } from "radix-ui";
import { cn } from "@/lib/utils";
import { useSettingsStore } from "@/stores/settings-store";
import { useContactStore, getContactPhotoUri } from "@/stores/contact-store";
import { useConfig } from "@/hooks/use-config";
import { avatarHooks } from "@/lib/plugin-hooks";
import { withBasePath } from "@/lib/browser-navigation";
import { AVATAR_COLORS } from "@/lib/account-utils";

const IS_DEV = process.env.NODE_ENV !== "production";

// Known multi-part TLDs where the "main" domain includes one extra label.
// e.g. "newsletter.example.co.uk" → "example.co.uk", not "co.uk".
const MULTI_PART_TLDS = new Set([
  "co.uk", "org.uk", "me.uk", "ac.uk", "gov.uk", "net.uk",
  "co.jp", "or.jp", "ne.jp", "ac.jp", "go.jp",
  "co.kr", "or.kr", "go.kr", "ac.kr",
  "co.in", "net.in", "org.in", "ac.in", "gov.in",
  "co.nz", "org.nz", "net.nz", "govt.nz", "ac.nz",
  "co.za", "org.za", "net.za", "gov.za", "ac.za",
  "com.au", "net.au", "org.au", "edu.au", "gov.au",
  "com.br", "net.br", "org.br", "edu.br", "gov.br",
  "com.cn", "net.cn", "org.cn", "gov.cn", "edu.cn",
  "com.mx", "net.mx", "org.mx", "gob.mx", "edu.mx",
  "com.ar", "net.ar", "org.ar", "gob.ar", "edu.ar",
  "com.tw", "net.tw", "org.tw", "edu.tw", "gov.tw",
  "com.hk", "net.hk", "org.hk", "edu.hk", "gov.hk",
  "com.sg", "net.sg", "org.sg", "edu.sg", "gov.sg",
  "com.my", "net.my", "org.my", "edu.my", "gov.my",
  "com.ph", "net.ph", "org.ph", "edu.ph", "gov.ph",
  "com.pk", "net.pk", "org.pk", "edu.pk", "gov.pk",
  "com.ng", "net.ng", "org.ng", "edu.ng", "gov.ng",
  "co.il", "org.il", "net.il", "ac.il", "gov.il",
  "co.th", "or.th", "ac.th", "go.th", "in.th",
  "co.id", "or.id", "ac.id", "go.id", "web.id",
  "com.tr", "net.tr", "org.tr", "edu.tr", "gov.tr",
  "com.ua", "net.ua", "org.ua", "edu.ua", "gov.ua",
  "com.eg", "net.eg", "org.eg", "edu.eg", "gov.eg",
  "com.sa", "net.sa", "org.sa", "edu.sa", "gov.sa",
  "co.ke", "or.ke", "ac.ke", "go.ke", "ne.ke",
]);

/**
 * Extract the root/registrable domain from a full domain.
 * e.g. "newsletter.example.com" → "example.com"
 *      "mail.shop.example.co.uk" → "example.co.uk"
 *      "example.com" → "example.com"
 */
function getRootDomain(domain: string): string {
  const parts = domain.split(".");
  if (parts.length <= 2) return domain;

  // Check if the last two parts form a known multi-part TLD
  const lastTwo = parts.slice(-2).join(".");
  if (MULTI_PART_TLDS.has(lastTwo)) {
    // Need at least 3 parts for a valid domain under a multi-part TLD
    return parts.length >= 3 ? parts.slice(-3).join(".") : domain;
  }

  // Standard TLD: take last two parts
  return parts.slice(-2).join(".");
}

// Module-level cache of domains whose favicons failed to load.
// Shared across all Avatar instances to avoid re-requesting known-bad domains.
const failedFaviconDomains = new Set<string>();
// Personal email domains where the favicon is the mail provider logo, not the sender
const PERSONAL_DOMAINS = new Set([
  "gmail.com", "googlemail.com", "outlook.com", "hotmail.com", "live.com",
  "msn.com", "yahoo.com", "yahoo.fr", "yahoo.co.uk", "yahoo.co.jp",
  "aol.com", "icloud.com", "me.com", "mac.com", "mail.com",
  "proton.me", "protonmail.com", "pm.me", "tutanota.com", "tuta.com",
  "zoho.com", "yandex.com", "yandex.ru", "gmx.com", "gmx.net",
  "fastmail.com", "hey.com", "posteo.de", "mailbox.org",
  "example.com", "example.org",
]);

// Deterministic hash for an email string
function emailHash(email: string): number {
  let hash = 0;
  for (let i = 0; i < email.length; i++) {
    hash = email.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash);
}

// Dev-only: common first names to infer gender for demo portrait selection
const FEMALE_NAMES: Set<string> = IS_DEV ? new Set([
  "alice", "emily", "sarah", "priya", "carol", "anna", "maria", "emma", "olivia",
  "sophia", "isabella", "mia", "charlotte", "amelia", "harper", "ella", "grace",
  "chloe", "luna", "lily", "zoey", "hannah", "nora", "riley", "elena", "maya",
  "claire", "victoria", "natalie", "rachel", "jessica", "jennifer", "lisa",
  "karen", "nancy", "betty", "sandra", "ashley", "margaret", "dorothy",
  "julia", "laura", "susan", "andrea", "diana", "marie", "sophie",
]) : new Set();

const MALE_NAMES: Set<string> = IS_DEV ? new Set([
  "bob", "marcus", "alex", "david", "james", "john", "robert", "michael",
  "william", "richard", "joseph", "thomas", "charles", "daniel", "matthew",
  "anthony", "mark", "steven", "paul", "andrew", "kevin", "brian", "george",
  "timothy", "jason", "ryan", "jacob", "gary", "eric", "peter", "frank",
  "samuel", "benjamin", "henry", "patrick", "jack", "noah", "liam", "oliver",
  "lucas", "ethan", "mason", "logan", "leo", "max", "oscar", "hugo",
]) : new Set();

function inferGender(name: string | undefined, hash: number): "women" | "men" {
  if (name) {
    const firstName = name.trim().split(/\s+/)[0].toLowerCase();
    if (FEMALE_NAMES.has(firstName)) return "women";
    if (MALE_NAMES.has(firstName)) return "men";
  }
  return hash % 2 === 0 ? "women" : "men";
}

// Dev-only: custom avatar URLs for specific demo senders
const CUSTOM_AVATARS: Record<string, string> = IS_DEV ? {
  "newsletter@launchweekly.com": "https://img.freepik.com/premium-vector/swoosh-letter-lw-logo-design-business-company-identity-water-wave-lw-logo-with-modern-trendy_754537-799.jpg?w=360",
  "hello@launchpad.example": "https://img.freepik.com/premium-vector/swoosh-letter-lw-logo-design-business-company-identity-water-wave-lw-logo-with-modern-trendy_754537-799.jpg?w=360",
  "news@techdigest.example": "https://img.freepik.com/premium-vector/technology-letter-t-logo-design-template_125964-1249.jpg?w=360",
  "alice@example.com": "https://randomuser.me/api/portraits/thumb/women/44.jpg",
  "bob@example.org": "https://randomuser.me/api/portraits/thumb/men/32.jpg",
  "carol@example.com": "https://randomuser.me/api/portraits/thumb/women/68.jpg",
} : {};

// Mock-server-only: for personal-domain emails, deterministically pick a randomuser.me portrait.
// Returns null for ~30% of addresses so not everyone has a photo.
function getProfilePictureUrl(email: string, domain: string, devMode: boolean, name?: string): string | null {
  if (!devMode) return null;
  if (!PERSONAL_DOMAINS.has(domain)) return null;
  const h = emailHash(email);
  if (h % 10 < 3) return null; // ~30% get no photo
  const gender = inferGender(name, h);
  const id = h % 100;
  return `https://randomuser.me/api/portraits/thumb/${gender}/${id}.jpg`;
}

interface AvatarProps {
  name?: string;
  email?: string;
  contactPhotoUri?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
  /** When true, suppress all image sources (favicons, plugin avatars, profile pics, contact photos) and render initials only. */
  disableImages?: boolean;
  /** When true, do not fall through to the sender's domain favicon. Use for the user's own account avatar where the mail-provider logo is not meaningful. */
  disableFavicon?: boolean;
  /** Background color used when no image source resolves. Overrides the hash-based default. */
  fallbackColor?: string;
  /** Tooltip text. Defaults to the display name, then the email address. */
  title?: string;
}

export function Avatar({ name, email, contactPhotoUri, size = "md", className, disableImages = false, disableFavicon = false, fallbackColor, title }: AvatarProps) {
  // Set of image URLs known to be broken for this instance. Any source that
  // errors (or resolves to the favicon 1x1 sentinel) is recorded here so the
  // priority chain falls through to the next source and, ultimately, initials.
  // This generalizes the previous favicon-only fallback to every image source.
  const [failedSrcs, setFailedSrcs] = useState<Set<string>>(() => new Set());
  const [pluginAvatarUrl, setPluginAvatarUrl] = useState<string | null>(null);
  const [pluginAvatarFailed, setPluginAvatarFailed] = useState(false);
  const senderFavicons = useSettingsStore((s) => s.senderFavicons);
  const contacts = useContactStore((s) => s.contacts);
  const { devMode } = useConfig();

  // Reset per-instance broken-image state whenever the identity being rendered
  // changes, so a fresh subject is not penalized by a previous one's failures.
  useEffect(() => {
    setFailedSrcs(new Set());
  }, [email, name, contactPhotoUri]);

  // Ask plugins (e.g. Gravatar) to resolve an avatar URL for this email address.
  // Runs whenever email or name changes; resets plugin avatar state on each change.
  useEffect(() => {
    setPluginAvatarUrl(null);
    setPluginAvatarFailed(false);
    if (!email || avatarHooks.onAvatarResolve.size === 0) return;
    let cancelled = false;
    avatarHooks.onAvatarResolve
      .transform(null as string | null, { email, name })
      .then((url) => { if (!cancelled) setPluginAvatarUrl(url); })
      .catch(() => { if (!cancelled) setPluginAvatarFailed(true); });
    return () => { cancelled = true; };
  }, [email, name]);

  // Look up contact photo by email from the contact store
  const resolvedContactPhoto = useMemo(() => {
    if (contactPhotoUri) return contactPhotoUri;
    if (!email) return undefined;
    const lowerEmail = email.toLowerCase();
    for (const contact of contacts) {
      if (!contact.emails) continue;
      for (const e of Object.values(contact.emails)) {
        if (e.address.toLowerCase() === lowerEmail) {
          return getContactPhotoUri(contact);
        }
      }
    }
    return undefined;
  }, [contactPhotoUri, email, contacts]);

  const domain = email?.split("@")[1]?.toLowerCase();
  // Use root domain for favicon lookups (e.g. newsletter.example.com → example.com)
  const faviconDomain = domain ? getRootDomain(domain) : undefined;
  const domainFailed = faviconDomain ? failedFaviconDomains.has(faviconDomain) : false;

  const getInitials = () => {
    if (name) {
      const parts = name
        .trim()
        .split(/\s+/)
        .map((p) => p.replace(/^[^\p{L}\p{N}]+/u, ""))
        .filter((p) => p.length > 0);
      if (parts.length >= 2) {
        return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
      }
      if (parts.length === 1) {
        return parts[0].slice(0, 2).toUpperCase();
      }
      return name.slice(0, 2).toUpperCase();
    }
    if (email) {
      return email[0].toUpperCase();
    }
    return "?";
  };

  const getBackgroundColor = () => {
    const str = name || email || "";
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    // Index into the shared AA-safe palette instead of hsl(hue, 70%, 50%): the
    // continuous formula produced yellow/green/cyan/teal fills below 4.5:1
    // against the white initials, failing the contrast axe scan. Same hash ->
    // same index keeps colors deterministic per sender.
    return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
  };

  const sizeClasses = {
    sm: "w-8 h-8 text-xs",
    md: "w-10 h-10 text-sm",
    lg: "w-12 h-12 text-base",
  };

  const profilePic = email && domain ? getProfilePictureUrl(email, domain, devMode, name) : null;
  const showFavicon =
    !disableFavicon && senderFavicons && faviconDomain && !PERSONAL_DOMAINS.has(faviconDomain) && !domainFailed;

  // Priority: contact photo > plugin avatar (e.g. Gravatar) > custom avatar > profile picture > company favicon > initials
  const customAvatar = devMode && email ? CUSTOM_AVATARS[email.toLowerCase()] : null;
  const pluginAvatar = pluginAvatarFailed ? null : pluginAvatarUrl;
  const faviconSrc =
    showFavicon && faviconDomain
      ? withBasePath(`/api/favicon?domain=${encodeURIComponent(faviconDomain)}`)
      : null;

  // Ordered candidate sources; the first that has not failed for this instance wins.
  const candidateSrcs = disableImages
    ? []
    : ([resolvedContactPhoto, pluginAvatar, customAvatar, profilePic, faviconSrc].filter(
        Boolean,
      ) as string[]);
  const imgSrc = candidateSrcs.find((src) => !failedSrcs.has(src)) ?? null;
  const isFavicon = imgSrc !== null && imgSrc === faviconSrc;

  const handleImgError = useCallback(() => {
    if (!imgSrc) return;
    // Let the plugin hook layer know its resolved URL was unusable.
    if (pluginAvatar && imgSrc === pluginAvatar) {
      setPluginAvatarFailed(true);
    }
    // If this was the domain favicon, remember the domain module-wide so other
    // Avatar instances skip the known-bad request.
    if (faviconDomain && faviconSrc && imgSrc === faviconSrc) {
      failedFaviconDomains.add(faviconDomain);
    }
    // Record the broken URL so the next-priority source (or initials) is used.
    setFailedSrcs((prev) => {
      const next = new Set(prev);
      next.add(imgSrc);
      return next;
    });
  }, [imgSrc, pluginAvatar, faviconDomain, faviconSrc]);

  const resolvedTitle = title ?? (name || email);

  return (
    <AvatarPrimitive.Root
      data-slot="avatar"
      className={cn(
        "rounded-full flex items-center justify-center font-semibold text-white overflow-hidden select-none",
        sizeClasses[size],
        className,
      )}
      style={{
        backgroundColor: imgSrc
          ? isFavicon
            ? "#ffffff"
            : "transparent"
          : fallbackColor ?? getBackgroundColor(),
      }}
      title={resolvedTitle}
    >
      {imgSrc ? (
        <img
          src={imgSrc}
          alt=""
          className="w-full h-full object-cover"
          onError={handleImgError}
          // /api/favicon returns a 1x1 transparent PNG (HTTP 200) when no real
          // favicon exists, to avoid spamming the DevTools console with 404s.
          // Detect that sentinel by naturalWidth and fall back to initials.
          onLoad={(e) => {
            const img = e.currentTarget;
            if (isFavicon && img.naturalWidth <= 1) {
              handleImgError();
            }
          }}
        />
      ) : (
        <AvatarPrimitive.Fallback data-slot="avatar-fallback" className="leading-none">
          {getInitials()}
        </AvatarPrimitive.Fallback>
      )}
    </AvatarPrimitive.Root>
  );
}

/**
 * Vanilla shadcn/ui Avatar primitives, kept for future composition (e.g. cases
 * that want Radix's async image loading directly). The rich {@link Avatar}
 * above is the primary, behavior-rich component used across the app.
 */
function AvatarRoot({
  className,
  ...props
}: React.ComponentProps<typeof AvatarPrimitive.Root>) {
  return (
    <AvatarPrimitive.Root
      data-slot="avatar-root"
      className={cn(
        "relative flex size-8 shrink-0 overflow-hidden rounded-full select-none",
        className,
      )}
      {...props}
    />
  );
}

function AvatarImage({
  className,
  ...props
}: React.ComponentProps<typeof AvatarPrimitive.Image>) {
  return (
    <AvatarPrimitive.Image
      data-slot="avatar-image"
      className={cn("aspect-square size-full", className)}
      {...props}
    />
  );
}

function AvatarFallback({
  className,
  ...props
}: React.ComponentProps<typeof AvatarPrimitive.Fallback>) {
  return (
    <AvatarPrimitive.Fallback
      data-slot="avatar-fallback"
      className={cn(
        "flex size-full items-center justify-center rounded-full bg-muted text-sm text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}

function AvatarBadge({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="avatar-badge"
      className={cn(
        "absolute right-0 bottom-0 z-10 inline-flex items-center justify-center rounded-full bg-primary text-primary-foreground ring-2 ring-background select-none",
        className,
      )}
      {...props}
    />
  );
}

function AvatarGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="avatar-group"
      className={cn(
        "group/avatar-group flex -space-x-2 *:data-[slot=avatar]:ring-2 *:data-[slot=avatar]:ring-background",
        className,
      )}
      {...props}
    />
  );
}

function AvatarGroupCount({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="avatar-group-count"
      className={cn(
        "relative flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-sm text-muted-foreground ring-2 ring-background",
        className,
      )}
      {...props}
    />
  );
}

export {
  AvatarRoot,
  AvatarImage,
  AvatarFallback,
  AvatarBadge,
  AvatarGroup,
  AvatarGroupCount,
};

export type { AvatarProps };
