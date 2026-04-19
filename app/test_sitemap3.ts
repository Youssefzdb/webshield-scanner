import fetch from 'node-fetch';

async function test() {
  const res = await fetch('https://www.fushaar.com/post-sitemap5.xml');
  const xml = await res.text();
  const series = xml.match(/<loc>(https:\/\/www\.fushaar\.com\/[^<]+)<\/loc>/gi);
  console.log(series ? series.slice(0, 10) : "No series found");
}
test();
