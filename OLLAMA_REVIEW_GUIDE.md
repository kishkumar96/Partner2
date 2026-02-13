# 🚀 Improved Ollama Review Guide

## What's New

1. **✅ Project context** - AI now understands your Pacific Disaster Platform
2. **✅ Better prompts** - Focuses on real bugs, not style opinions
3. **✅ False positive filtering** - Removes known bad advice automatically
4. **✅ Ensemble mode ready** - Multi-model consensus for better accuracy

---

## Quick Start

### Best Quality (Recommended)
```bash
# Enable ensemble mode
echo "USE_ENSEMBLE=true" >> .env.local

# Run review
npm run ollama:review
```

### Fast Review (Good for quick checks)
```bash
npm run ollama:fast
```

### Review Specific File
```bash
npm run ollama:review -- src/components/YourComponent.tsx
```

---

## Quality Improvements

### Before (❌ Old Issues)
- False claims about aria-label
- Nitpicky style suggestions
- Generic "add comments" advice
- Wrong framework assumptions

### After (✅ New Behavior)
- Focused on real bugs only
- Understands Next.js/React patterns
- Knows your project context
- Filters out false positives

---

## How to Customize

### 1. Adjust Project Context
Edit `.ollama-context.md` to add:
- New patterns to ignore
- Specific things to check
- Project-specific conventions

### 2. Add More False Positive Filters
In `scripts/ollama-review.js`, add patterns to `filterFalsePositives()`:
```javascript
const falsePositivePatterns = [
  /your-pattern-here/i,
  // Add more...
];
```

### 3. Change Review Focus
Modify `getReviewFocus()` in the script to emphasize different areas.

---

## Best Practices

### ✅ DO Use For:
- **Pre-commit checks** - Catch bugs before pushing
- **Complex logic** - Get second opinion on tricky code
- **New features** - Quick sanity check
- **Learning** - Understand potential issues

### ❌ DON'T Rely On For:
- **Final say** - Human review is still essential
- **Framework expertise** - AI can be wrong about React/Next.js
- **Architecture** - Complex decisions need human judgment
- **Security audits** - Use dedicated security tools

---

## Troubleshooting

### "Too many false positives"
1. Check `.ollama-context.md` has your patterns
2. Add more filters to `filterFalsePositives()`
3. Use ensemble mode for consensus

### "Review too generic"
1. Add more specific context to `.ollama-context.md`
2. Update `getReviewFocus()` for your file types
3. Try different models (qwen2.5:14b is best)

### "Missing real issues"
1. Enable ensemble mode
2. Reduce `SKIP_TRIVIAL` threshold
3. Review more files at once (context helps)

---

## Model Recommendations

| Task | Model | Why |
|------|-------|-----|
| **Deep review** | qwen2.5:14b-instruct | Best reasoning, catches real issues |
| **Fast check** | gemma2:2b | Quick, good for obvious bugs |
| **Consensus** | Multiple (ensemble) | Best accuracy, reduces false positives |

---

## Metrics

Track your improvements:
- Bugs caught before production
- False positives reduced
- Time saved in reviews
- Team agreement with suggestions

Good luck! 🚀
