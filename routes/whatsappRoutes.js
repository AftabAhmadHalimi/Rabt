const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const whatsappService = require('../services/whatsappService');
const { ensureTenant } = require('../middleware/auth');
const { classifyPhones, extractPhoneValues } = require('../utils/recipients');
const { safeStoredName, isBlockedExt } = require('../utils/uploadSafety');

function waFor(req) {
    return whatsappService.forUser(req.user.id);
}

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uid = req.user && req.user.id ? String(req.user.id) : '';
        if (!uid) return cb(new Error('Not authenticated'));
        const uploadDir = path.join(__dirname, '..', 'storage', 'uploads', uid, 'whatsapp');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        const name = safeStoredName(file.originalname);
        if (!name) return cb(new Error('Invalid file type'));
        cb(null, name);
    }
});

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 16 * 1024 * 1024
    },
    fileFilter: (req, file, cb) => {
        if (isBlockedExt(file.originalname)) {
            return cb(new Error('This file type is not allowed'));
        }
        const ext = path.extname(file.originalname || '').toLowerCase();
        const isRecipientsField = file.fieldname === 'file';
        if (isRecipientsField) {
            const isTxtMime = file.mimetype === 'text/plain' || file.mimetype === 'application/octet-stream';
            if (ext === '.txt' || isTxtMime) {
                cb(null, true);
                return;
            }

            const okXls = ext === '.xls' || file.mimetype === 'application/vnd.ms-excel';
            const okXlsx =
                ext === '.xlsx' ||
                file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

            if (okXls || okXlsx) {
                cb(null, true);
                return;
            }

            cb(new Error('Invalid recipients file. Please upload a .txt or .xls/.xlsx file'));
            return;
        }

        const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'audio/mpeg', 'audio/ogg', 'video/mp4', 'application/pdf'];
        if (allowedTypes.includes(file.mimetype) || file.mimetype.startsWith('image/') || file.mimetype.startsWith('audio/') || file.mimetype.startsWith('video/')) {
            cb(null, true);
        } else {
            cb(new Error('Invalid file type. Allowed: images, audio, video, PDF'));
        }
    }
});

router.post('/connect', async (req, res) => {
    try {
        const result = await waFor(req).initializeClient();
        res.json({
            success: true,
            status: result.status,
            message: 'WhatsApp client initialized. Please scan the QR code.'
        });
    } catch (error) {
        console.error('Error connecting WhatsApp:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to initialize WhatsApp client'
        });
    }
});

router.get('/status', async (req, res) => {
    try {
        const client = waFor(req);
        await client.promoteReady(1200);
        res.json({
            success: true,
            data: client.getStatus()
        });
    } catch (error) {
        console.error('Error getting status:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to get WhatsApp status'
        });
    }
});

router.get('/qrcode', async (req, res) => {
    try {
        const qrData = waFor(req).getQRCode();
        res.json({
            success: true,
            data: qrData
        });
    } catch (error) {
        console.error('Error getting QR code:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to get QR code'
        });
    }
});

router.post('/rescan', async (req, res) => {
    try {
        await waFor(req).destroySession();
        const result = await waFor(req).rescan();
        res.json({
            success: true,
            status: result.status,
            message: 'Session cleared. Please scan the new QR code.'
        });
    } catch (error) {
        console.error('Error rescanning:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to rescan'
        });
    }
});

router.post('/disconnect', async (req, res) => {
    try {
        const result = await waFor(req).destroySession();
        res.json({
            success: true,
            status: result.status,
            message: result.message
        });
    } catch (error) {
        console.error('Error disconnecting:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to disconnect'
        });
    }
});

router.post('/send', async (req, res) => {
    try {
        const { phoneNumber, message } = req.body;

        if (!phoneNumber || !message) {
            return res.status(400).json({
                success: false,
                message: 'Phone number and message are required'
            });
        }

        const result = await waFor(req).sendMessage(phoneNumber, message);
        res.json({
            success: true,
            data: result
        });
    } catch (error) {
        console.error('Error sending message:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to send message'
        });
    }
});

