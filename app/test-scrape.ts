import nodeFetch from 'node-fetch';
import * as cheerio from 'cheerio';

async function test() {
    const query = "هذا البحر سوف يفيض";
    const searchUrl = `https://ak.sv/search?q=${encodeURIComponent(query)}`;
    console.log("Fetching:", searchUrl);
    
    const res = await nodeFetch(searchUrl, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
        }
    });
    
    const html = await res.text();
    const $ = cheerio.load(html);
    
    const results: any[] = [];
    
    console.log("HTML length:", html.length);
    
    $('a[href^="https://ak.sv/movie/"], a[href^="https://ak.sv/series/"]').each((i, el) => {
        const link = $(el).attr('href');
        const img = $(el).find('img').first();
        let image = img.attr('src') || img.attr('data-src') || img.attr('data-lazy-src') || '';
        let title = $(el).attr('title') || img.attr('alt') || $(el).text().trim();
        
        if (!image) {
            const parent = $(el).closest('article, .item, .post, .box, .widget');
            const parentImg = parent.find('img').first();
            image = parentImg.attr('src') || parentImg.attr('data-src') || parentImg.attr('data-lazy-src') || '';
            if (!title) {
                title = parent.find('h2, h3, .title').text().trim();
            }
        }

        if (link && title && !results.some(r => r.url === link)) {
            title = title.replace(/\s+/g, ' ').trim();
            results.push({
                title,
                image,
                url: link,
                type: link.includes('/series/') ? 'series' : 'movie'
            });
        }
    });
    
    console.log("Results:", JSON.stringify(results, null, 2));
}

test().catch(console.error);
