#!/usr/bin/env python3
import requests
from bs4 import BeautifulSoup
from urllib.parse import urljoin, urlparse

class Crawler:
    def __init__(self, base_url, depth=2):
        self.base = base_url
        self.depth = depth
        self.visited = set()
        self.domain = urlparse(base_url).netloc

    def _get_links(self, url):
        links = set()
        try:
            r = requests.get(url, timeout=5, headers={"User-Agent": "WebShield/1.0"})
            soup = BeautifulSoup(r.text, "html.parser")
            for tag in soup.find_all(["a", "form"]):
                href = tag.get("href") or tag.get("action", "")
                full = urljoin(url, href)
                if urlparse(full).netloc == self.domain:
                    links.add(full)
        except:
            pass
        return links

    def crawl(self, url=None, depth=0):
        if url is None:
            url = self.base
        if depth > self.depth or url in self.visited:
            return list(self.visited)
        self.visited.add(url)
        print(f"[*] Crawling: {url}")
        for link in self._get_links(url):
            self.crawl(link, depth + 1)
        return list(self.visited)
