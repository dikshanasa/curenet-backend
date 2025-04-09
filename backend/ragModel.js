// Add logging configuration at the top
const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3
};

const CURRENT_LOG_LEVEL = LOG_LEVELS.DEBUG; // Set to DEBUG for maximum visibility

function log(level, message, data = null) {
  if (level >= CURRENT_LOG_LEVEL) {
    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [RAG]`;
    console.log(`${prefix} ${message}`);
    if (data) {
      console.log(`${prefix} Data:`, JSON.stringify(data, null, 2));
    }
  }
}

async function preprocessText(text) {
  log(LOG_LEVELS.INFO, 'Starting text preprocessing');
  const startTime = Date.now();
  
  if (!text) {
    log(LOG_LEVELS.WARN, 'Empty text input for preprocessing');
    return '';
  }

  // ... existing preprocessing code ...

  const endTime = Date.now();
  log(LOG_LEVELS.INFO, 'Text preprocessing completed', {
    duration: `${endTime - startTime}ms`,
    originalLength: text.length,
    processedLength: cleanedText.length,
    removedCharacters: text.length - cleanedText.length
  });

  return cleanedText;
}

function chunkText(text, maxLength = 1000) {
  log(LOG_LEVELS.INFO, 'Starting text chunking');
  const startTime = Date.now();
  
  if (!text) {
    log(LOG_LEVELS.WARN, 'Empty text input for chunking');
    return [];
  }

  // ... existing chunking code ...

  const endTime = Date.now();
  log(LOG_LEVELS.INFO, 'Text chunking completed', {
    duration: `${endTime - startTime}ms`,
    totalChunks: chunks.length,
    averageChunkSize: chunks.reduce((sum, chunk) => sum + chunk.length, 0) / chunks.length,
    chunkSizes: chunks.map(chunk => chunk.length)
  });

  return chunks;
}

async function processBatch(chunks, queryEmbedding, startIndex, batchSize) {
  log(LOG_LEVELS.INFO, 'Processing batch', {
    batchNumber: Math.floor(startIndex / batchSize) + 1,
    startIndex,
    batchSize,
    totalChunks: chunks.length
  });
  
  const startTime = Date.now();
  
  // ... existing batch processing code ...

  const endTime = Date.now();
  log(LOG_LEVELS.INFO, 'Batch processing completed', {
    duration: `${endTime - startTime}ms`,
    processedChunks: batchChunks.length,
    averageScore: scores.reduce((sum, score) => sum + score.score, 0) / scores.length
  });

  return scores;
}

async function scoreChunksByQuery(chunks, query) {
  log(LOG_LEVELS.INFO, 'Starting chunk scoring', {
    totalChunks: chunks.length,
    queryLength: query.length
  });
  
  const startTime = Date.now();
  
  // ... existing scoring code ...

  const endTime = Date.now();
  log(LOG_LEVELS.INFO, 'Chunk scoring completed', {
    duration: `${endTime - startTime}ms`,
    totalChunks: chunks.length,
    topScores: scoredChunks.slice(0, 5).map(chunk => ({
      score: chunk.score,
      chunkLength: chunk.chunk.length
    }))
  });

  return scoredChunks;
}

async function summarizeTopChunks(scoredChunks, topN = 10) {
  log(LOG_LEVELS.INFO, 'Starting summary generation', {
    totalChunks: scoredChunks.length,
    topN
  });
  
  const startTime = Date.now();
  
  // ... existing summary generation code ...

  const endTime = Date.now();
  log(LOG_LEVELS.INFO, 'Summary generation completed', {
    duration: `${endTime - startTime}ms`,
    generatedSummaries: summaries.length,
    averageSummaryLength: summaries.reduce((sum, summary) => sum + summary.length, 0) / summaries.length
  });

  return summaries;
}

async function calculateConfidence(query, megaChunk, answer) {
  log(LOG_LEVELS.INFO, 'Calculating confidence score');
  const startTime = Date.now();
  
  // ... existing confidence calculation code ...

  const endTime = Date.now();
  log(LOG_LEVELS.INFO, 'Confidence calculation completed', {
    duration: `${endTime - startTime}ms`,
    queryLength: query.length,
    megaChunkLength: megaChunk.length,
    answerLength: answer.length,
    confidenceScore: confidence
  });

  return confidence;
}

async function getModelResponse(question, fullContext) {
  log(LOG_LEVELS.INFO, 'Starting model response generation', {
    questionLength: question.length,
    contextLength: fullContext.length
  });
  
  const startTime = Date.now();
  
  try {
    // ... existing response generation code ...

    const endTime = Date.now();
    log(LOG_LEVELS.INFO, 'Model response generation completed', {
      duration: `${endTime - startTime}ms`,
      totalProcessingTime: `${endTime - startTime}ms`,
      confidenceScore: confidence,
      usedFullContext: !isRelevant,
      contextLength: contextToUse.length
    });

    return {
      question,
      answer,
      confidence,
      metadata: {
        processingTime: new Date().getTime(),
        usedFullContext: !isRelevant,
        contextLength: contextToUse.length,
        confidenceScore: confidence,
        relevanceCheck: isRelevant,
      },
      usedFullContext: !isRelevant
    };
  } catch (error) {
    log(LOG_LEVELS.ERROR, 'Error in model response generation', {
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
} 