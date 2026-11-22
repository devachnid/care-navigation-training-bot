import Link from 'next/link';
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode, Ref } from 'react';
import { cx } from './cx';
import styles from './Button.module.css';

export type ButtonVariant = 'primary' | 'secondary' | 'go' | 'danger' | 'link';
export type ButtonSize = 'default' | 'large';

type Shared = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Not usable. For a link this renders an inert element announced as disabled. */
  disabled?: boolean;
  /** Work in progress: the button is disabled and marked busy. Change the label too. */
  pending?: boolean;
  className?: string;
  children: ReactNode;
};

export type ButtonProps = Shared & { href?: undefined; ref?: Ref<HTMLButtonElement> } & Omit<
    ButtonHTMLAttributes<HTMLButtonElement>,
    keyof Shared
  >;
export type ButtonLinkProps = Shared & { href: string } & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, keyof Shared | 'href'>;

export function Button(props: ButtonProps | ButtonLinkProps) {
  const { variant = 'primary', size = 'default', disabled, pending, className, children } = props;
  const off = Boolean(disabled || pending);
  const classes = cx(styles.button, styles[variant], size === 'large' && styles.large, off && styles.disabled, className);

  if (props.href !== undefined) {
    /* eslint-disable @typescript-eslint/no-unused-vars */
    const { variant: _v, size: _s, disabled: _d, pending: _p, className: _c, children: _ch, href, ...rest } = props;
    /* eslint-enable @typescript-eslint/no-unused-vars */
    if (off) {
      return (
        <a role="link" aria-disabled="true" className={classes}>
          {children}
        </a>
      );
    }
    return (
      <Link href={href} className={classes} {...rest}>
        {children}
      </Link>
    );
  }

  /* eslint-disable @typescript-eslint/no-unused-vars */
  const { variant: _v, size: _s, disabled: _d, pending: _p, className: _c, children: _ch, href: _h, type = 'button', ...rest } = props;
  /* eslint-enable @typescript-eslint/no-unused-vars */
  return (
    <button type={type} className={classes} disabled={off} aria-busy={pending || undefined} {...rest}>
      {children}
    </button>
  );
}
