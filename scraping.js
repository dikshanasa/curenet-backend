const axios = require('axios');
const puppeteer = require('puppeteer-core');
const NodeCache = require('node-cache');
const config = require('./config');

// Initialize cache with 1 hour TTL
const searchCache = new NodeCache({ stdTTL: config.CACHE_TTL });
const contentCache = new NodeCache({ stdTTL: config.CACHE_TTL });

// Configure Puppeteer to use the correct Chrome version
const PUPPETEER_CONFIG = {
  executablePath: config.PUPPETEER_EXECUTABLE_PATH,
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
  headless: true
};

async function fetchContentWithPuppeteer(url) {
  try {
    const browser = await puppeteer.launch(PUPPETEER_CONFIG);
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });
    
    const content = await page.evaluate(() => {
      // Remove script and style elements
      const elements = document.querySelectorAll('script, style, iframe, noscript');
      elements.forEach(el => el.remove());
      
      // Get main content
      const mainContent = document.querySelector('main, article, .content, #content') || document.body;
      return mainContent.innerText.trim();
    });
    
    await browser.close();
    return content;
  } catch (error) {
    console.error(`[SCRAPING] Error fetching content with Puppeteer: ${error.message}`);
    return null;
  }
}

async function getSearchResults(query, location) {
  try {
    const cacheKey = `${query}-${location}`;
    const cachedResults = searchCache.get(cacheKey);
    if (cachedResults) {
      console.log(`[SCRAPING] Using cached search results for query="${query}"`);
      return cachedResults;
    }

    if (!config.GOOGLE_API_KEY || !config.GOOGLE_CSE_ID) {
      console.error('[SCRAPING] Missing Google API configuration. Please check your environment variables.');
      return [];
    }

    console.log(`[SCRAPING] Searching Google for query="${query}" location="${location}"`);
    
    const response = await axios.get('https://www.googleapis.com/customsearch/v1', {
      params: {
        key: config.GOOGLE_API_KEY,
        cx: config.GOOGLE_CSE_ID,
        q: query,
        gl: location,
        num: 5,
        safe: 'active'
      },
      headers: {
        'Accept': 'application/json'
      }
    });

    if (!response.data || !response.data.items) {
      console.log('[SCRAPING] No search results found in response');
      return [];
    }

    const results = response.data.items;
    console.log(`[SCRAPING] Found ${results.length} search results`);
    
    if (results.length > 0) {
      searchCache.set(cacheKey, results);
    }
    
    return results;
  } catch (error) {
    if (error.response) {
      // The request was made and the server responded with a status code
      // that falls out of the range of 2xx
      console.error('[SCRAPING] Error response from Google API:', {
        status: error.response.status,
        statusText: error.response.statusText,
        data: error.response.data
      });
      
      if (error.response.status === 403) {
        console.error('[SCRAPING] API key might be invalid or API not enabled. Please check:');
        console.error('1. The API key is correct');
        console.error('2. The Custom Search API is enabled in your Google Cloud Console');
        console.error('3. The API key has the necessary permissions');
      }
    } else if (error.request) {
      // The request was made but no response was received
      console.error('[SCRAPING] No response received from Google API:', error.request);
    } else {
      // Something happened in setting up the request that triggered an Error
      console.error('[SCRAPING] Error setting up Google API request:', error.message);
    }
    return [];
  }
}

async function getArticleContent(url) {
  try {
    const cacheKey = `content:${url}`;
    const cachedContent = contentCache.get(cacheKey);
    if (cachedContent) {
      console.log(`[SCRAPING] Using cached content for ${url}`);
      return cachedContent;
    }

    // Try axios first
    try {
      const response = await axios.get(url, { timeout: 5000 });
      const content = response.data;
      if (content && content.length > 0) {
        console.log(`[SCRAPING] Successfully extracted ${content.length} characters from ${url} using axios`);
        contentCache.set(cacheKey, content);
        return content;
      }
    } catch (error) {
      console.log(`[SCRAPING] Falling back to Puppeteer for ${url}`);
    }

    // Fallback to Puppeteer
    const content = await fetchContentWithPuppeteer(url);
    if (content) {
      console.log(`[SCRAPING] Successfully extracted ${content.length} characters from ${url} using Puppeteer`);
      contentCache.set(cacheKey, content);
      return content;
    }

    console.log(`[SCRAPING] Article had no content or failed to process`);
    return null;
  } catch (error) {
    console.error(`[SCRAPING] Error fetching content from ${url}:`, error.message);
    return null;
  }
}

async function getFullContent(query, location) {
  try {
    const startTime = Date.now();
    console.log(`[SCRAPING] Starting content extraction for query: ${query}`);
    const searchResults = await getSearchResults(query, location);
    
    if (!searchResults.length) {
      console.log('[SCRAPING] No search results found');
      return [];
    }

    const articles = [];
    for (let i = 0; i < Math.min(searchResults.length, 3); i++) {
      const result = searchResults[i];
      console.log(`[SCRAPING] Processing article ${i + 1}/${Math.min(searchResults.length, 3)}: ${result.title}`);
      
      const content = await getArticleContent(result.link);
      if (content) {
        articles.push({
          title: result.title,
          link: result.link,
          content
        });
        console.log(`[SCRAPING] Article processed successfully in ${Date.now() - startTime}ms`);
      }
    }

    console.log(`[SCRAPING] Successfully scraped ${articles.length} articles in ${Date.now() - startTime}ms`);
    return articles;
  } catch (error) {
    console.error('[SCRAPING] Error in getFullContent:', error.message);
    return [];
  }
}

module.exports = { getFullContent };
