"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  RiArrowRightLine,
  RiPrinterLine,
  RiRefreshLine,
  RiTimeLine,
  RiCheckLine,
  RiStackLine,
} from "@remixicon/react";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import type { JobRow } from "@/lib/contracts";
import { dateTime, elapsed, money } from "@/lib/format";
import { PageHeading, Status, NoRecords, Pager, VoidButton } from "./common";
import { useList, useOperations, Loading, ErrorMessage } from "./provider";
import { Records, RecordName } from "./records";

export function ProductionPage() {
  const { running, printers, materials, products, settings, refresh } =
    useOperations();
  const [now, setNow] = useState(() => Date.now());
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState("completed");
  const [page, setPage] = useState({ filter, offset: 0 });
  const offset = page.filter === filter ? page.offset : 0;
  const {
    data: jobs,
    error,
    retry,
  } = useList<JobRow[]>(
    `/jobs?${filter === "voided" ? "voided=only" : "status=DONE&voided=exclude"}&limit=25&offset=${offset}`,
  );
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60000);
    return () => window.clearInterval(timer);
  }, []);
  const lowStock = materials.filter(
    (m) => m.isActive && m.stockGrams <= m.lowStockGrams,
  );
  const ready = printers.filter(
    (p) => p.isActive && !running.some((j) => j.printerId === p.id),
  );
  const configured = settings.some(
    (setting) => setting.key === "price_per_kwh",
  );
  const productName = (id: string) =>
    products.find((p) => p.id === id)?.name ?? id;
  const printerName = (id: string) =>
    printers.find((p) => p.id === id)?.name ?? id;
  return (
    <>
      <PageHeading
        title="Production"
        description="A clear view of what’s printing and what comes next."
        action={{ href: "/entry/job", label: "Start print job" }}
      >
        <Button
          variant="outline"
          size="icon"
          aria-label="Refresh workspace"
          disabled={refreshing}
          onClick={async () => {
            setRefreshing(true);
            await refresh();
            setRefreshing(false);
          }}
        >
          <RiRefreshLine className={refreshing ? "spin" : undefined} />
        </Button>
      </PageHeading>
      <div className="production-overview">
        <span>
          <span className="overview-dot printing" />
          {running.length} printing
        </span>
        <span>
          <span className="overview-dot ready" />
          {ready.length} {ready.length === 1 ? "printer" : "printers"} ready
        </span>
        <Link href="/materials">
          <RiStackLine aria-hidden="true" />
          {lowStock.length} {lowStock.length === 1 ? "material" : "materials"}{" "}
          low
        </Link>
      </div>
      <div className="production-layout">
        <section aria-labelledby="running-heading">
          <div className="section-heading">
            <h2 id="running-heading">On the print bed</h2>
            <span>
              {running.length
                ? "Elapsed time, not machine telemetry"
                : "Ready when you are"}
            </span>
          </div>
          <div className="running-jobs">
            {running.length ? (
              running.map((job) => {
                const material = materials.find((m) => m.id === job.materialId);
                return (
                  <article className="job-card" key={job.id}>
                    <div className="job-card-top">
                      <span className="printer-name">
                        <RiPrinterLine aria-hidden="true" />
                        {printerName(job.printerId)}
                      </span>
                      <Status tone="warning">Printing</Status>
                    </div>
                    <h3>{productName(job.productId)}</h3>
                    <p>
                      {material?.name} / {material?.color}
                    </p>
                    <div className="job-facts">
                      <div>
                        <span>Planned output</span>
                        <strong>
                          {job.qtyPlanned} <small>units</small>
                        </strong>
                      </div>
                      <div>
                        <span>
                          <RiTimeLine aria-hidden="true" />
                          Elapsed
                        </span>
                        <strong>{elapsed(job.startedAt, now)}</strong>
                      </div>
                    </div>
                    <div className="job-started">
                      Started {dateTime(job.startedAt)} WIB
                    </div>
                    {job.note && <p className="job-note">{job.note}</p>}
                    <div className="job-card-actions">
                      <VoidButton
                        resource="jobs"
                        id={job.id}
                        label={`Running job for ${productName(job.productId)}`}
                      />
                      <Link
                        href={`/entry/finish?id=${job.id}`}
                        className={buttonVariants({ variant: "outline" })}
                      >
                        Finish job
                        <RiCheckLine data-icon="inline-end" />
                      </Link>
                    </div>
                  </article>
                );
              })
            ) : (
              <div className="production-empty">
                <RiPrinterLine aria-hidden="true" />
                <NoRecords
                  title="The print beds are clear"
                  description="Choose a product and an available printer to start your next batch."
                  href="/entry/job"
                  action="Start a print job"
                />
              </div>
            )}
          </div>
          {ready.length > 0 && (
            <div className="ready-printers">
              <h3>Available printers</h3>
              {ready.map((p) => (
                <div key={p.id}>
                  <span>
                    <RiPrinterLine aria-hidden="true" />
                    {p.name}
                  </span>
                  <Status tone="success">Ready</Status>
                </div>
              ))}
            </div>
          )}
        </section>
        <aside className="attention-panel" aria-labelledby="attention-heading">
          <h2 id="attention-heading">Studio notes</h2>
          {!configured && (
            <Link href="/settings" className="attention-item">
              <span className="attention-symbol">!</span>
              <div>
                <strong>Set your electricity rate</strong>
                <p>Required before a print job can be completed.</p>
              </div>
              <RiArrowRightLine aria-hidden="true" />
            </Link>
          )}
          {!printers.length && (
            <Link href="/entry/printer" className="attention-item">
              <RiPrinterLine aria-hidden="true" />
              <div>
                <strong>Add your first printer</strong>
                <p>Its cost and power usage are part of every job’s HPP.</p>
              </div>
              <RiArrowRightLine aria-hidden="true" />
            </Link>
          )}
          {!products.length && (
            <Link
              href={materials.length ? "/entry/product" : "/entry/material"}
              className="attention-item"
            >
              <RiStackLine aria-hidden="true" />
              <div>
                <strong>
                  {materials.length
                    ? "Create your first product"
                    : "Add your first material"}
                </strong>
                <p>Start with the materials and designs you actually use.</p>
              </div>
              <RiArrowRightLine aria-hidden="true" />
            </Link>
          )}
          {lowStock.map((material) => (
            <Link
              href={`/entry/purchase?materialId=${material.id}`}
              key={material.id}
              className="attention-item"
            >
              <RiStackLine aria-hidden="true" />
              <div>
                <strong>
                  {material.name} / {material.color}
                </strong>
                <p>
                  {material.stockGrams.toLocaleString()} g left · threshold{" "}
                  {material.lowStockGrams.toLocaleString()} g
                </p>
                <span>Record a purchase</span>
              </div>
              <RiArrowRightLine aria-hidden="true" />
            </Link>
          ))}
          {configured &&
            printers.length > 0 &&
            products.length > 0 &&
            !lowStock.length && (
              <div className="attention-clear">
                <RiCheckLine aria-hidden="true" />
                <strong>Nothing needs attention</strong>
                <p>Active materials are above their low-stock thresholds.</p>
              </div>
            )}
          <div className="costing-note">
            <h3>Good prints. Clear costs.</h3>
            <p>
              Finish a job with the actual grams used. Material, machine time
              and electricity are calculated together.
            </p>
            <p>
              Material is consumed at completion, not reserved when printing
              starts.
            </p>
          </div>
        </aside>
      </div>
      <section className="history-section" aria-labelledby="history-heading">
        <div className="section-heading">
          <div>
            <h2 id="history-heading">Print history</h2>
            <p>Actual output and the cost behind it.</p>
          </div>
          <NativeSelect
            aria-label="Filter print history"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            <NativeSelectOption value="completed">
              Completed jobs
            </NativeSelectOption>
            <NativeSelectOption value="voided">Voided jobs</NativeSelectOption>
          </NativeSelect>
        </div>
        {error ? (
          <ErrorMessage message={error} retry={retry} />
        ) : !jobs ? (
          <Loading label="Loading print history…" />
        ) : (
          <div className="records-panel">
            <Records
              rows={jobs}
              emptyTitle="Your first finished print starts here"
              emptyDescription="Completed batches will show their actual material, machine and energy costs."
              columns={[
                {
                  title: "Print job",
                  render: (job) => (
                    <RecordName
                      title={productName(job.productId)}
                      detail={`${printerName(job.printerId)} · ${dateTime(job.finishedAt ?? job.startedAt)}`}
                    />
                  ),
                },
                {
                  title: "Output",
                  render: (job) => (
                    <RecordName
                      title={`${job.qtyGood} good / ${job.qtyPlanned} planned`}
                      detail={
                        job.qtyFailed
                          ? `${job.qtyFailed} failed · ${job.failureReason?.toLowerCase().replaceAll("_", " ")}`
                          : "No failed units"
                      }
                    />
                  ),
                },
                {
                  title: "Material",
                  numeric: true,
                  render: (job) => (
                    <RecordName
                      title={job.gramsUsed == null ? "—" : `${job.gramsUsed} g`}
                      detail={money(job.materialCost, 4)}
                    />
                  ),
                },
                {
                  title: "Machine",
                  numeric: true,
                  render: (job) => money(job.machineCost, 4),
                },
                {
                  title: "Energy",
                  numeric: true,
                  render: (job) => money(job.energyCost, 4),
                },
                {
                  title: "Unit HPP",
                  numeric: true,
                  render: (job) => (
                    <RecordName
                      title={money(job.unitCost, 4)}
                      detail={
                        job.qtyGood === 0 && !job.voidedAt
                          ? "Fully failed batch"
                          : undefined
                      }
                    />
                  ),
                },
                {
                  title: "Correction",
                  render: (job) =>
                    job.voidedAt ? (
                      <RecordName title="Voided" detail={job.voidReason} />
                    ) : (
                      <VoidButton
                        resource="jobs"
                        id={job.id}
                        label={`Completed job for ${productName(job.productId)}`}
                      />
                    ),
                },
              ]}
            />
            <Pager
              offset={offset}
              count={jobs.length}
              onChange={(value) => setPage({ filter, offset: value })}
            />
          </div>
        )}
      </section>
    </>
  );
}
