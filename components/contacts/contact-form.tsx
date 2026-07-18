"use client";

import { useState, useMemo, useCallback, useRef, Children, isValidElement } from "react";
import { useTranslations } from "@/i18n/client";
import { X, Plus, ChevronDown, ChevronRight, User, Building, MapPin, Globe, Cake, Heart, Tag, StickyNote, Mail, Phone, Calendar, UserCircle, Book, Camera, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar } from "@/components/ui/avatar";
import {
  Select as SelectRoot,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { normalizeContactPhotoUri } from "@/stores/contact-store";
import { cn } from "@/lib/utils";
import type { ContactCard, ContactOnlineService, ContactAnniversary, ContactPersonalInfo, AddressBook, AnniversaryDate, PartialDate, ContactAddress, ContactMedia } from "@/lib/jmap/types";

interface EmailEntry {
  address: string;
  context: "work" | "private" | "";
}

interface PhoneEntry {
  number: string;
  context: "work" | "private" | "";
  feature: "voice" | "cell" | "fax" | "pager" | "video" | "text" | "";
}

interface OnlineServiceEntry {
  uri: string;
  service: string;
  label: string;
}

interface AnniversaryEntry {
  date: string;
  kind: "birth" | "death" | "wedding" | "other";
}

interface PersonalInfoEntry {
  value: string;
  kind: "expertise" | "hobby" | "interest" | "other";
  level: "high" | "medium" | "low" | "";
}

interface AddressEntry {
  street: string;
  locality: string;
  region: string;
  postcode: string;
  country: string;
  context: "work" | "private" | "";
}

interface ContactFormProps {
  contact?: ContactCard | null;
  addressBooks?: AddressBook[];
  allKeywords?: string[];
  defaultAddressBookId?: string;
  /** Prefills the create form (ignored when `contact` is set). */
  prefill?: { email?: string; name?: string };
  onSave: (data: Partial<ContactCard>) => Promise<void>;
  onCancel: () => void;
}

function FormSection({ icon: Icon, title, children, collapsible, defaultOpen = true }: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  children: React.ReactNode;
  collapsible?: boolean;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className="py-5">
      <button
        type="button"
        className={cn(
          "flex items-center gap-2 w-full text-start",
          collapsible ? "cursor-pointer" : "cursor-default"
        )}
        onClick={() => collapsible && setOpen(!open)}
        tabIndex={collapsible ? 0 : -1}
      >
        <Icon className="w-4 h-4 text-muted-foreground shrink-0" />
        <h3 className="flex-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
        {collapsible && (
          open ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
        )}
      </button>
      {(open || !collapsible) && (
        <div className="space-y-3 mt-3">
          {children}
        </div>
      )}
    </section>
  );
}

const MAX_PHOTO_DIM = 512;
const PHOTO_QUALITY = 0.85;

async function processImageFile(file: File): Promise<{ uri: string; mediaType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const ratio = Math.min(1, MAX_PHOTO_DIM / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * ratio));
        const h = Math.max(1, Math.round(img.height * ratio));
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("canvas-unsupported"));
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        const uri = canvas.toDataURL("image/jpeg", PHOTO_QUALITY);
        resolve({ uri, mediaType: "image/jpeg" });
      };
      img.onerror = () => reject(new Error("invalid-image"));
      img.src = reader.result as string;
    };
    reader.onerror = () => reject(new Error("read-failed"));
    reader.readAsDataURL(file);
  });
}

// Sentinel standing in for the empty-string option value. Radix Select forbids
// an empty-string item value, so it is mapped to this sentinel internally and
// translated back to "" across the value / onChange boundary. This lets the
// wrapper keep its native-<select> prop signature (value + change event carrying
// e.target.value) so every call site stays unchanged.
const EMPTY_OPTION_VALUE = "__empty__";

function Select({ value, onChange, children, className }: {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  children: React.ReactNode;
  className?: string;
}) {
  const options = Children.toArray(children)
    .filter(isValidElement)
    .map((child) => {
      const optionProps = (
        child as React.ReactElement<{
          value?: string;
          children?: React.ReactNode;
          disabled?: boolean;
        }>
      ).props;
      const optionValue = optionProps.value ?? "";
      return {
        itemValue: optionValue === "" ? EMPTY_OPTION_VALUE : optionValue,
        label: optionProps.children,
        disabled: optionProps.disabled,
      };
    });

  return (
    <SelectRoot
      value={value === "" ? EMPTY_OPTION_VALUE : value}
      onValueChange={(next) => {
        const normalized = next === EMPTY_OPTION_VALUE ? "" : next;
        onChange({
          target: { value: normalized },
          currentTarget: { value: normalized },
        } as unknown as React.ChangeEvent<HTMLSelectElement>);
      }}
    >
      <SelectTrigger size="sm" className={className}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem
            key={option.itemValue}
            value={option.itemValue}
            disabled={option.disabled}
          >
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </SelectRoot>
  );
}

