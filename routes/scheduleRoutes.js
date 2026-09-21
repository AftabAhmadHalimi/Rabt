const express = require('express');
const router = express.Router();
const multer = require('multer');
const scheduleController = require('../controllers/scheduleController');
const { ensureTenant } = require('../middleware/auth');

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 20 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (file.fieldname === 'recipientsFile') {
            const ext = (file.originalname || '').toLowerCase();
            const okTxt = file.mimetype === 'text/plain' || ext.endsWith('.txt');
            const okXls = ext.endsWith('.xls') || file.mimetype === 'application/vnd.ms-excel';
            const okXlsx = ext.endsWith('.xlsx') || file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
            if (okTxt || okXls || okXlsx) return cb(null, true);
            return cb(new Error('Invalid recipients file. Upload .txt or .xls/.xlsx'));
        }
        if (file.fieldname === 'htmlTemplate') {
            const ext = (file.originalname || '').toLowerCase();
            if (ext.endsWith('.html')) return cb(null, true);
            return cb(new Error('HTML template must be a .html file'));
        }
        cb(new Error('Unexpected file field: ' + file.fieldname));
    }
});

const emailUpload = upload.fields([
    { name: 'recipientsFile', maxCount: 1 },
    { name: 'htmlTemplate', maxCount: 1 }
]);

const whatsappUpload = upload.fields([
    { name: 'recipientsFile', maxCount: 1 }
]);

// Create schedules
router.post('/email', emailUpload, ensureTenant, (req, res) => scheduleController.createEmailSchedule(req, res));
router.post('/whatsapp', whatsappUpload, ensureTenant, (req, res) => scheduleController.createWhatsappSchedule(req, res));
router.post('/telegram', whatsappUpload, ensureTenant, (req, res) => scheduleController.createTelegramSchedule(req, res));

// List / Get
router.get('/', (req, res) => scheduleController.listSchedules(req, res));
router.get('/:id', (req, res) => scheduleController.getSchedule(req, res));

// Actions
router.post('/:id/run-now', (req, res) => scheduleController.runNow(req, res));
router.post('/:id/cancel', (req, res) => scheduleController.cancelSchedule(req, res));
router.delete('/:id', (req, res) => scheduleController.deleteSchedule(req, res));

// Live log SSE stream
router.get('/:id/live-log', (req, res) => scheduleController.liveLog(req, res));

module.exports = router;
