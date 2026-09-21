const express = require('express');
const router = express.Router();
const supportChat = require('../services/supportChatService');

router.get('/unread', (req, res) => {
    res.json({ success: true, unread: supportChat.unreadForUser(req.user.id) });
});

router.get('/chat', (req, res) => {
    try {
        res.json({ success: true, data: supportChat.getUserThread(req.user.id) });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message || 'Could not load chat' });
    }
});

router.post('/chat', (req, res) => {
    try {
        const data = supportChat.addUserMessage(req.user.id, (req.body || {}).text);
        res.json({ success: true, data, message: 'Message sent.' });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message || 'Could not send message' });
    }
});

module.exports = router;
