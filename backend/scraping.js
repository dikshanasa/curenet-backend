const axios = require('axios');
const puppeteer = require('puppeteer');
const { GOOGLE_API_KEY, GOOGLE_CSE_ID } = require('./utils/config');
const fs = require('fs');
const path = require('path');

// Configure Puppeteer for Render
const PUPPETEER_OPTIONS = {
  args: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-accelerated-2d-canvas',
    '--disable-gpu',
    '--window-size=1920x1080',
    '--disable-web-security',
    '--disable-features=IsolateOrigins,site-per-process',
    '--disable-site-isolation-trials',
    '--single-process',
    '--no-zygote',
    '--no-first-run',
    '--disable-extensions',
    '--disable-software-rasterizer',
    '--disable-features=TranslateUI',
    '--disable-features=BlinkGenPropertyTrees'
  ],
  headless: 'new',
  executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || process.env.CHROME_PATH || '/usr/bin/google-chrome',
  ignoreHTTPSErrors: true,
  defaultViewport: {
    width: 1920,
    height: 1080
  }
};

// Log environment variables
console.log('[SCRAPING] Environment variables:');
console.log(`[SCRAPING] PUPPETEER_EXECUTABLE_PATH: ${process.env.PUPPETEER_EXECUTABLE_PATH}`);
console.log(`[SCRAPING] CHROME_PATH: ${process.env.CHROME_PATH}`);
console.log(`[SCRAPING] PUPPETEER_CACHE_DIR: ${process.env.PUPPETEER_CACHE_DIR}`);
console.log(`[SCRAPING] PUPPETEER_PRODUCT: ${process.env.PUPPETEER_PRODUCT}`);

// Verify Chrome installation
const verifyChromeInstallation = async () => {
  try {
    console.log('[SCRAPING] Starting Chrome verification...');
    console.log('[SCRAPING] Chrome path:', PUPPETEER_OPTIONS.executablePath);
    
    // Check if Chrome exists
    if (!fs.existsSync(PUPPETEER_OPTIONS.executablePath)) {
      console.error('[SCRAPING] Chrome executable not found at:', PUPPETEER_OPTIONS.executablePath);
      console.log('[SCRAPING] Checking alternative locations...');
      
      const possiblePaths = [
        '/usr/bin/google-chrome',
        '/usr/bin/google-chrome-stable',
        '/opt/google/chrome/chrome',
        '/opt/google/chrome/google-chrome',
        '/opt/render/.cache/puppeteer/chrome/chrome'
      ];
      
      for (const path of possiblePaths) {
        console.log(`[SCRAPING] Checking ${path}...`);
        if (fs.existsSync(path)) {
          console.log(`[SCRAPING] Found Chrome at ${path}`);
          PUPPETEER_OPTIONS.executablePath = path;
          break;
        }
      }
      
      if (!fs.existsSync(PUPPETEER_OPTIONS.executablePath)) {
        console.error('[SCRAPING] Chrome not found in any standard location');
        return false;
      }
    }
    
    console.log('[SCRAPING] Chrome executable found, checking permissions...');
    const stats = fs.statSync(PUPPETEER_OPTIONS.executablePath);
    console.log(`[SCRAPING] Chrome permissions: ${stats.mode.toString(8)}`);
    
    // Try to get Chrome version
    try {
      const { execSync } = require('child_process');
      const version = execSync(`${PUPPETEER_OPTIONS.executablePath} --version`).toString();
      console.log('[SCRAPING] Chrome version from command:', version);
    } catch (error) {
      console.error('[SCRAPING] Error getting Chrome version:', error.message);
    }
    
    console.log('[SCRAPING] Attempting to launch Chrome...');
    const browser = await puppeteer.launch(PUPPETEER_OPTIONS);
    const version = await browser.version();
    console.log('[SCRAPING] Chrome version from Puppeteer:', version);
    
    console.log('[SCRAPING] Testing Chrome functionality...');
    const page = await browser.newPage();
    await page.goto('about:blank');
    console.log('[SCRAPING] Chrome page load successful');
    
    await page.close();
    await browser.close();
    console.log('[SCRAPING] Chrome installation verified successfully');
    return true;
  } catch (error) {
    console.error('[SCRAPING] Chrome verification failed:', error.message);
    console.error('[SCRAPING] Error stack:', error.stack);
    return false;
  }
};

