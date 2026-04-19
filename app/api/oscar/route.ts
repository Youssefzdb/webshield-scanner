import { NextResponse } from 'next/server';

const BASE_URL = "https://admin.dramaramadan.net/api";

export async function GET(req: Request) {
    const { searchParams } = new URL(req.url);
    const action = searchParams.get('action'); // 'seasons', 'episodes', 'watch_links'
    const id = searchParams.get('id');

    if (!action || !id) {
        return NextResponse.json({ error: 'Missing action or id' }, { status: 400 });
    }

    let url = '';
    if (action === 'seasons') {
        url = `${BASE_URL}/seasons/?series_id=${id}`;
    } else if (action === 'episodes') {
        url = `${BASE_URL}/episodes/?season_id=${id}`;
    } else if (action === 'watch_links') {
        url = `${BASE_URL}/watch_links/?episode_id=${id}`;
    } else {
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);

        const response = await fetch(url, {
            headers: {
                'User-Agent': 'OscarTV/1.0.9 (Android; 13)',
                'Accept': 'application/json',
            },
            signal: controller.signal,
            cache: 'no-store'
        });
        
        clearTimeout(timeoutId);

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        return NextResponse.json(data);
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
