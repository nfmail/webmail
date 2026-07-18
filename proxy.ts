import { type NextRequest, NextResponse } from "next/server";
import {
  LOCALE_COOKIE,
  isSupportedLocale,
  localeFromAcceptLanguage,
  routing,
} from "./i18n/routing";
import { getEnabledPluginFrameOrigins } from "./lib/admin/csp-frame-origins";
import { configManager } from "./lib/admin/config-manager";
import { detectSetupState } from "./lib/setup/state";

/**
 * Locale negotiation for the [locale] app segment (replaces next-intl's
 * middleware). Detection order: NEXT_LOCALE cookie, Accept-Language, default.
 * Prefix modes: "always"/"as-needed" redirect to the prefixed URL; "never"
 * (and the default locale in "as-needed") rewrites internally so the URL
 * stays clean.
 */
function localeMiddleware(request: NextRequest, requestHeaders: Headers): NextResponse {
  const pathname = request.nextUrl.pathname;
  const cookieLocale = request.cookies.get(LOCALE_COOKIE)?.value;
  const locale = isSupportedLocale(cookieLocale)
    ? cookieLocale
    : (localeFromAcceptLanguage(request.headers.get("accept-language")) ??
      routing.defaultLocale);

  const url = request.nextUrl.clone();
  url.pathname = pathname === "/" ? `/${locale}` : `/${locale}${pathname}`;

  const needsPrefix =
    routing.localePrefix === "always" ||
    (routing.localePrefix === "as-needed" && locale !== routing.defaultLocale);

  const response = needsPrefix
    ? NextResponse.redirect(url)
    : NextResponse.rewrite(url, { request: { headers: requestHeaders } });
  if (cookieLocale !== locale) {
    response.cookies.set(LOCALE_COOKIE, locale, { path: "/", sameSite: "lax" });
  }
  return response;
}

// Next 16's Proxy always runs on Node.js runtime and route-segment config
// (e.g. `export const config = { matcher }`) is no longer allowed in the
// proxy file. We replicate the previous matcher inline by short-circuiting
// requests for API routes, Next internals and static assets.
const PROXY_SKIP_PATTERN = /^\/(?:api|_next)(?:\/|$)|\.[^/]+$/;

function isSetupPath(pathname: string): boolean {
  return (
    pathname === "/setup" ||
    pathname.startsWith("/setup/") ||
    pathname.startsWith("/api/setup")
  );
}

