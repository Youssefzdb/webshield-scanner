import { NextResponse } from 'next/server';
import { startCronJob } from '../../lib/scraper';

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { sitemapUrls, startTime } = body;
        
        if (!sitemapUrls || !Array.isArray(sitemapUrls)) {
            return NextResponse.json({ error: 'Invalid sitemapUrls' }, { status: 400 });
        }

        // Start the cron job
        startCronJob(sitemapUrls, startTime);

        return NextResponse.json({ message: '24-hour background scrape cron job started successfully' });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
