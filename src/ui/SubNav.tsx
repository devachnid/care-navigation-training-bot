import { NavLinks } from './NavLinks';
import type { NavItem } from './NavLinks';
import styles from './SubNav.module.css';

export type SubNavProps = {
  /** Names the navigation landmark, for example "Team sections". */
  label: string;
  items: NavItem[];
  /** The href of the current item. Leave out to work it out from the URL. */
  current?: string;
};

/** Link-based tabs for the sections of one area (for example Reports: Overview, People, Scenarios). Not ARIA tabs: each one is a page. */
export function SubNav({ label, items, current }: SubNavProps) {
  return (
    <nav aria-label={label} className={styles.nav}>
      <NavLinks
        items={items}
        current={current}
        listClassName={styles.list}
        linkClassName={styles.link}
        currentClassName={styles.current}
      />
    </nav>
  );
}
