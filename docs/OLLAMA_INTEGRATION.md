# Ollama Integration Guide

## Overview

This guide explains how to use Ollama models locally and in CI/CD for various development tasks like code review, documentation generation, test generation, and more.

## Table of Contents

- [Local Development Setup](#local-development-setup)
- [CI/CD Integration](#cicd-integration)
- [Use Cases](#use-cases)
- [Available Scripts](#available-scripts)
- [Configuration](#configuration)

## Local Development Setup

### 1. Install Ollama

#### Linux
```bash
curl -fsSL https://ollama.com/install.sh | sh
```

#### macOS
```bash
brew install ollama
```

#### Windows
Download from [ollama.com](https://ollama.com/download)

### 2. Pull Models

```bash
# Recommended models for development
ollama pull codellama:7b          # Code generation
ollama pull mistral:7b            # General purpose
ollama pull llama2:13b            # Better reasoning
ollama pull codellama:13b         # Advanced code tasks

# Specialized models
ollama pull starcoder:7b          # Code completion
ollama pull deepseek-coder:6.7b   # Code understanding
```

### 3. Start Ollama Service

```bash
# Start in background
ollama serve

# Or use systemd (Linux)
sudo systemctl start ollama
sudo systemctl enable ollama
```

### 4. Configure Environment

Add to your `.env.local`:

```bash
# Ollama Configuration
OLLAMA_HOST=http://localhost:11434
OLLAMA_MODEL=codellama:7b
OLLAMA_TIMEOUT=60000

# Feature flags
USE_OLLAMA_CODE_REVIEW=true
USE_OLLAMA_DOCS=true
USE_OLLAMA_TESTS=true
```

## CI/CD Integration

### GitHub Actions Setup

The CI/CD pipeline can use Ollama for automated tasks:

#### 1. Add Ollama to CI Workflow

```yaml
# .github/workflows/ollama-ci.yml
name: Ollama CI Tasks

on:
  pull_request:
    branches: [main, develop]

jobs:
  ollama-code-review:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v3
        with:
          fetch-depth: 0
      
      - name: Install Ollama
        run: |
          curl -fsSL https://ollama.com/install.sh | sh
          
      - name: Start Ollama Service
        run: |
          ollama serve &
          sleep 5
          
      - name: Pull Model
        run: |
          ollama pull codellama:7b
          
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'npm'
          
      - name: Install Dependencies
        run: npm ci
        
      - name: Run AI Code Review
        run: npm run ollama:review
        env:
          OLLAMA_HOST: http://localhost:11434
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          
      - name: Generate Documentation
        run: npm run ollama:docs
        
      - name: Post Review Comment
        uses: actions/github-script@v6
        with:
          script: |
            const fs = require('fs');
            const review = fs.readFileSync('ollama-review.md', 'utf8');
            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: review
            });
```

#### 2. Resource Considerations

**Memory Requirements:**
- 7B models: ~8GB RAM
- 13B models: ~16GB RAM
- 70B models: ~64GB RAM

**GitHub Actions Limits:**
- Standard runners: 7GB RAM (use 7B models)
- Larger runners: 16GB+ RAM (paid plans)

**Alternative: Self-hosted Runners**
```yaml
jobs:
  ollama-code-review:
    runs-on: self-hosted  # Use your own hardware
    steps:
      # Your Ollama steps here
```

## Use Cases

### 1. Automated Code Review

```bash
# Review changed files in PR
npm run ollama:review

# Review specific file
npm run ollama:review -- src/components/MapView.tsx
```

**What it checks:**
- Code quality and best practices
- Potential bugs or issues
- Performance concerns
- Security vulnerabilities
- Accessibility issues
- TypeScript type safety

### 2. Documentation Generation

```bash
# Generate docs for all components
npm run ollama:docs

# Generate docs for specific file
npm run ollama:docs -- src/utils/analytics.ts
```

**What it generates:**
- JSDoc comments
- README sections
- API documentation
- Usage examples
- Type definitions explanations

### 3. Test Generation

```bash
# Generate tests for changed files
npm run ollama:tests

# Generate tests for specific file
npm run ollama:tests -- src/components/ErrorBoundary.tsx
```

**What it creates:**
- Unit tests
- Integration tests
- Edge case tests
- Mock data
- Test descriptions

### 4. Commit Message Generation

```bash
# Generate commit message from staged changes
npm run ollama:commit
```

**Output:**
- Conventional commit format
- Clear description
- Breaking changes noted

### 5. Code Explanation

```bash
# Explain complex code
npm run ollama:explain -- src/utils/performance.ts
```

### 6. Bug Analysis

```bash
# Analyze error logs
npm run ollama:debug -- error.log
```

## Available Scripts

Add these to your `package.json`:

```json
{
  "scripts": {
    "ollama:review": "node scripts/ollama-review.js",
    "ollama:docs": "node scripts/ollama-docs.js",
    "ollama:tests": "node scripts/ollama-tests.js",
    "ollama:commit": "node scripts/ollama-commit.js",
    "ollama:explain": "node scripts/ollama-explain.js",
    "ollama:debug": "node scripts/ollama-debug.js",
    "ollama:refactor": "node scripts/ollama-refactor.js"
  }
}
```

## Configuration

### Model Selection

Different models for different tasks:

```javascript
const OLLAMA_MODELS = {
  codeReview: 'codellama:13b',      // Best for code analysis
  documentation: 'mistral:7b',       // Good for writing docs
  testing: 'codellama:7b',          // Fast test generation
  explanation: 'llama2:13b',        // Better reasoning
  debugging: 'deepseek-coder:6.7b', // Code understanding
};
```

### Performance Tuning

```javascript
const OLLAMA_CONFIG = {
  temperature: 0.2,        // Lower = more focused
  top_p: 0.9,             // Sampling parameter
  max_tokens: 2000,       // Response length
  timeout: 60000,         // 60 seconds
  stream: false,          // Set true for real-time
};
```

## Local Development Workflow

### 1. Pre-commit Hook (Using Husky)

```bash
# .husky/pre-commit
#!/bin/sh
. "$(dirname "$0")/_/husky.sh"

# Check if Ollama is available
if command -v ollama &> /dev/null; then
  echo "🤖 Running AI code review..."
  npm run ollama:review -- --staged
fi

npm run lint
npm run type-check
```

### 2. VS Code Integration

Create `.vscode/tasks.json`:

```json
{
  "version": "2.0.0",
  "tasks": [
    {
      "label": "AI Code Review",
      "type": "shell",
      "command": "npm run ollama:review -- ${file}",
      "problemMatcher": [],
      "presentation": {
        "reveal": "always",
        "panel": "new"
      }
    },
    {
      "label": "Generate Documentation",
      "type": "shell",
      "command": "npm run ollama:docs -- ${file}",
      "problemMatcher": []
    }
  ]
}
```

### 3. CLI Interactive Mode

```bash
# Start interactive AI assistant
npm run ollama:chat

# Ask questions about your code
> How can I optimize the MapView component?
> What's the best way to handle errors in React?
> Review my last git diff
```

## Best Practices

### 1. Model Caching
- Pull models once, reuse across runs
- Use model registry for team consistency

### 2. Rate Limiting
- Limit API calls in CI to avoid timeouts
- Only run on significant changes

### 3. Result Validation
- Always review AI suggestions
- Don't auto-commit AI-generated code
- Use AI as a helper, not replacement

### 4. Privacy
- Run locally = no data leaves your machine
- Safe for proprietary code
- No API keys needed

### 5. Performance
- Use smaller models (7B) for speed
- Use larger models (13B+) for quality
- Cache results when possible

## Troubleshooting

### Ollama Won't Start
```bash
# Check if running
ollama list

# Restart service
sudo systemctl restart ollama

# Check logs
journalctl -u ollama -f
```

### Out of Memory
```bash
# Use smaller model
ollama pull codellama:7b

# Or increase swap
sudo fallocate -l 8G /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
```

### Slow Performance
```bash
# Use GPU acceleration (if available)
ollama run codellama:7b --gpu

# Reduce context window
# In your scripts, set num_ctx: 2048
```

## Examples

### Code Review Output Example

```markdown
## AI Code Review Results

### File: src/components/MapView.tsx

**Issues Found:**
1. ⚠️ Performance: Large dependency array in useEffect (line 45)
   - Suggestion: Memoize the `filters` object

2. 🔒 Security: Potential XSS in user-generated content (line 120)
   - Suggestion: Sanitize HTML before rendering

3. ♿ Accessibility: Missing ARIA label on interactive element (line 88)
   - Suggestion: Add aria-label="Close map legend"

**Strengths:**
- ✅ Good TypeScript typing
- ✅ Proper error handling
- ✅ Clean component structure

**Complexity Score:** 7/10
**Maintainability:** Good
```

### Documentation Output Example

```typescript
/**
 * Performance monitoring utility for tracking Web Vitals and custom metrics
 * 
 * @module performance
 * @category Utilities
 * 
 * @example
 * ```typescript
 * import { measureRenderTime } from '@/utils/performance';
 * 
 * const duration = measureRenderTime('MyComponent', startTime);
 * console.log(`Rendered in ${duration}ms`);
 * ```
 * 
 * @see {@link https://web.dev/vitals/ | Web Vitals}
 */
```

## Integration with Existing Tools

### ESLint Plugin
```javascript
// Future: Create custom ESLint rule using Ollama
// .eslintrc.js
module.exports = {
  plugins: ['ollama-ai'],
  rules: {
    'ollama-ai/review-complexity': 'warn',
  },
};
```

### Pre-push Checks
```bash
#!/bin/bash
# .git/hooks/pre-push

echo "Running AI analysis before push..."
npm run ollama:review -- --all
if [ $? -ne 0 ]; then
  echo "AI review found issues. Continue? (y/n)"
  read answer
  [ "$answer" != "y" ] && exit 1
fi
```

## Cost Comparison

| Solution | Cost | Speed | Privacy |
|----------|------|-------|---------|
| Ollama (Local) | $0 | Fast* | 100% Private |
| ChatGPT API | ~$0.002/1K tokens | Fast | Data sent to OpenAI |
| GitHub Copilot | $10/month | Fast | Data sent to GitHub |
| Claude API | ~$0.015/1K tokens | Fast | Data sent to Anthropic |

*Depends on hardware

## Resources

- **Ollama Docs**: https://ollama.com/docs
- **Model Library**: https://ollama.com/library
- **Community Models**: https://ollama.com/community
- **API Reference**: https://github.com/ollama/ollama/blob/main/docs/api.md

## Support

For issues or questions:
- 📖 Check Ollama documentation
- 💬 Join Ollama Discord
- 🐛 Report issues on GitHub
- 📧 Contact team lead

---

**Note**: Ollama integration is optional. The application works perfectly without it. This is a developer productivity enhancement.
