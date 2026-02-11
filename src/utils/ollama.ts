/**
 * Ollama Client Utility
 * Interface for interacting with local Ollama models
 */

interface OllamaConfig {
  host: string;
  model: string;
  timeout?: number;
}

interface OllamaRequest {
  model: string;
  prompt: string;
  stream?: boolean;
  options?: {
    temperature?: number;
    top_p?: number;
    num_ctx?: number;
    num_predict?: number;
  };
}

interface OllamaResponse {
  response: string;
  model: string;
  created_at: string;
  done: boolean;
}

class OllamaClient {
  private host: string;
  private defaultModel: string;
  private timeout: number;

  constructor(config?: Partial<OllamaConfig>) {
    this.host = config?.host || process.env.OLLAMA_HOST || 'http://localhost:11434';
    this.defaultModel = config?.model || process.env.OLLAMA_MODEL || 'codellama:7b';
    this.timeout = config?.timeout || 60000;
  }

  /**
   * Check if Ollama service is available
   */
  async isAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${this.host}/api/tags`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * List available models
   */
  async listModels(): Promise<string[]> {
    try {
      const response = await fetch(`${this.host}/api/tags`, {
        method: 'GET',
      });
      
      if (!response.ok) {
        throw new Error('Failed to fetch models');
      }

      const data = await response.json();
      return data.models?.map((m: any) => m.name) || [];
    } catch (error) {
      console.error('Error listing models:', error);
      return [];
    }
  }

  /**
   * Generate completion from prompt
   */
  async generate(
    prompt: string,
    options?: {
      model?: string;
      temperature?: number;
      maxTokens?: number;
      stream?: boolean;
    }
  ): Promise<string> {
    const model = options?.model || this.defaultModel;
    
    const request: OllamaRequest = {
      model,
      prompt,
      stream: options?.stream ?? false,
      options: {
        temperature: options?.temperature ?? 0.2,
        top_p: 0.9,
        num_ctx: 4096,
        num_predict: options?.maxTokens ?? 2000,
      },
    };

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      const response = await fetch(`${this.host}/api/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Ollama API error: ${response.statusText}`);
      }

      const data: OllamaResponse = await response.json();
      return data.response;
    } catch (error) {
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          throw new Error('Ollama request timed out');
        }
        throw error;
      }
      throw new Error('Unknown error occurred');
    }
  }

  /**
   * Stream completion (for real-time responses)
   */
  async *generateStream(
    prompt: string,
    options?: {
      model?: string;
      temperature?: number;
    }
  ): AsyncGenerator<string> {
    const model = options?.model || this.defaultModel;
    
    const request: OllamaRequest = {
      model,
      prompt,
      stream: true,
      options: {
        temperature: options?.temperature ?? 0.2,
        top_p: 0.9,
        num_ctx: 4096,
      },
    };

    const response = await fetch(`${this.host}/api/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.statusText}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('Unable to read response stream');
    }

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.trim()) {
          try {
            const data: OllamaResponse = JSON.parse(line);
            yield data.response;
            
            if (data.done) {
              return;
            }
          } catch (e) {
            // Skip invalid JSON
          }
        }
      }
    }
  }

  /**
   * Review code with AI (World-Class Standards)
   */
  async reviewCode(code: string, language: string = 'typescript'): Promise<string> {
    const prompt = `You are a world-class senior software engineer and architect reviewing code for production deployment. Compare this code against industry-leading standards and best practices.

Code Language: ${language}

Code to review:
\`\`\`${language}
${code}
\`\`\`

Provide a comprehensive analysis:

🔴 **CRITICAL ISSUES** (Must fix before production):
- Security vulnerabilities (OWASP Top 10)
- Data loss risks
- Breaking changes
- Memory leaks
- Race conditions

🟡 **WARNINGS** (Should fix):
- Performance bottlenecks
- Scalability concerns
- Maintainability issues
- Tech debt
- Anti-patterns

🟢 **SUGGESTIONS** (World-class improvements):
- How top companies (Google, Netflix, Meta) would approach this
- Modern best practices and patterns
- Performance optimizations
- Developer experience improvements
- Future-proofing recommendations

✨ **EXCELLENCE OPPORTUNITIES**:
- Code that could win awards
- Innovation possibilities
- Standout features to add
- Ways to exceed expectations

♿ **ACCESSIBILITY & INCLUSIVITY**:
- WCAG 2.1 compliance
- Screen reader support
- Keyboard navigation
- International support

🌍 **PRODUCTION READINESS**:
- Error handling completeness
- Logging and monitoring
- Testing coverage needs
- Documentation quality

✅ **STRENGTHS** (What's already world-class):
- Praise excellent patterns
- Highlight innovative solutions
- Note production-ready aspects

**OVERALL RATING**: X/10 (Compare to industry leaders)
**RECOMMENDATION**: Ready for Production / Needs Work / Major Refactoring Needed

Be specific, actionable, and aim for world-class quality!`;

    return this.generate(prompt, { temperature: 0.1, maxTokens: 3000 });
  }

  /**
   * Review with multiple models for consensus (Best quality)
   */
  async reviewCodeWithEnsemble(
    code: string, 
    language: string = 'typescript'
  ): Promise<{ reviews: Array<{ model: string; review: string }>; consensus: string }> {
    // Get available models
    const models = await this.listModels();
    
    // Select best models for code review (up to 3 for performance)
    const reviewModels = models
      .filter(m => m.includes('qwen') || m.includes('codellama') || m.includes('deepseek') || m.includes('llama'))
      .slice(0, 3);

    if (reviewModels.length === 0) {
      throw new Error('No suitable models available for code review');
    }

    console.log(`📊 Using ${reviewModels.length} models for ensemble review...`);

    // Get reviews from multiple models
    const reviews = await Promise.all(
      reviewModels.map(async (model) => {
        console.log(`   Consulting ${model}...`);
        const review = await this.generate(
          this.getWorldClassReviewPrompt(code, language),
          { model, temperature: 0.1, maxTokens: 2000 }
        );
        return { model, review };
      })
    );

    // Generate consensus from all reviews
    const consensusPrompt = `You are synthesizing reviews from multiple AI models. Create a unified, comprehensive review that:
1. Combines the best insights from all reviews
2. Resolves contradictions (prefer majority opinion)
3. Ranks issues by severity and agreement
4. Provides actionable recommendations

Reviews from different models:
${reviews.map(r => `\n=== ${r.model} ===\n${r.review}`).join('\n')}

Create a UNIFIED WORLD-CLASS REVIEW:`;

    const consensus = await this.generate(consensusPrompt, { 
      model: reviewModels[0], // Use best available model for consensus
      temperature: 0.2,
      maxTokens: 3000 
    });

    return { reviews, consensus };
  }

  /**
   * Get world-class review prompt
   */
  private getWorldClassReviewPrompt(code: string, language: string): string {
    return `You are a world-class software architect reviewing code. Compare against industry leaders like Google, Meta, Netflix, and AWS standards.

Code (${language}):
\`\`\`${language}
${code}
\`\`\`

Rate and review:
🔴 Critical Issues | 🟡 Warnings | 🟢 Improvements | ✨ Excellence Ideas | ✅ Strengths

Be specific and actionable. Focus on world-class quality.`;
  }

  /**
   * Generate documentation
   */
  async generateDocs(code: string, type: 'jsdoc' | 'readme' = 'jsdoc'): Promise<string> {
    const prompt = type === 'jsdoc' 
      ? `Generate comprehensive JSDoc documentation for this code. Include descriptions, parameters, return types, and examples.

Code:
\`\`\`typescript
${code}
\`\`\`

Documentation:`
      : `Generate README documentation for this code. Include overview, usage, examples, and API reference.

Code:
\`\`\`typescript
${code}
\`\`\`

Documentation (Markdown):`;

    return this.generate(prompt, { temperature: 0.3 });
  }

  /**
   * Generate unit tests
   */
  async generateTests(code: string, framework: string = 'jest'): Promise<string> {
    const prompt = `Generate comprehensive unit tests using ${framework} and React Testing Library for this code. Include:

1. Basic functionality tests
2. Edge cases
3. Error handling
4. Mock data if needed

Code to test:
\`\`\`typescript
${code}
\`\`\`

Tests:`;

    return this.generate(prompt, { temperature: 0.2 });
  }

  /**
   * Explain complex code
   */
  async explainCode(code: string): Promise<string> {
    const prompt = `Explain this code in simple terms. Break down what it does, why it's structured this way, and any important concepts.

Code:
\`\`\`
${code}
\`\`\`

Explanation:`;

    return this.generate(prompt, { temperature: 0.4 });
  }

  /**
   * Generate commit message from diff
   */
  async generateCommitMessage(diff: string): Promise<string> {
    const prompt = `Generate a concise, conventional commit message for these changes. Use the format: type(scope): description

Changes:
\`\`\`diff
${diff}
\`\`\`

Commit message (one line):`;

    return this.generate(prompt, { temperature: 0.1, maxTokens: 100 });
  }

  /**
   * Suggest refactoring
   */
  async suggestRefactoring(code: string): Promise<string> {
    const prompt = `Analyze this code and suggest refactoring improvements. Focus on:
- Code structure and organization
- Performance optimizations
- Readability improvements
- Modern best practices

Code:
\`\`\`
${code}
\`\`\`

Refactoring suggestions:`;

    return this.generate(prompt, { temperature: 0.3 });
  }

  /**
   * Debug error
   */
  async debugError(error: string, context?: string): Promise<string> {
    const prompt = `Analyze this error and suggest solutions. Provide:
1. Root cause analysis
2. Possible solutions (ranked by likelihood)
3. Prevention strategies

Error:
${error}

${context ? `Context:\n${context}` : ''}

Analysis:`;

    return this.generate(prompt, { temperature: 0.2 });
  }
}

