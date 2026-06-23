# Security Policy

This app is privacy-first by design: it runs entirely client-side, has no
backend, and sends no data anywhere. Everything you scan stays in your browser
unless you export it yourself.

## Reporting a vulnerability

Please report security issues **privately** via GitHub's
[private vulnerability reporting](https://github.com/deathy/qr.codemonkey.ro/security/advisories/new)
(Security → Report a vulnerability). Don't open a public issue for anything
security-sensitive.

Useful things to include: what you observed, steps to reproduce, the browser /
OS / device, and the impact you think it has.

## Scope

In scope: anything that could leak scanned data off-device, bypass the
"links are never auto-opened" guarantee, or compromise the served site.

Out of scope: issues that require a already-compromised device or a malicious
browser extension.
