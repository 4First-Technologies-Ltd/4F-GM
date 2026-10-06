import type { Metadata } from "next";
import { LegalPage } from "@/components/legal/LegalPage";
import { PRIVACY, TERMS } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Terms and Conditions",
  description:
    "The rules for using the 4FG Smart Gas Monitor platform — the monitor, the apps, the marketplace and deliveries.",
};

export default function TermsPage() {
  return <LegalPage doc={TERMS} other={PRIVACY} />;
}
