'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cx } from './cx';

export type NavItem = { href: string; label: string };

type Props = {
  items: NavItem[];
  listClassName?: string;
  linkClassName?: string;
  currentClassName?: string;
  /** Force which item is current (an href from `items`) instead of working it out from the URL. */
  current?: string;
};

/** The item whose href is the longest match for the path: `/team/abc` selects "/team", `/` only matches exactly. */
export function currentHref(items: NavItem[], pathname: string): string | undefined {
  let best: string | undefined;
  for (const { href } of items) {
    const matches = href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);
    if (matches && (!best || href.length > best.length)) best = href;
  }
  return best;
}

/** A list of links that marks the current one with aria-current="page". Used by AppShell and SubNav. */
export function NavLinks({ items, listClassName, linkClassName, currentClassName, current }: Props) {
  const pathname = usePathname();
  const active = current ?? currentHref(items, pathname);
  return (
    <ul className={listClassName}>
      {items.map(item => {
        const isCurrent = item.href === active;
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              className={cx(linkClassName, isCurrent && currentClassName)}
              aria-current={isCurrent ? 'page' : undefined}
            >
              {item.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
