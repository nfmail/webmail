"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { useTranslations } from "@/i18n/client";
import { X, ShieldCheck, Search, Trash2, Plus, Loader2 } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { useSettingsStore } from "@/stores/settings-store";
import { useContactStore } from "@/stores/contact-store";
import { useAuthStore } from "@/stores/auth-store";
import { cn } from "@/lib/utils";

interface TrustedSendersModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function TrustedSendersModal({ isOpen, onClose }: TrustedSendersModalProps) {
  const t = useTranslations();
  const inputRef = useRef<HTMLInputElement>(null);

  const { trustedSenders, addTrustedSender, removeTrustedSender, trustedSendersAddressBook } = useSettingsStore();
  const {
    trustedSenderEmails,
    trustedSendersLoaded,
    trustedSendersLoading,
    loadTrustedSendersBook,
    addToTrustedSendersBook,
    removeFromTrustedSendersBook,
  } = useContactStore();
  const { client } = useAuthStore();

  const [searchQuery, setSearchQuery] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [emailError, setEmailError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // When address book mode is on, load the book on first open
  useEffect(() => {
    if (isOpen && trustedSendersAddressBook && client && !trustedSendersLoaded) {
      loadTrustedSendersBook(client);
    }
  }, [isOpen, trustedSendersAddressBook, client, trustedSendersLoaded, loadTrustedSendersBook]);

  // The active list depends on mode
  const activeSenders = trustedSendersAddressBook ? trustedSenderEmails : trustedSenders;
  const isLoading = trustedSendersAddressBook && (!trustedSendersLoaded || trustedSendersLoading);

  // Filter senders based on search query
  const filteredSenders = useMemo(() => {
    if (!searchQuery.trim()) return activeSenders;
    const query = searchQuery.toLowerCase();
    return activeSenders.filter((email) => email.toLowerCase().includes(query));
  }, [activeSenders, searchQuery]);

  // Show search only when 5+ senders
  const showSearch = activeSenders.length >= 5;

  // Focus input when adding mode is enabled
  useEffect(() => {
    if (isAdding && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isAdding]);

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setSearchQuery("");
      setIsAdding(false);
      setNewEmail("");
      setEmailError("");
    }
  }, [isOpen]);

  const validateEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const handleAddSender = async () => {
    const trimmedEmail = newEmail.trim().toLowerCase();

    if (!trimmedEmail) {
      setEmailError(t("Please enter a valid email address"));
      return;
    }

    if (!validateEmail(trimmedEmail)) {
      setEmailError(t("Please enter a valid email address"));
      return;
    }

    if (activeSenders.includes(trimmedEmail)) {
      setEmailError(t("This sender is already trusted"));
      return;
    }

    setIsSubmitting(true);
    try {
      if (trustedSendersAddressBook && client) {
        await addToTrustedSendersBook(client, trimmedEmail);
      } else {
        addTrustedSender(trimmedEmail);
      }
      setNewEmail("");
      setIsAdding(false);
      setEmailError("");
    } catch {
      setEmailError(t("Failed to save - check the Contacts debug log for details"));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRemoveSender = async (email: string) => {
    if (trustedSendersAddressBook && client) {
      await removeFromTrustedSendersBook(client, email);
    } else {
      removeTrustedSender(email);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      handleAddSender();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent
        aria-describedby={undefined}
        showCloseButton={false}
        onEscapeKeyDown={(e) => {
          // While the inline add row is open, Escape backs out of add mode
          // instead of dismissing the whole dialog.
          if (isAdding) {
            e.preventDefault();
            setIsAdding(false);
            setNewEmail("");
            setEmailError("");
          }
        }}
        className={cn(
          "max-w-md max-h-[60vh] gap-0 overflow-hidden p-0",
          "flex flex-col"
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border flex-shrink-0">
          <div className="flex items-center gap-3">
            <ShieldCheck className="w-5 h-5 text-primary" />
            <DialogTitle className="text-lg font-semibold text-foreground">
              {t("Trusted Senders")}
            </DialogTitle>
          </div>
          <DialogClose asChild>
            <button
              aria-label={t("Close")}
              className="p-1.5 rounded-md hover:bg-muted transition-colors duration-150 text-muted-foreground hover:text-foreground"
            >
              <X className="w-5 h-5" />
            </button>
          </DialogClose>
        </div>

        {/* Search (only when 5+ senders) */}
        {showSearch && (
          <div className="px-6 py-3 border-b border-border flex-shrink-0">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                placeholder={t("Search senders...")}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full ps-9 pe-3 py-2 text-sm bg-muted border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : activeSenders.length === 0 ? (
            /* Empty State */
            <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
              <ShieldCheck className="w-12 h-12 text-muted-foreground mb-4" />
              <h3 className="text-base font-medium text-foreground mb-2">
                {t("No trusted senders yet")}
              </h3>
              <p className="text-sm text-muted-foreground max-w-[280px] mb-6">
                {t("When viewing an email with blocked images, click \"Always trust this sender\" to add them here.")}
              </p>
              <button
                onClick={() => setIsAdding(true)}
                className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors text-sm font-medium"
              >
                <Plus className="w-4 h-4" />
                {t("Add sender manually")}
              </button>
            </div>
          ) : filteredSenders.length === 0 ? (
            /* No search results */
            <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
              <Search className="w-10 h-10 text-muted-foreground mb-3" />
              <p className="text-sm text-muted-foreground">
                {t("No senders match your search")}
              </p>
            </div>
          ) : (
            /* Sender list */
            <div className="divide-y divide-border">
              {filteredSenders.map((email) => (
                <div
                  key={email}
                  className="flex items-center gap-3 px-6 py-3 hover:bg-muted/50 transition-colors group"
                >
                  <Avatar email={email} size="sm" />
                  <span className="flex-1 text-sm text-foreground truncate">
                    {email}
                  </span>
                  <button
                    onClick={() => handleRemoveSender(email)}
                    className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
                    aria-label={`${t("Remove")} ${email}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer - Add sender */}
        {!isLoading && activeSenders.length > 0 && (
          <div className="px-6 py-4 border-t border-border flex-shrink-0">
            {isAdding ? (
              <div className="flex flex-col gap-2">
                <div className="flex gap-2">
                  <input
                    ref={inputRef}
                    type="email"
                    placeholder={t("Enter email address")}
                    value={newEmail}
                    onChange={(e) => {
                      setNewEmail(e.target.value);
                      setEmailError("");
                    }}
                    onKeyDown={handleKeyDown}
                    className={cn(
                      "flex-1 px-3 py-2 text-sm bg-background border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/50",
                      emailError ? "border-destructive" : "border-border"
                    )}
                  />
                  <button
                    onClick={handleAddSender}
                    disabled={isSubmitting}
                    className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors text-sm font-medium disabled:opacity-50"
                  >
                    {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : t("Add")}
                  </button>
                </div>
                {emailError && (
                  <p className="text-xs text-destructive">{emailError}</p>
                )}
              </div>
            ) : (
              <button
                onClick={() => setIsAdding(true)}
                className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <Plus className="w-4 h-4" />
                {t("Add sender manually")}
              </button>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
