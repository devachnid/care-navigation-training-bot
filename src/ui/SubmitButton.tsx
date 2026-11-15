'use client';

import { useFormStatus } from 'react-dom';
import { Button } from './Button';
import type { ButtonProps } from './Button';

export type SubmitButtonProps = Omit<ButtonProps, 'type' | 'pending' | 'href' | 'children'> & {
  /** Normal label, for example "Save changes". */
  children: React.ReactNode;
  /** Label while the form is being submitted, for example "Saving…". Defaults to the normal label. */
  pendingLabel?: React.ReactNode;
};

/** A submit button that disables itself and shows `pendingLabel` while its parent form's action runs. Must be inside a `<form>`. */
export function SubmitButton({ children, pendingLabel, ...rest }: SubmitButtonProps) {
  const { pending } = useFormStatus();
  return (
    <Button {...rest} type="submit" pending={pending}>
      {pending ? (pendingLabel ?? children) : children}
    </Button>
  );
}
