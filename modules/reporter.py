#!/usr/bin/env python3
"""WebShield Reporter - HTML report"""
from datetime import datetime

class WebShieldReporter:
    def __init__(self, results):
        self.results = results

    def save(self, filename):
        findings = self.results.get("findings", [])
        headers = self.results.get("headers", [])
        target = self.results.get("target", "")
        
        rows = "".join(f"<tr><td class='{f['severity'].lower()}'>{f['type']}</td><td>{f.get('url','')}</td><td>{f.get('param','')}</td><td>{f['severity']}</td></tr>" for f in findings)
        hrows = "".join(f"<tr><td>{h['header']}</td><td>{h['note']}</td></tr>" for h in headers if 'header' in h)
        
        html = f"""<!DOCTYPE html><html><head><title>WebShield Report</title>
<style>body{{font-family:Arial;background:#0f0f23;color:#cdd6f4;padding:20px}}
h1{{color:#f38ba8}}h2{{color:#fab387}}
table{{width:100%;border-collapse:collapse;margin:10px 0}}
td,th{{padding:8px;border:1px solid #313244}}th{{background:#1e1e2e}}
.critical{{color:#f38ba8}}.high{{color:#fab387}}.medium{{color:#f9e2af}}
</style></head><body>
<h1>🛡 WebShield Scan Report</h1>
<p>Target: <b>{target}</b> | {datetime.now().strftime('%Y-%m-%d %H:%M')}</p>
<p>URLs scanned: {self.results.get('urls_found',0)} | Vulnerabilities: {len(findings)}</p>
<h2>Vulnerabilities</h2>
<table><tr><th>Type</th><th>URL</th><th>Parameter</th><th>Severity</th></tr>{rows}</table>
<h2>Missing Security Headers</h2>
<table><tr><th>Header</th><th>Risk</th></tr>{hrows}</table>
</body></html>"""
        
        with open(filename, "w") as f:
            f.write(html)
