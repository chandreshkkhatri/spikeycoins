/**
 * AI Client Utility
 * Provides a unified interface for Gemini models
 */

import { GoogleGenAI, type GenerateContentConfig } from "@google/genai";
import logger from "./logger";
import type { ResearchEvidence } from "../services/researchPublication";

export interface CompletionOptions {
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  useWebSearch?: boolean;
}

export class AIClient {
  private geminiClient: GoogleGenAI;
  private model: string;

  constructor(model?: string) {
    this.model = model || process.env.AI_MODEL || "gemini-2.5-flash";

    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY environment variable is required");
    }
    this.geminiClient = new GoogleGenAI({ apiKey });

    logger.info(`AIClient initialized with model: ${this.model}`);
  }

  getModel(): string {
    return this.model;
  }

  /**
   * Generate a completion with the configured Gemini model
   */
  async generateCompletion(prompt: string, options?: CompletionOptions): Promise<string> {
    return (await this.generateWithEvidence(prompt, options)).text;
  }

  async generateWithEvidence(prompt: string, options?: CompletionOptions): Promise<ResearchEvidence> {
    try {
      const config: GenerateContentConfig = {};

      if (options?.useWebSearch) {
        config.tools = [{ googleSearch: {} }];
      }

      if (options?.systemPrompt) {
        config.systemInstruction = options.systemPrompt;
      }

      if (options?.temperature !== undefined) {
        config.temperature = options.temperature;
      }

      if (options?.maxTokens !== undefined) {
        config.maxOutputTokens = options.maxTokens;
      }

      const response = await this.geminiClient.models.generateContent({
        model: this.model,
        contents: prompt,
        config,
      });

      // Check if response has content
      if (!response) {
        throw new Error("No response from Gemini - empty response object");
      }

      let text: string;
      try {
        text = response.text ?? "";
      } catch (textError) {
        const textErrorMessage = textError instanceof Error ? textError.message : String(textError);
        logger.error(`AIClient: Error extracting text from response - ${textErrorMessage}`);
        throw new Error(`No response from Gemini - cannot extract text: ${textErrorMessage}`);
      }

      if (!text || text.trim().length === 0) {
        logger.warn("AIClient: Empty text response from Gemini");
        throw new Error("No response from Gemini - empty text");
      }

      const candidate = response.candidates?.[0];
      return {
        text,
        model: this.model,
        grounding: candidate?.groundingMetadata ?? null,
        finishReason: candidate?.finishReason,
      };
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
