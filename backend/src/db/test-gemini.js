require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const { GoogleGenerativeAI } = require('@google/generative-ai');

async function listModels() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('❌ GEMINI_API_KEY is missing in .env');
    return;
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  console.log('Testing with API Key starting with:', apiKey.substring(0, 5));

  try {
    // Note: listModels is usually on v1beta or v1
    // We'll try the default first
    const result = await genAI.listModels();
    console.log('✅ Available Models:');
    result.models.forEach(m => {
      console.log(`- ${m.name} (Supported: ${m.supportedGenerationMethods.join(', ')})`);
    });
  } catch (err) {
    console.error('❌ Failed to list models:', err.message);
  }
}

listModels();
