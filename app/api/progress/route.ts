import { NextResponse } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';
import { checkAndResumeCronJob } from '../../lib/scraper';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        // Check and resume cron job if it was missed due to server restart
        checkAndResumeCronJob();

        const progressPath = path.join(process.cwd(), 'public', 'progress.json');
        if (fs.existsSync(progressPath)) {
            const data = fs.readFileSync(progressPath, 'utf-8');
            return NextResponse.json(JSON.parse(data));
        }
        return NextResponse.json({ status: 'idle' });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
