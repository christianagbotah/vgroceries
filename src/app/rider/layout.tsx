import { RiderShell } from "@/components/layout/rider-shell";

export default function RiderLayout({ children }: { children: React.ReactNode }) {
  return <RiderShell>{children}</RiderShell>;
}
