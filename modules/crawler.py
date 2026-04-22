#!/usr/bin/env python3
"""Web Crawler - Discover URLs for scanning"""
import requests
from bs4 import BeautifulSoup
from urllib.parse import urljoin, urlparse

class WebCrawler:
    def __init__(self, base_url, depth=2):
        self.base_url = base_url
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
                if href:
                    full = urljoin(url, href)
                    if urlparse(full).netloc == self.domain:
                        links.add(full)
        except:
            pass
        return links

    def crawl(self, url=None, depth=None):
        if url is None:
            url = self.base_url
        if depth is None:
            depth = self.depth
        
        if depth == 0 or url in self.visited:
            return list(self.visited)
        
        self.visited.add(url)
        print(f"[*] Crawling: {url}")
        
        for link in self._get_links(url):
            self.crawl(link, depth - 1)
        
        return list(self.visited)
