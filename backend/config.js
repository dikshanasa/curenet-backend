// Configuration for the application
module.exports = {
  // Google API keys
  GOOGLE_API_KEY: process.env.GOOGLE_CUSTOM_SEARCH_API_KEY,
  GOOGLE_CSE_ID: process.env.GOOGLE_CUSTOM_SEARCH_ENGINE_ID,
  
  // Server configuration
  PORT: process.env.PORT || 10000,
  
  // Puppeteer configuration
  PUPPETEER_EXECUTABLE_PATH: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/google-chrome',
  
  // Rate limiting
  RATE_LIMIT_REQUESTS_PER_MINUTE: 15,
  
  // Cache settings
  CACHE_TTL: 3600000, // 1 hour in milliseconds
  
  // Model settings
  MODEL_NAME: "gemini-2.0-flash",
  MAX_OUTPUT_TOKENS: 2048,
  TEMPERATURE: 0.3,
  
  // Safety settings
  SAFETY_SETTINGS: [
    {
      category: "HARM_CATEGORY_DANGEROUS_CONTENT",
      threshold: "BLOCK_NONE"
    }
  ]
}; 