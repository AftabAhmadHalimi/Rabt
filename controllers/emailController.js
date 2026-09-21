const emailService = require('../services/NamecheapEmailService');
const trackingService = require('../services/trackingService');
const { decodeHtmlBuffer } = require('../utils/emailTemplates');
const { parseEmailBuffer, classifyEmails } = require('../utils/recipients');

function withTracking(req, extra) {
    return Object.assign({}, extra || {}, {
        publicBaseUrl: trackingService.rememberPublicBaseFromRequest(req),
        userId: req.user && req.user.id,
        businessId: req.user && (req.user.businessId || req.user.id)
    });
}

function parseRecipientsFromBuffer(buffer, originalName, emailColumn) {
    const parsed = parseEmailBuffer(buffer, originalName, emailColumn);
    return {
        validRecipients: parsed.valid,
        invalidRecipients: parsed.invalid,
        duplicateRecipients: parsed.duplicates
    };
}

class EmailController {
    async sendBulkEmail(req, res) {
        try {
            const { recipients, subject, htmlContent } = req.body;
            
            if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Please provide at least one recipient email address'
                });
            }
            
            if (!subject || subject.trim().length < 3) {
                return res.status(400).json({
                    success: false,
                    message: 'Email subject must be at least 3 characters long'
                });
            }
            
            if (!htmlContent || htmlContent.trim().length < 10) {
                return res.status(400).json({
                    success: false,
                    message: 'Email content cannot be empty'
                });
            }
            
            const classified = classifyEmails(recipients);
            if (classified.valid.length === 0) {
                return res.status(400).json({
                    success: false,
                    message: 'No valid email addresses found',
                    invalidRecipients: classified.invalid,
                    duplicateRecipients: classified.duplicates
                });
            }

            const result = await emailService.sendBulkEmail(
                classified.valid,
                subject,
                htmlContent,
                null,
                [],
                withTracking(req)
            );
            
            res.json({
                success: true,
                message: `Email successfully sent to ${result.recipientsCount} recipients`,
                data: result
            });

        } catch (error) {
            res.status(500).json({
                success: false,
                message: error.message
            });
        }
    }

    async sendBulkEmailFromFile(req, res) {
        try {
            const { subject, htmlContent, delayMs } = req.body;
            const delay = parseInt(delayMs) || 5000;

            const recipientsFile =
                req.files &&
                req.files.recipientsFile &&
                req.files.recipientsFile[0];

            if (!recipientsFile || !recipientsFile.buffer) {
                return res.status(400).json({
                    success: false,
                    message: 'Please upload a txt file with email addresses (one per line)'
                });
            }

            if (!subject || subject.trim().length < 3) {
                return res.status(400).json({
                    success: false,
                    message: 'Email subject must be at least 3 characters long'
                });
            }

            const htmlTemplateFile = req.files && req.files.htmlTemplate && req.files.htmlTemplate[0];
            const templateHtml = htmlTemplateFile && htmlTemplateFile.buffer ? decodeHtmlBuffer(htmlTemplateFile.buffer) : '';
            const effectiveHtml = (templateHtml || htmlContent || '').trim();
            if (!effectiveHtml || effectiveHtml.length < 10) {
                return res.status(400).json({
                    success: false,
                    message: 'Email content cannot be empty (provide htmlContent or upload an HTML template)'
                });
            }

            const filename = recipientsFile.originalname || '';
            const emailColumn = req.body.emailColumn;
            const { validRecipients, invalidRecipients, duplicateRecipients } =
                parseRecipientsFromBuffer(recipientsFile.buffer, filename, emailColumn);

            if (validRecipients.length === 0) {
                return res.status(400).json({
                    success: false,
                    message: 'No valid email addresses found in the uploaded file',
                    invalidRecipients,
                    duplicateRecipients
                });
            }

            let imageAttachment = null;
            const imageFile =
                req.files &&
                req.files.image &&
                req.files.image[0];

            if (imageFile && imageFile.buffer) {
                imageAttachment = {
                    filename: imageFile.originalname,
                    content: imageFile.buffer,
                    contentType: imageFile.mimetype,
                    cid: 'embedded-image@emailsystem'
                };
            }

            let extraAttachments = [];
            if (req.files && req.files.attachments) {
                extraAttachments = req.files.attachments
                    .filter(f => f.buffer)
                    .map(f => ({
                        filename: f.originalname,
                        content: f.buffer,
                        contentType: f.mimetype
                    }));
            }

            const result = await emailService.sendBulkEmail(
                validRecipients,
                subject,
                effectiveHtml,
                imageAttachment,
                extraAttachments,
                withTracking(req, {
                    delayMs: delay,
                    useRawHtml: !!templateHtml
                })
            );

            res.json({
                success: true,
                message: `Email successfully sent to ${result.sentCount} valid recipients`,
                data: {
                    ...result,
                    validRecipients,
                    invalidRecipients,
                    duplicateRecipients
                }
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                message: error.message
            });
        }
    }

    async sendBulkEmailStream(req, res) {
        try {
            const { subject, htmlContent, delayMs } = req.body;
            const delay = parseInt(delayMs) || 5000;
            
            if (!subject || subject.trim().length < 3) {
                return res.status(400).json({
                    success: false,
                    message: 'Email subject must be at least 3 characters long'
                });
            }
            
            const htmlTemplateFile = req.files && req.files.htmlTemplate && req.files.htmlTemplate[0];
            const templateHtml = htmlTemplateFile && htmlTemplateFile.buffer ? decodeHtmlBuffer(htmlTemplateFile.buffer) : '';
            const effectiveHtml = (templateHtml || htmlContent || '').trim();
            if (!effectiveHtml || effectiveHtml.length < 10) {
                return res.status(400).json({
                    success: false,
                    message: 'Email content cannot be empty (provide htmlContent or upload an HTML template)'
                });
            }

            const recipientsFile =
                req.files &&
                req.files.recipientsFile &&
                req.files.recipientsFile[0];

            if (!recipientsFile || !recipientsFile.buffer) {
                return res.status(400).json({
                    success: false,
                    message: 'Please upload a txt file with email addresses (one per line)'
                });
            }

            const filename = recipientsFile.originalname || '';
            const emailColumn = req.body.emailColumn;
            const { validRecipients, invalidRecipients, duplicateRecipients } =
                parseRecipientsFromBuffer(recipientsFile.buffer, filename, emailColumn);

            if (validRecipients.length === 0) {
                return res.status(400).json({
                    success: false,
                    message: 'No valid email addresses found in the uploaded file',
                    invalidRecipients,
                    duplicateRecipients
                });
            }

            let imageAttachment = null;
            const imageFile = req.files && req.files.image && req.files.image[0];
            if (imageFile && imageFile.buffer) {
                imageAttachment = {
                    filename: imageFile.originalname,
                    content: imageFile.buffer,
                    contentType: imageFile.mimetype,
                    cid: 'embedded-image@emailsystem'
                };
            }

            let extraAttachments = [];
            if (req.files && req.files.attachments) {
                extraAttachments = req.files.attachments
                    .filter(f => f.buffer)
                    .map(f => ({
                        filename: f.originalname,
                        content: f.buffer,
                        contentType: f.mimetype
                    }));
            }

            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');
            res.flushHeaders();

            const sendEvent = (data) => {
                res.write(`data: ${JSON.stringify(data)}\n\n`);
            };

            invalidRecipients.forEach(email => {
                sendEvent({ type: 'invalid', recipient: email, error: 'Invalid format' });
            });
            duplicateRecipients.forEach(email => {
                sendEvent({ type: 'duplicate', recipient: email, error: 'Duplicate address' });
            });

            await emailService.sendBulkEmail(
                validRecipients, 
                subject, 
                effectiveHtml, 
                imageAttachment, 
                extraAttachments,
                withTracking(req, {
                    delayMs: delay,
                    onStatus: sendEvent,
                    useRawHtml: !!templateHtml
                })
            );

            res.end();
            
        } catch (error) {
            res.write(`data: ${JSON.stringify({ type: 'error', error: error.message })}\n\n`);
            res.end();
        }
    }
    
    async testConnection(req, res) {
        try {
            const result = await emailService.testConnection(req.user && req.user.id);
            res.json(result);
        } catch (error) {
            res.status(500).json({
                success: false,
                message: error.message
            });
        }
    }
}

module.exports = new EmailController();
