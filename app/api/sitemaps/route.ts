import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const TIMEOUT = 15000;

async function fetchSitemap(url: string) {
    try {
        const res = await fetch(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
            signal: AbortSignal.timeout(TIMEOUT)
        });
        if (res.ok) {
            const text = await res.text();
            const matches = text.match(/<loc>(https?:\/\/[^<]+)<\/loc>/g);
            if (matches) {
                return matches.map(m => m.replace(/<\/?loc>/g, ''));
            }
        }
    } catch (e) {
        console.error(`Error fetching sitemap ${url}:`, e);
    }
    return [];
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

    try {
        const { sitemaps } = await req.json();
        if (!Array.isArray(sitemaps)) {
            return NextResponse.json({ error: 'Invalid input' }, { status: 400, headers: corsHeaders });
        }

        const allLinks = { movies: [] as string[], series: [] as string[], episodes: [] as string[] };
        
        const sitemapUrls = sitemaps.filter(url => url.includes('.xml') || url.includes('sitemap'));
        const directUrls = sitemaps.filter(url => !url.includes('.xml') && !url.includes('sitemap'));

        // Handle direct URLs and IDs
        for (const input of directUrls) {
            let url = input;
            if (/^\d+$/.test(input)) {
                url = `https://ak.sv/episode/${input}/`;
            }
            
            if (url.includes('/movie/')) allLinks.movies.push(url);
            else if (url.includes('/series/') || url.includes('/show/')) allLinks.series.push(url);
            else if (url.includes('/episode/') || url.match(/-(?:episode|ep|الحلقة)-?\d+/i) || url.match(/%d8%a7%d9%84%d8%ad%d9%84%d9%82%d8%a9/i)) allLinks.episodes.push(url);
        }

        const results = await Promise.all(sitemapUrls.map(url => fetchSitemap(url).then(links => ({ url, links }))));
        
        for (const { url, links } of results) {
            const isFushaar = url.includes('fushaar.com');
            const isMoviesSitemap = url.includes('movies');
            const isEpisodesSitemap = url.includes('episodes');
            const isSeriesSitemap = url.includes('series') || (url.includes('shows') && !isEpisodesSitemap);

            for (const link of links) {
                if (isFushaar) {
                    if (link.includes('/movie/')) allLinks.movies.push(link);
                    else if (link.includes('/series/') || link.includes('/show/')) allLinks.series.push(link);
                    else if (link.includes('/episode/')) allLinks.episodes.push(link);
                } else {
                    if (isMoviesSitemap) allLinks.movies.push(link);
                    else if (isSeriesSitemap) allLinks.series.push(link);
                    else if (isEpisodesSitemap) allLinks.episodes.push(link);
                    else {
                        if (link.includes('/movie/')) allLinks.movies.push(link);
                        else if (link.includes('/series/')) allLinks.series.push(link);
                        else if (link.includes('/episode/') || link.match(/-(?:episode|ep|الحلقة)-?\d+/i) || link.match(/%d8%a7%d9%84%d8%ad%d9%84%d9%82%d8%a9/i)) allLinks.episodes.push(link);
                    }
                }
            }
        }
        
        // Deduplicate episodes by ID
        const epMap = new Map<string, string>();
        for (const l of allLinks.episodes) {
            const idMatch = l.match(/\/episode\/(\d+)/i);
            const id = idMatch ? idMatch[1] : l;
            if (!epMap.has(id) || l.length > epMap.get(id)!.length) {
                epMap.set(id, l);
            }
        }
        allLinks.episodes = Array.from(epMap.values());

        // Deduplicate movies and series
        allLinks.movies = [...new Set(allLinks.movies)];
        allLinks.series = [...new Set(allLinks.series)];

        return NextResponse.json(allLinks, { headers: corsHeaders });
    } catch (error) {
        return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders });
    }
}
