import requests

REQUIRED_HEADERS = {
    "Content-Security-Policy": "Prevents XSS attacks",
    "X-Frame-Options": "Prevents clickjacking",
    "X-XSS-Protection": "Browser XSS filter",
    "Strict-Transport-Security": "Forces HTTPS",
    "X-Content-Type-Options": "Prevents MIME sniffing",
    "Referrer-Policy": "Controls referrer info",
}

class HeaderChecker:
    def __init__(self, url):
        self.url = url

    def check(self):
        results = {"present": [], "missing": [], "server": ""}
        try:
            r = requests.get(self.url, timeout=5)
            results["server"] = r.headers.get("Server", "hidden")
            results["status"] = r.status_code
            for header, desc in REQUIRED_HEADERS.items():
                if header in r.headers:
                    results["present"].append({"header": header, "value": r.headers[header]})
                else:
                    results["missing"].append({"header": header, "description": desc})
                    print(f"[!] Missing security header: {header}")
        except Exception as e:
            print(f"[-] Header check failed: {e}")
        return results
