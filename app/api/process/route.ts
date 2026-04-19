import { NextResponse } from 'next/server';
import nodeFetch from 'node-fetch';

const BASE_URL = "https://ak.sv";
const TIMEOUT = 20000;
const RETRY_COUNT = 4;

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

function extractName(url: string) {
    let name = url.split('/').filter(Boolean).pop() || '';
    name = decodeURIComponent(name);
    name = name.replace(/[_-]/g, ' ');
    return name.trim();
}

function cleanSeriesName(name: string) {
    return name
        .replace(/(?:season|الموسم|s)[-_ ]?\d+/gi, '')
        .replace(/(?:episode|الحلقة|e|ep)[-_ ]?\d+/gi, '')
        .replace(/مسلسل/g, '')
        .replace(/مترجم(?:ة)?/g, '')
        .replace(/من/g, '')
        .replace(/[-_]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/\b\w/g, l => l.toUpperCase());
}

function parseEpisodeInfo(url: string, directUrl: string = "", pageTitle: string | null = "") {
    let seriesName = "";
    let season = "1";
    let episode = "1";
    let id = "";

    // Extract ID from URL (e.g., https://ak.sv/episode/87/...)
    const idMatch = url.match(/\/episode\/(\d+)/i);
    if (idMatch) {
        id = idMatch[1];
    }

    if (pageTitle) {
        const titleMatch = pageTitle.match(/(.+?)(?:\s*-\s*|\s+)(?:الحلقة|Episode)\s*(\d+)/i);
        if (titleMatch) {
            seriesName = titleMatch[1].replace(/مسلسل/g, '').trim();
            episode = parseInt(titleMatch[2], 10).toString();
            // Try to extract season from title if present
            const seasonMatch = pageTitle.match(/(?:الموسم|Season)\s*(\d+)/i);
            if (seasonMatch) {
                season = parseInt(seasonMatch[1], 10).toString();
                seriesName = seriesName.replace(new RegExp(`(?:الموسم|Season)\\s*${seasonMatch[1]}`, 'i'), '').trim();
            }
            seriesName = seriesName.replace(/[-_]/g, ' ').replace(/\s+/g, ' ').trim();
            return { seriesName, season, episode };
        }
    }

    if (directUrl) {
        let filename = directUrl.split('/').pop() || '';
        filename = decodeURIComponent(filename);
        
        // Pattern 1: S01E05
        const match1 = filename.match(/(.+?)[.\-_]S(\d+)E(\d+)(?:[.\-_]|$)/i);
        if (match1) {
            seriesName = match1[1].replace(/[.\-_]/g, ' ').trim();
            season = parseInt(match1[2], 10).toString();
            episode = parseInt(match1[3], 10).toString();
            seriesName = seriesName.replace(/\b\w/g, l => l.toUpperCase());
            return { seriesName, season, episode };
        }

        // Pattern 2: Season 1 Episode 5
        const match2 = filename.match(/(.+?)[.\-_]Season[.\-_](\d+)[.\-_]Episode[.\-_](\d+)(?:[.\-_]|$)/i);
        if (match2) {
            seriesName = match2[1].replace(/[.\-_]/g, ' ').trim();
            season = parseInt(match2[2], 10).toString();
            episode = parseInt(match2[3], 10).toString();
            seriesName = seriesName.replace(/\b\w/g, l => l.toUpperCase());
            return { seriesName, season, episode };
        }

        // Pattern 3: E05 (no season)
        const match3 = filename.match(/(.+?)[.\-_]E(\d+)(?:[.\-_]|$)/i);
        if (match3 && !match3[1].match(/S\d+$/i)) {
            seriesName = match3[1].replace(/[.\-_]/g, ' ').trim();
            episode = parseInt(match3[2], 10).toString();
            seriesName = seriesName.replace(/\b\w/g, l => l.toUpperCase());
            return { seriesName, season, episode };
        }
        
        // Pattern 4: Episode 5 (no season)
        const match4 = filename.match(/(.+?)[.\-_]Episode[.\-_](\d+)(?:[.\-_]|$)/i);
        if (match4) {
            seriesName = match4[1].replace(/[.\-_]/g, ' ').trim();
            episode = parseInt(match4[2], 10).toString();
            seriesName = seriesName.replace(/\b\w/g, l => l.toUpperCase());
            return { seriesName, season, episode };
        }
    }

    // Fallback to URL slug
    const parts = url.split('/');
    let slug = parts.pop() || '';
    slug = decodeURIComponent(slug);
    
    // Extract Season (e.g. season-1, الموسم-1, s1, s01)
    const seasonMatch = slug.match(/(?:season|الموسم|s)[-_]?(\d+)/i);
    if (seasonMatch) season = parseInt(seasonMatch[1], 10).toString();

    // Extract Episode (e.g. episode-1, الحلقة-1, e1, e01, ep1)
    const episodeMatch = slug.match(/(?:episode|الحلقة|e|ep)[-_]?(\d+)/i);
    if (episodeMatch) {
        episode = parseInt(episodeMatch[1], 10).toString();
    }

    // Clean up slug to get series name
    if (slug.match(/^\d+$/)) {
        seriesName = '';
    } else {
        seriesName = cleanSeriesName(slug);
    }

    // If seriesName is empty, try to get it from the URL path
    if (!seriesName && parts.length >= 5) {
        if (parts[3] === 'episode') {
            seriesName = cleanSeriesName(decodeURIComponent(parts[5] || ''));
        } else if (parts[3] === 'show' && parts[4] === 'episode') {
            seriesName = cleanSeriesName(decodeURIComponent(parts[6] || ''));
        }
    }

    // Capitalize
    seriesName = seriesName.replace(/\b\w/g, l => l.toUpperCase());
    
    if (!seriesName) seriesName = "Unknown Series";

    return { seriesName, season, episode, id };
}

