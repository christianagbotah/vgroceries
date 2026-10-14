import { StorefrontFooter, StorefrontHeader, StorefrontMobileNav } from "@/components/layout/storefront-shell";

export default function StorefrontLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col pb-16 md:pb-0">
      <StorefrontHeader />
      <main id="main" className="flex-1">
        {children}
      </main>
      <StorefrontFooter />
      <StorefrontMobileNav />
    </div>
  );
}
