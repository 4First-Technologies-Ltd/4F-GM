import type { Metadata } from "next";
import { LegalPage } from "@/components/legal/LegalPage";
import { PRIVACY, TERMS } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "What personal data 4FG Smart Gas Monitor collects, why, who it is shared with, and your rights.",
};

export default function PrivacyPage() {
  return <LegalPage doc={PRIVACY} other={TERMS} />;
}
