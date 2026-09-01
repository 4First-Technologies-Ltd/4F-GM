import { SmoothScroll } from "@/components/scroll/SmoothScroll";
import { ExperienceCanvas } from "@/components/three/ExperienceCanvas";
import { SiteHeader } from "@/components/site/SiteHeader";
import { SiteFooter } from "@/components/site/SiteFooter";

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SmoothScroll>
      <ExperienceCanvas />
      <SiteHeader />
      <div className="relative z-10">{children}</div>
      <SiteFooter />
    </SmoothScroll>
  );
}
