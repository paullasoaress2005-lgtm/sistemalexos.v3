import { AppLayout } from "@/components/AppLayout";
import { PartnersDashboardClient } from "@/components/PartnersDashboardClient";
import { RestrictedAccess } from "@/components/RestrictedAccess";

export default function SociosPage() {
  return (
    <AppLayout>
      <RestrictedAccess module="socios"><PartnersDashboardClient /></RestrictedAccess>
    </AppLayout>
  );
}
