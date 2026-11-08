import { OperationsProvider } from "@/components/ops/provider";
import { Shell } from "@/components/ops/shell";

export default function OperationsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <OperationsProvider>
      <Shell>{children}</Shell>
    </OperationsProvider>
  );
}
