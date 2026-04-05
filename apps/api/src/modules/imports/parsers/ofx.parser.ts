// =============================================================================
// OFX Parser — handles both SGML (legacy) and XML OFX formats
// =============================================================================

export interface ParsedTransaction {
  date: Date;
  amount: number; // positive = credit, negative = debit
  description: string;
  external_id?: string; // FITID from OFX
}

// ---------------------------------------------------------------------------
// OFX date parser: YYYYMMDD[HHMMSS[.mmm][+/-TZ]] → Date
// ---------------------------------------------------------------------------
function parseOFXDate(raw: string): Date {
  const cleaned = raw.trim();
  // Extract the date and optional time portion — stop at [ or end
  const base = cleaned.split('[')[0].replace(/\s/g, '');
  const year = parseInt(base.slice(0, 4), 10);
  const month = parseInt(base.slice(4, 6), 10) - 1; // 0-based
  const day = parseInt(base.slice(6, 8), 10);
  const hour = base.length >= 10 ? parseInt(base.slice(8, 10), 10) : 0;
  const minute = base.length >= 12 ? parseInt(base.slice(10, 12), 10) : 0;
  const second = base.length >= 14 ? parseInt(base.slice(12, 14), 10) : 0;
  return new Date(Date.UTC(year, month, day, hour, minute, second));
}

// ---------------------------------------------------------------------------
// SGML parser — regex-based extraction of <STMTTRN> blocks
// ---------------------------------------------------------------------------
function parseSGML(content: string): ParsedTransaction[] {
  const results: ParsedTransaction[] = [];

  // Find all <STMTTRN>...</STMTTRN> blocks (SGML uses implicit closing or </STMTTRN>)
  // Support both cases: explicit </STMTTRN> and implicit (next opening tag)
  const blockPattern =
    /<STMTTRN>([\s\S]*?)(?:<\/STMTTRN>|(?=<STMTTRN>)|$)/gi;
  let match: RegExpExecArray | null;

  while ((match = blockPattern.exec(content)) !== null) {
    const block = match[1];

    const dateMatch = /<DTPOSTED>\s*([^\s<]+)/i.exec(block);
    const amtMatch = /<TRNAMT>\s*([^\s<]+)/i.exec(block);
    const memoMatch = /<MEMO>\s*([^\r\n<]+)/i.exec(block);
    const nameMatch = /<NAME>\s*([^\r\n<]+)/i.exec(block);
    const fitidMatch = /<FITID>\s*([^\s<]+)/i.exec(block);

    if (dateMatch === null || amtMatch === null) continue;

    const description = (memoMatch ?? nameMatch)?.[1]?.trim() ?? '';
    const amount = parseFloat(amtMatch[1].trim().replace(',', '.'));

    if (isNaN(amount)) continue;

    results.push({
      date: parseOFXDate(dateMatch[1]),
      amount,
      description,
      external_id: fitidMatch?.[1]?.trim(),
    });
  }

  return results;
}

// ---------------------------------------------------------------------------
// XML OFX parser — simple string-based element extraction
// ---------------------------------------------------------------------------
function getTagValue(xml: string, tag: string): string | null {
  const re = new RegExp(`<${tag}[^>]*>([^<]*)<\\/${tag}>`, 'i');
  const m = re.exec(xml);
  return m ? m[1].trim() : null;
}

function getAllTagBlocks(xml: string, tag: string): string[] {
  const blocks: string[] = [];
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'gi');
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    blocks.push(m[1]);
  }
  return blocks;
}

function parseXML(content: string): ParsedTransaction[] {
  const results: ParsedTransaction[] = [];
  const stmtTrnBlocks = getAllTagBlocks(content, 'STMTTRN');

  for (const block of stmtTrnBlocks) {
    const dateStr = getTagValue(block, 'DTPOSTED');
    const amtStr = getTagValue(block, 'TRNAMT');
    const memo = getTagValue(block, 'MEMO');
    const name = getTagValue(block, 'NAME');
    const fitid = getTagValue(block, 'FITID');

    if (dateStr === null || amtStr === null) continue;

    const amount = parseFloat(amtStr.replace(',', '.'));
    if (isNaN(amount)) continue;

    const description = memo ?? name ?? '';

    results.push({
      date: parseOFXDate(dateStr),
      amount,
      description,
      external_id: fitid ?? undefined,
    });
  }

  return results;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse OFX content (SGML or XML) and return normalized transactions.
 */
export function parseOFX(content: string): ParsedTransaction[] {
  const trimmed = content.trimStart();
  // XML OFX starts with an XML declaration or <OFX> with XML namespace
  if (trimmed.startsWith('<?xml') || /^<\?XML/i.test(trimmed)) {
    return parseXML(content);
  }
  // SGML OFX — legacy format
  return parseSGML(content);
}
