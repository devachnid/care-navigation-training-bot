import styles from './SkipLink.module.css';

/** First thing on the page: lets keyboard users jump past the header to `#main`. Used by both shells. */
export function SkipLink() {
  return (
    <a href="#main" className={styles.skip}>
      Skip to main content
    </a>
  );
}
