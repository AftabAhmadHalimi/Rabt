const path = require('path');
const express = require('express');
const multer = require('multer');
const onboarding = require('../services/onboardingService');
const superAdmin = require('../services/superAdminService');
const { requirePaid } = require('../middleware/auth');
const { sendPrivateFile } = require('../utils/safeSendFile');

const router = express.Router();

const avatarUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 2 * 1024 * 1024, files: 1 },
    fileFilter: (req, file, cb) => {
        const ext = path.extname(String(file.originalname || '')).toLowerCase();
        if (['.png', '.jpg', '.jpeg', '.webp'].indexOf(ext) === -1) {
            return cb(new Error('Profile image must be a PNG, JPG, or WEBP file.'));
        }
        cb(null, true);
    }
}).single('avatar');

router.get('/options', requirePaid, (req, res) => {
    res.json({ success: true, data: onboarding.OPTIONS });
});

router.get('/me', requirePaid, (req, res) => {
    const record = onboarding.loadRecord(req.user);
    res.json({
        success: true,
        data: onboarding.publicRecord(record),
        completed: !!(req.user && req.user.onboardingCompleted)
    });
});

router.post('/save', requirePaid, (req, res) => {
    try {
        const record = onboarding.saveProgress(req.user, req.body || {});
        res.json({ success: true, message: 'Saved.', data: onboarding.publicRecord(record) });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message || 'Could not save onboarding answers.' });
    }
});

router.post('/complete', requirePaid, (req, res) => {
    try {
        const record = onboarding.markCompleted(req.user, req.body || {}, false);
        res.json({
            success: true,
            message: 'Welcome to Rabط.',
            data: onboarding.publicRecord(record),
            next: '/'
        });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message || 'Could not complete onboarding.' });
    }
});

router.post('/skip', requirePaid, (req, res) => {
    try {
        const record = onboarding.markCompleted(req.user, req.body || {}, true);
        res.json({
            success: true,
            message: 'You can edit your preferences later in Settings.',
            data: onboarding.publicRecord(record),
            next: '/'
        });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message || 'Could not skip onboarding.' });
    }
});

router.post('/avatar', requirePaid, (req, res) => {
    avatarUpload(req, res, (err) => {
        if (err) return res.status(400).json({ success: false, message: err.message || 'Could not upload image.' });
        try {
            const data = onboarding.saveAvatar(req.user, req.file);
            res.json({ success: true, message: 'Profile image saved.', data });
        } catch (error) {
            res.status(400).json({ success: false, message: error.message || 'Could not save profile image.' });
        }
    });
});

router.get('/avatar', requirePaid, (req, res) => {
    const file = onboarding.findAvatarPath(req.user.id);
    if (!file) return res.status(404).json({ success: false, message: 'No profile image yet.' });
    res.setHeader('Cache-Control', 'private, no-store');
    return sendPrivateFile(res, file, path.join(__dirname, '..', 'storage', 'onboarding-avatars'), {
        inline: true,
        notFound: 'No profile image yet.'
    });
});

router.get('/android', requirePaid, (req, res) => {
    res.json({ success: true, data: superAdmin.androidAppPublic() });
});

module.exports = router;
