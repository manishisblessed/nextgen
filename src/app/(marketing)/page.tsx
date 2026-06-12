import { HeroNext } from "@/components/home/HeroNext";
import { TrustMarquee } from "@/components/home/TrustMarquee";
import { RoleShowcase } from "@/components/home/RoleShowcase";
import { ServicesGrid } from "@/components/home/ServicesGrid";
import { PlatformPillars } from "@/components/home/PlatformPillars";
import { PaymentProcess } from "@/components/home/PaymentProcess";
import { MadeInIndia } from "@/components/home/MadeInIndia";
import { ImpactStats } from "@/components/home/ImpactStats";
import { Coverage } from "@/components/home/Coverage";
import { Compliance } from "@/components/home/Compliance";
import { IntegrationsConstellation } from "@/components/home/IntegrationsConstellation";
import { Pricing } from "@/components/home/Pricing";
import { AnimatedTestimonials } from "@/components/home/AnimatedTestimonials";
import { Faq } from "@/components/home/Faq";
import { Blog } from "@/components/home/Blog";
import { StackedCTA } from "@/components/home/StackedCTA";

export default function HomePage() {
  return (
    <>
      <HeroNext />
      <TrustMarquee />
      <RoleShowcase />
      <ServicesGrid />
      <PlatformPillars />
      <PaymentProcess />
      <MadeInIndia />
      <ImpactStats />
      <Coverage />
      <Compliance />
      <IntegrationsConstellation />
      <Pricing />
      <AnimatedTestimonials />
      <Faq />
      <Blog />
      <StackedCTA />
    </>
  );
}
