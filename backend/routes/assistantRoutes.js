import express from 'express';
import { chatWithAssistant } from '../controllers/assistantController.js';
import { limiters } from '../middlewares/rateLimit.js';

const assistantRouter = express.Router();

// POST /api/assistant/chat — Public endpoint (no auth required)
// Rate limited per real client IP (route limiter + controller sliding window)
assistantRouter.post('/chat', limiters.assistant, chatWithAssistant);

export default assistantRouter;
