import type { ReactNode } from "react";
import type { CmsContentPageView } from "@/services/contracts";
import { InfoPageShell, InfoSection } from "@/components/shared/info-page-shell";

export function CmsInfoPage({ page, children }: { page: CmsContentPageView; children?: ReactNode }) {
  return (
    <InfoPageShell title={page.title} intro={page.intro}>
      {children}
      {page.sections.map((section, index) => (
        <InfoSection key={`${page.slug}-${index}`} title={section.heading}>
          <p>{section.body}</p>
        </InfoSection>
      ))}
    </InfoPageShell>
  );
}
