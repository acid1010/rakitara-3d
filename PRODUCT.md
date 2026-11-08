# Rakitara 3D

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

A single owner managing a 3D-print business, using desktop and phone equally.

## Product Purpose

Track material purchases, production, finished stock, sales, payments, machine maintenance, and the cash journal in one operational workflow.

## Operating Context

English interface, Indonesian rupiah (IDR), and Asia/Jakarta (WIB) timestamps. Production starts and finishes at the time of recording; this is not printer telemetry.

## Capabilities and Constraints

Express owns authentication, inventory, costing, and accounting. Next.js accesses it through the same-origin `/api` proxy. One owner account; no registration or roles. Money travels as decimal strings. Records are voided or deactivated, never deleted. Voids correct data-entry errors, not physical returns or refunds. Writes must not be automatically retried after ambiguous network failures. Financial reporting and printer integrations are outside this release.

## Brand Commitments

Keep the existing neutral/amber shadcn Base UI foundation. Favor clear operational states, accessible touch-friendly forms, immediate feedback, and restrained motion over decorative dashboards.

## Evidence on Hand

The API contract and accounting policies are in `server/README.md`; the schema is in `prisma/schema.prisma`. No real product imagery or business performance claims were provided.