export async function proxy(request: NextRequest) {
  // Resolve setup state before deciding what to skip. The first call after
  // boot triggers the config load; subsequent calls are in-memory.
  await configManager.ensureLoaded();
  const setupState = detectSetupState();
  const pathname = request.nextUrl.pathname;

  if (setupState === "bootstrap") {
    // Wizard active. Redirect HTML pages to /setup; let asset/internal
    // requests through so the wizard UI can render. Block non-setup APIs
    // with a 503 so cached SPA code doesn't silently call them.
    const allowed =
      isSetupPath(pathname) ||
      pathname === "/api/health" ||
      pathname.startsWith("/_next/") ||
      pathname.startsWith("/branding/") ||
      // Public read endpoint - serves wizard-uploaded branding assets so
      // image previews work during the wizard. No auth on the GET route.
      pathname.startsWith("/api/admin/branding/") ||
      /\.[^/]+$/.test(pathname);

    if (!allowed) {
      if (pathname.startsWith("/api/")) {
        return new NextResponse(
          JSON.stringify({ error: "setup_required", message: "Initial setup has not completed." }),
          { status: 503, headers: { "content-type": "application/json" } },
        );
      }
      const url = request.nextUrl.clone();
      url.pathname = "/setup";
      url.search = request.nextUrl.search;
      return NextResponse.redirect(url);
    }
  } else if (isSetupPath(pathname)) {
    // Configured / env-managed: wizard is no longer reachable.
    //  - HTML /setup pages → redirect to admin login so users who reload
    //    the URL after setup don't see a dead "Not Found" page.
    //  - /api/setup/* → 404 (no reason to expose these endpoints).
    if (pathname.startsWith("/api/setup")) {
      return new NextResponse("Not Found", { status: 404 });
    }
    const url = request.nextUrl.clone();
    url.pathname = "/admin/login";
    url.search = "";
    return NextResponse.redirect(url);
  }

  if (PROXY_SKIP_PATTERN.test(pathname)) {
    return NextResponse.next();
  }

  const nonce = crypto.randomUUID();
  const isDev = process.env.NODE_ENV === "development";
  // The plugin-sandbox iframe document needs `'unsafe-eval'` to run plugin
  // bundles via `new Function`. The untrusted route is null-origin
  // (sandbox="allow-scripts"); the privileged route is same-origin
  // (allow-same-origin) so a vetted plugin gets real WebCrypto + IndexedDB.
  // Both get the SAME CSP relaxations (unsafe-eval, frame-ancestors 'self');
  // the privileged route's extra power comes from the iframe sandbox flag the
  // host sets, gated by signature + admin approval, NOT from a wider CSP.
  const isSandboxPath =
    pathname === "/plugin-sandbox" ||
    pathname.startsWith("/plugin-sandbox/") ||
    pathname === "/plugin-sandbox-privileged" ||
    pathname.startsWith("/plugin-sandbox-privileged/");

  const scriptSrc = isSandboxPath
    ? `'self' 'nonce-${nonce}' 'unsafe-eval'`
    : isDev
    ? `'self' 'nonce-${nonce}' 'unsafe-eval'`
    : `'self' 'nonce-${nonce}'`;

  const connectSrc = isDev ? `'self' http: https: ws: wss:` : `'self' https:`;

  const frameAncestors = isSandboxPath
    ? `'self'`
    : process.env.ALLOWED_FRAME_ANCESTORS?.trim() || "'none'";

  // Plugins may declare iframe origins they need (e.g. for embedded video).
  // Each origin is validated at install time and re-validated here.
  const pluginFrameOrigins = await getEnabledPluginFrameOrigins();
  const frameSrc =
    pluginFrameOrigins.length > 0
      ? `frame-src 'self' blob: ${pluginFrameOrigins.join(" ")}`
      : `frame-src 'self' blob:`;

  const csp = [
    `default-src 'self'`,
    `script-src ${scriptSrc}`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data: blob: https:`,
    `font-src 'self' https: data:`,
    `connect-src ${connectSrc}`,
    frameSrc,
    `object-src 'self' blob:`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `frame-ancestors ${frameAncestors}`,
    `media-src 'self' blob:`,
  ].join("; ");

  // Skip intl middleware for routes outside the localized app tree.
  const isAdminRoute = pathname === '/admin' || pathname.startsWith('/admin/');
  const isProtocolRoute = pathname === '/protocol' || pathname.startsWith('/protocol/');
  const isSetupRoute = pathname === '/setup' || pathname.startsWith('/setup/');
  // The plugin sandbox lives in its own root layout under app/(sandbox)/ and
  // is not part of the localized tree. Letting next-intl rewrite the path to
  // /en/plugin-sandbox 404s, which kills the iframe and disables every plugin.
  const isSandboxRoute = isSandboxPath;

  // When localePrefix is 'always', paths that already have a locale prefix
  // (e.g. /en/settings) should not be re-processed by the intl middleware -
  // doing so can trigger rewrite loops when combined with a proxy basePath.
  const locales = routing.locales as readonly string[];
  const hasLocalePrefix = locales.some(
    (l) => pathname === `/${l}` || pathname.startsWith(`/${l}/`)
  );

  // Expose the nonce AND the request pathname to server components as request
  // headers. The root (main)/layout renders <html> ABOVE the [locale] segment,
  // so the request locale can't be resolved from route params there - the
  // layout reads x-pathname to recover it for <html lang>. Forward through the
  // official `request.headers` mechanism: hand-writing only our two names into
  // x-middleware-override-headers made Next treat that as the COMPLETE header
  // allowlist, stripping the RSC router headers and silently breaking every
  // client-side navigation in dev.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("x-pathname", pathname);

  let intlResponse: NextResponse | null = null;
  if (!isAdminRoute && !isProtocolRoute && !isSetupRoute && !isSandboxRoute && !hasLocalePrefix) {
    try {
      intlResponse = localeMiddleware(request, requestHeaders);
    } catch (error) {
      console.error('Locale middleware error:', error);
    }
  }
  const response =
    intlResponse ?? NextResponse.next({ request: { headers: requestHeaders } });

  response.headers.set("X-Content-Type-Options", "nosniff");

  // X-Frame-Options only supports DENY/SAMEORIGIN. When frame-ancestors
  // specifies explicit origins, we rely solely on the CSP header.
  if (frameAncestors === "'none'") {
    response.headers.set("X-Frame-Options", "DENY");
  }

  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("X-XSS-Protection", "0");
  response.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=()"
  );
  response.headers.set("Content-Security-Policy", csp);

  return response;
}