// Export singleton instance
export const ollama = new OllamaClient();

// Export class for custom instances
export default OllamaClient;

// Utility functions
export const isOllamaAvailable = async (): Promise<boolean> => {
  return ollama.isAvailable();
};

export const getAvailableModels = async (): Promise<string[]> => {
  return ollama.listModels();
};

/**
 * Smart model selector - picks best model for the task
 */
export const selectBestModel = async (task: 'review' | 'docs' | 'test' | 'explain'): Promise<string> => {
  const models = await ollama.listModels();
  
  // Priority order for each task
  const preferences = {
    review: ['qwen2.5:14b', 'codellama:13b', 'deepseek-coder', 'qwen2.5:7b', 'codellama:7b'],
    docs: ['qwen2.5:7b', 'mistral:7b', 'llama3', 'gemma2'],
    test: ['codellama:7b', 'qwen2.5:7b', 'deepseek-coder', 'gemma2'],
    explain: ['qwen2.5:14b', 'llama3', 'qwen2.5:7b', 'mistral'],
  };

  const taskPrefs = preferences[task];
  
  // Find best available model
  for (const pref of taskPrefs) {
    const found = models.find(m => m.includes(pref));
    if (found) return found;
  }

  // Fallback to any available model
  return models[0] || 'qwen2.5:7b-instruct';
};

/**
 * Multi-model review for best quality
 */
export const getWorldClassReview = async (code: string, language: string = 'typescript'): Promise<string> => {
  const models = await ollama.listModels();
  
  // Use ensemble if multiple good models available
  if (models.length >= 2) {
    const result = await ollama.reviewCodeWithEnsemble(code, language);
    return result.consensus;
  }
  
  // Single model fallback
  return ollama.reviewCode(code, language);
};
