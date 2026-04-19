import { NextResponse } from 'next/server';
import nodeFetch from 'node-fetch';

const TIMEOUT = 20000;
const userAgents = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
];

function getRandomUserAgent() {
    return userAgents[0];
}

async function fetchWithProxy(url: string, options: any = {}): Promise<any> {
    const headers = {
        'User-Agent': getRandomUserAgent(),
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        ...options.headers
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT);
    
    try {
        const res = await nodeFetch(url, {
            ...options,
            headers,
            signal: controller.signal
        });
        
        if (!res.ok) {
            clearTimeout(timeoutId);
            throw new Error(`Status ${res.status}`);
        }

        const originalText = res.text.bind(res);
        res.text = async () => {
            try {
                return await originalText();
            } finally {
                clearTimeout(timeoutId);
            }
        };
        
        return res;
    } catch (error) {
        clearTimeout(timeoutId);
        throw error;
    }
}

export async function GET(req: Request) {
    try {
        const url = new URL(req.url).searchParams.get('url');
        if (!url) return NextResponse.json({ error: 'No url' });

        const r1 = await fetchWithProxy(url);
        const html = await r1.text();
        
        // Fushaar.com support
        if (url.includes('fushaar.com')) {
            const fushaarRegex = /(?:href|src)=["'](https?:\/\/[^"']+\.mp4[^"']*)["']/gi;
            let fushaarMatch;
            let bestLink = null;
            let highestRes = 0;
            
            while ((fushaarMatch = fushaarRegex.exec(html)) !== null) {
                const link = fushaarMatch[1];
                const resMatch = link.match(/-(\d+)p\.mp4/i);
                if (resMatch) {
                    const res = parseInt(resMatch[1]);
                    if (res > highestRes && highestRes !== 9999) {
                        highestRes = res;
                        bestLink = link;
                    }
                } else {
                    highestRes = 9999;
                    bestLink = link;
                }
            }
            return NextResponse.json({ bestLink });
        }

        let goLinks: string[] = [];
        const goRegex = /https?:\/\/go\.ak\.sv\/link\/\d+/gi;
        const matches = html.match(goRegex);
        if (matches) {
            goLinks.push(...matches);
        }

        goLinks = [...new Set(goLinks.filter(Boolean))];
        return NextResponse.json({ goLinks, htmlLength: html.length });
    } catch (e: any) {
        return NextResponse.json({ error: e.message });
    }
}
