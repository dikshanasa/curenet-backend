const natural = require('natural');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const tf = require('@tensorflow/tfjs-node');
const use = require('@tensorflow-models/universal-sentence-encoder');

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);

// Safety settings for medical content
const SAFETY_SETTINGS = [
  {
    category: "HARM_CATEGORY_DANGEROUS_CONTENT",
    threshold: "BLOCK_NONE"
  }
];


// Generation config for consistent outputs
const GENERATION_CONFIG = {
  temperature: 0.3,
  topK: 1,
  topP: 1,
  maxOutputTokens: 2048,
};

// Initialize TensorFlow.js with Node backend
tf.setBackend('tensorflow');

// Optimize memory settings for Node.js
tf.ENV.set('CPU_HANDOFF_SIZE_THRESHOLD', 0);
tf.ENV.set('WEBGL_CPU_FORWARD', true);

// Enhanced caching with TTL
const embeddingCache = new Map();
const CACHE_TTL = 3600000; // 1 hour

let sentenceEncoder = null;
async function loadModel() {
  if (sentenceEncoder) return;

  try {
    sentenceEncoder = await use.load();
    console.log('[RAGMODEL] Universal Sentence Encoder model loaded successfully');
  } catch (error) {
    console.error('[RAGMODEL] Error loading Universal Sentence Encoder:', error);
    throw new Error('Failed to load Universal Sentence Encoder model');
  }
}

// Initialize model on startup
loadModel();

// Enhanced conversation context tracking
const conversationContext = {
  currentTopic: null,
  lastQuery: null,
  topicConfidence: 0,
  contextWindow: 5,
  messageHistory: [],
  topicKeywords: new Set() // Track keywords related to the current topic
};

// Function to extract main topic from text
function extractMainTopic(text) {
  // Medical-specific stop words
  const stopWords = new Set([
    'what', 'are', 'the', 'symptoms', 'of', 'treatment', 'for', 'how', 'to',
    'diagnose', 'cure', 'prevent', 'manage', 'handle', 'deal', 'with', 'latest',
    'research', 'researches', 'medications', 'drugs', 'therapy', 'therapies'
  ]);
  
  // Split text into words and clean
  const words = text.toLowerCase()
    .replace(/[^\w\s]/g, '')
    .split(/\s+/)
    .filter(word => !stopWords.has(word) && word.length > 2);
  
  // Count word frequencies
  const wordFreq = {};
  words.forEach(word => {
    wordFreq[word] = (wordFreq[word] || 0) + 1;
  });
  
  // Find most frequent word that's not a stop word
  let maxFreq = 0;
  let mainTopic = null;
  
  for (const [word, freq] of Object.entries(wordFreq)) {
    if (freq > maxFreq) {
      maxFreq = freq;
      mainTopic = word;
    }
  }
  
  return mainTopic;
}

// Function to update conversation context
function updateConversationContext(query) {
  // Extract potential topic from current query
  const potentialTopic = extractMainTopic(query);
  
  // If we have a previous topic, check if the new query is related
  if (conversationContext.currentTopic) {
    const queryWords = new Set(query.toLowerCase().split(/\s+/));
    const topicWords = new Set(conversationContext.currentTopic.toLowerCase().split(/\s+/));
    
    // Calculate overlap between query and current topic
    const overlap = [...queryWords].filter(word => topicWords.has(word)).length;
    const topicConfidence = overlap / Math.max(queryWords.size, topicWords.size);
    
    // Update context if confidence is high enough or if the query contains topic keywords
    if (topicConfidence > 0.3 || [...queryWords].some(word => conversationContext.topicKeywords.has(word))) {
      conversationContext.topicConfidence = topicConfidence;
      console.log(`[RAGMODEL] Maintaining context: ${conversationContext.currentTopic}`);
      return conversationContext.currentTopic;
    }
  }
  
  // If no strong connection to current topic, update with new topic
  conversationContext.currentTopic = potentialTopic;
  conversationContext.lastQuery = query;
  conversationContext.topicConfidence = 0.8;
  
  // Update topic keywords
  const queryWords = new Set(query.toLowerCase().split(/\s+/));
  conversationContext.topicKeywords = new Set([...queryWords].filter(word => word.length > 2));
  
  conversationContext.messageHistory.push({
    query,
    topic: potentialTopic,
    timestamp: Date.now()
  });
  
  // Keep only recent messages in history
  if (conversationContext.messageHistory.length > conversationContext.contextWindow) {
    conversationContext.messageHistory.shift();
  }
  
  console.log(`[RAGMODEL] New context topic: ${potentialTopic}`);
  return potentialTopic;
}

