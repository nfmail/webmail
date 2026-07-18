"use client";

import { useState, useEffect, useRef } from "react";
import { useTranslations } from "@/i18n/client";
import { useTotpReauthStore } from "@/stores/totp-reauth-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Shield } from "lucide-react";

/**
 * Modal dialog that prompts the user for a fresh TOTP code when their
 * 2FA session expires (TOTP rotates every ~30 seconds).
 *
 * Rendered once at the app root level. The JMAP client triggers it via
 * the useTotpReauthStore when a 401 is received on a TOTP-authenticated session.
 */
export function TotpReauthDialog() {
  const t = useTranslations();
  const { isOpen, submit, cancel } = useTotpReauthStore();
  const [code, setCode] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Clear any previously entered code whenever the dialog is (re)opened so a
  // stale value never lingers in the field.
  useEffect(() => {
    if (isOpen) {
      setCode("");
    }
  }, [isOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (code.length >= 6) {
      submit(code);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) cancel(); }}>
      <DialogContent
        showCloseButton={false}
        className="max-w-sm gap-0"
        onOpenAutoFocus={(e) => {
          // Focus the code field directly instead of Radix's default target.
          e.preventDefault();
          inputRef.current?.focus();
        }}
      >
        <DialogHeader className="flex-row items-center gap-3 text-left">
          <div className="flex items-center justify-center w-10 h-10 rounded-full bg-primary/10">
            <Shield className="w-5 h-5 text-primary" />
          </div>
          <div>
            <DialogTitle className="text-lg font-semibold text-foreground">
              Session Expired
            </DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              Your 2FA code has rotated
            </DialogDescription>
          </div>
        </DialogHeader>

        <p className="text-sm text-muted-foreground mt-4 mb-4">
          Enter a fresh authentication code from your authenticator app to continue.
        </p>

        <p className="text-xs text-warning mb-4 leading-relaxed">
          To avoid being prompted repeatedly, ask your administrator to enable OAuth authentication
          (either Stalwart&apos;s built-in OAuth or an external identity provider).
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Input
            ref={inputRef}
            type="text"
            inputMode="numeric"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            className="h-12 text-center font-mono tracking-widest text-lg bg-muted/40 border-border/60 rounded-xl focus:bg-background focus:border-primary/50 transition-all duration-200"
            placeholder="000000"
            autoComplete="one-time-code"
            aria-label={t("Authentication code")}
          />
          <div className="flex gap-3">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={cancel}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="flex-1"
              disabled={code.length < 6}
            >
              Verify
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
