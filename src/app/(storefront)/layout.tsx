import { StorefrontFooter, StorefrontHeader } from "@/components/layout/storefront-shell";

export default function StorefrontLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <StorefrontHeader />
      <main id="main" className="flex-1">
        {children}
      </main>
      <StorefrontFooter />
    </div>
  );
}
