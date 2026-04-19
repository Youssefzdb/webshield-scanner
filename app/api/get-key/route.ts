import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function OPTIONS() {
    return new NextResponse(null, {
        status: 200,
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, x-api-key, Authorization',
        },
    });
}

export async function GET() {
    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, x-api-key, Authorization',
    };

    // In a real app, you might want to authenticate the user before giving them the key.
    // For this personal tool, we just return the key from the environment.
    const apiKey = process.env.API_SECRET_KEY || 'ak-secret-key-2026';
    return NextResponse.json({ apiKey }, { headers: corsHeaders });
}
