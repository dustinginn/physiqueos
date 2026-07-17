This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.js`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Founder operations output

Generated Founder Alpha output must not be written to the repository root. Use `private/founder/logs/` for server, recovery, migration, test, and debug logs; use `private/founder/tmp/` for disposable operational files. Production incident snapshots remain in the established `private/founder/incident-recovery/` directory and are never included in routine cleanup.

Use lowercase descriptive names and Windows-safe timestamps such as `controlled-restart-2026-07-15T03-46-51-703Z.out.log`. The helper in `scripts/operationsPaths.mjs` creates category directories and stdout/stderr paths.

- `npm run ops:root:check` rejects known generated logs in the repository root.
- `npm run ops:logs:check` previews retention cleanup without deleting anything.
- `npm run ops:logs:clean -- --retain 20 --older-than-days 30` explicitly deletes eligible logs. Runtime stores, backups, uploads, evidence, and incident-recovery snapshots are always excluded.

## Visual language follow-up

During a future app-wide Visual Language Pass, use the approved DEXA Hero metric-card treatment to inform Weekly Hero highlights. Do not redesign Weekly as part of DEXA work.

Semantic colors communicate outcomes; neutral colors communicate evidence. The DEXA Event is the current reference implementation for this rule, but it should not be propagated to other surfaces before that app-wide pass.
