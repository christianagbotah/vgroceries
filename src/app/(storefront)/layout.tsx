import { Suspense } from "react";
import { StorefrontFooter, StorefrontHeader, StorefrontMobileNav } from "@/components/layout/storefront-shell";

function HeaderFallback() {
  return <div className="h-[148px] border-b bg-white lg:h-[114px]" aria-hidden />;
}

export default function StorefrontLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col pb-16 md:pb-0">
      <Suspense fallback={<HeaderFallback />}>
        <StorefrontHeader />
      </Suspense>
      <main id="main" className="flex-1">
        {children}
      </main>
      <StorefrontFooter />
      <StorefrontMobileNav />
    </div>
  );
}
