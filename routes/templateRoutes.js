'use strict';

const express = require('express');
const templateService = require('../services/templateService');

const router = express.Router();

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

router.get('/categories', (req, res) => {
    if (!requireUser(req, res)) return;
    res.json({ success: true, data: templateService.CATEGORIES });
});

router.post('/compile', (req, res) => {
    const userId = requireUser(req, res);
    if (!userId) return;
    try {
        const html = templateService.compilePreview(req.body || {});
        res.json({ success: true, data: { html } });
    } catch (err) {
        sendError(res, err);
    }
});

router.post('/assets', (req, res) => {
    const userId = requireUser(req, res);
    if (!userId) return;
    try {
        const emailAssetService = require('../services/emailAssetService');
        emailAssetService.assertUploadAllowed(userId);
        const dataUri = req.body && req.body.dataUri;
        const asset = emailAssetService.saveDataUri(userId, dataUri);
        if (!asset) {
            return res.status(400).json({ success: false, message: 'Use a PNG, JPG, GIF, or WebP image.' });
        }
        const publicBase = emailAssetService.publicHttpsBaseFromRequest(req);
        res.json({
            success: true,
            data: {
                src: asset.path,
                publicUrl: publicBase ? publicBase + asset.path : ''
            }
        });
    } catch (err) {
        sendError(res, err);
    }
});

router.get('/', (req, res) => {
    const userId = requireUser(req, res);
    if (!userId) return;
    try {
        const data = templateService.listTemplates(userId, req.query || {});
        res.json({ success: true, data });
    } catch (err) {
        sendError(res, err);
    }
});

router.get('/:id', (req, res) => {
    const userId = requireUser(req, res);
    if (!userId) return;
    try {
        const data = templateService.getTemplate(userId, req.params.id);
        res.json({ success: true, data });
    } catch (err) {
        sendError(res, err);
    }
});

router.post('/', (req, res) => {
    const userId = requireUser(req, res);
    if (!userId) return;
    try {
        const data = templateService.createTemplate(userId, req.body || {});
        res.json({ success: true, data });
    } catch (err) {
        sendError(res, err);
    }
});

router.post('/:id/copy', (req, res) => {
    const userId = requireUser(req, res);
    if (!userId) return;
    try {
        const data = templateService.copyTemplate(userId, req.params.id, req.body || {});
        res.json({ success: true, data });
    } catch (err) {
        sendError(res, err);
    }
});

router.put('/:id', (req, res) => {
    const userId = requireUser(req, res);
    if (!userId) return;
    try {
        const data = templateService.updateTemplate(userId, req.params.id, req.body || {});
        res.json({ success: true, data });
    } catch (err) {
        sendError(res, err);
    }
});

router.delete('/:id', (req, res) => {
    const userId = requireUser(req, res);
    if (!userId) return;
    try {
        const data = templateService.deleteTemplate(userId, req.params.id);
        res.json({ success: true, data });
    } catch (err) {
        sendError(res, err);
    }
});

module.exports = router;
