# Bangalore Electronics ERP UI redesign

## Scope and architecture

The existing React/Vite application retains its route registry, service layer, authentication, calculations and print workflows. The redesign covers the application shell, executive dashboard, inventory workflows and registers, project management, HRMS, tools, settings, profile and authentication screens.

The audit found independent page styling, oversized KPI treatments, inconsistent controls and navigation, placeholder tool screens, and render failures caused by passing icon component objects as React children. It also identified a dashboard cache event loop, an employee API response-shape mismatch, and tablet grids expanding to table width.

## Implementation

- Semantic color, spacing, typography, radius, shadow and motion tokens in `src/styles/variables.css`; shared controls and responsive rules in the styles directory.
- Reusable page headers, cards, metrics, tables, tabs, badges, empty/loading states and avatars in `src/components/ui`, with common buttons, inputs and accessible modal behavior.
- Dark grouped sidebar, collapse/mobile navigation, keyboard search, breadcrumbs, contextual actions and route error recovery.
- Executive overview combines project health, procurement, workforce, inventory activity and action priorities using existing service data.
- Project dashboard, project register/detail workspace, tasks, milestones, team, materials, purchases, site reports, financials and documents share the design language. Project query links open the matching workspace.
- Inventory entry screens and registers share workflow headers, compact forms, table treatments and responsive containment.
- HR dashboard, employee directory/profile, attendance, reviews and payroll use consistent hierarchy and statuses. Profile tabs retain unsaved edits; settings show the selected category.
- Tool workspaces use the existing tool store. CSV import validates required columns and duplicate serial numbers before appending records. Storage remains browser-local, as in the existing tools implementation.
- Shared icon rendering handles both component types and rendered elements, resolving the HRMS/project blank-screen failure. Dashboard cache writes no longer recursively refresh unchanged data.

## Verification

Start the frontend on localhost:5173, then run:

```text
npm run build
npm test
npm run test:ui
npm run test:ui:routes
npm run check:ui
```

The browser scripts use installed Microsoft Edge and isolated synthetic API responses. `UI_CHECK_MODE=populated` or `offline`, `UI_CHECK_WIDTH`, and comma-separated `UI_CHECK_ROUTES` select additional route scenarios. `UI_BROWSER` can select a different installed Playwright browser channel for the route runner. Reports and screenshots are generated under `artifacts/ui-review` and ignored by Git.

Verified during implementation:

- Production build passes; all 28 existing backend tests pass.
- All 106 discovered frontend routes and aliases pass the 1440-pixel empty-data sweep without detected runtime exceptions or page overflow.
- Nine browser interaction checks pass: sidebar, keyboard search, dashboard filters, profile state, employee tabs, settings selection, project deep links, CSV validation/preservation, and mobile Escape.
- Populated representative screens render without detected runtime exceptions or page overflow at 1024, 1366, 1440 and 1920 pixels.
- Tablet route inspection found tools/invoice overflow; all five affected route aliases pass after the grid containment fix.
- Eleven representative routes render under simulated API unavailability without uncaught render failures.
- Static audit reports no undefined identifiers or parser failures. Full lint is not clean: it reports 76 errors and five warnings, including legacy hook patterns and unused declarations. The audit command deliberately reports those separately rather than claiming full lint success.

## Verification limits

Browser fixtures validate rendering and selected interactions; they do not certify every real-data create/edit/approval flow or print output. Existing business service handlers and print structures were retained. No production data was modified by browser tests. Vite still reports the large main bundle warning; route code splitting and tool-image optimization remain performance work. Some complex legacy page-specific dialogs remain and have not all been converted to shared drawers/modals.
