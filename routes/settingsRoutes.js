const express = require('express');
const router = express.Router();
const { setEmailConfig, getEmailConfig, isConfigured } = require('../config/emailConfig');
const emailService = require('../services/NamecheapEmailService');

router.post('/smtp', async (req, res) => {
    try {
        const { 
            provider,
            host, 
            port, 
            secure, 
            user, 
            password, 
            fromName,
            rateLimit,
            bccLimit,
            systemName,
            backgroundColor
        } = req.body;

        if (!user || !password) {
            return res.status(400).json({
                success: false,
                message: 'Please provide user and password'
            });
        }

        const providerNormalized = (provider || 'custom').toString().toLowerCase();
        const isGmail = providerNormalized === 'gmail';

        const config = setEmailConfig({
            provider: isGmail ? 'gmail' : 'custom',
            host: isGmail ? 'smtp.gmail.com' : (host || '').trim(),
            port: isGmail ? 465 : (parseInt(port) || 465),
            secure: isGmail ? true : (secure === true || secure === 'true' || secure === '1'),
            user: user.trim(),
            password: password,
            fromName: fromName ? fromName.trim() : 'Rabط',
            rateLimit: parseInt(rateLimit) || 550,
            bccLimit: parseInt(bccLimit) || 500,
            systemName: systemName || 'Rabط',
            backgroundColor: typeof backgroundColor === 'string' ? backgroundColor : '#1d4ed8'
        }, req.user && req.user.id);

        res.json({
            success: true,
            message: 'SMTP settings saved successfully'
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

router.get('/smtp/status', (req, res) => {
    const userId = req.user && req.user.id;
    const config = getEmailConfig(userId);
    res.json({
        success: true,
        configured: isConfigured(userId),
        config: {
            provider: config.provider || 'custom',
            host: config.host,
            port: config.port,
            secure: config.secure,
            user: config.auth ? config.auth.user : '',
            fromName: config.fromName,
            rateLimit: config.rateLimit,
            bccLimit: config.bccLimit,
            systemName: config.systemName || 'Rabط',
            backgroundColor: config.backgroundColor || '#1d4ed8'
        }
    });
});

router.post('/smtp/test', async (req, res) => {
    try {
        if (!isConfigured(req.user && req.user.id)) {
            return res.status(400).json({
                success: false,
                message: 'SMTP not configured. Please configure SMTP settings first.'
            });
        }
        
        const result = await emailService.testConnection(req.user && req.user.id);
        res.json(result);
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});
module.exports = router;