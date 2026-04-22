import requests
from urllib.parse import urlparse, parse_qs, urlencode, urlunparse

XSS_PAYLOADS = [
    "<script>alert(1)</script>",
    "\">\x3cscript>alert(1)\x3c/script>",
    "<img src=x onerror=alert(1)>",
    "javascript:alert(1)",
    "<svg onload=alert(1)>",
]

class XSSScanner:
    def __init__(self, url):
        self.url = url
        self.findings = []

    def scan(self):
        parsed = urlparse(self.url)
        params = parse_qs(parsed.query)
        if not params:
            return []
        for param in params:
            for payload in XSS_PAYLOADS:
                test_params = params.copy()
                test_params[param] = [payload]
                new_query = urlencode(test_params, doseq=True)
                test_url = urlunparse(parsed._replace(query=new_query))
                try:
                    r = requests.get(test_url, timeout=3)
                    if payload in r.text:
                        self.findings.append({
                            "type": "XSS",
                            "url": test_url,
                            "param": param,
                            "payload": payload
                        })
                        print(f"[!] XSS found: {test_url} param={param}")
                except:
                    pass
        return self.findings

