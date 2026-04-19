import fetch from 'node-fetch';

async function test() {
  try {
    const res = await fetch('https://www.fushaar.com/movie/wonder-woman-1984/');
    const html = await res.text();
    console.log("Length:", html.length);
    const mp4Links = html.match(/href="([^"]+\.mp4[^"]*)"/gi);
    console.log("MP4 links:", mp4Links);
    const sourceMatches = html.match(/<source[^>]+src="([^"]+)"/gi);
    console.log("Source tags:", sourceMatches);
    const iframeMatches = html.match(/<iframe[^>]+src="([^"]+)"/gi);
    console.log("Iframe tags:", iframeMatches);
    const downloadMatches = html.match(/href="([^"]+)"[^>]*download/gi);
    console.log("Download links:", downloadMatches);
    const allLinks = html.match(/href="([^"]+)"/gi);
    if (allLinks) {
      console.log("Some links:", allLinks.filter(l => l.includes('download') || l.includes('video') || l.includes('mp4')));
    }
  } catch (e) {
    console.error(e);
  }
}
test();
