#!/usr/bin/env python3
"""webshield-scanner - Automated Web Application Vulnerability Scanner"""
import argparse
from modules.crawler import WebCrawler
from modules.xss_scanner import XSSScanner
from modules.sqli_scanner import SQLiScanner
from modules.header_checker import HeaderChecker
from modules.reporter import WebShieldReporter

def main():
    parser = argparse.ArgumentParser(description="webshield-scanner")
    parser.add_argument("target", help="Target URL (e.g. http://example.com)")
    parser.add_argument("--depth", type=int, default=2, help="Crawl depth")
    parser.add_argument("--output", default="webshield_report.html")
    args = parser.parse_args()

    print(f"[*] WebShield Scanner | Target: {args.target}")
    
    crawler = WebCrawler(args.target, args.depth)
    urls = crawler.crawl()
    
    results = {"target": args.target, "urls_found": len(urls), "findings": []}
    
    header_checker = HeaderChecker(args.target)
    results["headers"] = header_checker.check()
    
    for url in urls[:20]:
        xss = XSSScanner(url)
        results["findings"].extend(xss.scan())
        sqli = SQLiScanner(url)
        results["findings"].extend(sqli.scan())
    
    reporter = WebShieldReporter(results)
    reporter.save(args.output)
    print(f"[+] Found {len(results['findings'])} vulnerabilities. Report: {args.output}")

if __name__ == "__main__":
    main()
