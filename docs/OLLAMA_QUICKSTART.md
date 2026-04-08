# 🌟 Ollama Integration - World-Class AI Code Review

## Quick Start

Ollama allows you to run AI models locally for code review, documentation, testing, and more - with **zero API costs** and **100% privacy**.

### 🎯 What's New: Multi-Model Ensemble

The system now uses **multiple models simultaneously** to provide world-class code reviews that compare your code against industry leaders like Google, Meta, Netflix, and AWS standards.

**Your Setup**: 4 models detected and ready to use!
- qwen2.5:14b-instruct (8.99 GB) - Best quality
- qwen2.5:7b-instruct (4.68 GB) - Fast validation
- llama3.2:latest (2.02 GB) - Additional perspective
- gemma2:2b (1.63 GB) - Super fast checks

**Benefits**:
- 🎯 Multiple AI perspectives reduce false positives
- 🏆 Reviews compare against industry standards
- ✨ Specific, actionable excellence recommendations
- 🔴 Better critical issue detection
- 📊 Consensus from multiple models

### 1. Check if Ollama is Ready

```bash
npm run ollama:check
```

### 2. Install Ollama (if needed)

**Linux:**
```bash
curl -fsSL https://ollama.com/install.sh | sh
```

**macOS:**
```bash
brew install ollama
```

**Windows:** Download from [ollama.com](https://ollama.com/download)

### 3. Start Ollama

```bash
ollama serve
```

### 4. Pull Models (Already Done! ✅)

You already have these excellent models installed:
```bash
# ✅ You have: qwen2.5:14b-instruct (Best quality)
# ✅ You have: qwen2.5:7b-instruct (Fast)
# ✅ You have: llama3.2:latest (Good alternative)
# ✅ You have: gemma2:2b (Super fast)
```

If you want to add more:
```bash
# For code tasks
ollama pull codellama:7b

# For better reasoning
ollama pull deepseek-coder

# For general tasks
ollama pull mistral:7b
```

### 5. Use It!

```bash
# 🌟 World-class ensemble review (uses multiple models)
npm run ollama:review

# 🏃 Quick single-model review (faster)
USE_ENSEMBLE=false npm run ollama:review

# 📄 Review specific file
npm run ollama:review -- src/components/MapView.tsx

# 🎯 Best model for the task
# The system automatically picks the best model from your 4 installed models
```

# Review staged changes (pre-commit)
npm run ollama:review -- --staged
```

## What Can You Do?

### 🔍 Code Review
- Detect bugs and issues
- Security vulnerability scanning
- Performance analysis
- Accessibility checks
- Best practice recommendations

### 📚 Documentation
- Generate JSDoc comments
- Create README sections
- API documentation
- Usage examples

### 🧪 Test Generation
- Unit tests
- Integration tests
- Edge cases
- Mock data

### 💬 Interactive Help
- Explain complex code
- Debug errors
- Suggest refactoring
- Generate commit messages

## CI/CD Integration

### Option 1: Self-Hosted Runner (Recommended)

If you have a self-hosted GitHub Actions runner with Ollama:

1. Label your PR with `ai-review`
2. The workflow will automatically run
3. AI review will be posted as a comment

### Option 2: Local Development Only

Use Ollama locally without CI/CD:

1. Run reviews before committing
2. Keep feedback in your local environment
3. No CI/CD resources needed

## Example Output

```markdown
## 📄 src/components/MapView.tsx

🔴 **Critical:**
- Potential memory leak in useEffect (line 45)
- Missing null check for mapRef.current (line 120)

🟡 **Warnings:**
- Large dependency array may cause excessive re-renders
- Consider memoizing expensive computations

🟢 **Suggestions:**
- Extract map initialization logic to custom hook
- Add error boundary for map failures

✅ **Strengths:**
- Good TypeScript types
- Proper cleanup in useEffect
- Clear component structure

**Complexity Score:** 7/10
```

## Cost Comparison

| Solution | Cost | Privacy | Speed |
|----------|------|---------|-------|
| **Ollama** | $0 | 100% Private | Fast* |
| GitHub Copilot | $10/mo | Data sent to GitHub | Fast |
| ChatGPT API | ~$0.002/1K tokens | Data sent to OpenAI | Fast |
| Claude API | ~$0.015/1K tokens | Data sent to Anthropic | Fast |

*Speed depends on your hardware. 7B models run fast on most machines.

## Learn More

📖 **[Complete Guide](docs/OLLAMA_INTEGRATION.md)** - Full documentation with examples

🛠️ **Available Commands:**
```bash
npm run ollama:check    # Check Ollama status
npm run ollama:review   # Review code
npm run ollama:docs     # Generate docs (coming soon)
npm run ollama:tests    # Generate tests (coming soon)
npm run ollama:commit   # Generate commit msg (coming soon)
```

## Requirements

- **RAM:** 8GB minimum (for 7B models), 16GB recommended (for 13B models)
- **Disk:** ~4-8GB per model
- **CPU:** Any modern processor (GPU optional but faster)

## Troubleshooting

**Ollama not found?**
```bash
# Check if running
curl http://localhost:11434/api/tags

# Start if needed
ollama serve
```

**Slow performance?**
```bash
# Use smaller model
ollama pull codellama:7b

# Or enable GPU (if available)
ollama run codellama:7b --gpu
```

**Out of memory?**
```bash
# Use quantized model (less RAM)
ollama pull codellama:7b-q4
```

---

## 🚀 Next Steps

**Ready for More?**

- 🌟 **Learn about World-Class Reviews**: [OLLAMA_WORLD_CLASS.md](OLLAMA_WORLD_CLASS.md)
  - Multi-model ensemble reviews
  - Industry leader comparisons
  - Excellence opportunities
  - How to use all your models

- 📚 **Full Documentation**: [OLLAMA_INTEGRATION.md](OLLAMA_INTEGRATION.md)
  - Complete API reference
  - Advanced usage patterns
  - CI/CD integration
  - Custom prompts

- 📋 **Setup Summary**: [../OLLAMA_SETUP.md](../OLLAMA_SETUP.md)
  - Everything in one place
  - Your detected setup
  - All available commands

---

💡 **Note:** Ollama integration is **completely optional**. Your dashboard works perfectly without it. This is a developer productivity enhancement for those who want local AI assistance.
