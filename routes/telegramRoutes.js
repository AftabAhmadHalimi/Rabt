const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const telegramService = require('../services/telegramService');
const { ensureTenant } = require('../middleware/auth');
const { classifyPhones, extractPhoneValues } = require('../utils/recipients');
const { safeStoredName, isBlockedExt } = require('../utils/uploadSafety');

function tgFor(req) {
    if (!req.user || !req.user.id) {
        throw new Error('Not authenticated');
    }
    return telegramService.forUser(req.user.id);
}

const storage = multer.diskStorage({
    destination(req, file, cb) {
        const uid = req.user && req.user.id ? String(req.user.id) : '';
        if (!uid) return cb(new Error('Not authenticated'));
        const uploadDir = path.join(__dirname, '..', 'storage', 'uploads', uid, 'telegram');
        if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
        cb(null, uploadDir);
    },
    filename(req, file, cb) {
        const name = safeStoredName(file.originalname);
        if (!name) return cb(new Error('Invalid file type'));
        cb(null, name);
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 16 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (isBlockedExt(file.originalname)) {
            return cb(new Error('This file type is not allowed'));
        }
        const ext = path.extname(file.originalname || '').toLowerCase();
        const isRecipients = file.fieldname === 'file';
        if (isRecipients) {
            const isTxt = ext === '.txt' || file.mimetype === 'text/plain' || file.mimetype === 'application/octet-stream';
            const okXls = ext === '.xls' || file.mimetype === 'application/vnd.ms-excel';
            const okXlsx =
                ext === '.xlsx' ||
                file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
            if (isTxt || okXls || okXlsx) return cb(null, true);
            return cb(new Error('Invalid recipients file. Please upload a .txt or .xls/.xlsx file'));
        }
        const okImg =
            (file.mimetype && file.mimetype.startsWith('image/')) ||
            ['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(file.mimetype);
        if (okImg) return cb(null, true);
        return cb(new Error('Invalid image type'));
    }
});

router.post('/credentials', (req, res) => {
    try {
        const { apiId, apiHash } = req.body || {};
        const result = tgFor(req).setApiCredentials(apiId, apiHash);
        res.json({ success: true, message: 'API credentials saved', data: result });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message || 'Failed to save credentials' });
    }
});

router.get('/credentials/status', (req, res) => {
    try {
        res.json({ success: true, data: tgFor(req).getApiStatus() });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

router.get('/status', async (req, res) => {
    try {
        const data = await tgFor(req).syncFromSavedSession();
        res.json({ success: true, data });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message || 'Failed to get status' });
    }
});

router.get('/qrcode', async (req, res) => {
    try {
        const qrData = tgFor(req).getQRCode();
        const statusData = tgFor(req).getStatus();
        res.json({
            success: true,
            data: {
                ...qrData,
                connected: statusData.connected,
                status: statusData.status
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

/** Begin QR device login (same idea as WhatsApp QR). */
router.post('/connect', async (req, res) => {
    try {
        if (!tgFor(req).getApiStatus().configured) {
            return res.status(400).json({
                success: false,
                message: 'Telegram login is not available right now.'
            });
        }
        const result = await tgFor(req).startQrLogin();
        res.json({ success: true, ...result });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message || 'Failed to start Telegram login' });
    }
});

router.post('/phone/send-code', async (req, res) => {
    try {
        if (!tgFor(req).getApiStatus().configured) {
            return res.status(400).json({
                success: false,
                message: 'Telegram login is not available right now.'
            });
        }
        const { phoneNumber } = req.body || {};
        const result = await tgFor(req).sendPhoneCode(phoneNumber);
        res.json({ success: true, data: result });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message || 'Failed to send code' });
    }
});

router.post('/phone/verify', async (req, res) => {
    try {
        const { phoneCode, password } = req.body || {};
        const result = await tgFor(req).verifyPhoneCode(phoneCode, password);
        res.json({ success: true, data: result });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message || 'Verification failed' });
    }
});

router.post('/auth/password', async (req, res) => {
    try {
        const { password } = req.body || {};
        const result = tgFor(req).submitPassword(password);
        res.json({ success: true, data: result });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
});

router.post('/disconnect', async (req, res) => {
    try {
        const result = await tgFor(req).destroySession();
        res.json({ success: true, data: result });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

router.post('/rescan', async (req, res) => {
    try {
        const result = await tgFor(req).rescan();
        res.json({ success: true, ...result });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

router.post('/send', async (req, res) => {
    try {
        const { phoneNumber, message } = req.body || {};
        if (!phoneNumber || !message) {
            return res.status(400).json({ success: false, message: 'phoneNumber and message are required' });
        }
        const result = await tgFor(req).sendMessage(phoneNumber, message);
        res.json({ success: true, data: result });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message || 'Failed to send' });
    }
});

router.post('/send-bulk', upload.fields([{ name: 'file', maxCount: 1 }, { name: 'image', maxCount: 1 }]), ensureTenant, async (req, res) => {
    let phoneNumbers = [];
    let message = req.body.message;
    const delaySec = parseInt(req.body.delay, 10);
    const delayMs = Number.isFinite(delaySec) && delaySec > 0 ? delaySec * 1000 : 2000;
    const recipientsFile = req.files && req.files.file ? req.files.file[0] : null;
    const imageFile = req.files && req.files.image ? req.files.image[0] : null;
    const mediaPath = imageFile ? imageFile.path : null;

    try {
        if (req.body.phoneNumbers && typeof req.body.phoneNumbers === 'string') {
            phoneNumbers = req.body.phoneNumbers.split(/[\n,]/);
        } else if (Array.isArray(req.body.phoneNumbers)) {
            phoneNumbers = req.body.phoneNumbers;
        }

        if (recipientsFile && recipientsFile.path && fs.existsSync(recipientsFile.path)) {
            const buf = fs.readFileSync(recipientsFile.path);
            phoneNumbers = phoneNumbers.concat(extractPhoneValues(buf, recipientsFile.originalname));
        }

        if (!message || !String(message).trim()) {
            return res.status(400).json({ success: false, message: 'Message is required' });
        }

        const classified = classifyPhones(phoneNumbers);
        if (!classified.valid.length) {
            return res.status(400).json({
                success: false,
                message: 'At least one valid phone number is required',
                invalid: classified.invalid,
                duplicates: classified.duplicates
            });
        }

        const results = await tgFor(req).sendBulkMessages(
            phoneNumbers,
            message,
            delayMs,
            mediaPath || null
        );

        if (recipientsFile && recipientsFile.path && fs.existsSync(recipientsFile.path)) {
            fs.unlinkSync(recipientsFile.path);
        }
        if (imageFile && imageFile.path && fs.existsSync(imageFile.path)) {
            fs.unlinkSync(imageFile.path);
        }

        res.json({ success: true, data: results });
    } catch (error) {
        if (recipientsFile && recipientsFile.path && fs.existsSync(recipientsFile.path)) {
            try {
                fs.unlinkSync(recipientsFile.path);
            } catch (_) {}
        }
        if (imageFile && imageFile.path && fs.existsSync(imageFile.path)) {
            try {
                fs.unlinkSync(imageFile.path);
            } catch (_) {}
        }
        res.status(500).json({ success: false, message: error.message || 'Failed to send bulk' });
    }
});

router.put('/delay', (req, res) => {
    try {
        const { delay } = req.body || {};
        if (delay === undefined || delay === null) {
            return res.status(400).json({ success: false, message: 'Delay value is required' });
        }
        const delayMs = parseInt(delay, 10);
        const result = tgFor(req).setRateLimitDelay(delayMs);
        res.json({ success: result.success, data: result });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;
