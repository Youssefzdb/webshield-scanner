# WebShield Scanner

> Automated Web Application Vulnerability Scanner

![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue) ![License](https://img.shields.io/badge/License-MIT-green) ![Status](https://img.shields.io/badge/Status-Active-brightgreen)

## Overview

WebShield Scanner is an automated web application security testing tool that identifies common vulnerabilities including XSS, SQL Injection, CSRF, and misconfigured security headers.

## Features

- 🔍 **XSS Detection** — Reflected, stored, and DOM-based XSS
- 💉 **SQL Injection** — Automated SQLi payload testing
- 🔐 **Auth Testing** — Broken authentication & session management
- 📋 **Header Analysis** — Security headers audit (CSP, HSTS, X-Frame)
- 🗺️ **Crawler** — Smart endpoint discovery and mapping
- 📊 **Reports** — Detailed HTML vulnerability reports

## Installation

```bash
git clone https://github.com/Youssefzdb/Film-s-ries-
cd Film-s-ries-
npm install
```

## Usage

```bash
npm run scan -- --target https://example.com
npm run scan -- --target https://example.com --mode full
```

## Scan Modes

| Mode | Description |
|------|-------------|
| `quick` | Fast scan — headers + basic XSS/SQLi |
| `full` | Deep scan — all modules enabled |
| `stealth` | Low-noise scan for sensitive targets |

## Disclaimer

> For authorized testing only. Get written permission before scanning any target.

## Author

**Shadow Core** — Web Application Security Specialist