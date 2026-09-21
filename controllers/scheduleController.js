const scheduleService = require('../services/scheduleService');
const { decodeHtmlBuffer } = require('../utils/emailTemplates');
const { parseEmailBuffer, parsePhoneBuffer } = require('../utils/recipients');

function parseEmailsFromBuffer(buffer, originalName) {
    return parseEmailBuffer(buffer, originalName).valid;
}

function parsePhonesFromBuffer(buffer, originalName) {
    return parsePhoneBuffer(buffer, originalName).valid;
}

function formatRunAt(schedule) {
    const t = `${String(schedule.hour).padStart(2, '0')}:${String(schedule.minute).padStart(2, '0')}`;
    if (schedule.nextRun) {
        const d = new Date(schedule.nextRun);
        if (!isNaN(d.getTime())) {
            const dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
            return `${dateStr} at ${t}`;
        }
    }
    if (schedule.date) return `${schedule.date} at ${t}`;
    return t;
}

function sendError(res, error) {
    const code = error && error.statusCode ? error.statusCode : 500;
    res.status(code).json({ success: false, message: error.message });
}

// ── Controller ───────────────────────────────────────────────────────────────

class ScheduleController {

    async createEmailSchedule(req, res) {
        try {
            const { name, hour, minute, date, repeat, subject, htmlContent, delayMs } = req.body;

            if (!name || !name.trim()) {
                return res.status(400).json({ success: false, message: 'Schedule name is required' });
            }
            if (hour === undefined || minute === undefined) {
                return res.status(400).json({ success: false, message: 'Hour and minute are required' });
            }
            if (!subject || subject.trim().length < 3) {
                return res.status(400).json({ success: false, message: 'Email subject must be at least 3 characters' });
            }

            // Parse recipients file
            const recipientsFile = req.files && req.files.recipientsFile && req.files.recipientsFile[0];
            if (!recipientsFile || !recipientsFile.buffer) {
                return res.status(400).json({ success: false, message: 'Please upload a recipients file (.txt or .xlsx)' });
            }

            const recipients = parseEmailsFromBuffer(recipientsFile.buffer, recipientsFile.originalname);
            if (recipients.length === 0) {
                return res.status(400).json({ success: false, message: 'No valid email addresses found in the uploaded file' });
            }

            // Determine HTML content
            const templateFile = req.files && req.files.htmlTemplate && req.files.htmlTemplate[0];
            const effectiveHtml = templateFile
                ? decodeHtmlBuffer(templateFile.buffer)
                : (htmlContent || '').trim();

            if (!effectiveHtml || effectiveHtml.replace(/<[^>]*>/g, '').trim().length < 5) {
                return res.status(400).json({ success: false, message: 'Email content is required' });
            }

            const schedule = scheduleService.createSchedule({
                name,
                type: 'email',
                hour: parseInt(hour),
                minute: parseInt(minute),
                date,
                repeat: repeat || 'once',
                config: {
                    recipients,
                    subject: subject.trim(),
                    htmlContent: effectiveHtml,
                    delayMs: parseInt(delayMs) || 5000
                }
            }, req.user && req.user.id);

            res.json({
                success: true,
                message: `Email schedule "${schedule.name}" created. Will run on ${formatRunAt(schedule)}.`,
                data: schedule
            });
        } catch (error) {
            sendError(res, error);
        }
    }

    async createWhatsappSchedule(req, res) {
        try {
            const { name, hour, minute, date, repeat, message, delayMs } = req.body;

            if (!name || !name.trim()) {
                return res.status(400).json({ success: false, message: 'Schedule name is required' });
            }
            if (hour === undefined || minute === undefined) {
                return res.status(400).json({ success: false, message: 'Hour and minute are required' });
            }
            if (!message || message.trim().length < 1) {
                return res.status(400).json({ success: false, message: 'Message is required' });
            }

            const recipientsFile = req.files && req.files.recipientsFile && req.files.recipientsFile[0];
            if (!recipientsFile || !recipientsFile.buffer) {
                return res.status(400).json({ success: false, message: 'Please upload a phone numbers file (.txt or .xlsx)' });
            }

            const phoneNumbers = parsePhonesFromBuffer(recipientsFile.buffer, recipientsFile.originalname);
            if (phoneNumbers.length === 0) {
                return res.status(400).json({ success: false, message: 'No valid phone numbers found in the uploaded file' });
            }

            const schedule = scheduleService.createSchedule({
                name,
                type: 'whatsapp',
                hour: parseInt(hour),
                minute: parseInt(minute),
                date,
                repeat: repeat || 'once',
                config: {
                    phoneNumbers,
                    message: message.trim(),
                    delayMs: parseInt(delayMs) || 2000
                }
            }, req.user && req.user.id);

            res.json({
                success: true,
                message: `WhatsApp schedule "${schedule.name}" created. Will run on ${formatRunAt(schedule)}.`,
                data: schedule
            });
        } catch (error) {
            sendError(res, error);
        }
    }

