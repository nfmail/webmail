import { getTranslations } from "@/i18n/server";
import { WebcalProtocolClient } from "@/components/protocol/webcal-protocol-client";

export default async function WebcalProtocolPage() {
  const t = await getTranslations();

  return <WebcalProtocolClient openingText={t("Opening calendar...")} />;
}
