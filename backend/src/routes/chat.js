const router = require('express').Router();
const fs = require('fs');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { authenticate } = require('../middleware/auth');

// Path to the system manual
const MANUAL_PATH = path.join(__dirname, '..', '..', 'prompt', 'guide_prompt.md');

// POST /api/chat
router.post('/', authenticate, async (req, res) => {
  try {
    const { message } = req.body;
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.status(500).json({ error: 'GEMINI_API_KEY chưa được thiết lập trong Backend' });
    }

    if (!message) {
      return res.status(400).json({ error: 'Nội dung tin nhắn không được để trống' });
    }

    // Read the manual to use as context
    let manualContent = '';
    try {
      manualContent = fs.readFileSync(MANUAL_PATH, 'utf8');
    } catch (err) {
      console.error('Lỗi khi đọc file hướng dẫn:', err);
      manualContent = 'Hướng dẫn sử dụng hệ thống hiện không khả dụng.';
    }

    const genAI = new GoogleGenerativeAI(apiKey);

    // Prioritized list of models based on availability
    // Note: User's list shows -latest aliases are available
    const modelPriorities = ["gemini-flash-latest"];

    let result;
    let successfulModel = "";

    const systemInstruction = `
      Bạn là một trợ lý AI (Chatbot Hỗ trợ) cho trang web "HRM".
      Nhiệm vụ của bạn là hướng dẫn người dùng cách sử dụng trang web dựa trên Tài liệu hướng dẫn dưới đây.
      
      QUY TẮC QUAN TRỌNG:
      1. CHỈ trả lời dựa trên thông tin trong Tài liệu hướng dẫn.
      2. Nếu người dùng hỏi các vấn đề không có trong hướng dẫn, hãy trả lời lịch sự rằng bạn không có thông tin về vấn đề đó.
      3. TUYỆT ĐỐI KHÔNG được bịa đặt tính năng hoặc đưa ra thông tin sai lệch.
      4. Bạn KHÔNG có quyền truy cập vào dữ liệu thực tế (như bảng lương hay điểm danh của ai đó).
      5. Luôn trả lời bằng Tiếng Việt thân thiện và chuyên nghiệp.

      TÀI LIỆU HƯỚNG DẪN:
      ${manualContent}
    `;

    const prompt = `Người dùng hỏi: ${message}`;

    for (const modelName of modelPriorities) {
      try {
        console.log(`Trying model: ${modelName}...`);
        const model = genAI.getGenerativeModel({ model: modelName });
        result = await model.generateContent([systemInstruction, prompt]);
        successfulModel = modelName;
        break; // Success!
      } catch (err) {
        // Any error in finding the model or quota for THIS model, we try another
        console.warn(`Model ${modelName} failed: ${err.message}`);
        continue;
      }
    }

    if (!result) {
      throw new Error('Không có model Gemini nào khả dụng.');
    }

    console.log(`Gemini API call (${successfulModel}) successful`);
    const response = await result.response;
    const text = response.text();

    res.json({ response: text });
  } catch (err) {
    console.error('Lỗi Chatbot AI chi tiết:', err);
    res.status(500).json({
      error: 'Lỗi khi kết nối với AI',
      details: err.message
    });
  }
});

module.exports = router;
