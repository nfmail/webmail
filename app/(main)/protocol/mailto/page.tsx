import { getTranslations } from "@/i18n/server";
import { MailtoProtocolClient } from "@/components/protocol/mailto-protocol-client";

export default async function MailtoProtocolPage() {
  const t = await getTranslations();

  return <MailtoProtocolClient openingText={t("Opening composer...")} />;
}
