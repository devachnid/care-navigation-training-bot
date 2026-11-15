# Next.js 16 notes for this codebase

A digest of the docs bundled with the installed version (`node_modules/next/dist/docs/`, paths below are relative to it). Read the page itself before relying on a detail; this is a pointer, not a replacement. This project does **not** enable `cacheComponents`, so `01-app/02-guides/caching-without-cache-components.md` is the caching model that applies.

## Request APIs are async

- `await cookies()`, `await headers()`. Sync access was removed (`02-guides/upgrading/version-16.md`).
- Cookies can be set or deleted only in server functions (actions) and route handlers, never while rendering a server component (`03-api-reference/04-functions/cookies.md`).
- `params` and `searchParams` are Promises in pages, layouts and route handlers. Generated global helpers type them: `PageProps<'/debrief/[sessionId]'>`, `LayoutProps<'/x'>`, `RouteContext<'/api/sessions/[sessionId]/end'>` (run `npx next typegen`, or they appear during `next dev` / `next build`).

```tsx
export default async function Page(props: PageProps<'/debrief/[sessionId]'>) {
  const { sessionId } = await props.params;
}
```

## Where to check who is signed in

From `02-guides/authentication.md` and `02-guides/data-security.md`:

- Put the check in a data access layer that starts with `import 'server-only'`, wrapped in React `cache()` so one render asks once. `cache()` does nothing inside server actions and route handlers, which is fine.
- Check again in every server action and route handler. A page-level check does not cover the action behind it. Route handlers answer 401 (not signed in) or 403.
- Do not check in layouts: they do not re-run on navigation and do not stop child pages rendering.
- Return only the fields a page needs. Client components cannot import the data layer.
- `proxy.ts` (the renamed `middleware.ts`; lives in `src/`, Node runtime only) is for optimistic cookie-presence redirects at most, never database checks. This app does not need one for auth.

## Forms and mutations

- Server functions: `'use server'` at the top of a file. Client form pattern is `const [state, action, pending] = useActionState(fn, initial)`; the action takes `(prevState, formData)` and returns field errors (`01-getting-started/07-mutating-data.md`).
- React resets an uncontrolled form after its action runs. Return the submitted values in the state and feed them back as `defaultValue` so a failed submit does not wipe what the person typed.
- `redirect()` throws: call it outside `try/catch`.
- After a mutation use `revalidatePath(path)` (actions and route handlers) or `refresh()` (actions only). `revalidateTag` needs two arguments in 16. Setting or deleting a cookie in an action re-renders the current page.

## Caching

- Reading `cookies()` or `headers()` makes a route dynamic. Every signed-in page here does that through the actor lookup, so per-user pages are never cached. `export const dynamic = 'force-dynamic'` is allowed in this mode if a page needs to be explicit.
- Never wrap per-user queries in `unstable_cache`.

## Errors

- `error.tsx` is a client component; props are `error` and `retry()`. `global-error.tsx` must render `<html>` and `<body>`.
- `notFound()` with `not-found.tsx`. `forbidden()` / `unauthorized()` are experimental and need `experimental.authInterrupts`; this app uses `notFound()` for "not yours" so it does not reveal that something exists.

## Security headers

- Static headers and a non-nonce CSP go in `next.config.ts` `headers()`. A nonce-based CSP needs `proxy.ts` and forces every page dynamic (`02-guides/content-security-policy.md`).

## Other changes from 14/15

- Turbopack is the default for dev and build. `next lint` is gone; lint is plain `eslint` with flat config.
- Route groups `(name)` do not appear in URLs; two groups must not resolve to the same path. `loading.tsx` wraps the page, not its own layout.
- Parallel route slots need `default.js`.
