import fetch from 'node-fetch';

async function test() {
  const res = await fetch('https://www.fushaar.com/post-sitemap.xml');
  const xml = await res.text();
  console.log(xml.substring(0, 1000));
}
test();
