import { NextResponse } from 'next/server';
import { getAuthorizationServerMetadata } from '@/lib/oauth/config';

export async function GET() {
  return NextResponse.json(getAuthorizationServerMetadata(), {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