// Function to enhance query with context
function enhanceQueryWithContext(query) {
  const currentTopic = updateConversationContext(query);
  
  if (currentTopic && conversationContext.topicConfidence > 0.3) {
    console.log(`[RAGMODEL] Using conversation context: ${currentTopic} (confidence: ${conversationContext.topicConfidence.toFixed(2)})`);
    
    // Always include the current topic in the search query
    const topicWords = currentTopic.toLowerCase().split(/\s+/);
    const queryWords = query.toLowerCase().split(/\s+/);
    
    // Check if the topic is already in the query
    const hasTopic = topicWords.some(word => queryWords.includes(word));
    
    if (!hasTopic) {
      // Add the topic to the query
      return `${query} about ${currentTopic}`;
    }
  }
  
  return query;
}

function preprocessText(text) {
  if (!text || typeof text !== 'string') {
    console.warn('[RAGMODEL] Invalid text input for preprocessing');
    return '';
  }

  console.log('[RAGMODEL] Preprocessing text...');
  
  // First, remove HTML tags and decode HTML entities
  let cleanedText = text
    .replace(/<[^>]*>/g, ' ') // Remove HTML tags
    .replace(/&nbsp;/g, ' ') // Replace non-breaking spaces
    .replace(/&[^;]+;/g, ' ') // Replace other HTML entities
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();

  // Remove navigation, menus, and other common web elements
  cleanedText = cleanedText
    .replace(/Navigation[\s\S]*?(Menu|Search)/gi, '')
    .replace(/\b(Privacy Policy|Terms & Conditions|Legal|Contact Us|About Us|Advertisements)\b/gi, '')
    .replace(/\b(Copyright|All Rights Reserved|©)\b/gi, '')
    .replace(/\b(Home|Back|Next|Previous|Close|Menu|Search|Login|Sign Up)\b/gi, '')
    .replace(/\[.*?\]/g, '') // Remove text in square brackets
    .replace(/\(.*?\)/g, '') // Remove text in parentheses
    .replace(/\s+/g, ' ') // Normalize whitespace again
    .trim();

  // Remove special characters but keep basic punctuation and medical terms
  cleanedText = cleanedText
    .replace(/[^\w\s.,!?\-()/]/g, '') // Keep basic punctuation and medical terms
    .replace(/\s+/g, ' ') // Final whitespace normalization
    .trim();

  // Remove any remaining HTML-like content
  cleanedText = cleanedText
    .replace(/DOCTYPE|html|head|body|meta|link|script|style|div|span|class|id|src|href|alt|title/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

  console.log(`[RAGMODEL] Preprocessed text length: ${cleanedText.length}`);
  if (cleanedText.length > 200) {
    console.log(`[RAGMODEL] First 200 characters: ${cleanedText.substring(0, 200)}...`);
  }
  
  return cleanedText;
}

function chunkText(text, maxLength = 3000) {
  if (!text) return [];
  
  console.log('[RAGMODEL] Chunking content...');
  const chunks = [];
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [];
  let currentChunk = '';
  const minChunkSize = 500; // Minimum chunk size to ensure meaningful content

  for (const sentence of sentences) {
    if ((currentChunk.length + sentence.length) <= maxLength) {
      currentChunk += sentence + ' ';
    } else {
      if (currentChunk.length >= minChunkSize) {
        chunks.push(currentChunk.trim());
        currentChunk = sentence + ' ';
      } else {
        // If current chunk is too small, try to add more sentences
        currentChunk += sentence + ' ';
      }
    }
  }

  // Add the last chunk if it meets minimum size
  if (currentChunk.trim().length >= minChunkSize) {
    chunks.push(currentChunk.trim());
  } else if (chunks.length > 0) {
    // If last chunk is too small, append it to the last chunk
    chunks[chunks.length - 1] += ' ' + currentChunk.trim();
  } else if (currentChunk.trim()) {
    // If it's the only chunk, keep it regardless of size
    chunks.push(currentChunk.trim());
  }

  console.log(`[RAGMODEL] Created ${chunks.length} chunks`);
  chunks.forEach((chunk, index) => {
    console.log(`[RAGMODEL] Chunk ${index + 1} length: ${chunk.length} chars`);
  });

  return chunks;
}

// Function to generate content with Gemini
async function generateContent(prompt) {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
    const result = await model.generateContent({
      contents: [{ parts: [{ text: prompt }]}],
      generationConfig: GENERATION_CONFIG,
      safetySettings: SAFETY_SETTINGS
    });
    return result;
  } catch (error) {
    console.error('[RAGMODEL] Error generating content:', error);
    throw error;
  }
}