    async createTelegramSchedule(req, res) {
        try {
            const { name, hour, minute, date, repeat, message, delayMs } = req.body;

            if (!name || !name.trim()) {
                return res.status(400).json({ success: false, message: 'Schedule name is required' });
            }
            if (hour === undefined || minute === undefined) {
                return res.status(400).json({ success: false, message: 'Hour and minute are required' });
            }
            if (!message || message.trim().length < 1) {
                return res.status(400).json({ success: false, message: 'Message is required' });
            }

            const recipientsFile = req.files && req.files.recipientsFile && req.files.recipientsFile[0];
            if (!recipientsFile || !recipientsFile.buffer) {
                return res.status(400).json({ success: false, message: 'Please upload a phone numbers file (.txt or .xlsx)' });
            }

            const phoneNumbers = parsePhonesFromBuffer(recipientsFile.buffer, recipientsFile.originalname);
            if (phoneNumbers.length === 0) {
                return res.status(400).json({ success: false, message: 'No valid phone numbers found in the uploaded file' });
            }

            const schedule = scheduleService.createSchedule({
                name,
                type: 'telegram',
                hour: parseInt(hour),
                minute: parseInt(minute),
                date,
                repeat: repeat || 'once',
                config: {
                    phoneNumbers,
                    message: message.trim(),
                    delayMs: parseInt(delayMs) || 2000
                }
            }, req.user && req.user.id);

            res.json({
                success: true,
                message: `Telegram schedule "${schedule.name}" created. Will run on ${formatRunAt(schedule)}.`,
                data: schedule
            });
        } catch (error) {
            sendError(res, error);
        }
    }

    listSchedules(req, res) {
        try {
            const schedules = scheduleService.getSchedules(req.user && req.user.id);
            res.json({ success: true, data: schedules, count: schedules.length });
        } catch (error) {
            res.status(500).json({ success: false, message: error.message });
        }
    }

    getSchedule(req, res) {
        try {
            const schedule = scheduleService.getSchedule(req.params.id, req.user && req.user.id);
            if (!schedule) {
                return res.status(404).json({ success: false, message: 'Schedule not found' });
            }
            res.json({ success: true, data: schedule });
        } catch (error) {
            res.status(500).json({ success: false, message: error.message });
        }
    }

    cancelSchedule(req, res) {
        try {
            const result = scheduleService.cancelSchedule(req.params.id, req.user && req.user.id);
            if (!result) {
                return res.status(404).json({ success: false, message: 'Schedule not found' });
            }
            res.json({ success: true, message: 'Schedule cancelled', data: result });
        } catch (error) {
            res.status(500).json({ success: false, message: error.message });
        }
    }

    deleteSchedule(req, res) {
        try {
            const deleted = scheduleService.deleteSchedule(req.params.id, req.user && req.user.id);
            if (!deleted) {
                return res.status(404).json({ success: false, message: 'Schedule not found' });
            }
            res.json({ success: true, message: 'Schedule deleted' });
        } catch (error) {
            res.status(500).json({ success: false, message: error.message });
        }
    }

    async runNow(req, res) {
        try {
            const schedule = scheduleService.getSchedule(req.params.id, req.user && req.user.id);
            if (!schedule) {
                return res.status(404).json({ success: false, message: 'Schedule not found' });
            }
            // Fire in background, respond immediately
            const started = scheduleService.runNow(req.params.id, req.user && req.user.id);
            if (started && typeof started.catch === 'function') {
                started.catch(err => {
                    console.error('[Schedule] runNow error:', err.message);
                });
            }
            res.json({ success: true, message: `Schedule "${schedule.name}" is now running...` });
        } catch (error) {
            res.status(500).json({ success: false, message: error.message });
        }
    }

    liveLog(req, res) {
        const { id } = req.params;
        const userId = req.user && req.user.id;
        const schedule = scheduleService.getSchedule(id, userId);
        if (!schedule) {
            return res.status(404).json({ success: false, message: 'Schedule not found' });
        }

        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.flushHeaders();

        const send = (data) => {
            try { res.write(`data: ${JSON.stringify(data)}\n\n`); } catch (_) {}
        };

        // Replay buffered events so late-connecting clients catch up
        scheduleService.getLogBuffer(id, userId).forEach(evt => send(evt));

        // If already in a terminal state, signal complete and close
        const current = scheduleService.getSchedule(id, userId);
        if (current && ['completed', 'failed', 'cancelled'].includes(current.status)) {
            send({ type: 'scheduleComplete', status: current.status });
            res.end();
            return;
        }

        // Subscribe to future log events
        const handler = (evt) => send(evt);
        scheduleService.on(`log:${id}`, handler);

        // Close SSE when scheduleComplete / scheduleError arrives
        // handler already sent the event; just clean up and end the response
        const doneHandler = (evt) => {
            if (evt.type === 'scheduleComplete' || evt.type === 'scheduleError') {
                scheduleService.off(`log:${id}`, handler);
                scheduleService.off(`log:${id}`, doneHandler);
                try { res.end(); } catch (_) {}
            }
        };
        scheduleService.on(`log:${id}`, doneHandler);

        // Clean up listeners if the client disconnects first
        req.on('close', () => {
            scheduleService.off(`log:${id}`, handler);
            scheduleService.off(`log:${id}`, doneHandler);
        });
    }
}

module.exports = new ScheduleController();
