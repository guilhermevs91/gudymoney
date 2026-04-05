// =============================================================================
// CSV Parser — configurable column mapping with Brazilian bank presets
// =============================================================================

import type { ParsedTransaction } from './ofx.parser';

export type { ParsedTransaction };

// ---------------------------------------------------------------------------
// Bank presets — map logical column roles to actual header names
// ---------------------------------------------------------------------------

const PRESETS: Record<
  string,
  { date: string; amount: string; description: string }
> = {
  nubank: { date: 'date', amount: 'amount', description: 'title' },
  itau: { date: 'Data', amount: 'Valor', description: 'Histórico' },
  bradesco: { date: 'Data', amount: 'Valor', description: 'Descrição' },
  santander: { date: 'Data', amount: 'Valor', description: 'Descrição' },
  bb: { date: 'Data', amount: 'Valor', description: 'Histórico' },
};

/**
 * Return the column name mapping for a known bank preset, or null if unknown.
 */
export function getPresetMapping(
  preset: string,
): { date: string; amount: string; description: string } | null {
  return PRESETS[preset] ?? null;
}

// ---------------------------------------------------------------------------
// Date parsers — try multiple formats
// ---------------------------------------------------------------------------

function parseDateString(raw: string): Date | null {
  const s = raw.trim();
  if (s.length === 0) return null;

  // DD/MM/YYYY
  const dmyMatch = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s);
  if (dmyMatch !== null) {
    const [, d, m, y] = dmyMatch;
    return new Date(
      Date.UTC(parseInt(y, 10), parseInt(m, 10) - 1, parseInt(d, 10)),
    );
  }

  // YYYY-MM-DD
  const ymdMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (ymdMatch !== null) {
    const [, y, m, d] = ymdMatch;
    return new Date(
      Date.UTC(parseInt(y, 10), parseInt(m, 10) - 1, parseInt(d, 10)),
    );
  }

  // MM/DD/YYYY
  const mdyMatch = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s);
  if (mdyMatch !== null) {
    const [, m, d, y] = mdyMatch;
    const month = parseInt(m, 10);
    const day = parseInt(d, 10);
    // Disambiguate: if month > 12 it must be day-first (already handled above)
    if (month <= 12) {
      return new Date(Date.UTC(parseInt(y, 10), month - 1, day));
    }
  }

  // ISO 8601 fallback
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

// ---------------------------------------------------------------------------
// Amount parsers — handle Brazilian "1.500,50" and US "1500.50" formats
// ---------------------------------------------------------------------------

function parseAmount(raw: string): number | null {
  let s = raw.trim();
  if (s.length === 0) return null;

  // Strip currency symbols and whitespace
  s = s.replace(/[R$\s]/g, '');

  // Negative via parentheses: (1.500,50) or (1500.50)
  const isNegative = s.startsWith('(') && s.endsWith(')');
  if (isNegative) {
    s = s.slice(1, -1);
  }

  // Detect Brazilian format: "1.500,50" — dot as thousands, comma as decimal
  if (/^\d{1,3}(\.\d{3})*(,\d{2})?$/.test(s)) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (/^\d+(,\d{2})?$/.test(s) && s.includes(',')) {
    // Simple "1500,50"
    s = s.replace(',', '.');
  }
  // else treat as plain number "1500.50"

  const value = parseFloat(s);
  if (isNaN(value)) return null;
  return isNegative ? -value : value;
}

// ---------------------------------------------------------------------------
// Simple CSV line splitter respecting quoted fields
// ---------------------------------------------------------------------------

function splitCSVLine(line: string, delimiter = ','): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === delimiter && !inQuotes) {
      fields.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current.trim());
  return fields;
}

// Detect delimiter by sampling the header line
function detectDelimiter(header: string): string {
  const candidates = [',', ';', '\t', '|'];
  let best = ',';
  let bestCount = 0;
  for (const d of candidates) {
    const count = (header.split(d).length - 1);
    if (count > bestCount) {
      bestCount = count;
      best = d;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse CSV content using the provided column mapping.
 * The mapping specifies the exact header names for date, amount, description.
 */
export function parseCSV(
  content: string,
  mapping: { date: string; amount: string; description: string },
): ParsedTransaction[] {
  const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];

  const delimiter = detectDelimiter(lines[0]);
  const headers = splitCSVLine(lines[0], delimiter).map((h) =>
    h.replace(/^"|"$/g, '').trim(),
  );

  const dateIdx = headers.indexOf(mapping.date);
  const amountIdx = headers.indexOf(mapping.amount);
  const descIdx = headers.indexOf(mapping.description);

  if (dateIdx === -1 || amountIdx === -1 || descIdx === -1) {
    throw new Error(
      `CSV columns not found. Expected: "${mapping.date}", "${mapping.amount}", "${mapping.description}". ` +
        `Found headers: ${headers.join(', ')}`,
    );
  }

  const results: ParsedTransaction[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim().length === 0) continue;

    const fields = splitCSVLine(line, delimiter).map((f) =>
      f.replace(/^"|"$/g, '').trim(),
    );

    const rawDate = fields[dateIdx] ?? '';
    const rawAmount = fields[amountIdx] ?? '';
    const rawDesc = fields[descIdx] ?? '';

    if (rawDate.length === 0 && rawAmount.length === 0) continue;

    const date = parseDateString(rawDate);
    const amount = parseAmount(rawAmount);

    if (date === null || amount === null) continue;

    results.push({
      date,
      amount,
      description: rawDesc,
    });
  }

  return results;
}
