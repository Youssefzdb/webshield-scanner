import fs from 'node:fs';
import path from 'node:path';

const PROGRESS_FILE = path.join(process.cwd(), 'public', 'progress.json');
const OUTPUT_FILE = path.join(process.cwd(), 'public', 'latest-scrape.json');
const SCHEDULE_FILE = path.join(process.cwd(), 'public', 'schedule.json');

let isScraping = false;
let cronInterval: NodeJS.Timeout | null = null;
let cronTimeout: NodeJS.Timeout | null = null;

export async function runBackgroundScrape(sitemapUrls: string[]) {
    if (isScraping) {
        console.log('Scraping already in progress.');
        return;
    }

    isScraping = true;
    
    const progress = {
        status: 'running',
        startTime: new Date().toISOString(),
        endTime: null as string | null,
        logs: [] as string[],
        stats: {
            movies: { total: 0, processed: 0, found: 0 },
            series: { total: 0, processed: 0, found: 0 },
            episodes: { total: 0, processed: 0, found: 0 }
        },
        error: null as string | null
    };

    const updateProgress = (logMsg?: string) => {
        if (logMsg) {
            progress.logs.push(`[${new Date().toISOString()}] ${logMsg}`);
            // Keep only last 50 logs to avoid huge file
            if (progress.logs.length > 50) progress.logs.shift();
        }
        fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
    };

    try {
        updateProgress('Starting background scrape...');
        
        // 1. Fetch Sitemaps
        const urls = { movies: [] as string[], series: [] as string[], episodes: [] as string[] };
        
        for (const sitemapUrl of sitemapUrls) {
            // Check if it's a direct URL or ID instead of a sitemap
            if (!sitemapUrl.includes('.xml') && !sitemapUrl.includes('sitemap')) {
                let url = sitemapUrl;
                if (/^\d+$/.test(sitemapUrl)) {
                    url = `https://ak.sv/episode/${sitemapUrl}/`;
                }
                
                if (url.includes('/movie/')) urls.movies.push(url);
                else if (url.includes('/series/') || url.includes('/show/')) urls.series.push(url);
                else if (url.includes('/episode/') || url.match(/-(?:episode|ep|الحلقة)-?\d+/i) || url.match(/%d8%a7%d9%84%d8%ad%d9%84%d9%82%d8%a9/i)) urls.episodes.push(url);
                continue;
            }

            updateProgress(`Fetching sitemap: ${sitemapUrl}`);
            try {
                const response = await fetch(sitemapUrl);
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                const xml = await response.text();
                
                const isFushaar = sitemapUrl.includes('fushaar.com');
                const isMoviesSitemap = sitemapUrl.includes('movies');
                const isEpisodesSitemap = sitemapUrl.includes('episodes');
                const isSeriesSitemap = sitemapUrl.includes('series') || (sitemapUrl.includes('shows') && !isEpisodesSitemap);

                const locRegex = /<loc>(.*?)<\/loc>/g;
                let match;
                while ((match = locRegex.exec(xml)) !== null) {
                    const url = match[1];
                    
                    if (isFushaar) {
                        if (url.includes('/movie/')) urls.movies.push(url);
                        else if (url.includes('/series/') || url.includes('/show/')) urls.series.push(url);
                        else if (url.includes('/episode/')) urls.episodes.push(url);
                    } else {
                        if (isMoviesSitemap) urls.movies.push(url);
                        else if (isSeriesSitemap) urls.series.push(url);
                        else if (isEpisodesSitemap) urls.episodes.push(url);
                        else {
                            if (url.includes('/movie/')) urls.movies.push(url);
                            else if (url.includes('/series/') || url.includes('/shows/')) urls.series.push(url);
                            else if (url.includes('/episode/') || url.includes('/show_episodes/') || url.match(/-(?:episode|ep|الحلقة)-?\d+/i) || url.match(/%d8%a7%d9%84%d8%ad%d9%84%d9%82%d8%a9/i)) urls.episodes.push(url);
                        }
                    }
                }
            } catch (err: any) {
                updateProgress(`Error fetching sitemap ${sitemapUrl}: ${err.message}`);
            }
        }

        // 2. Auto-discover latest episodes from homepage
        updateProgress('Discovering latest episodes from homepage...');
        try {
            const homeRes = await fetch('https://ak.sv/');
            if (homeRes.ok) {
                const homeHtml = await homeRes.text();
                const epRegex = /href="(https?:\/\/ak\.sv\/episode\/\d+\/)"/gi;
                let epMatch;
                while ((epMatch = epRegex.exec(homeHtml)) !== null) {
                    urls.episodes.push(epMatch[1]);
                }
            }
        } catch (err: any) {
            updateProgress(`Error discovering latest episodes: ${err.message}`);
        }

        // 3. Deduplicate URLs
        urls.movies = [...new Set(urls.movies)];
        urls.series = [...new Set(urls.series)];
        
        // Deduplicate episodes by ID
        const epMap = new Map<string, string>();
        for (const l of urls.episodes) {
            const idMatch = l.match(/\/episode\/(\d+)/i);
            const id = idMatch ? idMatch[1] : l;
            if (!epMap.has(id) || l.length > epMap.get(id)!.length) {
                epMap.set(id, l);
            }
        }
        urls.episodes = Array.from(epMap.values());

        progress.stats.movies.total = urls.movies.length;
        progress.stats.series.total = urls.series.length;
        progress.stats.episodes.total = urls.episodes.length;
        updateProgress(`Found ${urls.movies.length} movies, ${urls.series.length} series, ${urls.episodes.length} episodes after deduplication.`);

        const finalResults: any[] = [];
        const CONCURRENCY = 15; // Increased from 5 to 15 for faster background processing
        
        // Helper to process chunks
        const processChunk = async (chunk: string[], type: 'movies' | 'series' | 'episodes') => {
            // We'll call our own local API to reuse the robust logic, or we can duplicate the logic.
            // Calling local API is safer to reuse the exact same logic.
            const apiUrl = `http://localhost:3000/api/process`;
            const apiKey = process.env.API_SECRET_KEY || 'ak-secret-key-2026';
            try {
                const res = await fetch(apiUrl, {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json',
                        'x-api-key': apiKey
                    },
                    body: JSON.stringify({ urls: chunk, type })
                });
                if (res.ok) {
                    const data = await res.json();
                    if (data.results) {
                        finalResults.push(...data.results);
                        progress.stats[type].found += data.results.length;
                    }
                }
            } catch (err: any) {
                updateProgress(`Error processing chunk of ${type}: ${err.message}`);
            }
            progress.stats[type].processed += chunk.length;
            updateProgress();
        };

        // Process Movies
        updateProgress('Processing movies...');
        for (let i = 0; i < urls.movies.length; i += CONCURRENCY) {
            await processChunk(urls.movies.slice(i, i + CONCURRENCY), 'movies');
            // Add a small delay to avoid rate limits
            await new Promise(r => setTimeout(r, 2000));
        }

        // Process Series
        updateProgress('Processing series...');
        for (let i = 0; i < urls.series.length; i += CONCURRENCY) {
            await processChunk(urls.series.slice(i, i + CONCURRENCY), 'series');
            await new Promise(r => setTimeout(r, 2000));
        }

        // Process Episodes
        updateProgress('Processing episodes...');
        for (let i = 0; i < urls.episodes.length; i += CONCURRENCY) {
            await processChunk(urls.episodes.slice(i, i + CONCURRENCY), 'episodes');
            await new Promise(r => setTimeout(r, 2000));
        }

        // Save final results
        updateProgress('Saving final results...');
        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(finalResults, null, 2));
        
        progress.status = 'done';
        progress.endTime = new Date().toISOString();
        updateProgress('Background scrape completed successfully.');

    } catch (error: any) {
        progress.status = 'error';
        progress.error = error.message;
        progress.endTime = new Date().toISOString();
        updateProgress(`Fatal Error: ${error.message}`);
    } finally {
        isScraping = false;
    }
}

