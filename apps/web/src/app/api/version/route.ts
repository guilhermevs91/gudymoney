import { NextResponse } from 'next/server';
import { readFileSync } from 'fs';
import { join } from 'path';

export const dynamic = 'force-dynamic';

export function GET() {
  const pkg = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf-8'));
  return NextResponse.json({ version: pkg.version as string });
}
