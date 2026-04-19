import { NextResponse } from 'next/server';
import nodeFetch from 'node-fetch';

export async function GET(req: Request) {
    try {
        const url = new URL(req.url).searchParams.get('url');
        if (!url) return NextResponse.json({ error: 'No url' });

        const r1 = await nodeFetch(url);
        const html = await r1.text();
        
        return new NextResponse(html, { headers: { 'Content-Type': 'text/html' } });
    } catch (e: any) {
        return NextResponse.json({ error: e.message });
    }
}