export function checkAndResumeCronJob() {
    if (
        process.env.npm_lifecycle_event === 'build' || 
        process.env.NEXT_PHASE === 'phase-production-build' ||
        process.argv.includes('build')
    ) {
        return;
    }
    if (isScraping || cronTimeout || cronInterval) return;

    try {
        if (fs.existsSync(SCHEDULE_FILE)) {
            const data = fs.readFileSync(SCHEDULE_FILE, 'utf-8');
            const schedule = JSON.parse(data);
            
            if (schedule.sitemapUrls && Array.isArray(schedule.sitemapUrls)) {
                console.log(`[Cron] Resuming cron job from schedule.json`);
                // We pass true for isResume to avoid overwriting the schedule file again
                startCronJob(schedule.sitemapUrls, schedule.startTime, true);
            }
        }
    } catch (error) {
        console.error('[Cron] Error checking and resuming cron job:', error);
    }
}

export function startCronJob(sitemapUrls: string[], startTime?: string, isResume = false) {
    if (cronInterval) {
        clearInterval(cronInterval);
    }
    if (cronTimeout) {
        clearTimeout(cronTimeout);
    }
    
    const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;

    // Save the schedule if it's not a resume operation and startTime is provided
    if (!isResume) {
        if (startTime) {
            fs.writeFileSync(SCHEDULE_FILE, JSON.stringify({ sitemapUrls, startTime }, null, 2));
        } else if (fs.existsSync(SCHEDULE_FILE)) {
            fs.unlinkSync(SCHEDULE_FILE);
        }
    }

    if (startTime) {
        // startTime format: "HH:MM" (in UTC)
        const [hours, minutes] = startTime.split(':').map(Number);
        const now = new Date();
        const scheduledTime = new Date();
        scheduledTime.setUTCHours(hours, minutes, 0, 0);

        // If the scheduled time has already passed today, schedule for tomorrow
        if (scheduledTime.getTime() <= now.getTime()) {
            scheduledTime.setUTCDate(scheduledTime.getUTCDate() + 1);
        }

        const delay = scheduledTime.getTime() - now.getTime();
        console.log(`Scheduled to start in ${delay / 1000} seconds at ${scheduledTime.toLocaleString()}`);

        // Write initial progress state to indicate it's scheduled
        // Only if we are not currently scraping
        if (!isScraping) {
            const progress = {
                status: 'scheduled',
                scheduledTime: scheduledTime.toISOString(),
                sitemapUrls: sitemapUrls,
                startTime: null,
                endTime: null,
                logs: [`[${new Date().toISOString()}] Scheduled to start at ${scheduledTime.toLocaleString()}`],
                stats: {
                    movies: { total: 0, processed: 0, found: 0 },
                    series: { total: 0, processed: 0, found: 0 },
                    episodes: { total: 0, processed: 0, found: 0 }
                },
                error: null
            };
            fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
        }

        cronTimeout = setTimeout(() => {
            runBackgroundScrape(sitemapUrls).catch(console.error);
            cronInterval = setInterval(() => {
                runBackgroundScrape(sitemapUrls).catch(console.error);
            }, TWENTY_FOUR_HOURS);
        }, delay);

    } else {
        // Run immediately
        runBackgroundScrape(sitemapUrls).catch(console.error);
        
        // Then run every 24 hours
        cronInterval = setInterval(() => {
            runBackgroundScrape(sitemapUrls).catch(console.error);
        }, TWENTY_FOUR_HOURS);
        
        console.log('24-hour cron job started immediately.');
    }
}