export function ContactForm({ contact, addressBooks, allKeywords, defaultAddressBookId, prefill, onSave, onCancel }: ContactFormProps) {
  const t = useTranslations();
  const isEditing = !!contact;

  // Split a free-form display name into given/surname for prefill.
  const prefillGivenName = (() => {
    if (contact || !prefill?.name) return "";
    const parts = prefill.name.trim().split(/\s+/);
    return parts[0] || "";
  })();
  const prefillSurname = (() => {
    if (contact || !prefill?.name) return "";
    const parts = prefill.name.trim().split(/\s+/);
    return parts.slice(1).join(" ");
  })();

  // Accept JSContact-standard kinds (RFC 9553) and legacy vCard-style aliases.
  const findComponent = (...kinds: string[]) =>
    contact?.name?.components?.find(c => kinds.includes(c.kind))?.value || "";

  // Convert RFC 9553 AnniversaryDate to ISO date string for HTML date input
  function anniversaryDateToString(date: AnniversaryDate): string {
    if (typeof date === 'string') return date;
    if (date && typeof date === 'object') {
      if ('@type' in date && date['@type'] === 'Timestamp' && 'utc' in date) {
        return (date as { utc: string }).utc.split('T')[0];
      }
      const pd = date as PartialDate;
      if (pd.year && pd.month && pd.day) {
        return `${String(pd.year).padStart(4, '0')}-${String(pd.month).padStart(2, '0')}-${String(pd.day).padStart(2, '0')}`;
      }
      if (pd.month && pd.day) {
        return `--${String(pd.month).padStart(2, '0')}-${String(pd.day).padStart(2, '0')}`;
      }
      if (pd.year && pd.month) {
        return `${String(pd.year).padStart(4, '0')}-${String(pd.month).padStart(2, '0')}`;
      }
      if (pd.year) return String(pd.year);
    }
    return String(date);
  }

  // Convert ISO date string back to RFC 9553 PartialDate for the server
  function stringToPartialDate(str: string): PartialDate {
    if (str.startsWith('--')) {
      const parts = str.substring(2).split('-');
      const pd: PartialDate = { month: parseInt(parts[0], 10) };
      if (parts[1]) pd.day = parseInt(parts[1], 10);
      return pd;
    }
    const parts = str.split('-');
    const pd: PartialDate = {};
    if (parts[0]) pd.year = parseInt(parts[0], 10);
    if (parts[1]) pd.month = parseInt(parts[1], 10);
    if (parts[2]) pd.day = parseInt(parts[2], 10);
    return pd;
  }

  // Extract flat address fields from RFC 9553 components format
  function addressToFlat(a: ContactAddress): AddressEntry {
    if (a.components && a.components.length > 0) {
      const findComp = (kind: string) => a.components!.filter(c => c.kind === kind).map(c => c.value).join(' ');
      return {
        street: findComp('name') || findComp('number') ? [findComp('number'), findComp('name')].filter(Boolean).join(' ') : '',
        locality: findComp('locality'),
        region: findComp('region'),
        postcode: findComp('postcode'),
        country: findComp('country'),
        context: a.contexts?.work ? 'work' : a.contexts?.private ? 'private' : '',
      };
    }
    return {
      street: a.street || '',
      locality: a.locality || '',
      region: a.region || '',
      postcode: a.postcode || '',
      country: a.country || '',
      context: a.contexts?.work ? 'work' : a.contexts?.private ? 'private' : '',
    };
  }

  const [prefix, setPrefix] = useState(findComponent("title", "prefix"));
  const [givenName, setGivenName] = useState(findComponent("given") || prefillGivenName);
  const [additionalName, setAdditionalName] = useState(findComponent("given2", "additional", "middle"));
  const [surname, setSurname] = useState(findComponent("surname") || prefillSurname);
  const [suffix, setSuffix] = useState(findComponent("generation", "suffix"));

  const [nickname, setNickname] = useState(
    contact?.nicknames ? Object.values(contact.nicknames)[0]?.name || "" : ""
  );

  const [emails, setEmails] = useState<EmailEntry[]>(() => {
    if (contact?.emails) {
      return Object.values(contact.emails).map(e => ({
        address: e.address,
        context: e.contexts?.work ? "work" : e.contexts?.private ? "private" : "",
      }));
    }
    return [{ address: prefill?.email || "", context: "" }];
  });

  const [phones, setPhones] = useState<PhoneEntry[]>(() => {
    if (contact?.phones) {
      return Object.values(contact.phones).map(p => ({
        number: p.number,
        context: p.contexts?.work ? "work" : p.contexts?.private ? "private" : "",
        feature: p.features?.cell ? "cell" : p.features?.fax ? "fax" : p.features?.pager ? "pager" : p.features?.video ? "video" : p.features?.text ? "text" : p.features?.voice ? "voice" : "",
      }));
    }
    return [];
  });

  const [organization, setOrganization] = useState(
    contact?.organizations ? Object.values(contact.organizations)[0]?.name || "" : ""
  );
  const [department, setDepartment] = useState(
    contact?.organizations ? (Object.values(contact.organizations)[0]?.units?.[0]?.name || "") : ""
  );

  const [jobTitle, setJobTitle] = useState(() => {
    if (contact?.titles) {
      const t = Object.values(contact.titles).find(t => t.kind !== "role");
      return t?.name || "";
    }
    return "";
  });
  const [role, setRole] = useState(() => {
    if (contact?.titles) {
      const r = Object.values(contact.titles).find(t => t.kind === "role");
      return r?.name || "";
    }
    return "";
  });

  const [addresses, setAddresses] = useState<AddressEntry[]>(() => {
    if (contact?.addresses) {
      return Object.values(contact.addresses).map(a => addressToFlat(a));
    }
    return [];
  });

  const [onlineServices, setOnlineServices] = useState<OnlineServiceEntry[]>(() => {
    if (contact?.onlineServices) {
      return Object.values(contact.onlineServices).map(s => ({
        uri: s.uri,
        service: s.service || "",
        label: s.label || "",
      }));
    }
    return [];
  });

  const [anniversaries, setAnniversaries] = useState<AnniversaryEntry[]>(() => {
    if (contact?.anniversaries) {
      return Object.values(contact.anniversaries).map(a => ({
        date: anniversaryDateToString(a.date),
        kind: a.kind,
      }));
    }
    return [];
  });

  const [personalInfoEntries, setPersonalInfoEntries] = useState<PersonalInfoEntry[]>(() => {
    if (contact?.personalInfo) {
      return Object.values(contact.personalInfo).map(p => ({
        value: p.value,
        kind: p.kind,
        level: p.level || "",
      }));
    }
    return [];
  });

  const [keywordsStr, setKeywordsStr] = useState(
    contact?.keywords ? Object.keys(contact.keywords).filter(k => contact.keywords![k]).join(", ") : ""
  );

  const [note, setNote] = useState(
    contact?.notes ? Object.values(contact.notes)[0]?.note || "" : ""
  );

  const [genderSex, setGenderSex] = useState(contact?.speakToAs?.grammaticalGender || "");
  const [genderIdentity, setGenderIdentity] = useState(
    contact?.speakToAs?.pronouns ? Object.values(contact.speakToAs.pronouns)[0]?.pronouns || "" : ""
  );
  const [calendarUri, setCalendarUri] = useState(contact?.calendarUri || "");
  const [schedulingUri, setSchedulingUri] = useState(contact?.schedulingUri || "");
  const [freeBusyUri, setFreeBusyUri] = useState(contact?.freeBusyUri || "");

  // Address book selection
  const currentBookId = useMemo(() => {
    if (contact?.addressBookIds) {
      const ids = Object.keys(contact.addressBookIds).filter(k => contact.addressBookIds[k]);
      if (ids.length > 0) {
        // addressBookIds are already namespaced for shared contacts (e.g. "accountId:bookId")
        // so we can use them directly to match addressBook entries
        return ids[0];
      }
    }
    if (defaultAddressBookId && addressBooks?.some(b => b.id === defaultAddressBookId)) {
      return defaultAddressBookId;
    }
    return "";
  }, [contact, defaultAddressBookId, addressBooks]);
  const [selectedBookId, setSelectedBookId] = useState(currentBookId);

  const initialPhotoEntry = useMemo(() => {
    if (!contact?.media) return null;
    for (const [key, m] of Object.entries(contact.media)) {
      if (m.kind === "photo" && m.uri) {
        return { key, uri: normalizeContactPhotoUri(m.uri, m.mediaType), mediaType: m.mediaType };
      }
    }
    return null;
  }, [contact]);
  const [photoUri, setPhotoUri] = useState<string | undefined>(initialPhotoEntry?.uri);
  const [photoMediaType, setPhotoMediaType] = useState<string | undefined>(initialPhotoEntry?.mediaType);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [photoUploading, setPhotoUploading] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emailErrors, setEmailErrors] = useState<Record<number, string>>({});

  const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setPhotoError(t("Invalid image file"));
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setPhotoError(t("Image is too large (max 10 MB)"));
      return;
    }
    setPhotoError(null);
    setPhotoUploading(true);
    try {
      const { uri, mediaType } = await processImageFile(file);
      setPhotoUri(uri);
      setPhotoMediaType(mediaType);
    } catch {
      setPhotoError(t("Invalid image file"));
    } finally {
      setPhotoUploading(false);
    }
  };

  const handlePhotoRemove = () => {
    setPhotoUri(undefined);
    setPhotoMediaType(undefined);
    setPhotoError(null);
  };

  const validateEmail = (address: string): boolean => {
    if (!address.trim()) return true;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address.trim());
  };

  const handleEmailBlur = (index: number, address: string) => {
    if (address.trim() && !validateEmail(address)) {
      setEmailErrors(prev => ({ ...prev, [index]: t("Invalid email format") }));
    } else {
      setEmailErrors(prev => {
        const next = { ...prev };
        delete next[index];
        return next;
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!givenName.trim() && !surname.trim()) {
      setError(t("At least a first name or last name is required"));
      return;
    }

    const validEmails = emails.filter(e => e.address.trim());
    for (const entry of validEmails) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(entry.address.trim())) {
        setError(t("Please enter a valid email address"));
        return;
      }
    }

    const emailsMap: Record<string, { address: string; contexts?: Record<string, boolean> }> = {};
    validEmails.forEach((entry, i) => {
      const obj: { address: string; contexts?: Record<string, boolean> } = { address: entry.address.trim() };
      if (entry.context) {
        obj.contexts = { [entry.context]: true };
      }
      emailsMap[`e${i}`] = obj;
    });

    const validPhones = phones.filter(p => p.number.trim());
    const phonesMap: Record<string, { number: string; contexts?: Record<string, boolean>; features?: Record<string, boolean> }> = {};
    validPhones.forEach((entry, i) => {
      const obj: { number: string; contexts?: Record<string, boolean>; features?: Record<string, boolean> } = { number: entry.number.trim() };
      if (entry.context) {
        obj.contexts = { [entry.context]: true };
      }
      if (entry.feature) {
        obj.features = { [entry.feature]: true };
      }
      phonesMap[`p${i}`] = obj;
    });

    // Emit JSContact-standard kinds (RFC 9553) so the JMAP server stores them losslessly.
    const nameComponents = [];
    if (prefix.trim()) nameComponents.push({ kind: "title" as const, value: prefix.trim() });
    if (givenName.trim()) nameComponents.push({ kind: "given" as const, value: givenName.trim() });
    if (additionalName.trim()) nameComponents.push({ kind: "given2" as const, value: additionalName.trim() });
    if (surname.trim()) nameComponents.push({ kind: "surname" as const, value: surname.trim() });
    if (suffix.trim()) nameComponents.push({ kind: "generation" as const, value: suffix.trim() });

    const titlesMap: Record<string, { name: string; kind?: "title" | "role" }> = {};
    if (jobTitle.trim()) titlesMap["t0"] = { name: jobTitle.trim(), kind: "title" };
    if (role.trim()) titlesMap["t1"] = { name: role.trim(), kind: "role" };

    const orgUnits = department.trim() ? [{ name: department.trim() }] : undefined;

    const addressesMap: Record<string, ContactCard["addresses"] extends Record<string, infer V> ? V : never> = {};
    addresses.filter(a => a.street.trim() || a.locality.trim() || a.country.trim()).forEach((a, i) => {
      const components: Array<{ kind: string; value: string }> = [];
      if (a.street.trim()) components.push({ kind: "name", value: a.street.trim() });
      if (a.locality.trim()) components.push({ kind: "locality", value: a.locality.trim() });
      if (a.region.trim()) components.push({ kind: "region", value: a.region.trim() });
      if (a.postcode.trim()) components.push({ kind: "postcode", value: a.postcode.trim() });
      if (a.country.trim()) components.push({ kind: "country", value: a.country.trim() });
      const obj: Record<string, unknown> = { components, isOrdered: true, defaultSeparator: ", " };
      if (a.context) obj.contexts = { [a.context]: true };
      // @ts-expect-error - dynamic build
      addressesMap[`a${i}`] = obj;
    });

    const onlineServicesMap: Record<string, ContactOnlineService> = {};
    onlineServices.filter(s => s.uri.trim()).forEach((s, i) => {
      const obj: ContactOnlineService = { uri: s.uri.trim() };
      if (s.service.trim()) obj.service = s.service.trim();
      if (s.label.trim()) obj.label = s.label.trim();
      onlineServicesMap[`os${i}`] = obj;
    });

    const anniversariesMap: Record<string, ContactAnniversary> = {};
    anniversaries.filter(a => a.date.trim()).forEach((a, i) => {
      anniversariesMap[`an${i}`] = { date: stringToPartialDate(a.date.trim()), kind: a.kind };
    });

    const personalInfoMap: Record<string, ContactPersonalInfo> = {};
    personalInfoEntries.filter(p => p.value.trim()).forEach((p, i) => {
      const obj: ContactPersonalInfo = { value: p.value.trim(), kind: p.kind };
      if (p.level) obj.level = p.level as "high" | "medium" | "low";
      personalInfoMap[`pi${i}`] = obj;
    });

    const keywordsMap: Record<string, boolean> = {};
    if (keywordsStr.trim()) {
      keywordsStr.split(",").map(k => k.trim()).filter(Boolean).forEach(k => {
        keywordsMap[k] = true;
      });
    }

    const mediaMap: Record<string, ContactMedia> = {};
    if (contact?.media) {
      for (const [key, m] of Object.entries(contact.media)) {
        if (m.kind !== "photo") mediaMap[key] = m;
      }
    }
    if (photoUri) {
      const photoKey = initialPhotoEntry?.key || "photo";
      mediaMap[photoKey] = { kind: "photo", uri: photoUri, mediaType: photoMediaType };
    }

    // Set mediaVluae to null if we are removing media, so the server removes it
    const hadMedia = !!contact?.media && Object.keys(contact.media).length > 0;
    const mediaValue: Record<string, ContactMedia> | null | undefined =
      Object.keys(mediaMap).length > 0 ? mediaMap : (hadMedia ? null : undefined);

    const data: Partial<ContactCard> = {
      name: { components: nameComponents, isOrdered: true },
      nicknames: nickname.trim() ? { n0: { name: nickname.trim() } } : undefined,
      emails: Object.keys(emailsMap).length > 0 ? emailsMap : undefined,
      phones: Object.keys(phonesMap).length > 0 ? phonesMap : undefined,
      titles: Object.keys(titlesMap).length > 0 ? titlesMap : undefined,
      organizations: organization.trim()
        ? { o0: { name: organization.trim(), units: orgUnits } }
        : undefined,
      addresses: Object.keys(addressesMap).length > 0 ? addressesMap : undefined,
      onlineServices: Object.keys(onlineServicesMap).length > 0 ? onlineServicesMap : undefined,
      anniversaries: Object.keys(anniversariesMap).length > 0 ? anniversariesMap : undefined,
      personalInfo: Object.keys(personalInfoMap).length > 0 ? personalInfoMap : undefined,
      keywords: Object.keys(keywordsMap).length > 0 ? keywordsMap : undefined,
      notes: note.trim()
        ? { n0: { note: note.trim() } }
        : undefined,
      speakToAs: (genderSex.trim() || genderIdentity.trim())
        ? {
            grammaticalGender: genderSex.trim() || undefined,
            pronouns: genderIdentity.trim() ? { p0: { pronouns: genderIdentity.trim() } } : undefined,
          }
        : undefined,
      calendarUri: calendarUri.trim() || undefined,
      schedulingUri: schedulingUri.trim() || undefined,
      freeBusyUri: freeBusyUri.trim() || undefined,
      media: mediaValue as Record<string, ContactMedia> | undefined,
      ...(selectedBookId ? { addressBookIds: { [selectedBookId]: true } } : {}),
    };

    setIsSaving(true);
    try {
      await onSave(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("Failed to save contact"));
    } finally {
      setIsSaving(false);
    }
  };

  const previewName = [givenName, surname].filter(Boolean).join(" ").trim();
  const previewEmail = emails.find(e => e.address.trim())?.address.trim() || "";

  return (
    <form onSubmit={handleSubmit} className="flex flex-col h-full bg-background">
      <div className="flex items-center justify-between px-6 py-4 border-b border-border flex-shrink-0">
        <h2 className="text-lg font-semibold">
          {isEditing ? t("Edit Contact") : t("New Contact")}
        </h2>
        <button type="button" onClick={onCancel} aria-label={t("Cancel")} className="p-1.5 rounded-md hover:bg-muted transition-colors duration-150 text-muted-foreground hover:text-foreground">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="px-6 py-4 max-w-3xl">
          {error && (
            <div className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-lg border border-destructive/30 mb-4">
              {error}
            </div>
          )}

          <div className="flex items-center gap-4 pb-4">
            <button
              type="button"
              onClick={() => photoInputRef.current?.click()}
              disabled={photoUploading}
              className="relative group rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-60"
              title={t("Upload photo")}
              aria-label={t("Upload photo")}
            >
              <Avatar
                name={previewName || undefined}
                email={previewEmail || undefined}
                contactPhotoUri={photoUri}
                size="lg"
                className="!w-20 !h-20 !text-xl"
              />
              <span
                aria-hidden="true"
                className="absolute inset-0 rounded-full bg-black/55 text-white flex flex-col items-center justify-center gap-0.5 opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity"
              >
                <Camera className="w-5 h-5" />
                <span className="text-[10px] font-medium leading-none">{t("Change")}</span>
              </span>
              <input
                ref={photoInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handlePhotoSelect}
              />
            </button>
            <div className="flex flex-col gap-1 min-w-0 flex-1">
              <p className="text-xs text-muted-foreground">{t("JPG or PNG, up to 10 MB. Will be resized.")}</p>
              {photoError && (
                <p className="text-xs text-destructive">{photoError}</p>
              )}
              {photoUri && (
                <button
                  type="button"
                  onClick={handlePhotoRemove}
                  className="inline-flex items-center gap-1 self-start text-xs text-muted-foreground hover:text-destructive transition-colors"
                >
                  <Trash2 className="w-3 h-3" />
                  {t("Remove photo")}
                </button>
              )}
            </div>
          </div>

          <div className="divide-y divide-border/60">

          {addressBooks && addressBooks.length > 1 && (
            <FormSection icon={Book} title={t("Directory") || "Directory"}>
              <Select
                value={selectedBookId}
                onChange={(e) => setSelectedBookId(e.target.value)}
                className="w-full"
              >
                <option value="">{t("Select a directory...") || "Select a directory..."}</option>
                {addressBooks.map((book) => (
                  <option key={book.id} value={book.id}>
                    {book.accountName ? `${book.name} (${book.accountName})` : book.name}
                  </option>
                ))}
              </Select>
            </FormSection>
          )}

          <FormSection icon={User} title={t("Name & Identity")}>
            <div className="grid grid-cols-[auto_1fr_1fr_auto] gap-2">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">{t("Prefix")}</label>
                <Input value={prefix} onChange={(e) => setPrefix(e.target.value)} placeholder={t("Dr., Mr., Mrs.")} className="w-20" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">
                  {t("First name")} <span className="text-destructive">*</span>
                </label>
                <Input value={givenName} onChange={(e) => setGivenName(e.target.value)} placeholder={t("First name")} autoFocus />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">
                  {t("Last name")} <span className="text-destructive">*</span>
                </label>
                <Input value={surname} onChange={(e) => setSurname(e.target.value)} placeholder={t("Last name")} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">{t("Suffix")}</label>
                <Input value={suffix} onChange={(e) => setSuffix(e.target.value)} placeholder={t("Jr., Sr., III")} className="w-20" />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">{t("Middle name")}</label>
                <Input value={additionalName} onChange={(e) => setAdditionalName(e.target.value)} placeholder={t("Middle name")} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">{t("Nickname")}</label>
                <Input value={nickname} onChange={(e) => setNickname(e.target.value)} placeholder={t("Nickname")} />
              </div>
            </div>
          </FormSection>

          {/* Email */}
          <FormSection icon={Mail} title={t("Email")}>
            <div className="space-y-2">
              {emails.map((entry, i) => (
                <div key={i}>
                  <div className="flex items-center gap-2">
                    <Input
                      type="email"
                      inputMode="email"
                      value={entry.address}
                      onChange={(e) => {
                        const next = [...emails];
                        next[i] = { ...next[i], address: e.target.value };
                        setEmails(next);
                        if (emailErrors[i]) {
                          setEmailErrors(prev => { const n = { ...prev }; delete n[i]; return n; });
                        }
                      }}
                      onBlur={() => handleEmailBlur(i, entry.address)}
                      placeholder={t("email@example.com")}
                      className={cn("flex-1", emailErrors[i] && "border-destructive focus:ring-destructive")}
                    />
                    <Select
                      value={entry.context}
                      onChange={(e) => {
                        const next = [...emails];
                        next[i] = { ...next[i], context: e.target.value as EmailEntry["context"] };
                        setEmails(next);
                      }}
                    >
                      <option value="">-</option>
                      <option value="work">{t("Work")}</option>
                      <option value="private">{t("Private")}</option>
                    </Select>
                    {emails.length > 1 && (
                      <Button type="button" variant="ghost" size="icon" aria-label={t("Remove email")} onClick={() => setEmails(emails.filter((_, j) => j !== i))} className="h-8 w-8 shrink-0">
                        <X className="w-3 h-3" />
                      </Button>
                    )}
                  </div>
                  {emailErrors[i] && (
                    <p className="text-xs text-destructive mt-1 ms-1">{emailErrors[i]}</p>
                  )}
                </div>
              ))}
              <Button type="button" variant="ghost" size="sm" onClick={() => setEmails([...emails, { address: "", context: "" }])} className="text-xs">
                <Plus className="w-3 h-3 me-1" />
                {t("Add email")}
              </Button>
            </div>
          </FormSection>

          {/* Phone */}
          <FormSection icon={Phone} title={t("Phone")}>
            <div className="space-y-2">
              {phones.map((entry, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input
                    type="tel"
                    inputMode="tel"
                    value={entry.number}
                    onChange={(e) => {
                      const next = [...phones];
                      next[i] = { ...next[i], number: e.target.value };
                      setPhones(next);
                    }}
                    placeholder={t("+1 234 567 890")}
                    className="flex-1"
                  />
                  <Select
                    value={entry.feature}
                    onChange={(e) => {
                      const next = [...phones];
                      next[i] = { ...next[i], feature: e.target.value as PhoneEntry["feature"] };
                      setPhones(next);
                    }}
                    className="w-[5.5rem]"
                  >
                    <option value="">{t("Type")}</option>
                    <option value="voice">{t("Voice")}</option>
                    <option value="cell">{t("Mobile")}</option>
                    <option value="fax">{t("Fax")}</option>
                    <option value="pager">{t("Pager")}</option>
                    <option value="video">{t("Video")}</option>
                    <option value="text">{t("Text")}</option>
                  </Select>
                  <Select
                    value={entry.context}
                    onChange={(e) => {
                      const next = [...phones];
                      next[i] = { ...next[i], context: e.target.value as PhoneEntry["context"] };
                      setPhones(next);
                    }}
                  >
                    <option value="">-</option>
                    <option value="work">{t("Work")}</option>
                    <option value="private">{t("Private")}</option>
                  </Select>
                  <Button type="button" variant="ghost" size="icon" aria-label={t("Remove phone")} onClick={() => setPhones(phones.filter((_, j) => j !== i))} className="h-8 w-8 shrink-0">
                    <X className="w-3 h-3" />
                  </Button>
                </div>
              ))}
              <Button type="button" variant="ghost" size="sm" onClick={() => setPhones([...phones, { number: "", context: "", feature: "" }])} className="text-xs">
                <Plus className="w-3 h-3 me-1" />
                {t("Add phone")}
              </Button>
            </div>
          </FormSection>

          {/* Work & Organization */}
          <FormSection icon={Building} title={t("Work & Organization")} collapsible defaultOpen={!!(organization || department || jobTitle || role)}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">{t("Organization")}</label>
                <Input value={organization} onChange={(e) => setOrganization(e.target.value)} placeholder={t("Company name")} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">{t("Department")}</label>
                <Input value={department} onChange={(e) => setDepartment(e.target.value)} placeholder={t("Department")} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">{t("Job title")}</label>
                <Input value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} placeholder={t("e.g., Software Engineer")} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">{t("Role")}</label>
                <Input value={role} onChange={(e) => setRole(e.target.value)} placeholder={t("e.g., Team Lead")} />
              </div>
            </div>
          </FormSection>

          {/* Addresses */}
          <FormSection icon={MapPin} title={t("Addresses")} collapsible defaultOpen={addresses.length > 0}>
            <div className="space-y-3">
              {addresses.map((addr, i) => (
                <div key={i} className="rounded-md border border-border/60 bg-muted/20 p-3 space-y-2 relative">
                  <Button type="button" variant="ghost" size="icon" aria-label={t("Remove address")} onClick={() => setAddresses(addresses.filter((_, j) => j !== i))} className="h-6 w-6 absolute top-2 right-2">
                    <X className="w-3 h-3" />
                  </Button>
                  <Input value={addr.street} onChange={(e) => { const n = [...addresses]; n[i] = { ...n[i], street: e.target.value }; setAddresses(n); }} placeholder={t("Street")} />
                  <div className="grid grid-cols-2 gap-2">
                    <Input value={addr.locality} onChange={(e) => { const n = [...addresses]; n[i] = { ...n[i], locality: e.target.value }; setAddresses(n); }} placeholder={t("City")} />
                    <Input value={addr.region} onChange={(e) => { const n = [...addresses]; n[i] = { ...n[i], region: e.target.value }; setAddresses(n); }} placeholder={t("State / Region")} />
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <Input value={addr.postcode} onChange={(e) => { const n = [...addresses]; n[i] = { ...n[i], postcode: e.target.value }; setAddresses(n); }} placeholder={t("Postal code")} />
                    <Input value={addr.country} onChange={(e) => { const n = [...addresses]; n[i] = { ...n[i], country: e.target.value }; setAddresses(n); }} placeholder={t("Country")} />
                    <Select
                      value={addr.context}
                      onChange={(e) => { const n = [...addresses]; n[i] = { ...n[i], context: e.target.value as AddressEntry["context"] }; setAddresses(n); }}
                    >
                      <option value="">-</option>
                      <option value="work">{t("Work")}</option>
                      <option value="private">{t("Private")}</option>
                    </Select>
                  </div>
                </div>
              ))}
              <Button type="button" variant="ghost" size="sm" onClick={() => setAddresses([...addresses, { street: "", locality: "", region: "", postcode: "", country: "", context: "" }])} className="text-xs">
                <Plus className="w-3 h-3 me-1" />
                {t("Add address")}
              </Button>
            </div>
          </FormSection>

          {/* Online Services */}
          <FormSection icon={Globe} title={t("Online Services")} collapsible defaultOpen={onlineServices.length > 0}>
            <div className="space-y-2">
              {onlineServices.map((svc, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input
                    value={svc.uri}
                    onChange={(e) => { const n = [...onlineServices]; n[i] = { ...n[i], uri: e.target.value }; setOnlineServices(n); }}
                    placeholder={t("https://...")}
                    className="flex-1"
                  />
                  <Input
                    value={svc.service}
                    onChange={(e) => { const n = [...onlineServices]; n[i] = { ...n[i], service: e.target.value }; setOnlineServices(n); }}
                    placeholder={t("Service")}
                    className="w-24"
                  />
                  <Button type="button" variant="ghost" size="icon" aria-label={t("Remove online service")} onClick={() => setOnlineServices(onlineServices.filter((_, j) => j !== i))} className="h-8 w-8 shrink-0">
                    <X className="w-3 h-3" />
                  </Button>
                </div>
              ))}
              <Button type="button" variant="ghost" size="sm" onClick={() => setOnlineServices([...onlineServices, { uri: "", service: "", label: "" }])} className="text-xs">
                <Plus className="w-3 h-3 me-1" />
                {t("Add online service")}
              </Button>
            </div>
          </FormSection>

          {/* Anniversaries */}
          <FormSection icon={Cake} title={t("Anniversaries")} collapsible defaultOpen={anniversaries.length > 0}>
            <div className="space-y-2">
              {anniversaries.map((ann, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input
                    type="date"
                    value={ann.date}
                    onChange={(e) => { const n = [...anniversaries]; n[i] = { ...n[i], date: e.target.value }; setAnniversaries(n); }}
                    className="flex-1"
                  />
                  <Select
                    value={ann.kind}
                    onChange={(e) => { const n = [...anniversaries]; n[i] = { ...n[i], kind: e.target.value as AnniversaryEntry["kind"] }; setAnniversaries(n); }}
                  >
                    <option value="birth">{t("Birthday")}</option>
                    <option value="wedding">{t("Anniversary")}</option>
                    <option value="death">{t("Memorial")}</option>
                    <option value="other">{t("Other")}</option>
                  </Select>
                  <Button type="button" variant="ghost" size="icon" aria-label={t("Remove date")} onClick={() => setAnniversaries(anniversaries.filter((_, j) => j !== i))} className="h-8 w-8 shrink-0">
                    <X className="w-3 h-3" />
                  </Button>
                </div>
              ))}
              <Button type="button" variant="ghost" size="sm" onClick={() => setAnniversaries([...anniversaries, { date: "", kind: "birth" }])} className="text-xs">
                <Plus className="w-3 h-3 me-1" />
                {t("Add date")}
              </Button>
            </div>
          </FormSection>

          {/* Personal Info */}
          <FormSection icon={Heart} title={t("Personal Info")} collapsible defaultOpen={personalInfoEntries.length > 0}>
            <div className="space-y-2">
              {personalInfoEntries.map((pi, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input
                    value={pi.value}
                    onChange={(e) => { const n = [...personalInfoEntries]; n[i] = { ...n[i], value: e.target.value }; setPersonalInfoEntries(n); }}
                    placeholder={t("e.g., Photography")}
                    className="flex-1"
                  />
                  <Select
                    value={pi.kind}
                    onChange={(e) => { const n = [...personalInfoEntries]; n[i] = { ...n[i], kind: e.target.value as PersonalInfoEntry["kind"] }; setPersonalInfoEntries(n); }}
                  >
                    <option value="expertise">{t("Expertise")}</option>
                    <option value="hobby">{t("Hobby")}</option>
                    <option value="interest">{t("Interest")}</option>
                    <option value="other">{t("Other")}</option>
                  </Select>
                  <Select
                    value={pi.level}
                    onChange={(e) => { const n = [...personalInfoEntries]; n[i] = { ...n[i], level: e.target.value as PersonalInfoEntry["level"] }; setPersonalInfoEntries(n); }}
                  >
                    <option value="">{t("Level")}</option>
                    <option value="high">{t("High")}</option>
                    <option value="medium">{t("Medium")}</option>
                    <option value="low">{t("Low")}</option>
                  </Select>
                  <Button type="button" variant="ghost" size="icon" aria-label={t("Remove entry")} onClick={() => setPersonalInfoEntries(personalInfoEntries.filter((_, j) => j !== i))} className="h-8 w-8 shrink-0">
                    <X className="w-3 h-3" />
                  </Button>
                </div>
              ))}
              <Button type="button" variant="ghost" size="sm" onClick={() => setPersonalInfoEntries([...personalInfoEntries, { value: "", kind: "hobby", level: "" }])} className="text-xs">
                <Plus className="w-3 h-3 me-1" />
                {t("Add entry")}
              </Button>
            </div>
          </FormSection>

          {/* Categories */}
          <FormSection icon={Tag} title={t("Categories")} collapsible defaultOpen={!!keywordsStr}>
            <CategoryComboBox
              keywordsStr={keywordsStr}
              onChange={setKeywordsStr}
              allKeywords={allKeywords || []}
              placeholder={t("e.g., Family, Friends, Colleagues")}
              hint={t("Type to search or add categories")}
              addLabel={t("Add")}
            />
          </FormSection>

          {/* Gender */}
          <FormSection icon={UserCircle} title={t("Gender")} collapsible defaultOpen={!!(genderSex || genderIdentity)}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">{t("Sex")}</label>
                <Select value={genderSex} onChange={(e) => setGenderSex(e.target.value)} className="w-full">
                  <option value="">-</option>
                  <option value="masculine">{t("Male")}</option>
                  <option value="feminine">{t("Female")}</option>
                  <option value="other">{t("Other")}</option>
                  <option value="none">{t("Not applicable")}</option>
                  <option value="unknown">{t("Unknown")}</option>
                </Select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">{t("Gender identity")}</label>
                <Input value={genderIdentity} onChange={(e) => setGenderIdentity(e.target.value)} placeholder={t("Gender identity...")} />
              </div>
            </div>
          </FormSection>

          {/* Calendar */}
          <FormSection icon={Calendar} title={t("Calendar")} collapsible defaultOpen={!!(calendarUri || schedulingUri || freeBusyUri)}>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">{t("Calendar URL")}</label>
                <Input value={calendarUri} onChange={(e) => setCalendarUri(e.target.value)} placeholder="https://..." />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">{t("Scheduling URL")}</label>
                <Input value={schedulingUri} onChange={(e) => setSchedulingUri(e.target.value)} placeholder="https://..." />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">{t("Free/Busy URL")}</label>
                <Input value={freeBusyUri} onChange={(e) => setFreeBusyUri(e.target.value)} placeholder="https://..." />
              </div>
            </div>
          </FormSection>

          {/* Notes */}
          <FormSection icon={StickyNote} title={t("Notes")} collapsible defaultOpen={!!note}>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t("Add a note...")}
              className="w-full min-h-[100px] rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground resize-y outline-none focus:ring-2 focus:ring-ring"
            />
          </FormSection>

          </div>
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-border flex-shrink-0">
        <Button type="button" variant="outline" onClick={onCancel} disabled={isSaving}>
          {t("Cancel")}
        </Button>
        <Button type="submit" disabled={isSaving}>
          {isSaving ? (isEditing ? t("Updating...") : t("Creating...")) : t("Save")}
        </Button>
      </div>
    </form>
  );
}

