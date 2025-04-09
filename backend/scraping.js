const axios = require('axios');
const puppeteer = require('puppeteer');
const { GOOGLE_API_KEY, GOOGLE_CSE_ID } = require('./utils/config');

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
    '--disable-site-isolation-trials'
  ],
  headless: 'new',
  executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome',
  ignoreHTTPSErrors: true,
  defaultViewport: {
    width: 1920,
    height: 1080
  }
};

// Verify Chrome installation
const verifyChromeInstallation = async () => {
  try {
    const browser = await puppeteer.launch(PUPPETEER_OPTIONS);
    await browser.close();
    console.log('[SCRAPING] Chrome installation verified successfully');
    return true;
  } catch (error) {
    console.error('[SCRAPING] Chrome verification failed:', error.message);
    return false;
  }
};

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