router.post('/send-bulk', upload.fields([
    { name: 'file', maxCount: 1 },
    { name: 'image', maxCount: 1 }
]), ensureTenant, async (req, res) => {
    try {
        let phoneNumbers = [];
        let message = req.body.message;
        let delay = parseInt(req.body.delay) || 2000;
        const recipientsFile = req.files && req.files.file ? req.files.file[0] : null;
        const imageFile = req.files && req.files.image ? req.files.image[0] : null;
        let mediaPath = imageFile ? imageFile.path : null;

        if (req.body.phoneNumbers && typeof req.body.phoneNumbers === 'string') {
            phoneNumbers = req.body.phoneNumbers.split(/[\n,]/);
        } else if (Array.isArray(req.body.phoneNumbers)) {
            phoneNumbers = req.body.phoneNumbers;
        }

        if (recipientsFile && recipientsFile.path) {
            const filePath = recipientsFile.path;
            if (fs.existsSync(filePath)) {
                const fileBuffer = fs.readFileSync(filePath);
                phoneNumbers = phoneNumbers.concat(extractPhoneValues(fileBuffer, recipientsFile.originalname));
            }
        }

        if (!message) {
            return res.status(400).json({
                success: false,
                message: 'Message is required'
            });
        }

        const classified = classifyPhones(phoneNumbers);
        if (classified.valid.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'At least one valid phone number is required',
                invalid: classified.invalid,
                duplicates: classified.duplicates
            });
        }

        const results = await waFor(req).sendBulkMessages(phoneNumbers, message, delay, mediaPath);

        if (recipientsFile && recipientsFile.path && fs.existsSync(recipientsFile.path)) {
            fs.unlinkSync(recipientsFile.path);
        }
        if (imageFile && imageFile.path && fs.existsSync(imageFile.path)) {
            fs.unlinkSync(imageFile.path);
        }

        res.json({
            success: true,
            data: results
        });
    } catch (error) {
        console.error('Error sending bulk messages:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to send bulk messages'
        });
    }
});

router.post('/send-with-media', upload.single('media'), ensureTenant, async (req, res) => {
    try {
        const { phoneNumber, message } = req.body;
        const mediaPath = req.file ? req.file.path : null;

        if (!phoneNumber) {
            return res.status(400).json({
                success: false,
                message: 'Phone number is required'
            });
        }

        if (!mediaPath && !message) {
            return res.status(400).json({
                success: false,
                message: 'Either message or media is required'
            });
        }

        const result = await waFor(req).sendMessageWithMedia(phoneNumber, message, mediaPath);

        if (mediaPath && fs.existsSync(mediaPath)) {
            fs.unlinkSync(mediaPath);
        }

        res.json({
            success: true,
            data: result
        });
    } catch (error) {
        console.error('Error sending message with media:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to send message with media'
        });
    }
});

router.get('/contacts', async (req, res) => {
    try {
        const contacts = await waFor(req).getContacts();
        res.json({
            success: true,
            data: contacts,
            count: contacts.length
        });
    } catch (error) {
        console.error('Error getting contacts:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to get contacts'
        });
    }
});

router.get('/chats', async (req, res) => {
    try {
        const chats = await waFor(req).getChats();
        res.json({
            success: true,
            data: chats,
            count: chats.length
        });
    } catch (error) {
        console.error('Error getting chats:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to get chats'
        });
    }
});

router.put('/delay', async (req, res) => {
    try {
        const { delay } = req.body;

        if (delay === undefined || delay === null) {
            return res.status(400).json({
                success: false,
                message: 'Delay value is required'
            });
        }

        const delayMs = parseInt(delay);
        if (isNaN(delayMs) || delayMs < 500) {
            return res.status(400).json({
                success: false,
                message: 'Delay must be a number and at least 500ms'
            });
        }

        const result = waFor(req).setRateLimitDelay(delayMs);
        res.json({
            success: result.success,
            data: result
        });
    } catch (error) {
        console.error('Error setting delay:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to set delay'
        });
    }
});

module.exports = router;