async function getDirectLinkEnhanced(url: string, retry = 0): Promise<{ link: string, title: string | null, rawTitle?: string | null, image?: string | null } | null> {
    try {
        // Normalize URL to use ak.sv to avoid Cloudflare/fingerprinting pages on other domains
        url = url.replace(/https?:\/\/(?:akwam\.[a-z]+|akwam\.to|akwam\.net|akwam\.com)/i, 'https://ak.sv');
        
        const r1 = await fetchWithProxy(url);
        const html = await r1.text();

        let pageTitle = null;
        let rawTitle = null;
        let image = null;

        const rawTitleMatch = html.match(/<title>(.*?)<\/title>/i);
        if (rawTitleMatch) {
            rawTitle = rawTitleMatch[1].replace(/اكوام|akwam|فشار|Fushaar|مشاهده وتحميل|مترجم|مدبلج/gi, '').replace(/-|\s+$/g, '').replace(/\|/g, '').trim();
        }

        const imgMatch = html.match(/<meta property="og:image" content="([^"]+)"/i) || html.match(/<img[^>]+src="([^"]+)"[^>]*class="[^"]*poster[^"]*"[^\>]*>/i);
        if (imgMatch) {
            image = imgMatch[1];
        }
        
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
                    // No resolution suffix usually means original/highest quality
                    highestRes = 9999;
                    bestLink = link;
                }
            }
            
            if (bestLink) {
                const titleMatch = html.match(/<title>(.*?)<\/title>/i);
                if (titleMatch) {
                    pageTitle = titleMatch[1].replace(/فشار|Fushaar|مشاهده وتحميل|مترجم|مدبلج/gi, '').replace(/-|\s+$/g, '').replace(/\|/g, '').trim();
                }
                return { link: bestLink, title: pageTitle, rawTitle, image };
            }
        }

        // 1. Try to find the series link in the breadcrumb or page
        const isFushaar = url.includes('fushaar.com');
        const seriesRegex = isFushaar 
            ? /href="(https?:\/\/(?:www\.)?fushaar\.com\/(?:series|show)\/[^"]+)"/i
            : /href="(https:\/\/ak\.sv\/series\/[^"]+)"/i;
            
        const seriesLinkMatch = html.match(seriesRegex);
        if (seriesLinkMatch) {
            let slug = seriesLinkMatch[1].split('/').filter(Boolean).pop() || '';
            slug = decodeURIComponent(slug);
            slug = slug.replace(/مسلسل/g, '').replace(/مترجم(?:ة)?/g, '').replace(/[-_]/g, ' ').replace(/\s+/g, ' ').trim();
            if (slug) {
                pageTitle = slug;
            }
        }

        // 2. Fallback to title tag
        if (!pageTitle) {
            const titleMatch = html.match(/<title>(.*?)<\/title>/i);
            if (titleMatch) {
                let t = titleMatch[1];
                t = t.replace(/اكوام|akwam/gi, '').replace(/-|\s+$/g, '').trim();
                const seriesMatch = t.match(/(?:مسلسل\s+)?(.*?)(?:\s+)?(?:الحلقة|الموسم)/i);
                if (seriesMatch && seriesMatch[1].trim()) {
                    pageTitle = seriesMatch[1].replace(/مترجم(?:ة)?|مدبلج(?:ة)?/gi, '').trim();
                } else {
                    const movieMatch = t.match(/(?:فيلم\s+)?(.*?)(?:\s+)?(?:مترجم|مدبلج)/i);
                    if (movieMatch && movieMatch[1].trim()) {
                        pageTitle = movieMatch[1].trim();
                    } else {
                        // Avoid using just "الحلقة X" as the series name
                        if (!t.match(/^الحلقة\s*\d+$/i)) {
                            pageTitle = t;
                        }
                    }
                }
            }
        }

        let goLinks: string[] = [];
        
        // Find all go.ak.sv links
        const goRegex = /https?:\/\/go\.ak\.sv\/link\/\d+/gi;
        const matches = html.match(goRegex);
        if (matches) {
            goLinks.push(...matches);
        }

        goLinks = [...new Set(goLinks.filter(Boolean))];
        if (goLinks.length === 0) throw new Error('No goLinks found');

        // Try all goLinks concurrently to find a working direct link
        try {
            const directLinkInfo = await Promise.any(goLinks.map(async (goUrl) => {
                console.log('Trying goUrl:', goUrl);
                const r2 = await fetchWithProxy(goUrl, { redirect: 'follow' });
                const html2 = await r2.text();

                // If r2 redirected directly to a file
                if (r2.url.match(/\.(mp4|mkv|avi|m4v|webm)$/i) || r2.url.includes('downet.net/download/')) {
                    console.log('Found direct link from redirect:', r2.url);
                    return { link: r2.url, title: pageTitle, rawTitle, image };
                }

                // Check if html2 contains direct links directly
                const directMatch2 = html2.match(/(https?:\/\/[^\/]+\.downet\.net\/download\/[^"']+)/i);
                if (directMatch2) {
                    console.log('Found direct link in html2:', directMatch2[1]);
                    return { link: directMatch2[1], title: pageTitle, rawTitle, image };
                }
                const altMatch2 = html2.match(/(?:href|src)="(https?:\/\/[^"']+\.(?:mp4|mkv|avi|m4v|webm))"/i);
                if (altMatch2 && !altMatch2[1].includes('go.ak.sv')) {
                    console.log('Found alt link in html2:', altMatch2[1]);
                    return { link: altMatch2[1], title: pageTitle, rawTitle, image };
                }

                let downloadLinks: string[] = [];
                
                // Find all download and watch links on the ak.sv page
                const dlRegex = /href="(\/(?:download|watch)\/[^"']+)"/gi;
                let dlMatch;
                while ((dlMatch = dlRegex.exec(html2)) !== null) {
                    downloadLinks.push(BASE_URL + dlMatch[1]);
                }
                
                const dlRegexFull = /(https?:\/\/(?:ak\.sv|akwam\.[a-z]+)\/(?:download|watch)\/[^"']+)/gi;
                const dlMatchFull = html2.match(dlRegexFull);
                if (dlMatchFull) {
                    downloadLinks.push(...dlMatchFull);
                }

                downloadLinks = [...new Set(downloadLinks.filter(Boolean))];
                console.log('Found downloadLinks:', downloadLinks);

                if (downloadLinks.length > 0) {
                    // Fetch ALL download links concurrently
                    const dlPromises = downloadLinks.map(async (dlLink) => {
                        console.log('Fetching dlLink:', dlLink);
                        const r3 = await fetchWithProxy(dlLink);
                        const html3 = await r3.text();
                        
                        // Look for direct link in the final page
                        // 1. downet.net links
                        const directMatch = html3.match(/(https?:\/\/[^\/]+\.downet\.net\/download\/[^"']+)/i);
                        if (directMatch) {
                            console.log('Found directMatch:', directMatch[1]);
                            return directMatch[1];
                        }
                        
                        // 2. Any link ending in video extension
                        const altMatch = html3.match(/(?:href|src)="(https?:\/\/[^"']+\.(?:mp4|mkv|avi|m4v|webm))"/i);
                        if (altMatch && !altMatch[1].includes('go.ak.sv')) {
                            console.log('Found altMatch:', altMatch[1]);
                            return altMatch[1];
                        }

                        // 3. Any link containing 'download' and a hash, not ak.sv
                        const genericMatch = html3.match(/(?:href|src)="(https?:\/\/[^"']+\/download\/[^"']+)"/i);
                        if (genericMatch && !genericMatch[1].includes('ak.sv') && !genericMatch[1].includes('akwam.')) {
                            console.log('Found genericMatch:', genericMatch[1]);
                            return genericMatch[1];
                        }

                        console.log('No direct link found in dlLink html');
                        throw new Error('Direct link not found in this source');
                    });

                    const directLink = await Promise.any(dlPromises);
                    if (directLink) return { link: directLink, title: pageTitle, rawTitle, image };
                }
                throw new Error('Failed for this goUrl');
            }));
            return directLinkInfo;
        } catch (e) {
            console.log('Failed to find direct link after checking all goLinks');
            throw new Error('Failed to find direct link after checking all goLinks');
        }

    } catch (e) {
        if (retry < RETRY_COUNT) {
            const delay = 1000 * (retry + 1); // Exponential-ish backoff: 1s, 2s, 3s, 4s
            await new Promise(r => setTimeout(r, delay));
            return getDirectLinkEnhanced(url, retry + 1);
        }
    }
    return null;
}

export async function OPTIONS() {
    return new NextResponse(null, {
        status: 200,
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, x-api-key, Authorization',
        },
    });
}

export async function POST(req: Request) {
    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, x-api-key, Authorization',
    };

    try {
        let apiKey = req.headers.get('x-api-key');
        const authHeader = req.headers.get('authorization');
        if (!apiKey && authHeader && authHeader.startsWith('Bearer ')) {
            apiKey = authHeader.substring(7);
        }

        const validApiKey = process.env.API_SECRET_KEY || 'ak-secret-key-2026';
        
        if (apiKey !== validApiKey) {
            return NextResponse.json({ error: 'Unauthorized. Invalid API Key.' }, { status: 401, headers: corsHeaders });
        }

        const { urls, type } = await req.json();
        console.log(`\n[API Request] POST /api/process - Processing ${urls?.length || 0} URLs of type "${type}"`);
        
        if (!Array.isArray(urls)) {
            console.error(`[API Response] /api/process - 400 Error: Invalid input`);
            return NextResponse.json({ error: 'Invalid input' }, { status: 400, headers: corsHeaders });
        }

        const results = [];
        const CONCURRENCY_LIMIT = 20; // Process 20 URLs at a time per request
        
        for (let i = 0; i < urls.length; i += CONCURRENCY_LIMIT) {
            const chunk = urls.slice(i, i + CONCURRENCY_LIMIT);
            const chunkResults = await Promise.all(chunk.map(async (url) => {
                // Normalize URL to use ak.sv to avoid Cloudflare/fingerprinting pages on other domains
                url = url.replace(/https?:\/\/(?:akwam\.[a-z]+|akwam\.to|akwam\.net|akwam\.com)/i, 'https://ak.sv');
                
                if (type === 'series') {
                    try {
                        const res = await fetchWithProxy(url);
                        const html = await res.text();
                        let image = null;
                        const ogImageMatch = html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/i);
                        if (ogImageMatch) {
                            image = ogImageMatch[1];
                        } else {
                            const imgMatch = html.match(/<img[^>]+class="img-fluid"[^>]+src="([^"]+)"/i);
                            if (imgMatch) {
                                image = imgMatch[1];
                            }
                        }
                        return {
                            title: parseEpisodeInfo(url).seriesName,
                            original_url: url,
                            image
                        };
                    } catch (e) {
                        return {
                            title: parseEpisodeInfo(url).seriesName,
                            original_url: url
                        };
                    }
                }

                const directInfo = await getDirectLinkEnhanced(url);
                if (directInfo) {
                    const direct = directInfo.link;
                    const pageTitle = directInfo.title;
                    const rawTitle = directInfo.rawTitle;
                    const image = directInfo.image;
                    if (type === 'episodes') {
                        const info = parseEpisodeInfo(url, direct, rawTitle || pageTitle);
                        if (pageTitle && info.seriesName === "Unknown Series") {
                            info.seriesName = cleanSeriesName(pageTitle);
                        }
                        return { ...info, direct_url: direct, original_url: url, image };
                    } else {
                        let finalTitle = pageTitle || extractName(url);
                        finalTitle = cleanSeriesName(finalTitle) || finalTitle;
                        return {
                            title: finalTitle,
                            direct_url: direct,
                            original_url: url,
                            image
                        };
                    }
                }
                return null;
            }));
            results.push(...chunkResults.filter(Boolean));
        }

        const finalResults = results.filter(Boolean);
        console.log(`[API Response] /api/process - 200 OK - Successfully processed ${finalResults.length} URLs`);
        return NextResponse.json({ results: finalResults }, { headers: corsHeaders });
    } catch (error: any) {
        console.error(`[API Response] /api/process - 500 Error:`, error.message);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders });
    }
}
