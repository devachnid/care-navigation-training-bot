import type { ErrorSummaryItem } from '@/ui';

/**
 * What a server action returns to `useActionState`. Shared by every form.
 * - `errors`: one message per field, keyed by the field's `name` (which is also its id).
 * - `message`: a problem with the form as a whole, or the success message when `success` is true.
 * - `values`: what the person typed, to put back as `defaultValue`. Never put a password in it.
 */
export type FormState = {
  errors?: Record<string, string>;
  message?: string;
  values?: Record<string, string>;
  success?: boolean;
};

export const initialFormState: FormState = {};

/** A text field from a form, or '' if it is missing. Not trimmed: trim it yourself where it matters. */
export function text(formData: FormData, name: string): string {
  const v = formData.get(name);
  return typeof v === 'string' ? v : '';
}

/** The named text fields as `values`, for giving back to the form. List only fields that are safe to show again. */
export function keep(formData: FormData, names: readonly string[]): Record<string, string> {
  return Object.fromEntries(names.map(n => [n, text(formData, n)]));
}

/** A failed submit: field errors and/or a form-wide message, plus the values to keep. */
export function failed(
  formData: FormData,
  keepNames: readonly string[],
  problems: { errors?: Record<string, string>; message?: string },
): FormState {
  return { ...problems, values: keep(formData, keepNames) };
}

/**
 * The `ErrorSummary` items for a state: each field error links to its field (`#name`); a form-wide
 * message has no link. Empty on success. Pass `order` (field names) to list errors in page order.
 */
export function summaryItems(state: FormState, order?: readonly string[]): ErrorSummaryItem[] {
  if (state.success) return [];
  const entries = Object.entries(state.errors ?? {});
  if (order) entries.sort(([a], [b]) => rank(order, a) - rank(order, b));
  const items: ErrorSummaryItem[] = entries.map(([name, message]) => ({ message, href: `#${name}` }));
  if (state.message) items.push({ message: state.message });
  return items;
}

const rank = (order: readonly string[], name: string) => {
  const i = order.indexOf(name);
  return i === -1 ? order.length : i;
};
