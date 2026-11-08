import { OperationsProvider } from "@/components/ops/provider";
import { Shell } from "@/components/ops/shell";
import { Toaster } from "@/components/ui/toast";

export default function OperationsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <OperationsProvider>
      <Shell>{children}</Shell>
      <Toaster timeout={0} />
    </OperationsProvider>
  );
}