// Initialize Chrome verification
verifyChromeInstallation().catch(error => {
  console.error('[SCRAPING] Chrome verification failed with error:', error);
});

const getSearchResults = async (query, location) => {
  try {
    const apiKey = process.env.GOOGLE_CUSTOM_SEARCH_API_KEY;
    const cx = process.env.GOOGLE_CUSTOM_SEARCH_ENGINE_ID;

    if (!apiKey || !cx) {
      console.error('[SCRAPING] Missing Google API configuration');
      return [];
    }

    console.log(`[SCRAPING] Searching Google for query="${query}" location="${location}"`);

    const response = await axios.get('https://www.googleapis.com/customsearch/v1', {
      params: {
        key: apiKey,
        cx: cx,
        q: query,
        gl: location,
        num: 5,
      },
      timeout: 10000
    });

    const items = response.data.items || [];
    console.log(`[SCRAPING] Found ${items.length} search results.`);
    return items;
  } catch (error) {
    console.error('[SCRAPING] Error fetching search results:', error.message);
    return [];
  }
};

const getArticleContent = async (url) => {
  let browser;
  let page;
  try {
    console.log(`[SCRAPING] Fetching content from URL: ${url}`);

    browser = await puppeteer.launch(PUPPETEER_OPTIONS);
    page = await browser.newPage();
    
    // Set default timeout
    page.setDefaultTimeout(30000);
    
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
    
    // Add request interception to block unnecessary resources
    await page.setRequestInterception(true);
    page.on('request', (request) => {
      if (['image', 'stylesheet', 'font', 'media'].includes(request.resourceType())) {
        request.abort();
      } else {
        request.continue();
      }
    });
    
    // Add timeout and retry logic
    let retries = 3;
    let content = '';
    
    while (retries > 0) {
      try {
        await page.goto(url, { 
          waitUntil: 'networkidle0',
          timeout: 30000 
        });
        
        content = await page.evaluate(() => {
          // Remove unwanted elements
          const elementsToRemove = document.querySelectorAll('script, style, nav, header, footer, iframe, #cookie-banner, .advertisement, .ads, .social-share');
          elementsToRemove.forEach(el => el.remove());
          
          // Get the main content
          const mainContent = document.querySelector('main, article, .content, #content, [role="main"]') || document.body;
          return mainContent.innerText || '';
        });
        
        if (content && content.trim().length > 0) {
          break;
        }
        
        throw new Error('No content found');
      } catch (error) {
        retries--;
        if (retries === 0) {
          console.error(`[SCRAPING] Failed to fetch content after all retries for ${url}:`, error.message);
          return '';
        }
        console.log(`[SCRAPING] Retry ${3 - retries} for ${url}`);
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    console.log(`[SCRAPING] Extracted content length for ${url}: ${content.length}`);
    return content.substring(0, 10000); // Limit to first 10,000 characters

  } catch (error) {
    console.error(`[SCRAPING] Error fetching content from ${url}:`, error.message);
    return '';
  } finally {
    if (page) await page.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
  }
};

const getFullContent = async (query, location) => {
  try {
    const searchResults = await getSearchResults(query, location);
    
    if (!searchResults.length) {
      console.log('[SCRAPING] No search results found');
      return [];
    }

    const articles = await Promise.all(
      searchResults.map(async result => {
        try {
          return {
            title: result.title,
            link: result.link,
            content: await getArticleContent(result.link),
          };
        } catch (error) {
          console.error(`[SCRAPING] Error processing article ${result.link}:`, error.message);
          return null;
        }
      })
    );

    return articles
      .filter(article => article && article.content && article.content.trim().length > 0);
      
  } catch (error) {
    console.error('[SCRAPING] Error in getFullContent:', error.message);
    return [];
  }
};

module.exports = { getFullContent };
