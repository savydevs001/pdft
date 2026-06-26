# Linux Headless Server Deployment Guide

This document explains how to run the PDF generation feature (via Puppeteer/Chromium) on a CLI-based Linux server that lacks a GUI (e.g., Ubuntu Server, Debian slim).

## The Code is Ready
The `server.js` code is already configured to run headlessly. The following arguments are passed to Puppeteer:
```javascript
const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
```
These arguments are required to run Chromium securely on a CLI Linux server without a display manager.

## Installing System Dependencies
Even though Chromium runs invisibly (headless mode), the browser engine still requires the underlying Linux graphics, font rendering, and networking libraries to physically draw the PDF. These libraries are usually missing on barebones CLI Linux servers.

If you skip this step, Puppeteer will likely crash with an error similar to: `error while loading shared libraries: libnss3.so: cannot open shared object file`.

### For Ubuntu / Debian
Run the following command to install all necessary Chromium shared dependencies:

```bash
sudo apt-get update
sudo apt-get install -yq gconf-service libasound2 libatk1.0-0 libc6 libcairo2 libcups2 libdbus-1-3 libexpat1 libfontconfig1 libgcc1 libgconf-2-4 libgdk-pixbuf2.0-0 libglib2.0-0 libgtk-3-0 libnspr4 libpango-1.0-0 libpangocairo-1.0-0 libstdc++6 libx11-6 libx11-xcb1 libxcb1 libxcomposite1 libxcursor1 libxdamage1 libxext6 libxfixes3 libxi6 libxrandr2 libxrender1 libxss1 libxtst6 ca-certificates fonts-liberation libnss3 lsb-release xdg-utils wget
```

## Installing Standard Fonts
Your report design relies on standard fonts like `Arial` and `Helvetica Neue`. Linux servers typically do not have these installed by default, which will cause the PDF text to fallback to generic, unstyled fonts, breaking the layout.

Install the Microsoft TrueType core fonts to fix this:

```bash
sudo apt-get install -y ttf-mscorefonts-installer fontconfig
fc-cache -f -v
```

## Docker Alternative
If you plan to deploy this project via Docker, you can avoid installing dependencies manually by using the official Puppeteer Docker image (`ghcr.io/puppeteer/puppeteer:latest`). This image comes pre-packaged with every single dependency Chromium needs right out of the box.