// Rate limiting for Gemini API
const RATE_LIMIT = {
  requestsPerMinute: 15,
  lastRequestTime: 0,
  requestQueue: []
};

async function rateLimitedGenerateContent(prompt) {
  const now = Date.now();
  const timeSinceLastRequest = now - RATE_LIMIT.lastRequestTime;
  
  if (timeSinceLastRequest < 60000 / RATE_LIMIT.requestsPerMinute) {
    // Queue the request
    return new Promise((resolve) => {
      RATE_LIMIT.requestQueue.push(() => {
        setTimeout(async () => {
          const result = await generateContent(prompt);
          resolve(result);
        }, 60000 / RATE_LIMIT.requestsPerMinute);
      });
    });
  }
  
  RATE_LIMIT.lastRequestTime = now;
  return generateContent(prompt);
}

// Optimized batch processing
async function processBatch(chunks, queryEmbedding, startIndex, batchSize, currentQuery) {
  const endIndex = Math.min(startIndex + batchSize, chunks.length);
  const batchChunks = chunks.slice(startIndex, endIndex);
  
  if (!sentenceEncoder) {
    await loadModel();
  }
  
  // Get embeddings for batch
  const embeddings = await sentenceEncoder.embed(batchChunks);
  
  // Calculate scores in parallel
  const scores = await Promise.all(batchChunks.map(async (chunk, index) => {
    const chunkEmbedding = embeddings.slice([index, 0], [1, -1]);
    const semanticScore = tf.matMul(queryEmbedding, chunkEmbedding.transpose()).dataSync()[0];
    
    // Optimized keyword matching
    const queryWords = new Set(currentQuery.toLowerCase().split(/\W+/).filter(Boolean));
    const chunkWords = new Set(chunk.toLowerCase().split(/\W+/).filter(Boolean));
    const matchingWords = [...queryWords].filter(word => chunkWords.has(word));
    const keywordScore = matchingWords.length / Math.max(queryWords.size, 1);
    
    // Weighted scoring
    return {
      chunk,
      score: (0.7 * semanticScore) + (0.3 * keywordScore)
    };
  }));
  
  return scores;
}

async function scoreChunksByQuery(chunks, query) {
  if (!sentenceEncoder) {
    await loadModel();
  }
  
  console.log(`[RAGMODEL] Starting scoring for ${chunks.length} chunks`);
  
  try {
    // Get query embedding
    const queryEmbedding = await sentenceEncoder.embed([query]);
    
    // Process chunks in batches
    const batchSize = 12;
    const scores = [];
    
    for (let i = 0; i < chunks.length; i += batchSize) {
      const batchScores = await processBatch(chunks, queryEmbedding, i, batchSize, query);
      scores.push(...batchScores);
    }
    
    // Sort by score
    return scores.sort((a, b) => b.score - a.score);
  } catch (error) {
    console.error('[RAGMODEL] Error in chunk scoring:', error);
    console.log('[RAGMODEL] Using fallback scoring method...');
    
    // Fallback to simple keyword matching
    return chunks.map(chunk => {
      const queryWords = new Set(query.toLowerCase().split(/\W+/).filter(Boolean));
      const chunkWords = new Set(chunk.toLowerCase().split(/\W+/).filter(Boolean));
      const matchingWords = [...queryWords].filter(word => chunkWords.has(word));
      return {
        chunk,
        score: matchingWords.length / Math.max(queryWords.size, 1)
      };
    }).sort((a, b) => b.score - a.score);
  }
}

