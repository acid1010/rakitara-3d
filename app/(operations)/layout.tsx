import { OperationsProvider } from "@/components/ops/provider";
import { Shell } from "@/components/ops/shell";

// Entry into this workspace waits for the existing Express owner session.
export const instant = false;

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
