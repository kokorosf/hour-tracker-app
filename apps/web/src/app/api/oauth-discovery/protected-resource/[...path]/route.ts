import { NextResponse } from 'next/server';
import { getProtectedResourceMetadata } from '@/lib/oauth/config';

export async function GET() {
  return NextResponse.json(getProtectedResourceMetadata(), {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
