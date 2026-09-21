const path = require('path');
const express = require('express');
const listLibrary = require('../services/listLibrary');
const { sendPrivateFile } = require('../utils/safeSendFile');

const router = express.Router();
const LISTS_ROOT = path.join(__dirname, '..', 'storage', 'lists');

function safeId(value) {
    const id = String(value || '');
    if (!id || /[\\/]/.test(id) || id.indexOf('..') !== -1) return '';
    if (!/^[A-Za-z0-9._-]+$/.test(id)) return '';
    return id;
}

router.get('/:id/download', (req, res) => {
    const userId = req.user && req.user.id;
    if (!userId) {
        return res.status(401).json({ success: false, message: 'Please sign in.' });
    }
    const id = safeId(req.params.id);
    if (!id) {
        return res.status(404).json({ success: false, message: 'File not found.' });
    }
    try {
        const download = listLibrary.getDownload(userId, id);
        if (!download) {
            return res.status(404).json({ success: false, message: 'File not found.' });
        }
        return sendPrivateFile(res, download.filePath, LISTS_ROOT, {
            filename: download.downloadName,
            contentType: download.mime,
            notFound: 'File not found.'
        });
    } catch (err) {
        return res.status(err.status || 404).json({
            success: false,
            message: 'File not found.'
        });
    }
});

module.exports = router;