function CategoryComboBox({
  keywordsStr,
  onChange,
  allKeywords,
  placeholder,
  hint,
  addLabel,
}: {
  keywordsStr: string;
  onChange: (value: string) => void;
  allKeywords: string[];
  placeholder: string;
  hint: string;
  addLabel: string;
}) {
  const t = useTranslations();
  const [isOpen, setIsOpen] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Parse current keywords from comma-separated string
  const currentKeywords = useMemo(() => {
    return keywordsStr.split(",").map(k => k.trim()).filter(Boolean);
  }, [keywordsStr]);

  // Suggestions: existing keywords not already selected
  const suggestions = useMemo(() => {
    const lower = inputValue.toLowerCase();
    return allKeywords.filter(kw =>
      !currentKeywords.includes(kw) &&
      (!lower || kw.toLowerCase().includes(lower))
    );
  }, [allKeywords, currentKeywords, inputValue]);

  // Can add a new keyword if typed text is non-empty and not already in the list
  const canAddNew = inputValue.trim() &&
    !currentKeywords.includes(inputValue.trim()) &&
    !allKeywords.some(kw => kw.toLowerCase() === inputValue.trim().toLowerCase());

  const addKeyword = useCallback((keyword: string) => {
    const trimmed = keyword.trim();
    if (!trimmed || currentKeywords.includes(trimmed)) return;
    const next = [...currentKeywords, trimmed].join(", ");
    onChange(next);
    setInputValue("");
  }, [currentKeywords, onChange]);

  const removeKeyword = useCallback((keyword: string) => {
    const next = currentKeywords.filter(k => k !== keyword).join(", ");
    onChange(next);
  }, [currentKeywords, onChange]);


  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (inputValue.trim()) {
        addKeyword(inputValue);
      }
    } else if (e.key === "Escape") {
      setIsOpen(false);
    }
  };

  return (
    <div className="relative">
      {/* Keyword badges */}
      {currentKeywords.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {currentKeywords.map(kw => (
            <span
              key={kw}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-primary/10 text-primary border border-primary/20"
            >
              {kw}
              <button
                type="button"
                onClick={() => removeKeyword(kw)}
                aria-label={t("Remove {name}", { name: kw })}
                className="hover:text-destructive transition-colors"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Input with dropdown */}
      <Input
        ref={inputRef}
        value={inputValue}
        onChange={(e) => { setInputValue(e.target.value); setIsOpen(true); }}
        onFocus={() => setIsOpen(true)}
        onBlur={() => setIsOpen(false)}
        onKeyDown={handleKeyDown}
        placeholder={currentKeywords.length === 0 ? placeholder : ""}
      />
      <p className="text-xs text-muted-foreground mt-1.5">{hint}</p>

      {/* Dropdown */}
      {isOpen && (suggestions.length > 0 || canAddNew) && (
        <div className="absolute left-0 right-0 top-[calc(100%-1.5rem)] mt-1 rounded-md border border-border bg-popover text-popover-foreground shadow-md z-50 max-h-48 overflow-y-auto py-1" onMouseDown={(e) => e.preventDefault()}>
          {suggestions.map(kw => (
            <button
              key={kw}
              type="button"
              className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-accent transition-colors text-start"
              onClick={() => { addKeyword(kw); inputRef.current?.focus(); }}
            >
              <Tag className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
              {kw}
            </button>
          ))}
          {canAddNew && (
            <button
              type="button"
              className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-accent transition-colors text-start text-primary"
              onClick={() => { addKeyword(inputValue); inputRef.current?.focus(); }}
            >
              <Plus className="w-3.5 h-3.5 flex-shrink-0" />
              {addLabel}: &quot;{inputValue.trim()}&quot;
            </button>
          )}
        </div>
      )}
    </div>
  );
}
