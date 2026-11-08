import { Suspense } from "react";
import { EntryPage } from "@/components/ops/entry-page";
import { Loading, OperationsGuard } from "@/components/ops/provider";
import { entryKinds } from "@/lib/entry";

export function generateStaticParams() {
  return entryKinds.map((kind) => ({ kind }));
}
async function EntryRoute({ params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params;
  return <EntryPage kind={kind} />;
}
export default function Page({
  params,
}: {
  params: Promise<{ kind: string }>;
}) {
  return (
    <OperationsGuard>
      <Suspense fallback={<Loading />}>
        <EntryRoute params={params} />
      </Suspense>
    </OperationsGuard>
  );
}
