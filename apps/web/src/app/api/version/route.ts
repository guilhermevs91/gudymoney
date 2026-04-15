import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export function GET() {
  // In production Docker (standalone), package.json is not present.
  // Version is injected as APP_VERSION env var at build time.
  let version = process.env.APP_VERSION;

  if (!version) {
    try {
      const { readFileSync } = require('fs');
      const { join } = require('path');
      const pkg = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf-8'));
      version = pkg.version as string;
    } catch {
      version = '—';
    }
  }

  return NextResponse.json({ version });
}
