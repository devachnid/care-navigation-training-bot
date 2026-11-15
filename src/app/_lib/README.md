# src/app/_lib

Helpers every page and action uses. Copy the pattern.

## Access: `guard.ts` (server only)

- `requireMember(): Promise<MemberActor>`: signed in with an active practice. Not signed in goes to `/sign-in`; no practice goes to `/admin` (platform admin) or `/no-access`.
- `requireAbility(ability): Promise<MemberActor>`: as above, then `notFound()` if `can()` refuses. `requireAbility('platform.admin')` returns a plain `Actor` and needs no practice.
- `navFor(actor): { href; label }[]`: the main navigation by ability.

Call one of them first in every page, server action and route handler. The `(app)` layout only fills in the frame; it is not an access check.

## Forms: `form.ts`

```ts
type FormState = { errors?: Record<string, string>; message?: string; values?: Record<string, string>; success?: boolean };
```

- Server action: `(prev: FormState, formData: FormData) => Promise<FormState>`. Start with `requireAbility(...)`, check the input, call a data-access function, then return `failed(formData, ['email', 'name'], { errors })` or `redirect()`.
- `errors` is keyed by field `name` (also the field id). `message` is a problem with the whole form (or the success text when `success` is true).
- `values` goes back as `defaultValue`. List only safe fields in `keep`/`failed`: never a password.
- Client form: `const [state, action] = useActionState(myAction, initialFormState)`, then `<ErrorSummary errors={summaryItems(state, ORDER)} focusToken={state} />` at the top and `error={state.errors?.name}` on each `Field`.
- Put the form layout classes from `forms.module.css` (`.form`, `.actions`) on the form, and wrap stacked `Alert`s in `stack.module.css` `.alerts`.

## Other

- `request.ts`: `clientIp()` (the platform's `x-vercel-forwarded-for`, then `x-real-ip`, then the first `x-forwarded-for` entry; see `src/auth/client-ip.ts`).
- `session-actions.ts`: `signOutAction` for the `AppShell` form.
- `privacy-checkbox.tsx`, `not-found-content.tsx`, `error-content.tsx`: shared bits.
