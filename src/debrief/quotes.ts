import type { QuotedPoint } from './rubric';

const normalise = (s: string) =>
  s
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”"]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

/** Keeps only the points whose quote really appears in the transcript, so feedback can never cite words nobody said. */
export function keepVerifiedQuotes(points: QuotedPoint[], transcriptLines: string[]): QuotedPoint[] {
  const lines = transcriptLines.map(normalise);
  return points.filter(p => {
    const q = normalise(p.quote).replace(/[.…]+$/, '');
    return q.length > 0 && lines.some(line => line.includes(q));
  });
}
