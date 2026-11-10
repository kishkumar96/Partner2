#!/usr/bin/env node

/**
 * Check Ollama Status
 * Verifies Ollama installation and available models
 */

const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://localhost:11434';

async function checkOllama() {
  console.log('🔍 Checking Ollama Status...\n');

  // Check if Ollama is running
  try {
    const response = await fetch(`${OLLAMA_HOST}/api/tags`, {
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      throw new Error('Service responded with error');
    }

    const data = await response.json();
    const models = data.models || [];

    console.log('✅ Ollama is running');
    console.log(`📍 Host: ${OLLAMA_HOST}\n`);

    if (models.length === 0) {
      console.log('⚠️  No models installed\n');
      console.log('📥 Install recommended models:');
      console.log('   ollama pull codellama:7b      # Code generation');
      console.log('   ollama pull mistral:7b        # General purpose');
      console.log('   ollama pull deepseek-coder    # Code understanding\n');
    } else {
      console.log(`📦 Installed Models (${models.length}):\n`);
      models.forEach(model => {
        const sizeGB = (model.size / 1e9).toFixed(2);
        console.log(`   • ${model.name.padEnd(30)} (${sizeGB} GB)`);
      });
      console.log();
    }

    // Test generation
    console.log('🧪 Testing generation...');
    const testResponse = await fetch(`${OLLAMA_HOST}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: models[0]?.name || 'codellama:7b',
        prompt: 'Say "Hello from Ollama!" in one line.',
        stream: false,
        options: { num_predict: 20 },
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (testResponse.ok) {
      console.log('✅ Generation test passed\n');
    } else {
      console.log('⚠️  Generation test failed\n');
    }

    console.log('🎉 Ollama is ready to use!');
    console.log('\n📚 Available commands:');
    console.log('   npm run ollama:review   # Review code changes');
    console.log('   npm run ollama:docs     # Generate documentation');
    console.log('   npm run ollama:tests    # Generate tests');
    console.log('   npm run ollama:commit   # Generate commit message\n');

    console.log('📖 See docs/OLLAMA_INTEGRATION.md for full guide\n');

  } catch (error) {
    console.log('❌ Ollama is not available\n');
    
    if (error.name === 'AbortError') {
      console.log('⏱️  Request timed out. Ollama may be installing a model.\n');
    }

    console.log('🔧 Setup Instructions:\n');
    console.log('1. Install Ollama:');
    console.log('   Linux:   curl -fsSL https://ollama.com/install.sh | sh');
    console.log('   macOS:   brew install ollama');
    console.log('   Windows: Download from ollama.com\n');
    
    console.log('2. Start Ollama:');
    console.log('   ollama serve\n');
    
    console.log('3. Pull a model:');
    console.log('   ollama pull codellama:7b\n');
    
    console.log('📖 Full guide: docs/OLLAMA_INTEGRATION.md\n');
    
    process.exit(1);
  }
}

checkOllama().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