function fallbackScoring(chunks, query) {
  console.log('[RAGMODEL] Using fallback scoring method...');
  const queryWords = query.toLowerCase().split(/\W+/).filter(Boolean);
  
  return chunks.map(chunk => {
    const chunkWords = chunk.toLowerCase().split(/\W+/).filter(Boolean);
    const matchingWords = queryWords.filter(word => chunkWords.includes(word));
    const score = matchingWords.length / queryWords.length;
    return { chunk, score };
  }).sort((a, b) => b.score - a.score);
}

async function summarizeTopChunks(scoredChunks, topN = 10) {
  if (!scoredChunks.length) {
    console.warn('[RAGMODEL] No chunks to summarize');
    return [];
  }

  console.log(`[RAGMODEL] Summarizing top ${topN} chunks...`);
  const topChunks = scoredChunks.slice(0, topN);
  const summaries = [];

  for (const { chunk } of topChunks) {
    try {
      const summary = await generateSummary(chunk);
      if (summary) summaries.push(summary);
    } catch (error) {
      console.error('[RAGMODEL] Error summarizing chunk:', error);
      // Add original chunk as fallback
      summaries.push(chunk);
    }
  }

  return summaries;
}

async function generateSummary(chunk) {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
    const prompt = `Summarize the following medical text in 2-3 sentences, focusing on key information about treatments, symptoms, or medical conditions. Keep the summary concise and factual:\n\n${chunk}`;
    
    const result = await rateLimitedGenerateContent(prompt);
    const response = await result.response;
    return response.text();
  } catch (error) {
    console.error('[RAGMODEL] Error in summary generation:', error);
    // Return a simple summary based on the first few sentences
    return chunk.split('. ').slice(0, 3).join('. ') + '.';
  }
}

async function createMegaChunk(summaries, maxLength = 3000) {
  if (!Array.isArray(summaries) || !summaries.length) {
    console.warn('[RAGMODEL] Invalid summaries input for megachunk creation');
    return '';
  }

  console.log('[RAGMODEL] Creating mega chunk...');
  let megaChunk = '';
  let usedSummaries = 0;

  for (const summary of summaries) {
    if (megaChunk.length + summary.length <= maxLength) {
      megaChunk += summary + ' ';
      usedSummaries++;
    } else {
      break;
    }
  }

  megaChunk = megaChunk.trim();
  console.log(`[RAGMODEL] Mega chunk created:
    Length: ${megaChunk.length} characters
    Summaries used: ${usedSummaries}/${summaries.length}`);

  return megaChunk;
}

async function checkRelevance(query, megaChunk) {
  if (!query || !megaChunk) {
    console.warn('[RAGMODEL] Invalid input for relevance check');
    return false;
  }

  console.log('[RAGMODEL] Checking megachunk relevance...');
  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

  const prompt = `Analyze if this medical context contains relevant information to answer the query.
Consider both direct and indirect relevant information.
Reply with ONLY 'YES' or 'NO'.

Context: ${megaChunk}

Query: ${query}

Contains relevant information (YES/NO):`;

  try {
    const result = await model.generateContent({
      contents: [{ parts: [{ text: prompt }]}],
      generationConfig: {
        ...GENERATION_CONFIG,
        temperature: 0.1,
        maxOutputTokens: 1,
      },
      safetySettings: SAFETY_SETTINGS
    });

    const response = await result.response;
    const answer = response.text().trim().toUpperCase();
    console.log(`[RAGMODEL] Relevance check result: ${answer}`);
    return answer === 'YES';
  } catch (error) {
    console.error('[RAGMODEL] Error checking relevance:', error);
    return false;
  }
}

