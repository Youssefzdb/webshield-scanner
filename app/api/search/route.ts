import { NextResponse } from 'next/server';
import nodeFetch from 'node-fetch';
import * as cheerio from 'cheerio';

export const dynamic = 'force-dynamic';

const BASE_URL = "https://ak.sv";
const TIMEOUT = 20000;

const userAgents = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:123.0) Gecko/20100101 Firefox/123.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:123.0) Gecko/20100101 Firefox/123.0',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Edge/122.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
];

function getRandomUserAgent() {
    return userAgents[Math.floor(Math.random() * userAgents.length)];
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

export async function POST(req: Request) {
    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, x-api-key, Authorization',
    };

    let query = '';
    try {
        const body = await req.json();
        query = body.q || body.query || '';
    } catch (e) {
        // Fallback to search params if JSON parsing fails
        const { searchParams } = new URL(req.url);
        query = searchParams.get('q') || searchParams.get('query') || '';
    }
    
    let apiKey = req.headers.get('x-api-key');
    
    // Check Authorization header
    const authHeader = req.headers.get('authorization');
    if (!apiKey && authHeader && authHeader.startsWith('Bearer ')) {
        apiKey = authHeader.substring(7);
    }

    const validApiKey = process.env.API_SECRET_KEY || 'ak-secret-key-2026';
    
    if (apiKey !== validApiKey) {
        return NextResponse.json({ error: 'Unauthorized. Invalid API Key.' }, { status: 401, headers: corsHeaders });
    }

    if (!query) {
        return NextResponse.json({ error: 'Query parameter "q" or "query" is required in body' }, { status: 400, headers: corsHeaders });
    }

    return performSearch(query, corsHeaders);
}

export async function GET(req: Request) {
    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, x-api-key, Authorization',
    };

    const { searchParams } = new URL(req.url);
    const query = searchParams.get('q');
    
    let apiKey = req.headers.get('x-api-key') || searchParams.get('apiKey') || searchParams.get('apikey') || searchParams.get('api_key');
    
    // Check Authorization header
    const authHeader = req.headers.get('authorization');
    if (!apiKey && authHeader && authHeader.startsWith('Bearer ')) {
        apiKey = authHeader.substring(7);
    }

    const validApiKey = process.env.API_SECRET_KEY || 'ak-secret-key-2026';
    
    if (apiKey !== validApiKey) {
        return NextResponse.json({ error: 'Unauthorized. Invalid API Key.' }, { status: 401, headers: corsHeaders });
    }

    if (!query) {
        return NextResponse.json({ error: 'Query parameter "q" is required' }, { status: 400, headers: corsHeaders });
    }

    return performSearch(query, corsHeaders);
}

async function performSearch(query: string, corsHeaders: any) {
    console.log(`\n[API Request] GET/POST /api/search - Query: "${query}"`);
    try {
        // Search the site
        const searchUrl = `${BASE_URL}/search?q=${encodeURIComponent(query)}`;
        const searchRes = await fetchWithProxy(searchUrl);
        const searchHtml = await searchRes.text();

        const $ = cheerio.load(searchHtml);
        const results: any[] = [];

        // Try to find articles or items in the search results
        $('a[href^="https://ak.sv/movie/"], a[href^="https://ak.sv/series/"]').each((i, el) => {
            const link = $(el).attr('href');
            // Find an image inside or nearby
            const img = $(el).find('img').first();
            let image = img.attr('src') || img.attr('data-src') || img.attr('data-lazy-src') || '';
            
            // Sometimes the title is in the alt attribute of the image, or in a heading inside the link
            let title = $(el).attr('title') || img.attr('alt') || $(el).text().trim();
            
            // If the link doesn't wrap the image, maybe it's a sibling or parent structure
            if (!image) {
                const parent = $(el).closest('article, .item, .post, .box, .widget');
                const parentImg = parent.find('img').first();
                image = parentImg.attr('src') || parentImg.attr('data-src') || parentImg.attr('data-lazy-src') || '';
                if (!title) {
                    title = parent.find('h2, h3, .title').text().trim();
                }
            }

            if (link && title && !results.some(r => r.url === link)) {
                // Clean up title
                title = title.replace(/\s+/g, ' ').trim();
                results.push({
                    title,
                    image,
                    url: link,
                    type: link.includes('/series/') ? 'series' : 'movie'
                });
            }
        });

        const responseData = {
            success: true,
            query,
            results
        };
        console.log(`[API Response] /api/search - 200 OK - Found ${results.length} results`);
        return NextResponse.json(responseData, { headers: corsHeaders });

    } catch (error: any) {
        console.error(`[API Response] /api/search - 500 Error:`, error.message);
        return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500, headers: corsHeaders });
    }
}
