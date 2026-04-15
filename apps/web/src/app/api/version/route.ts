import { NextResponse } from 'next/server';
import { readFileSync } from 'fs';
import { join } from 'path';

export const dynamic = 'force-dynamic';

export function GET() {
  // In production Docker (standalone), package.json is not present.
  // Version is injected as APP_VERSION env var at build time.
  const version = process.env.APP_VERSION ?? (() => {
    try {
      const pkg = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf-8'));
      return pkg.version as string;
    } catch {
      return '—';
    }
  })();

  return NextResponse.json({ version });
}
