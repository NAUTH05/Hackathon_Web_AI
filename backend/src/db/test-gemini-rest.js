require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });

async function listModelsRest() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('GEMINI_API_KEY is missing');
    return;
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;

  try {
    const res = await fetch(url);
    const data = await res.json();
    
    if (data.error) {
      console.error('API Error:', data.error.message);
      return;
    }

    console.log('Available Models (REST):');
    data.models.forEach(m => {
      console.log(`- ${m.name}`);
    });
  } catch (err) {
    console.error('Request failed:', err.message);
  }
}

listModelsRest();
