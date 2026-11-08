import { SalesPage } from "@/components/ops/records";
import { OperationsGuard } from "@/components/ops/provider";

export default function Page() {
  return (
    <OperationsGuard>
      <SalesPage />
    </OperationsGuard>
  );
}