async function calculateConfidence(query, megaChunk, answer) {
  if (!sentenceEncoder) {
    await loadModel();
  }

  try {
    // Get embeddings for query, mega chunk, and answer
    const [queryEmbedding, chunkEmbedding, answerEmbedding] = await Promise.all([
      sentenceEncoder.embed([query]),
      sentenceEncoder.embed([megaChunk]),
      sentenceEncoder.embed([answer])
    ]);

    // Calculate semantic similarities
    const queryChunkSimilarity = tf.matMul(queryEmbedding, chunkEmbedding.transpose()).dataSync()[0];
    const queryAnswerSimilarity = tf.matMul(queryEmbedding, answerEmbedding.transpose()).dataSync()[0];
    const chunkAnswerSimilarity = tf.matMul(chunkEmbedding, answerEmbedding.transpose()).dataSync()[0];

    // Calculate weighted average of similarities
    const confidence = (0.4 * queryChunkSimilarity) + (0.4 * queryAnswerSimilarity) + (0.2 * chunkAnswerSimilarity);

    console.log(`[RAGMODEL] Confidence components:
      Query-Chunk similarity: ${queryChunkSimilarity.toFixed(3)}
      Query-Answer similarity: ${queryAnswerSimilarity.toFixed(3)}
      Chunk-Answer similarity: ${chunkAnswerSimilarity.toFixed(3)}
      Final confidence: ${confidence.toFixed(3)}`);

    return confidence;
  } catch (error) {
    console.error('[RAGMODEL] Error calculating confidence:', error);
    return 0.5; // Return neutral confidence on error
  }
}

async function generateAnswer(query, context, isFullContext = false) {
  if (!query || !context) {
    console.error('[RAGMODEL] Missing query or context for answer generation');
    throw new Error('Invalid input for answer generation');
  }

  console.log(`[RAGMODEL] Generating AI answer using ${isFullContext ? 'full context' : 'megachunk'}`);
  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

  const prompt = `As a medical information assistant, provide a comprehensive and accurate answer to the query based on the following context. 
Focus on medical facts and include any relevant details about symptoms, causes, diagnosis, or treatment if available.

Context: ${context}

Query: ${query}

Provide a clear, structured answer that directly addresses the query. Include only information that can be supported by the given context.

Answer:`;

  try {
    const result = await model.generateContent({
      contents: [{ parts: [{ text: prompt }]}],
      generationConfig: {
        ...GENERATION_CONFIG,
        temperature: 0.3,
        maxOutputTokens: 1024,
      },
      safetySettings: SAFETY_SETTINGS
    });

    const response = await result.response;
    const answer = response.text();
    console.log(`[RAGMODEL] Generated answer length: ${answer.length} characters`);
    return answer;
  } catch (error) {
    console.error('[RAGMODEL] Error generating answer:', error);
    throw new Error('Failed to generate answer');
  }
}

const getModelResponse = async (question, fullContext) => {
  try {
    console.log('\n[RAGMODEL] Starting new query processing...');
    console.log(`[RAGMODEL] Question: ${question}`);
    console.log(`[RAGMODEL] Context length: ${fullContext.length} characters`);

    // Input validation
    if (!question || !fullContext) {
      throw new Error('Invalid input: Question and context are required');
    }

    // Process and chunk the context
    const cleanedContext = preprocessText(fullContext);
    const chunks = chunkText(cleanedContext);
    
    // Score and rank chunks
    const scoredChunks = await scoreChunksByQuery(chunks, question);
    
    // Generate summaries and create megachunk
    const summaries = await summarizeTopChunks(scoredChunks);
    const megaChunk = await createMegaChunk(summaries);
    
    // Check relevance and generate answer
    const isRelevant = await checkRelevance(question, megaChunk);
    const contextToUse = isRelevant ? megaChunk : fullContext;
    
    console.log(`[RAGMODEL] Using ${isRelevant ? 'megachunk' : 'full context'} for answer generation`);
    
    const answer = await generateAnswer(question, contextToUse, !isRelevant);
    const confidence = await calculateConfidence(question, megaChunk, answer);

    // Prepare response metadata
    const metadata = {
      processingTime: new Date().getTime(),
      usedFullContext: !isRelevant,
      contextLength: contextToUse.length,
      confidenceScore: confidence,
      relevanceCheck: isRelevant,
    };

    console.log('[RAGMODEL] Response generated successfully');
    console.log('[RAGMODEL] Metadata:', metadata);

    return {
      question,
      answer,
      confidence,
      metadata,
      usedFullContext: !isRelevant
    };

  } catch (error) {
    console.error('[RAGMODEL] Error in pipeline:', error);
    throw new Error(`Failed to process query: ${error.message}`);
  }
};

// Export the main function and utility functions for testing
module.exports = getModelResponse;
