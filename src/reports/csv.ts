export type CsvCell = string | number | null;

const BOM = '\uFEFF';
const FORMULA_START = /^[=+\-@\t\r]/;

/**
 * One cell as text. A string that a spreadsheet could read as a formula (it starts with `=`, `+`,
 * `-`, `@`, a tab or a carriage return) gets a leading apostrophe so it stays plain text. Numbers
 * passed as numbers are left alone, so a negative number is still a number. Then it is quoted if
 * it contains a comma, a quote or a line break.
 */
function cell(value: CsvCell): string {
  let text: string;
  if (value === null) text = '';
  else if (typeof value === 'number') text = Number.isFinite(value) ? String(value) : '';
  else text = FORMULA_START.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/**
 * Spreadsheet-ready CSV: a UTF-8 byte order mark (so Excel reads accents), CRLF line endings
 * (one after every row, the last included), correct quoting, and protection against formula injection.
 */
export function toCsv(header: string[], rows: CsvCell[][]): string {
  const lines = [header, ...rows].map(r => r.map(cell).join(','));
  return `${BOM}${lines.join('\r\n')}\r\n`;
}
