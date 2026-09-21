const express = require('express');
const multer = require('multer');
const listLibrary = require('../services/listLibrary');
const { sendPrivateFile } = require('../utils/safeSendFile');
const path = require('path');

const router = express.Router();

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 20 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const ext = (file.originalname || '').toLowerCase();
        const okTxt = file.mimetype === 'text/plain' || ext.endsWith('.txt');
        const okXls = ext.endsWith('.xls') || file.mimetype === 'application/vnd.ms-excel';
        const okXlsx = ext.endsWith('.xlsx') || file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
        if (okTxt || okXls || okXlsx) return cb(null, true);
        return cb(new Error('Upload a .txt, .xls, or .xlsx file.'));
    }
});

function sendError(res, err) {
    const status = err && err.status ? err.status : 400;
    return res.status(status).json({
        success: false,
        message: (err && err.message) || 'Could not complete that request.'
    });
}

function requireUser(req, res) {
    const userId = req.user && req.user.id;
    if (!userId) {
        res.status(401).json({ success: false, message: 'Please sign in.' });
        return null;
    }
    return userId;
}

router.get('/', (req, res) => {
    const userId = requireUser(req, res);
    if (!userId) return;
    try {
        const kind = req.query.kind ? listLibrary.sanitizeKind(req.query.kind) : null;
        const data = listLibrary.listLists(userId, kind);
        res.json({ success: true, data });
    } catch (err) {
        sendError(res, err);
    }
});

router.post('/', (req, res, next) => {
    upload.single('file')(req, res, (err) => {
        if (err) return sendError(res, err);
        next();
    });
}, (req, res) => {
    const userId = requireUser(req, res);
    if (!userId) return;
    try {
        if (!req.file || !req.file.buffer) {
            return res.status(400).json({ success: false, message: 'Choose a file to upload.' });
        }
        const body = req.body || {};
        if (body.marketingListId || body.fromMarketingDatabase) {
            return res.status(403).json({
                success: false,
                message: 'Marketing Database lists cannot be saved on the Contact page. Use them from Marketing Database only.'
            });
        }
        const saved = listLibrary.saveList(userId, {
            kind: req.body && req.body.kind,
            name: req.body && req.body.name,
            originalName: req.file.originalname,
            buffer: req.file.buffer
        });
        res.json({ success: true, data: saved });
    } catch (err) {
        sendError(res, err);
    }
});

router.post('/remove-contacts', (req, res) => {
    const userId = requireUser(req, res);
    if (!userId) return;
    try {
        const changed = listLibrary.removeContacts(userId, {
            emails: req.body && req.body.emails,
            phones: req.body && req.body.phones
        });
        res.json({ success: true, data: { changed } });
    } catch (err) {
        sendError(res, err);
    }
});

router.post('/delete-many', (req, res) => {
    const userId = requireUser(req, res);
    if (!userId) return;
    try {
        const removed = listLibrary.deleteLists(userId, req.body && req.body.ids);
        res.json({ success: true, data: { removed } });
    } catch (err) {
        sendError(res, err);
    }
});

router.get('/:id/download', (req, res) => {
    const userId = requireUser(req, res);
    if (!userId) return;
    try {
        const download = listLibrary.getDownload(userId, req.params.id);
        if (!download) {
            return res.status(404).json({ success: false, message: 'List not found.' });
        }
        res.setHeader('Content-Type', download.mime);
        res.setHeader('Content-Disposition', 'attachment; filename="' + download.downloadName.replace(/"/g, '') + '"');
        res.setHeader('Cache-Control', 'private, no-store');
        return sendPrivateFile(res, download.filePath, path.join(__dirname, '..', 'storage', 'lists'), {
            filename: download.downloadName,
            contentType: download.mime,
            notFound: 'List not found.'
        });
    } catch (err) {
        sendError(res, err);
    }
});

router.delete('/:id', (req, res) => {
    const userId = requireUser(req, res);
    if (!userId) return;
    try {
        const removed = listLibrary.deleteList(userId, req.params.id);
        if (!removed) {
            return res.status(404).json({ success: false, message: 'List not found.' });
        }
        res.json({ success: true });
    } catch (err) {
        sendError(res, err);
    }
});

module.exports = router;
