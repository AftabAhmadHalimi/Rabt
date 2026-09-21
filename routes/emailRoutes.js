const express = require('express');
const router = express.Router();
const multer = require('multer');
const emailController = require('../controllers/emailController');
const { ensureTenant } = require('../middleware/auth');

// Multer configuration for txt + image + document uploads (memory storage)
// Increase file size limit so larger files are allowed.
const upload = multer({
    limits: {
        fileSize: 20 * 1024 * 1024 // 20MB max per file
    },
    fileFilter: (req, file, cb) => {
        if (file.fieldname === 'recipientsFile') {
            const ext = (file.originalname || '').toLowerCase();
            const okTxt = file.mimetype === 'text/plain' || ext.endsWith('.txt');
            const okXls = ext.endsWith('.xls') || file.mimetype === 'application/vnd.ms-excel';
            const okXlsx = ext.endsWith('.xlsx') || file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
            if (okTxt) return cb(null, true);
            if (okXls || okXlsx) return cb(null, true);
            return cb(new Error('Invalid recipients file. Upload .txt or .xls/.xlsx'));
        } else if (file.fieldname === 'htmlTemplate') {
            const ext = (file.originalname || '').toLowerCase();
            const okMime = file.mimetype === 'text/html' || file.mimetype === 'application/octet-stream' || file.mimetype === 'text/plain';
            if (okMime && ext.endsWith('.html')) cb(null, true);
            else cb(new Error('Unsupported HTML template type'));
        } else if (file.fieldname === 'image' && file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else if (file.fieldname === 'attachments') {
            // Allow common document types: pdf, Word, Excel, PowerPoint, txt
            const allowed = [
                'application/pdf',
                'application/msword',
                'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                'application/vnd.ms-excel',
                'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                'application/vnd.ms-powerpoint',
                'application/vnd.openxmlformats-officedocument.presentationml.presentation',
                'text/plain'
            ];
            if (allowed.includes(file.mimetype)) {
                cb(null, true);
            } else {
                cb(new Error('Unsupported attachment type'));
            }
        } else {
            cb(new Error('Only .txt recipient files, images, and document attachments are allowed'));
        }
    }
});

// Public routes (no authentication required)
router.post('/send-bulk', ensureTenant, emailController.sendBulkEmail);
router.post(
    '/send-from-file',
    upload.fields([
        { name: 'recipientsFile', maxCount: 1 },
        { name: 'htmlTemplate', maxCount: 1 },
        { name: 'image', maxCount: 1 },
        { name: 'attachments', maxCount: 5 }
    ]),
    ensureTenant,
    (req, res) => emailController.sendBulkEmailFromFile(req, res)
);
router.get('/test-connection', ensureTenant, (req, res) => emailController.testConnection(req, res));
router.post('/send-stream',
    upload.fields([
        { name: 'recipientsFile', maxCount: 1 },
        { name: 'htmlTemplate', maxCount: 1 },
        { name: 'image', maxCount: 1 },
        { name: 'attachments', maxCount: 5 }
    ]),
    ensureTenant,
    (req, res) => emailController.sendBulkEmailStream(req, res)
);

module.exports = router;