"use client";

import Link from "next/link";
import { useRef, useState, type ReactNode } from "react";
import {
  RiAddLine,
  RiArrowLeftSLine,
  RiArrowRightSLine,
} from "@remixicon/react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
  EmptyContent,
} from "@/components/ui/empty";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Field, FieldLabel, FieldGroup } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useOperations } from "./provider";

export function PageHeading({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description: string;
  action?: { href: string; label: string };
  children?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      <div className="heading-actions">
        {children}
        {action && (
          <Link href={action.href} className={buttonVariants()}>
            <RiAddLine data-icon="inline-start" />
            {action.label}
          </Link>
        )}
      </div>
    </div>
  );
}

export function Status({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "success" | "warning" | "danger";
}) {
  return (
    <Badge variant="outline" className={cn("status-badge", `status-${tone}`)}>
      <span aria-hidden="true" />
      {children}
    </Badge>
  );
}

export function NoRecords({
  title,
  description,
  href,
  action,
}: {
  title: string;
  description: string;
  href?: string;
  action?: string;
}) {
  return (
    <Empty className="empty-state">
      <EmptyHeader>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
      {href && (
        <EmptyContent>
          <Link href={href} className={buttonVariants({ variant: "outline" })}>
            {action}
          </Link>
        </EmptyContent>
      )}
    </Empty>
  );
}

export function Pager({
  offset,
  count,
  onChange,
}: {
  offset: number;
  count: number;
  onChange: (offset: number) => void;
}) {
  return (
    <div className="list-footer">
      <span>
        {count
          ? `Showing ${offset + 1}–${offset + count}`
          : "No records on this page"}
        <span className="pagination-hint"> · newest first</span>
      </span>
      <div>
        <Button
          variant="outline"
          size="sm"
          disabled={offset === 0}
          aria-label="Previous page"
          onClick={() => onChange(Math.max(0, offset - 25))}
        >
          <RiArrowLeftSLine />
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={count < 25 || offset >= 100000}
          aria-label="Next page"
          onClick={() => onChange(offset + 25)}
        >
          <RiArrowRightSLine />
        </Button>
      </div>
    </div>
  );
}

export function VoidButton({
  resource,
  id,
  label,
}: {
  resource: string;
  id: string;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [uncertain, setUncertain] = useState(false);
  const lock = useRef(false);
  const { refresh, notify } = useOperations();
  function close() {
    setOpen(false);
    if (uncertain) void refresh();
    setError("");
    setUncertain(false);
  }
  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        Void
      </Button>
      <Dialog
        open={open}
        onOpenChange={(value) => {
          if (!pending) {
            if (value) setOpen(true);
            else close();
          }
        }}
      >
        <DialogContent showCloseButton={!pending}>
          <DialogHeader>
            <DialogTitle>Void this record?</DialogTitle>
            <DialogDescription>
              {label}. This corrects a recording error, not a physical return or
              refund. Related stock and journal entries will be reversed when
              permitted.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              if (lock.current || uncertain) return;
              const data = new FormData(event.currentTarget);
              lock.current = true;
              setPending(true);
              setError("");
              try {
                await api(`/${resource}/${id}/void`, {
                  method: "POST",
                  body: { reason: data.get("reason") },
                });
                notify("Record voided. Related balances have been refreshed.");
                setOpen(false);
                await refresh();
              } catch (e) {
                setError(
                  e instanceof Error ? e.message : "Could not void record.",
                );
                setUncertain(e instanceof ApiError && e.uncertain);
              } finally {
                lock.current = false;
                setPending(false);
              }
            }}
          >
            <FieldGroup>
              {error && (
                <Alert variant="destructive">
                  <AlertDescription>
                    {error}
                    {uncertain &&
                      " Close this dialog to refresh the records before taking another action."}
                  </AlertDescription>
                </Alert>
              )}
              <Field>
                <FieldLabel htmlFor={`void-${id}`}>
                  Reason for correction
                </FieldLabel>
                <Textarea
                  id={`void-${id}`}
                  name="reason"
                  required
                  maxLength={1000}
                  disabled={pending}
                />
              </Field>
              <div className="form-actions">
                <Button
                  variant="outline"
                  type="button"
                  disabled={pending}
                  onClick={close}
                >
                  {uncertain ? "Close and check records" : "Keep record"}
                </Button>
                <Button
                  variant="destructive"
                  type="submit"
                  disabled={pending || uncertain}
                >
                  {pending ? "Voiding…" : "Void record"}
                </Button>
              </div>
            </FieldGroup>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
