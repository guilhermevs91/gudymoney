// =============================================================================
// Bradesco Invoice Parser
// Handles the multi-card CSV format exported from Bradesco online banking.
//
// Format overview:
//   Data: DD/MM/YYYY HH:MM:SS
//   Situação da Fatura: STATUS
//
//   CARDHOLDER NAME ;;; LAST4
//   Data;Histórico;Valor(US$);Valor(R$);
//   DD/MM;DESCRIPTION;USD_AMOUNT;BRL_AMOUNT
//   ...
//   (multiple card sections follow)
//
//   Total da fatura em Real: ;;;TOTAL
//   (summary and tax sections — ignored)
// =============================================================================

export interface BradescoTransaction {
  date: Date;
  description: string;
  amount_brl: number;
  installment_index: number | null;
  installment_total: number | null;
}

export interface BradescoCardSection {
  holder_name: string;
  last_four: string;
  transactions: BradescoTransaction[];
}

export interface BradescoInvoice {
  statement_date: Date;
  cards: BradescoCardSection[];
}

// ---------------------------------------------------------------------------
// Lines that represent payments / carry-forward — not real expenses
// ---------------------------------------------------------------------------

const SKIP_PATTERNS = [
  /^PAGTO[\.\s]/i,       // payment by debit
  /^SALDO ANTERIOR/i,    // previous balance carry-forward
  /^PAGAMENTO/i,
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Given a transaction month (1-based) and the statement reference date,
 * resolve the correct year. Transactions whose month is after the statement
 * month belong to the previous year.
 */
function resolveYear(txMonth: number, statementDate: Date): number {
  const stmtMonth = statementDate.getUTCMonth() + 1; // 1-based
  const stmtYear = statementDate.getUTCFullYear();
  return txMonth <= stmtMonth ? stmtYear : stmtYear - 1;
}

/**
 * Detect installment notation "DESCRIPTION X/Y" at the end of a description.
 * Returns the clean description and installment numbers.
 */
function parseInstallment(desc: string): {
  clean: string;
  installment_index: number | null;
  installment_total: number | null;
} {
  const match = /\s+(\d+)\/(\d+)\s*$/.exec(desc);
  if (match === null) {
    return { clean: desc.trim(), installment_index: null, installment_total: null };
  }
  return {
    clean: desc.slice(0, match.index).trim(),
    installment_index: parseInt(match[1], 10),
    installment_total: parseInt(match[2], 10),
  };
}

/**
 * Parse Brazilian-format currency string ("1.500,50") to a number.
 */
function parseBRLAmount(raw: string): number | null {
  const s = raw.trim().replace(/\./g, '').replace(',', '.');
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

// ---------------------------------------------------------------------------
// Public parser
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Encoding helper — Bradesco exports are often ISO-8859-1
// ---------------------------------------------------------------------------

/**
 * Decode buffer trying UTF-8 first; if the result looks garbled (has
 * replacement chars where Latin1 would have accented letters), fall back
 * to latin1 so "Histórico" / "Situação" are preserved.
 */
export function decodeInvoiceBuffer(buf: Buffer): string {
  const utf8 = buf.toString('utf-8');
  // A UTF-8 BOM is OK; replacement char U+FFFD signals bad UTF-8 bytes
  if (utf8.includes('\uFFFD')) {
    return buf.toString('latin1');
  }
  // Remove UTF-8 BOM if present
  return utf8.replace(/^\uFEFF/, '');
}

export function parseBradescoInvoice(content: string): BradescoInvoice {
  // Normalise line endings and strip BOM / non-printable junk
  const lines = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');

  // Default statement date to today if header is not found
  let statementDate: Date = new Date(
    Date.UTC(
      new Date().getUTCFullYear(),
      new Date().getUTCMonth(),
      new Date().getUTCDate(),
    ),
  );

  const cards: BradescoCardSection[] = [];
  let currentCard: BradescoCardSection | null = null;
  let inTransactions = false;

  for (const rawLine of lines) {
    // Strip BOM-like chars, non-break spaces, and surrounding whitespace
    const line = rawLine.replace(/[\uFEFF\u00A0]/g, ' ').trim();
    if (line.length === 0) continue;

    // ── Statement date ──────────────────────────────────────────────────────
    const dateMatch = /Data:\s*(\d{2})\/(\d{2})\/(\d{4})/.exec(line);
    if (dateMatch !== null) {
      statementDate = new Date(
        Date.UTC(
          parseInt(dateMatch[3], 10),
          parseInt(dateMatch[2], 10) - 1,
          parseInt(dateMatch[1], 10),
        ),
      );
      continue;
    }

    // ── Stop at summary/tax section ─────────────────────────────────────────
    if (/^(Total da fatura|Resumo das Despesas|Taxas[;:])/i.test(line)) {
      break;
    }

    // ── Card section header ─────────────────────────────────────────────────
    // Formats observed:
    //   "GUILHERME VIEIRA ;;; 1621"     (spaces around ;;;)
    //   "GUILHERME VIEIRA;;;1621"       (no spaces)
    //   "GUILHERME VIEIRA ; ; ; 1621"   (spaces between each ;)
    // The last column (4th) is the last-four digits.
    // Strategy: split by ; and check if the last non-empty field is 4 digits.
    const headerParts = line.split(';').map((p) => p.trim());
    if (headerParts.length >= 2) {
      const lastNonEmpty = [...headerParts].reverse().find((p) => p.length > 0) ?? '';
      const firstNonEmpty = headerParts[0] ?? '';
      if (
        /^\d{4}$/.test(lastNonEmpty) &&
        lastNonEmpty !== firstNonEmpty &&
        firstNonEmpty.length > 0 &&
        // Must not look like a transaction date
        !/^\d{2}\/\d{2}$/.test(firstNonEmpty)
      ) {
        currentCard = {
          holder_name: firstNonEmpty,
          last_four: lastNonEmpty,
          transactions: [],
        };
        cards.push(currentCard);
        inTransactions = false;
        continue;
      }
    }

    // ── Column header row ───────────────────────────────────────────────────
    // "Data;Histórico;Valor(US$);Valor(R$);"  — may be garbled in Latin1 read
    if (/^Data[;,]/.test(line) && /Valor/i.test(line)) {
      inTransactions = true;
      continue;
    }

    if (!inTransactions || currentCard === null) continue;

    // ── Transaction row: DD/MM;DESCRIPTION;USD;BRL ──────────────────────────
    const parts = line.split(';');
    if (parts.length < 4) continue;

    const rawDate = (parts[0] ?? '').trim();
    const rawDesc = (parts[1] ?? '').trim();
    const rawBrl = (parts[3] ?? '').trim();

    // Skip known non-expense lines
    if (SKIP_PATTERNS.some((p) => p.test(rawDesc))) continue;

    // Parse DD/MM
    const dmMatch = /^(\d{2})\/(\d{2})$/.exec(rawDate);
    if (dmMatch === null) continue;

    const day = parseInt(dmMatch[1], 10);
    const month = parseInt(dmMatch[2], 10);
    const year = resolveYear(month, statementDate);
    const date = new Date(Date.UTC(year, month - 1, day));

    // Parse BRL amount — skip payments (negative) and zero
    const amount = parseBRLAmount(rawBrl);
    if (amount === null || amount <= 0) continue;

    const {
      clean: description,
      installment_index,
      installment_total,
    } = parseInstallment(rawDesc);

    currentCard.transactions.push({
      date,
      description,
      amount_brl: amount,
      installment_index,
      installment_total,
    });
  }

  return { statement_date: statementDate, cards };
}
