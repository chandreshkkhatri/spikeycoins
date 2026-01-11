/**
 * AI Client Utility
 * Provides a unified interface for Gemini models
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import logger from "./logger";

export interface CompletionOptions {
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  useWebSearch?: boolean;
}

export class AIClient {
  private geminiClient: GoogleGenerativeAI;
  private model: string;

  constructor(model?: string) {
    this.model = model || process.env.AI_MODEL || "gemini-2.5-flash";

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY environment variable is required");
    }
    this.geminiClient = new GoogleGenerativeAI(apiKey);

    logger.info(`AIClient initialized with model: ${this.model}`);
  }

  getModel(): string {
    return this.model;
  }

  /**
   * Generate a completion with the configured Gemini model
   */
  async generateCompletion(prompt: string, options?: CompletionOptions): Promise<string> {
    try {
      const modelConfig: any = {
        model: this.model,
        generationConfig: {
          temperature: options?.temperature,
          maxOutputTokens: options?.maxTokens,
        },
      };

      if (options?.useWebSearch) {
        modelConfig.tools = [{ googleSearch: {} }];
      }

      if (options?.systemPrompt) {
        modelConfig.systemInstruction = options.systemPrompt;
      }

      const model = this.geminiClient.getGenerativeModel(modelConfig);
      const result = await model.generateContent(prompt);

      // Check if response has content
      if (!result || !result.response) {
        throw new Error("No response from Gemini - empty response object");
      }

      let text: string;
      try {
        text = result.response.text();
      } catch (textError) {
        const textErrorMessage = textError instanceof Error ? textError.message : String(textError);
        logger.error(`AIClient: Error extracting text from response - ${textErrorMessage}`);
        throw new Error(`No response from Gemini - cannot extract text: ${textErrorMessage}`);
      }

      if (!text || text.trim().length === 0) {
        logger.warn("AIClient: Empty text response from Gemini");
        throw new Error("No response from Gemini - empty text");
      }

      return text;
    } catch (error: any) {
      // Format Gemini API errors for better error handling
      const errorMessage = error?.message || String(error);
      const statusCode = error?.status || error?.response?.status;

      // Check for quota/rate limit errors from Gemini API
      if (statusCode === 429 || errorMessage.includes('quota') || errorMessage.includes('Quota exceeded') || errorMessage.includes('429')) {
        logger.error(`AIClient: Gemini API quota exceeded - ${errorMessage}`);
        throw new Error(`Gemini API quota exceeded: ${errorMessage}`);
      }

      // Re-throw other errors
      logger.error(`AIClient: Error generating completion - ${errorMessage}`);
      throw error;
    }
  }
}

export default AIClient;
