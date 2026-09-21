const express = require('express');
const marketingDb = require('../services/marketingDatabaseService');

const router = express.Router();

function sendError(res, err) {
    const status = err && err.status ? err.status : 400;
    return res.status(status).json({
        success: false,
        message: (err && err.message) || 'Could not complete that request.'
    });
}

router.get('/', (req, res) => {
    try {
        const kind = req.query.kind ? String(req.query.kind).trim() : null;
        let data = marketingDb.listAll({ onlyActive: true, includeContacts: true });
        if (kind) {
            const wanted = kind === 'messaging' ? 'messaging' : 'email';
            data = data.filter((item) => item.kind === wanted);
        }
        res.json({ success: true, data });
    } catch (err) {
        sendError(res, err);
    }
});

module.exports = router;
