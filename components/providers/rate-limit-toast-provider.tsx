"use client";

import { useEffect } from 'react';
import { useTranslations } from '@/i18n/client';
import { toast } from '@/stores/toast-store';

type RateLimitBlockedDetail = {
  retryAfterMs?: number;
};

export function RateLimitToastProvider({ children }: { children: React.ReactNode }) {
  const tCommon = useTranslations();

  useEffect(() => {
    const onRateLimitBlocked = (event: Event) => {
      const detail = (event as CustomEvent<RateLimitBlockedDetail>).detail;
      const seconds = Math.max(1, Math.ceil((detail?.retryAfterMs ?? 0) / 1000));

      toast.warning(
        tCommon("Request paused to avoid lockout."),
        tCommon("Bulwark is waiting for the server cooldown to end before sending more authenticated requests. Try again in {seconds}s.", { seconds }),
      );
    };

    window.addEventListener('bulwark:rate-limit-blocked', onRateLimitBlocked);
    return () => window.removeEventListener('bulwark:rate-limit-blocked', onRateLimitBlocked);
  }, [tCommon]);

  return <>{children}</>;
}