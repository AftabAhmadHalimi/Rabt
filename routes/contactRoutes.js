const express = require('express');
const contactMessages = require('../services/contactMessageService');
const { assertAllowed, recordFailure, recordSuccess } = require('../utils/rateLimit');

const router = express.Router();

function clientKey(req) {
    const ip = String((req.headers && (req.headers['x-forwarded-for'] || req.ip)) || 'unknown').split(',')[0].trim();
    return 'contact:' + ip;
}

router.post('/messages', (req, res) => {
    const key = clientKey(req);
    try {
        assertAllowed(key, 15 * 60 * 1000, 6);
        const message = contactMessages.submitMessage(req.body || {});
        recordSuccess(key);
        res.json({
            success: true,
            message: 'Thank you for your message. We will get back to you within 24 hours.',
            data: message
        });
    } catch (err) {
        if (err.statusCode === 429) {
            return res.status(429).json({ success: false, message: err.message });
        }
        recordFailure(key);
        res.status(400).json({ success: false, message: err.message || 'Could not send message.' });
    }
});

module.exports = router;
