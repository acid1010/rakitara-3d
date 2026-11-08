"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  RiArrowRightLine,
  RiBox3Line,
  RiPrinterLine,
  RiStackLine,
  RiShoppingBag3Line,
} from "@remixicon/react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default function Login() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const lock = useRef(false);
  useEffect(() => {
    const controller = new AbortController();
    void api("/auth/me", { signal: controller.signal })
      .then(() => router.replace("/"))
      .catch(() => {});
    return () => controller.abort();
  }, [router]);
  return (
    <main className="login-page">
      <section className="login-story">
        <div className="brand">
          <span className="brand-mark">
            <RiBox3Line />
          </span>
          <span>
            rakitara<span className="brand-suffix">3D</span>
          </span>
        </div>
        <div className="login-message">
          <h1>
            A little structure.
            <br />
            More room to make.
          </h1>
          <p>
            Your materials, prints and sales.
            <br />
            One place to keep the studio moving.
          </p>
          <div className="login-workflow">
            <span>
              <RiStackLine />
              Material
            </span>
            <RiArrowRightLine />
            <span>
              <RiPrinterLine />
              Print
            </span>
            <RiArrowRightLine />
            <span>
              <RiShoppingBag3Line />
              Sell
            </span>
          </div>
        </div>
        <span className="login-footnote">The work behind every print.</span>
      </section>
      <section className="login-panel">
        <div className="login-form">
          <div className="mobile-login-brand">
            <RiBox3Line />
            <span>rakitara 3D</span>
          </div>
          <h2>Welcome to your studio</h2>
          <p>Sign in to manage your daily operations.</p>
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              if (lock.current) return;
              const data = new FormData(event.currentTarget);
              lock.current = true;
              setPending(true);
              setError("");
              try {
                await api("/auth/login", {
                  method: "POST",
                  body: {
                    username: data.get("username"),
                    password: data.get("password"),
                  },
                });
                router.replace("/");
              } catch (e) {
                setError(e instanceof Error ? e.message : "Could not sign in.");
                setPending(false);
                lock.current = false;
              }
            }}
          >
            <FieldGroup>
              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              <Field>
                <FieldLabel htmlFor="username">Username</FieldLabel>
                <Input
                  id="username"
                  name="username"
                  autoComplete="username"
                  required
                  maxLength={100}
                  disabled={pending}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="password">Password</FieldLabel>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  maxLength={1024}
                  disabled={pending}
                />
              </Field>
              <Button type="submit" size="lg" disabled={pending}>
                {pending ? "Signing in…" : "Sign in"}
                <RiArrowRightLine data-icon="inline-end" />
              </Button>
            </FieldGroup>
          </form>
          <p className="login-security">
            Private workspace. Access is limited to the studio owner.
          </p>
        </div>
        <span className="login-panel-footer">
          Rakitara 3D · Studio operations
        </span>
      </section>
    </main>
  );
}
