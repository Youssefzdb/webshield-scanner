import { NextResponse } from 'next/server';
import nodeFetch from 'node-fetch';

export const dynamic = 'force-dynamic';

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

async function getDirectLinkEnhanced(url: string, retry = 0): Promise<{ link: string, title: string | null, image?: string | null } | null> {
    try {
        // Normalize URL to use ak.sv to avoid Cloudflare/fingerprinting pages on other domains
        url = url.replace(/https?:\/\/(?:akwam\.[a-z]+|akwam\.to|akwam\.net|akwam\.com)/i, 'https://ak.sv');
        
        const r1 = await fetchWithProxy(url);
        const html = await r1.text();

        let pageTitle = null;
        let image = null;

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
                return { link: bestLink, title: pageTitle, image };
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
                const r2 = await fetchWithProxy(goUrl, { redirect: 'follow' });
                const html2 = await r2.text();

                // If r2 redirected directly to a file
                if (r2.url.match(/\.(mp4|mkv|avi|m4v|webm)$/i) || r2.url.includes('downet.net/download/')) {
                    return { link: r2.url, title: pageTitle, image };
                }

                // Check if html2 contains direct links directly
                const directMatch2 = html2.match(/(https?:\/\/[^\/]+\.downet\.net\/download\/[^"']+)/i);
                if (directMatch2) {
                    return { link: directMatch2[1], title: pageTitle, image };
                }
                const altMatch2 = html2.match(/(?:href|src)="(https?:\/\/[^"']+\.(?:mp4|mkv|avi|m4v|webm))"/i);
                if (altMatch2 && !altMatch2[1].includes('go.ak.sv')) {
                    return { link: altMatch2[1], title: pageTitle, image };
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

                if (downloadLinks.length > 0) {
                    // Fetch ALL download links concurrently
                    const dlPromises = downloadLinks.map(async (dlLink) => {
                        const r3 = await fetchWithProxy(dlLink);
                        const html3 = await r3.text();
                        
                        // Look for direct link in the final page
                        // 1. downet.net links
                        const directMatch = html3.match(/(https?:\/\/[^\/]+\.downet\.net\/download\/[^"']+)/i);
                        if (directMatch) return directMatch[1];
                        
                        // 2. Any link ending in video extension
                        const altMatch = html3.match(/(?:href|src)="(https?:\/\/[^"']+\.(?:mp4|mkv|avi|m4v|webm))"/i);
                        if (altMatch && !altMatch[1].includes('go.ak.sv')) return altMatch[1];

                        // 3. Any link containing 'download' and a hash, not ak.sv
                        const genericMatch = html3.match(/(?:href|src)="(https?:\/\/[^"']+\/download\/[^"']+)"/i);
                        if (genericMatch && !genericMatch[1].includes('ak.sv') && !genericMatch[1].includes('akwam.')) return genericMatch[1];

                        throw new Error('Direct link not found in this source');
                    });

                    const directLink = await Promise.any(dlPromises);
                    if (directLink) return { link: directLink, title: pageTitle, image };
                }
                throw new Error('Failed for this goUrl');
            }));
            return directLinkInfo;
        } catch (e) {
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

    let targetUrl = '';
    try {
        const body = await req.json();
        targetUrl = body.url || '';
    } catch (e) {
        const { searchParams } = new URL(req.url);
        targetUrl = searchParams.get('url') || '';
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

    if (!targetUrl) {
        return NextResponse.json({ error: 'Query parameter "url" is required in body' }, { status: 400, headers: corsHeaders });
    }

    return performExtract(targetUrl, corsHeaders);
}

export async function GET(req: Request) {
    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, x-api-key, Authorization',
    };

    const { searchParams } = new URL(req.url);
    const targetUrl = searchParams.get('url');
    
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

    if (!targetUrl) {
        return NextResponse.json({ error: 'Query parameter "url" is required' }, { status: 400, headers: corsHeaders });
    }

    return performExtract(targetUrl, corsHeaders);
}

async function performExtract(targetUrl: string, corsHeaders: any) {
    console.log(`\n[API Request] GET/POST /api/extract - URL: "${targetUrl}"`);
    try {
        const pageRes = await fetchWithProxy(targetUrl);
        const pageHtml = await pageRes.text();

        let seriesImage = null;
        const imgMatch = pageHtml.match(/<meta property="og:image" content="([^"]+)"/i) || pageHtml.match(/<img[^>]+src="([^"]+)"[^>]*class="[^"]*poster[^"]*"[^\>]*>/i);
        if (imgMatch) {
            seriesImage = imgMatch[1];
        }

        // Function to extract episode links from HTML
        const extractEpisodes = (html: string, baseUrl: string) => {
            const isFushaar = baseUrl.includes('fushaar.com');
            const epRegex = isFushaar 
                ? /href="(https?:\/\/(?:www\.)?fushaar\.com\/episode\/[^"]+)"/g
                : /href="(https:\/\/ak\.sv\/[^"]+)"/g;
            
            let epMatch;
            const linksMap = new Map<string, string>(); // Map ID -> URL
            
            while ((epMatch = epRegex.exec(html)) !== null) {
                const l = epMatch[1];
                if (isFushaar) {
                    const idMatch = l.match(/\/episode\/([^\/]+)/i);
                    const id = idMatch ? idMatch[1] : l;
                    if (!linksMap.has(id)) linksMap.set(id, l);
                } else {
                    if (l.includes('/episode/') || l.match(/-(?:episode|ep|الحلقة)-?\d+/i) || l.match(/%d8%a7%d9%84%d8%ad%d9%84%d9%82%d8%a9/i)) {
                        const idMatch = l.match(/\/episode\/(\d+)/i);
                        const id = idMatch ? idMatch[1] : l;
                        // Prefer the URL with the slug if we already have one without it
                        if (!linksMap.has(id) || l.length > linksMap.get(id)!.length) {
                            linksMap.set(id, l);
                        }
                    }
                }
            }
            return Array.from(linksMap.values());
        };

        let episodeLinks = extractEpisodes(pageHtml, targetUrl);

        // If no episodes found, check if there's a link to the main series page (maybe we landed on a single episode)
        if (episodeLinks.length === 0) {
            const isFushaar = targetUrl.includes('fushaar.com');
            const seriesRegex = isFushaar 
                ? /href="(https?:\/\/(?:www\.)?fushaar\.com\/(?:series|show)\/[^"]+)"/i
                : /href="(https:\/\/ak\.sv\/series\/[^"]+)"/i;
                
            const seriesLinkMatch = pageHtml.match(seriesRegex);
            if (seriesLinkMatch) {
                const seriesRes = await fetchWithProxy(seriesLinkMatch[1]);
                const seriesHtml = await seriesRes.text();
                episodeLinks = extractEpisodes(seriesHtml, targetUrl);
                
                // Extract the series image since we are now on the series page
                const seriesImgMatch = seriesHtml.match(/<meta property="og:image" content="([^"]+)"/i) || seriesHtml.match(/<img[^>]+src="([^"]+)"[^>]*class="[^"]*poster[^"]*"[^\>]*>/i);
                if (seriesImgMatch) {
                    seriesImage = seriesImgMatch[1];
                }
            }
        }

        // 4. Process based on type (Series vs Movie)
        if (episodeLinks.length > 0) {
            // It's a series
            const getEpisodeNumber = (url: string, title?: string | null, directLink?: string | null) => {
                console.log('getEpisodeNumber inputs:', { url, title, directLink });
                if (title) {
                    const titleMatch = title.match(/(?:الحلقة|Episode)\s*(\d+)/i);
                    if (titleMatch) return parseInt(titleMatch[1], 10);
                }
                
                // Try to match 'الحلقة-1' or 'ep-1' in the URL first, ignoring 'episode/87' ID
                const m1 = url.match(/(?:الحلقة|%d8%a7%d9%84%d8%ad%d9%84%d9%82%d8%a9|ep)[-_](\d+)/i);
                if (m1) return parseInt(m1[1], 10);
                
                // Fallback to directLink filename (e.g. Ep01)
                if (directLink) {
                    const m2 = directLink.match(/Ep(?:isode)?\s*0*(\d+)/i);
                    if (m2) return parseInt(m2[1], 10);
                }
                
                // Last resort: try 'episode/87' (might be ID, but better than 0)
                const m3 = url.match(/(?:episode)[-_/]?(\d+)/i);
                if (m3) return parseInt(m3[1], 10);
                
                return 0;
            };

            const episodesData = [];
            const CONCURRENCY = 20; // Process 20 episodes concurrently to avoid timeouts
            
            for (let i = 0; i < episodeLinks.length; i += CONCURRENCY) {
                const chunk = episodeLinks.slice(i, i + CONCURRENCY);
                const chunkResults = await Promise.all(chunk.map(async (url) => {
                    const directInfo = await getDirectLinkEnhanced(url);
                    const idMatch = url.match(/\/episode\/(\d+)/i);
                    const id = idMatch ? idMatch[1] : null;
                    return { 
                        id,
                        episode: getEpisodeNumber(url, directInfo?.title, directInfo?.link), 
                        directLink: directInfo?.link || null 
                    };
                }));
                episodesData.push(...chunkResults);
            }

            // Sort episodes by episode number
            episodesData.sort((a, b) => a.episode - b.episode);

            const responseData = {
                success: true,
                type: 'series',
                totalEpisodes: episodesData.length,
                image: seriesImage,
                episodes: episodesData
            };
            console.log(`[API Response] /api/extract - 200 OK - Series with ${episodesData.length} episodes`);
            return NextResponse.json(responseData, { headers: corsHeaders });

        } else {
            // It's a movie or single episode without series link
            const directInfo = await getDirectLinkEnhanced(targetUrl);

            if (!directInfo || !directInfo.link) {
                console.error(`[API Response] /api/extract - 500 Error: Failed to extract direct link`);
                return NextResponse.json({ error: 'Failed to extract direct link from the result', url: targetUrl }, { status: 500, headers: corsHeaders });
            }

            const responseData = {
                success: true,
                type: 'movie',
                title: directInfo.title || undefined,
                image: directInfo.image || seriesImage || undefined,
                directLink: directInfo.link
            };
            console.log(`[API Response] /api/extract - 200 OK - Movie direct link found`);
            return NextResponse.json(responseData, { headers: corsHeaders });
        }

    } catch (error: any) {
        console.error(`[API Response] /api/extract - 500 Error:`, error.message);
        return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500, headers: corsHeaders });
    }
}
