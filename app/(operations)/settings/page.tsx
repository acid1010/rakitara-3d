"use client";

import { useRef, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { money } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldDescription,
} from "@/components/ui/field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "@/components/ui/toast";
import { OperationsGuard, useOperations } from "@/components/ops/provider";
import { PageHeading } from "@/components/ops/common";

export default function Settings() {
  return (
    <OperationsGuard>
      <SettingsForm />
    </OperationsGuard>
  );
}

function SettingsForm() {
  const { settings, refresh } = useOperations();
  const current = settings.find((s) => s.key === "price_per_kwh");
  const [value, setValue] = useState(current?.value ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [uncertain, setUncertain] = useState(false);
  const lock = useRef(false);
  return (
    <>
      <PageHeading
        title="Studio settings"
        description="The few details that keep your records consistent."
      />
      <div className="settings-layout">
        <section className="entry-panel">
          <h2>Electricity rate</h2>
          <p className="context-note">
            Used to calculate the energy cost of print jobs at completion.
          </p>
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              if (lock.current || uncertain) return;
              if (!/^(0|[1-9]\d{0,11})(\.\d{1,2})?$/.test(value)) {
                setError(
                  "Enter a non-negative decimal amount, with at most 12 integer digits and 2 decimal places.",
                );
                return;
              }
              lock.current = true;
              setPending(true);
              setError("");
              try {
                await api("/settings/price_per_kwh", {
                  method: "PUT",
                  body: { value },
                });
                toast.add({
                  id: "operation-success",
                  type: "success",
                  title:
                    "Electricity rate saved. Completed jobs keep their original costs.",
                });
                await refresh();
              } catch (e) {
                setError(
                  e instanceof Error ? e.message : "Could not save rate.",
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
                    {uncertain && (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => window.location.reload()}
                      >
                        Reload and check saved rate
                      </Button>
                    )}
                  </AlertDescription>
                </Alert>
              )}
              <Field>
                <FieldLabel htmlFor="electricity-rate">
                  Price per kWh (IDR)
                </FieldLabel>
                <Input
                  id="electricity-rate"
                  value={value}
                  onChange={(event) => setValue(event.target.value)}
                  inputMode="decimal"
                  required
                  maxLength={15}
                  placeholder="For example, 1444.70"
                  disabled={pending || uncertain}
                />
                <FieldDescription>
                  Without thousands separators. Use a dot for decimals. Current
                  rate:{" "}
                  {current ? `${money(current.value)} / kWh` : "not configured"}
                  .
                </FieldDescription>
              </Field>
              <div className="form-actions">
                <Button type="submit" disabled={pending || uncertain}>
                  {pending ? "Saving…" : "Save electricity rate"}
                </Button>
              </div>
            </FieldGroup>
          </form>
        </section>
        {/* <section className="settings-facts">
          <h2>Workspace defaults</h2>
          <dl>
            <dt>Language</dt>
            <dd>English</dd>
            <dt>Currency</dt>
            <dd>IDR · Indonesian rupiah</dd>
            <dt>Timezone</dt>
            <dd>WIB · Asia/Jakarta (UTC+7)</dd>
            <dt>Access</dt>
            <dd>Single studio owner</dd>
          </dl>
          <p>
            Owner credentials are configured on the server. Registration and
            password recovery are not available in this app.
          </p>
        </section> */}
      </div>
    </>
  );
}
