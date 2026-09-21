const path = require('path');
const express = require('express');
const multer = require('multer');
const billing = require('../services/billingService');
const authService = require('../services/authService');
const { requireVerified } = require('../middleware/auth');
const { sendPrivateFile } = require('../utils/safeSendFile');

const router = express.Router();

const receiptUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 8 * 1024 * 1024, files: 1 },
    fileFilter: (req, file, cb) => {
        const ext = path.extname(String(file.originalname || '')).toLowerCase();
        if (['.png', '.jpg', '.jpeg', '.webp', '.gif', '.pdf'].indexOf(ext) === -1) {
            return cb(new Error('Receipt must be a PNG, JPG, WEBP, GIF, or PDF file.'));
        }
        cb(null, true);
    }
}).single('receipt');

router.get('/plans', (req, res) => {
    const all = billing.plans();
    res.json({ success: true, data: [all.monthly, all.quarterly] });
});

router.get('/config', requireVerified, (req, res) => {
    res.json({ success: true, data: billing.publicPaymentConfig() });
});

router.get('/qr', requireVerified, (req, res) => {
    const file = billing.qrPath();
    const settings = billing.getSettings();
    if (!file || !settings.qr) {
        return res.status(404).json({ success: false, message: 'No payment QR code is configured yet.' });
    }
    res.setHeader('Cache-Control', 'private, no-store');
    res.type(settings.qr.mime || 'image/png');
    return sendPrivateFile(res, file, path.join(__dirname, '..', 'storage', 'billing'), {
        inline: true,
        contentType: settings.qr.mime || 'image/png',
        notFound: 'No payment QR code is configured yet.'
    });
});

router.get('/me', requireVerified, (req, res) => {
    let raw = authService.getRawUserById(req.user.id);
    try {
        raw = billing.expireIfNeeded(raw) || raw;
    } catch (_) {}
    const access = billing.accessFromUser(raw || req.user);
    const latest = billing.latestForUser(req.user.id);
    const history = billing.listPaymentsForUser(req.user.id);
    res.json({
        success: true,
        data: {
            access,
            subscription: access.subscription,
            latestPayment: latest ? billing.publicPayment(latest) : null,
            paymentHistory: history
        }
    });
});

router.post('/submit', requireVerified, (req, res) => {
    receiptUpload(req, res, (err) => {
        if (err) {
            return res.status(400).json({ success: false, message: err.message || 'Could not upload the receipt.' });
        }
        try {
            const payment = billing.submitPayment(req.user, req.body || {}, req.file);
            res.json({
                success: true,
                message: 'Your payment verification request has been submitted. Please wait for admin approval.',
                data: payment
            });
        } catch (error) {
            res.status(400).json({ success: false, message: error.message || 'Could not submit payment.' });
        }
    });
});

module.exports = router;
