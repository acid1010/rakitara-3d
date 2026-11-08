import { ProductionPage } from "@/components/ops/production";
import { OperationsGuard } from "@/components/ops/provider";

export default function Page() {
  return (
    <OperationsGuard>
      <ProductionPage />
    </OperationsGuard>
  );
}
