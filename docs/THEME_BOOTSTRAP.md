# Theme bootstrap

## Rendering stabilization

The root theme bootstrap must resolve appearance before React hydration. The
previous `ThemeScript` Server Component returned a raw `<script>` element from
inside the React component tree. Although its parent `RootLayout` is also a
Server Component, React 19.2.4's development client renderer encounters that
element while reconciling the streamed root layout and warns that scripts
rendered by React components are not executed. This was the unsupported path;
no client-component import was responsible for the boundary.

`ThemeScript` now renders Next.js 16.2.9's supported `next/script` boundary with
the `beforeInteractive` strategy and the stable id
`physiqueos-theme-bootstrap`. It remains mounted exactly once by the server
`RootLayout`. Next.js injects this strategy into the initial document before
hydration, which preserves the no-flash timing without using `useEffect` for
initial appearance.

The authoritative storage key remains `physiqueos-theme`. Accepted preferences
are `system`, `light`, and `dark`; invalid or inaccessible storage falls back to
`system`. System mode resolves with `(prefers-color-scheme: dark)` and safely
falls back to light when `matchMedia` is unavailable. The resolved appearance
continues to toggle the root `dark` class and set `data-theme`; the persisted
selection continues to use `data-theme-preference`. CSS owns `color-scheme`
through `:root[data-theme]`.

`suppressHydrationWarning` remains limited to `<html>` because the pre-hydration
bootstrap intentionally changes that element's class and data attributes. It is
not applied to `<body>` or any broader subtree.

Focused contract tests cover bootstrap timing, storage failures, invalid
preferences, system resolution, root attributes, duplicate prevention, and the
supported layout boundary. Turbopack HTTP verification confirmed the root Home
route and an unrelated RootLayout route render with one bootstrap boundary and
without the raw-script form. Interactive browser verification was unavailable
in the patch environment. The post-activation Goals surfaces remain blocked by
a separate `Link href={null}` regression; that belongs to the next Active App
Reconciliation patch and was not changed here.

The production founder store was fingerprinted before and after this patch. No
founder state, scheduler state, activation service, coordinator, or unit of work
was mutated or invoked.
