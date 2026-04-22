import requests
from bs4 import BeautifulSoup
from urllib.parse import urljoin, urlparse

class WebCrawler:
    def __init__(self, base_url, max_depth=2):
        self.base_url = base_url
        self.domain = urlparse(base_url).netloc
        self.max_depth = max_depth
        self.visited = set()
        self.headers = {"User-Agent": "WebShield-Scanner/1.0"}

    def crawl(self, url=None, depth=0):
        if url is None:
            url = self.base_url
        if depth > self.max_depth or url in self.visited:
            return list(self.visited)
        self.visited.add(url)
        try:
            r = requests.get(url, headers=self.headers, timeout=5)
            soup = BeautifulSoup(r.text, "html.parser")
            for tag in soup.find_all(["a", "form"]):
                href = tag.get("href") or tag.get("action")
                if href:
                    full = urljoin(url, href)
                    if urlparse(full).netloc == self.domain and full not in self.visited:
                        self.crawl(full, depth + 1)
        except Exception as e:
            pass
        return list(self.visited)

