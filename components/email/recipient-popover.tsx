"use client";

import { useState } from "react";
import { Mail, Phone, Building, ExternalLink, Copy, Send, UserPlus } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useContactStore, getContactDisplayName } from "@/stores/contact-store";
import { toast } from "@/stores/toast-store";
import type { ContactCard } from "@/lib/jmap/types";

interface RecipientPopoverProps {
  name?: string;
  email: string;
  /** Display label override (e.g. "me") */
  displayLabel?: string;
  /** Called when user clicks "View contact" - receives the contact and email */
  onViewContact?: (contact: ContactCard | null, email: string) => void;
  className?: string;
}

export function RecipientPopover({ name, email, displayLabel, onViewContact, className }: RecipientPopoverProps) {
  const [isOpen, setIsOpen] = useState(false);
  const contacts = useContactStore((s) => s.contacts);

  // Find matching contact by email
  const contact = contacts.find((c) => {
    if (!c.emails) return false;
    return Object.values(c.emails).some(
      (e) => e.address.toLowerCase() === email.toLowerCase()
    );
  });

  const contactName = contact ? getContactDisplayName(contact) : name;
  const emails = contact?.emails ? Object.values(contact.emails) : [];
  const phones = contact?.phones ? Object.values(contact.phones) : [];
  const orgs = contact?.organizations ? Object.values(contact.organizations) : [];

  const handleViewContact = () => {
    if (onViewContact) {
      onViewContact(contact ?? null, email);
    }
    setIsOpen(false);
  };

  const handleCopyEmail = async (addr: string) => {
    try {
      await navigator.clipboard.writeText(addr);
      toast.success("Copied!");
    } catch {
      toast.error("Failed to copy");
    }
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger
        className={cn(
          "text-foreground hover:text-primary hover:underline cursor-pointer transition-colors min-w-0 break-words",
          className
        )}
      >
        {displayLabel || name || email}
      </PopoverTrigger>

      <PopoverContent
        align="start"
        side="bottom"
        className="w-[300px] rounded-lg bg-background p-0 shadow-lg"
      >
        {/* Header with avatar and name */}
        <div className="px-4 pt-4 pb-3 flex items-center gap-3">
          <Avatar
            name={contactName || email}
            email={email}
            size="md"
          />
          <div className="min-w-0 flex-1">
            <div className="font-semibold text-sm truncate">
              {contactName || email}
            </div>
            {contactName && contactName !== email && (
              <div className="text-xs text-muted-foreground truncate">
                {email}
              </div>
            )}
            {orgs.length > 0 && orgs[0].name && (
              <div className="text-xs text-muted-foreground truncate flex items-center gap-1">
                <Building className="w-3 h-3 shrink-0" />
                {orgs[0].name}
              </div>
            )}
          </div>
        </div>

        {/* Contact details */}
        <div className="px-4 pb-3 flex flex-col gap-1.5">
          {/* Show additional emails if contact has them */}
          {emails.length > 1 && (
            <div className="flex flex-col gap-1">
              {emails.slice(1).map((e, i) => (
                <div key={i} className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Mail className="w-3 h-3 shrink-0" />
                  <span className="truncate">{e.address}</span>
                </div>
              ))}
            </div>
          )}

          {/* Phone numbers */}
          {phones.length > 0 && (
            <div className="flex flex-col gap-1">
              {phones.map((p, i) => (
                <div key={i} className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Phone className="w-3 h-3 shrink-0" />
                  <a href={`tel:${p.number}`} className="hover:text-foreground hover:underline truncate">
                    {p.number}
                  </a>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="border-t border-border px-2 py-2 flex items-center gap-1">
          <button
            onClick={() => handleCopyEmail(email)}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground px-2 py-1.5 rounded hover:bg-muted transition-colors"
            title="Copy email"
          >
            <Copy className="w-3.5 h-3.5" />
            Copy
          </button>
          <a
            href={`mailto:${email}`}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground px-2 py-1.5 rounded hover:bg-muted transition-colors"
            title="Send email"
          >
            <Send className="w-3.5 h-3.5" />
            Email
          </a>
          {onViewContact && (
            <button
              onClick={handleViewContact}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground px-2 py-1.5 rounded hover:bg-muted transition-colors ms-auto"
              title={contact ? "View contact" : "View details"}
            >
              {contact ? <ExternalLink className="w-3.5 h-3.5" /> : <UserPlus className="w-3.5 h-3.5" />}
              {contact ? "View contact" : "View details"}
            </button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
