import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@hour-tracker/database';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const deep = req.nextUrl.searchParams.get('check') === 'db';

  if (!deep) {
    return NextResponse.json({ status: 'ok' });
  }

  try {
    const pool = getPool();
    await pool.query('SELECT 1');
    return NextResponse.json({ status: 'ok', db: 'connected' });
  } catch (err) {
    console.error('[health] Database check failed:', err);
    return NextResponse.json(
      { status: 'error', message: 'Database unreachable' },
      { status: 503 },
    );
  }
}
