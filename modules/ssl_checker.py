#!/usr/bin/env python3
import ssl, socket
from urllib.parse import urlparse
from datetime import datetime

class SSLChecker:
    def __init__(self, url):
        parsed = urlparse(url)
        self.host = parsed.hostname
        self.port = parsed.port or 443

    def check(self):
        findings = []
        try:
            ctx = ssl.create_default_context()
            with ctx.wrap_socket(socket.socket(), server_hostname=self.host) as s:
                s.settimeout(5)
                s.connect((self.host, self.port))
                cert = s.getpeercert()
                expires = datetime.strptime(cert["notAfter"], "%b %d %H:%M:%S %Y %Z")
                days_left = (expires - datetime.utcnow()).days
                if days_left < 30:
                    findings.append({"type": "SSL Expiry", "desc": f"Cert expires in {days_left} days"})
        except Exception as e:
            findings.append({"type": "SSL Error", "desc": str(e)})
        return findings
