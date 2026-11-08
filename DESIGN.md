---
name: Rakitara 3D
description: A precise, touch-friendly owner workspace for the work behind each print.
colors:
  primary: "oklch(0.555 0.163 48.998)"
  background: "#f8f9fb"
  surface: "#ffffff"
  foreground: "oklch(0.141 0.005 285.823)"
  muted-foreground: "#626772"
  success: "#24694c"
  success-surface: "#edf6f0"
  warning: "#945008"
  warning-surface: "#fff6e8"
typography:
  body:
    fontFamily: "IBM Plex Sans, sans-serif"
    fontSize: "14px"
    lineHeight: 1.5
  heading:
    fontFamily: "Geist, sans-serif"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-0.035em"
rounded:
  control: "6px"
  panel: "10px"
  dialog: "12px"
spacing:
  desktop-content: "40px"
  mobile-content: "20px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    height: "44px"
    rounded: "{rounded.control}"
---

## Overview

An operational workspace, not a marketing dashboard. Preserve the existing neutral/amber foundation. The visual hierarchy follows the real workflow: materials, production, stock, sale, payment. State and actionable records lead; charts and decorative metrics do not.

## Colors

Amber identifies primary actions and active navigation. Green indicates ready/paid/healthy states; amber indicates printing, unpaid, and low-stock states. Every status has text as well as color. Surfaces are light for shop-floor and desk use. `app/globals.css` is the implementation authority.

## Typography

Geist carries headings; IBM Plex Sans carries controls and records. Use sentence case. Money, quantities, and elapsed time use tabular numerals. Inputs are at least 16px on mobile to avoid automatic browser zoom. Keep operational numbers exact; computed unit HPP can show four decimal places.

## Layout

Desktop uses a fixed 228px sidebar, a 72px topbar, and 40px content gutters. The sidebar disappears below 768px in favor of a disclosure navigation. Mobile uses 20px gutters and turns table records into labeled summaries. Long forms have a dedicated route, with guidance beside them on desktop and below on mobile. Sale totals stay above the save action at every width.

## Elevation & Depth

Use subtle borders for everyday panels. Reserve an offset, soft shadow for dialogs. No decorative gradients, blur, glowing states, or repeated entrance animation.

## Shapes

Controls use a 6px radius; panels roughly 9–10px; dialogs 12px. Controls are 44px high, with compact secondary actions at 40px. Corners support hierarchy rather than using the same radius everywhere.

## Components

Compose installed shadcn Base UI controls. Use `FieldGroup`, labels, descriptions and field errors for forms; native selects keep phone interaction familiar. Use a focused dialog only for void confirmation. Do not auto-dismiss successful save notices. Conflicts preserve form values; uncertain writes disable resubmission and point back to records. Session authorization remains in Express, not in a visual route guard.

Pointer press feedback is a subtle 0.97 scale with a 150ms custom ease-out. Keyboard-focused controls do not animate. Lists and navigation do not stagger. Reduced motion disables movement. Dialogs retain focus management, Escape behavior, and accessible titles.

## Do's and Don'ts

- Show actual records and honest loading, error, empty and inactive states.
- Display English labels, IDR amounts and explicit WIB operating timestamps.
- Keep production estimates distinct from actual elapsed time and final costs.
- Never invent printer telemetry, business-wide totals from partial lists, or delete actions.
- Don't automatically retry writes or describe a void as a physical refund.

Verification used isolated API fixtures, desktop and 390px mobile captures. Live database behavior and physical touch hardware were not verified.
