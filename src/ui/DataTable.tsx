import { useId } from 'react';
import type { ReactNode } from 'react';
import { cx } from './cx';
import styles from './DataTable.module.css';

export type DataTableColumn<Row> = {
  /** Unique within the table. Also the row property shown when `cell` is not given. */
  key: string;
  /** Column heading text. */
  header: ReactNode;
  /** Renders the cell. Defaults to `String(row[key])`. */
  cell?: (row: Row) => ReactNode;
  /** Make this column's cells row headers (`<th scope="row">`). Use for the name column, usually the first. */
  rowHeader?: boolean;
  /** Right-align, tabular figures. For counts, scores, durations. */
  numeric?: boolean;
  /** Keep the column from wrapping, for dates and scores. */
  nowrap?: boolean;
};

export type DataTableProps<Row> = {
  /** Names the table. Required: it is read out and also labels the scrolling region. */
  caption: ReactNode;
  /** Show the caption as text above the table. Otherwise it is visually hidden but still read out. */
  showCaption?: boolean;
  columns: DataTableColumn<Row>[];
  rows: Row[];
  /** A stable unique id for each row. */
  rowKey: (row: Row) => string;
  /** Shown when `rows` is empty. Defaults to "Nothing to show yet." */
  empty?: ReactNode;
};

/**
 * A plain, accessible table. Presentational: pass columns and rows. On narrow screens it scrolls
 * sideways inside a focusable, labelled region instead of making the page scroll.
 */
export function DataTable<Row>({ caption, showCaption = false, columns, rows, rowKey, empty = 'Nothing to show yet.' }: DataTableProps<Row>) {
  const captionId = useId();
  return (
    <div role="region" aria-labelledby={captionId} tabIndex={0} className={styles.scroll}>
      <table className={styles.table}>
        <caption id={captionId} className={showCaption ? styles.caption : styles.captionHidden}>
          {caption}
        </caption>
        <thead>
          <tr>
            {columns.map(column => (
              <th key={column.key} scope="col" className={cx(styles.th, column.numeric && styles.numeric)}>
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className={styles.empty}>
                {empty}
              </td>
            </tr>
          ) : (
            rows.map(row => (
              <tr key={rowKey(row)}>
                {columns.map(column => {
                  const content = column.cell ? column.cell(row) : String((row as Record<string, unknown>)[column.key] ?? '');
                  const classes = cx(styles.cell, column.numeric && styles.numeric, column.nowrap && styles.nowrap);
                  return column.rowHeader ? (
                    <th key={column.key} scope="row" className={cx(classes, styles.rowHeader)}>
                      {content}
                    </th>
                  ) : (
                    <td key={column.key} className={classes}>
                      {content}
                    </td>
                  );
                })}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
