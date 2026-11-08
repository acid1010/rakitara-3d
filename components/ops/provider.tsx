"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { allRows, api } from "@/lib/api";
import type {
  PrinterRow,
  MaterialRow,
  ProductRow,
  JobRow,
  SettingRow,
} from "@/lib/contracts";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

type References = {
  printers: PrinterRow[];
  materials: MaterialRow[];
  products: ProductRow[];
  running: JobRow[];
  settings: SettingRow[];
};
type Operations = References & {
  ready: boolean;
  expired: boolean;
  error: string;
  username: string;
  revision: number;
  refresh: () => Promise<void>;
  notice: string;
  notify: (message: string) => void;
};
const Context = createContext<Operations | null>(null);
const emptyReferences: References = {
  printers: [],
  materials: [],
  products: [],
  running: [],
  settings: [],
};

export function Loading({
  label = "Loading your workspace…",
}: {
  label?: string;
}) {
  return (
    <div role="status" aria-label={label} className="loading-state">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-4 w-72 max-w-full" />
      <Skeleton className="mt-6 h-44 w-full" />
      <span className="sr-only">{label}</span>
    </div>
  );
}

export function ErrorMessage({
  message,
  retry,
}: {
  message: string;
  retry?: () => void;
}) {
  return (
    <Alert variant="destructive">
      <AlertTitle>Couldn’t load this view</AlertTitle>
      <AlertDescription>
        {message}
        {retry && (
          <Button variant="outline" onClick={retry}>
            Try again
          </Button>
        )}
      </AlertDescription>
    </Alert>
  );
}

export function OperationsProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [refs, setRefs] = useState<References | null>(null);
  const [username, setUsername] = useState("");
  const [error, setError] = useState("");
  const [expired, setExpired] = useState(false);
  const [revision, setRevision] = useState(0);
  const [notice, notify] = useState("");
  const refresh = useCallback(async () => {
    try {
      // shortcut: owner-sized master catalogs load in full; add server-side lookup search before large catalogs.
      const [printers, materials, products, running, settings] =
        await Promise.all([
          allRows<PrinterRow>("/printers"),
          allRows<MaterialRow>("/materials"),
          allRows<ProductRow>("/products"),
          allRows<JobRow>("/jobs?status=PRINTING&voided=exclude"),
          api<SettingRow[]>("/settings"),
        ]);
      setRefs({ printers, materials, products, running, settings });
      setError("");
      setRevision((value) => value + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load workspace.");
    }
  }, []);

  useEffect(() => {
    let active = true;
    const expire = () => {
      setExpired(true);
      router.replace("/login");
    };
    window.addEventListener("session-expired", expire);
    void api<{ username: string }>("/auth/me")
      .then(async (owner) => {
        if (!active) return;
        setUsername(owner.username);
        await refresh();
      })
      .catch((e: Error) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
      window.removeEventListener("session-expired", expire);
    };
  }, [refresh, router]);

  useEffect(() => {
    if (!username) return;
    const onVisible = () => {
      if (document.visibilityState === "visible")
        void api("/auth/me")
          .then(refresh)
          .catch(() => {});
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [username, refresh]);

  return (
    <Context.Provider
      value={{
        ...(refs ?? emptyReferences),
        ready: !!refs && !!username,
        expired,
        error,
        username,
        revision,
        refresh,
        notice,
        notify,
      }}
    >
      {children}
    </Context.Provider>
  );
}

export function OperationsGuard({ children }: { children: ReactNode }) {
  const { ready, expired, error, refresh } = useOperations();
  if (expired) return <Loading label="Returning to sign in…" />;
  if (error)
    return (
      <div className="workspace-boot">
        <ErrorMessage
          message={
            ready
              ? `${error} Your last action may already be saved. Refresh before making another change.`
              : error
          }
          retry={ready ? () => void refresh() : () => window.location.reload()}
        />
      </div>
    );
  if (!ready) return <Loading />;
  return children;
}

export function useOperations() {
  const context = useContext(Context);
  if (!context) throw new Error("OperationsProvider is required");
  return context;
}

export function useList<T>(path: string) {
  const { revision } = useOperations();
  const [retry, setRetry] = useState(0);
  const key = `${path}:${revision}:${retry}`;
  const [result, setResult] = useState<{
    key: string;
    data?: T;
    error?: string;
  }>({ key: "" });
  useEffect(() => {
    const controller = new AbortController();
    void api<T>(path, { signal: controller.signal })
      .then((data) => setResult({ key, data }))
      .catch((error: Error) => {
        if (!controller.signal.aborted)
          setResult({ key, error: error.message });
      });
    return () => controller.abort();
  }, [path, key]);
  return {
    data: result.key === key ? result.data : undefined,
    error: result.key === key ? result.error : undefined,
    retry: () => setRetry((value) => value + 1),
  };
}
