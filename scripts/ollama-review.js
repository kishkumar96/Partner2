#!/usr/bin/env node

/**
 * Ollama Code Review Script
 * Reviews changed files using local AI models
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Configuration
const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'qwen2.5:14b-instruct';
const OUTPUT_FILE = 'ollama-review.md';
const USE_ENSEMBLE = process.env.USE_ENSEMBLE !== 'false'; // Use multiple models by default
const PARALLEL_BATCH = parseInt(process.env.PARALLEL_BATCH || '5'); // Process files in parallel
const SKIP_TRIVIAL = process.env.SKIP_TRIVIAL === 'true'; // Skip files with < 10 lines changed
const MIN_LINES_TO_REVIEW = parseInt(process.env.MIN_LINES_TO_REVIEW || '10');

// Check if Ollama is available
async function checkOllama() {
  try {
    const response = await fetch(`${OLLAMA_HOST}/api/tags`);
    return response.ok;
  } catch {
    console.error('❌ Ollama is not available. Make sure it\'s running.');
    console.error('   Start with: ollama serve');
    process.exit(1);
  }
}

// Get changed files
function getChangedFiles(staged = false) {
  try {
    const cmd = staged 
      ? 'git diff --cached --name-only --diff-filter=ACMR'
      : 'git diff --name-only --diff-filter=ACMR HEAD';
    
    const output = execSync(cmd, { encoding: 'utf-8' });
    return output
      .split('\n')
      .filter(file => file.trim() && /\.(ts|tsx|js|jsx)$/.test(file));
  } catch {
    return [];
  }
}

// Get file diff
function getFileDiff(file, staged = false) {
  try {
    const cmd = staged
      ? `git diff --cached HEAD -- ${file}`
      : `git diff HEAD -- ${file}`;
    
    return execSync(cmd, { encoding: 'utf-8' });
  } catch {
    return '';
  }
}

// Read file content
function readFile(file) {
  try {
    return fs.readFileSync(file, 'utf-8');
  } catch {
    return '';
  }
}

// Get available models
async function getAvailableModels() {
  try {
    const response = await fetch(`${OLLAMA_HOST}/api/tags`);
    const data = await response.json();
    return data.models?.map(m => m.name) || [];
  } catch {
    return [];
  }
}

// Select best models for ensemble
function selectReviewModels(availableModels, maxModels = 3) {
  const priorities = [
    'qwen2.5:14b',
    'codellama:13b',
    'deepseek-coder',
    'qwen2.5:7b',
    'codellama:7b',
    'llama3',
  ];

  const selected = [];
  for (const priority of priorities) {
    const match = availableModels.find(m => m.includes(priority));
    if (match && !selected.includes(match)) {
      selected.push(match);
      if (selected.length >= maxModels) break;
    }
  }

  // Add any other models if we don't have enough
  if (selected.length === 0) {
    selected.push(...availableModels.slice(0, maxModels));
  }

  return selected;
}

// Get review focus based on file type
function getReviewFocus(file) {
  if (file.includes('components/')) {
    return `Focus Areas:
- React performance (avoid unnecessary re-renders)
- Proper TypeScript types (no 'any')
- Accessibility (ARIA labels, keyboard nav)
- Error boundaries and loading states`;
  }
  
  if (file.includes('utils/')) {
    return `Focus Areas:
- Pure functions (no side effects)
- Comprehensive error handling
- TypeScript type safety
- Performance (avoid O(n²) operations)`;
  }
  
  if (file.includes('types/')) {
    return `Focus Areas:
- Interface completeness
- Proper optional vs required fields
- Avoid type assertions (as, any)
- JSDoc documentation`;
  }
  
  return `Focus Areas:
- Code quality and maintainability
- Error handling
- Type safety`;
}

// Read project context
function getProjectContext() {
  try {
    const contextPath = path.join(__dirname, '..', '.ollama-context.md');
    if (fs.existsSync(contextPath)) {
      return fs.readFileSync(contextPath, 'utf-8');
    }
  } catch (_e) {
    // Context file not found, continue without it
  }
  return '';
}

// World-class review prompt
function getWorldClassPrompt(file, diff) {
  // Smart truncation for large diffs
  let truncatedDiff = diff;
  if (diff.length > 3000) {
    const lines = diff.split('\n');
    const firstLines = lines.slice(0, 50);
    const lastLines = lines.slice(-30);
    truncatedDiff = [
      ...firstLines,
      `\n... [${lines.length - 80} lines omitted] ...\n`,
      ...lastLines
    ].join('\n');
  }

  const focus = getReviewFocus(file);
  const fileType = file.endsWith('.tsx') ? 'React Component' : file.endsWith('.ts') ? 'TypeScript' : 'JavaScript';
  const projectContext = getProjectContext();

  return `You are a world-class software architect reviewing code for a **Pacific Disaster Platform** (Next.js 16 + TypeScript + MapLibre).

${projectContext ? `## Project Context\n${projectContext}\n` : ''}

File: ${file} (${fileType})

Changes:
\`\`\`diff
${truncatedDiff}
\`\`\`

${focus}

## Review Guidelines

**ONLY flag real issues:**
- Actual bugs (undefined vars, type errors, logic errors)
- Memory leaks (missing cleanup, map instance leaks)
- Critical accessibility gaps
- Severe performance issues (O(n²), large bundles)

**DO NOT flag:**
- aria-label on canvas/charts (CORRECT for accessibility)
- Minor style/optimization preferences
- Generic advice without specific reason
- Framework features you're unsure about (verify first!)

Provide CONCISE analysis (max 12 lines per section):

🔴 CRITICAL (only real bugs):
- [Line X] Issue → Specific fix with code

🟡 WARNINGS (meaningful improvements):
- [Line X] Issue → Concrete improvement

🟢 STRENGTHS:
- What's done well

**RATING**: X/10 (Critical issues = max 7/10)
**RECOMMENDATION**: Production Ready / Needs Work

Be specific and accurate. Skip the issue if you're not 100% certain.`;
}

// Review with single model
async function reviewWithModel(model, file, diff) {
  const prompt = getWorldClassPrompt(file, diff);

  try {
    const response = await fetch(`${OLLAMA_HOST}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        prompt,
        stream: false,
        options: {
          temperature: 0.1,
          num_predict: 1500, // Reduced for speed
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`${response.statusText}`);
    }

    const data = await response.json();
    return data.response;
  } catch (error) {
    return `Error with ${model}: ${error.message}`;
  }
}

// Filter out common false positives
function filterFalsePositives(review) {
  const falsePositivePatterns = [
    // Known incorrect claims
    /aria-label.*not.*standard/i,
    /ariaLabel.*do(?:es)? not exist/i,
    /aria-label.*not supported/i,
    
    // Over-optimization
    /memoize.*onClick.*performance/i,
    /className.*could.*performance issue/i,
    
    // Generic unhelpful advice
    /consider adding.*comment/i,
    /should.*be.*documented/i,
    
    // Bad hook advice
    /useMemo.*hook.*inside/i,
  ];

  let lines = review.split('\n');
  let filtered = lines.filter(line => {
    return !falsePositivePatterns.some(pattern => pattern.test(line));
  });

  return filtered.join('\n');
}

// Review code with ensemble (multiple models)
async function reviewCode(file, content, diff) {
  if (!USE_ENSEMBLE) {
    console.log(`   Using ${OLLAMA_MODEL}...`);
    const review = await reviewWithModel(OLLAMA_MODEL, file, diff);
    return filterFalsePositives(review);
  }

  // Get available models
  const availableModels = await getAvailableModels();
  const reviewModels = selectReviewModels(availableModels, 3);

  if (reviewModels.length === 0) {
    console.log(`   ⚠️  No models available, using default...`);
    return reviewWithModel(OLLAMA_MODEL, file, diff);
  }

  console.log(`   📊 Ensemble review with ${reviewModels.length} models...`);

  // Get reviews from multiple models IN PARALLEL
  const reviews = await Promise.all(
    reviewModels.map(async (model) => {
      console.log(`      • ${model}...`);
      const review = await reviewWithModel(model, file, diff);
      return { model, review };
    })
  );

  // Synthesize consensus
  console.log(`   🔄 Synthesizing consensus...`);
  const consensusPrompt = `Synthesize these ${reviews.length} AI reviews into ONE comprehensive world-class review:

${reviews.map((r, i) => `\n=== Model ${i + 1}: ${r.model} ===\n${r.review}`).join('\n')}

Create UNIFIED REVIEW:
- Combine best insights
- Resolve contradictions (majority wins)
- Rank by severity and agreement
- Be actionable and specific
- Focus on world-class quality`;

  try {
    const response = await fetch(`${OLLAMA_HOST}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: reviewModels[0], // Use best model for consensus
        prompt: consensusPrompt,
        stream: false,
        options: {
          temperature: 0.2,
          num_predict: 3000,
        },
      }),
    });

    if (response.ok) {
      const data = await response.json();
      
      // Filter false positives from consensus
      const filteredConsensus = filterFalsePositives(data.response);
      
      // Return both individual reviews and consensus
      let result = `### 🎯 Consensus Review (from ${reviewModels.length} models)\n\n`;
      result += filteredConsensus;
      result += `\n\n---\n\n<details>\n<summary>📊 Individual Model Reviews (click to expand)</summary>\n\n`;
      reviews.forEach((r, i) => {
        result += `\n#### Model ${i + 1}: ${r.model}\n\n${filterFalsePositives(r.review)}\n\n`;
      });
      result += `</details>`;
      
      return result;
    }
  } catch (_error) {
    console.log(`   ⚠️  Consensus failed, using first review`);
  }

  // Fallback to best single review
  return filterFalsePositives(reviews[0].review);
}

// Main function
async function main() {
  console.log('🤖 Starting Ollama Code Review...\n');

  // Check Ollama availability
  await checkOllama();

  // Get files to review
  const args = process.argv.slice(2);
  const staged = args.includes('--staged');
  const specificFile = args.find(arg => !arg.startsWith('--'));

  let files = [];
  if (specificFile) {
    if (fs.existsSync(specificFile)) {
      files = [specificFile];
    } else {
      console.error(`❌ File not found: ${specificFile}`);
      process.exit(1);
    }
  } else {
    files = getChangedFiles(staged);
  }

  if (files.length === 0) {
    console.log('✅ No files to review.');
    process.exit(0);
  }

  // Filter out trivial changes if requested
  if (SKIP_TRIVIAL) {
    const originalCount = files.length;
    files = files.filter(file => {
      const diff = getFileDiff(file, staged);
      const addedLines = (diff.match(/^\+[^+]/gm) || []).length;
      const removedLines = (diff.match(/^-[^-]/gm) || []).length;
      const totalChanges = addedLines + removedLines;
      
      if (totalChanges < MIN_LINES_TO_REVIEW) {
        console.log(`   ⏭️  Skipped ${file} (only ${totalChanges} lines changed)`);
        return false;
      }
      return true;
    });
    console.log(`   Filtered: ${originalCount} → ${files.length} files (skipped trivial changes)\n`);
  }

  if (files.length === 0) {
    console.log('✅ No substantial changes to review.');
    process.exit(0);
  }

  console.log(`📝 Reviewing ${files.length} file(s) in parallel batches of ${PARALLEL_BATCH}...\n`);

  // Review files in parallel batches
  const reviews = [];
  for (let i = 0; i < files.length; i += PARALLEL_BATCH) {
    const batch = files.slice(i, i + PARALLEL_BATCH);
    const batchNum = Math.floor(i / PARALLEL_BATCH) + 1;
    const totalBatches = Math.ceil(files.length / PARALLEL_BATCH);
    
    console.log(`\n   📦 Batch ${batchNum}/${totalBatches} (${batch.length} files)`);
    
    const batchReviews = await Promise.all(
      batch.map(async (file) => {
        console.log(`      • ${file}...`);
        
        const content = readFile(file);
        const diff = specificFile ? content : getFileDiff(file, staged);
        
        if (!diff && !specificFile) {
          return null;
        }

        const review = await reviewCode(file, content, diff || content);
        return { file, review };
      })
    );
    
    reviews.push(...batchReviews.filter(r => r !== null));
  }

  // Generate report
  const models = await getAvailableModels();
  const reviewModels = USE_ENSEMBLE ? selectReviewModels(models, 3) : [OLLAMA_MODEL];
  
  let report = `# 🤖 AI Code Review (World-Class Standards)\n\n`;
  report += `**Date**: ${new Date().toLocaleString()}\n`;
  report += `**Review Mode**: ${USE_ENSEMBLE && reviewModels.length > 1 ? `Ensemble (${reviewModels.length} models)` : 'Single Model'}\n`;
  report += `**Models Used**: ${reviewModels.join(', ')}\n`;
  report += `**Files Reviewed**: ${reviews.length}\n`;
  report += `**Quality Standard**: Industry Leading (Google, Meta, Netflix, AWS level)\n\n`;
  report += `---\n\n`;

  for (const { file, review } of reviews) {
    report += `## 📄 ${file}\n\n`;
    report += review;
    report += `\n\n---\n\n`;
  }

  // Save report
  fs.writeFileSync(OUTPUT_FILE, report);
  console.log(`\n✅ Review complete! Report saved to: ${OUTPUT_FILE}\n`);

  // Display summary
  console.log('📊 Summary:');
  console.log(`   Files reviewed: ${reviews.length}`);
  console.log(`   Report: ${OUTPUT_FILE}`);
}

// Run
main().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
