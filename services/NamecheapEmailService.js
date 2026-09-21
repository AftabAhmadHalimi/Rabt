const nodemailer = require('nodemailer');
const { v4: uuidv4 } = require('uuid');
const { getEmailConfig, isConfigured, isSharedDefaultSmtp } = require('../config/emailConfig');
const { prepareOutboundEmail } = require('../utils/emailTemplates');
const activityService = require('./activityService');
const trackingService = require('./trackingService');
const { getUserId, runWithTenant } = require('./tenantContext');
const { classifyEmails, isValidEmail } = require('../utils/recipients');

function createTransporter(config) {
    const cfg = config;
    if (!cfg || isSharedDefaultSmtp(cfg) || !cfg.host || !cfg.auth || !cfg.auth.user || !cfg.auth.pass) {
        throw new Error('SMTP not configured. Please configure your own SMTP settings first.');
    }

    return nodemailer.createTransport({
        host: cfg.host,
        port: parseInt(cfg.port) || 465,
        secure: cfg.secure === true || cfg.secure === 'true',
        auth: {
            user: cfg.auth.user,
            pass: cfg.auth.pass
        },
        family: 4,
        tls: {
            rejectUnauthorized: false,
            servername: cfg.host
        },
        dnsTimeout: 60000,
        connectionTimeout: 60000,
        greetingTimeout: 60000,
        socketTimeout: 60000
    });
}

class NamecheapEmailService {
    constructor() {
        this.rateByUser = new Map();
    }

    _rateState(userId) {
        const uid = userId || getUserId();
        if (!uid) throw new Error('No authenticated user context');
        if (!this.rateByUser.has(uid)) {
            this.rateByUser.set(uid, { sentCount: 0, lastResetTime: Date.now() });
        }
        return this.rateByUser.get(uid);
    }

    getConfig(userId) {
        return getEmailConfig(userId || getUserId());
    }

    checkRateLimit(userId) {
        const uid = userId || getUserId();
        const config = getEmailConfig(uid);
        const rateLimit = config.rateLimit || 550;
        const state = this._rateState(uid);
        
        const now = Date.now();
        const hourPassed = (now - state.lastResetTime) > 3600000;
        
        if (hourPassed) {
            state.sentCount = 0;
            state.lastResetTime = now;
        }
        
        if (state.sentCount >= rateLimit) {
            throw new Error(`Rate limit exceeded: max ${rateLimit} emails per hour`);
        }
    }

    validateEmail(email) {
        return isValidEmail(email);
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async sendBulkEmail(recipients, subject, htmlContent, imageAttachment = null, extraAttachments = [], options = {}) {
        const userId = options.userId || getUserId();
        if (!userId) {
            throw new Error('Cannot send email without an authenticated user');
        }
        if (getUserId() !== userId) {
            return runWithTenant(
                { userId, businessId: options.businessId || userId },
                () => this.sendBulkEmail(recipients, subject, htmlContent, imageAttachment, extraAttachments, options)
            );
        }

        const config = getEmailConfig(userId);
        const bccLimit = config.bccLimit || 500;
        const delayMs = parseInt(options.delayMs) || 5000;
        const { onStatus, useRawHtml } = options;
        
        if (!isConfigured(userId)) {
            throw new Error('SMTP not configured. Please configure SMTP settings first.');
        }
        
        const transporter = createTransporter(config);
        
        try {
            const classified = classifyEmails(recipients);
            const validRecipients = classified.valid;
                
            if (validRecipients.length === 0) {
                throw new Error('No valid email addresses found');
            }
            
            if (validRecipients.length > bccLimit) {
                throw new Error(`Maximum recipients per email is ${bccLimit}`);
            }

            const results = [];
            let sentCount = 0;
            let failedCount = 0;

            if (onStatus) {
                onStatus({
                    type: 'start',
                    total: validRecipients.length,
                    message: `Starting to send ${validRecipients.length} emails...`
                });
            }

            const fromUser = config.auth.user;
            const emailAssetService = require('./emailAssetService');
            const prepared = prepareOutboundEmail(htmlContent, {
                useRawHtml,
                subject,
                fromEmail: fromUser,
                userId,
                publicBaseUrl: emailAssetService.publicHttpsBase(options.publicBaseUrl),
                wrapOptions: {
                    systemName: config.systemName,
                    backgroundColor: config.backgroundColor
                }
            });

            for (let i = 0; i < validRecipients.length; i++) {
                this.checkRateLimit(userId);

                const recipient = validRecipients[i];
                const messageId = `<${uuidv4()}@${config.auth.user.split('@')[1]}>`;
                const tracked = trackingService.createEmailTrack(
                    recipient,
                    prepared.html,
                    options.publicBaseUrl,
                    userId
                );

                const attachments = [];
                if (imageAttachment) attachments.push(imageAttachment);
                if (Array.isArray(prepared.inlineAttachments) && prepared.inlineAttachments.length) {
                    attachments.push(...prepared.inlineAttachments);
                }
                if (Array.isArray(extraAttachments) && extraAttachments.length) {
                    attachments.push(...extraAttachments);
                }

                const mailOptions = {
                    from: `"${config.fromName}" <${fromUser}>`,
                    replyTo: fromUser,
                    to: recipient,
                    subject: subject,
                    html: tracked.html,
                    text: prepared.text,
                    messageId: messageId,
                    headers: {
                        'List-Unsubscribe': `<mailto:${fromUser}?subject=unsubscribe>`
                    },
                    attachments
                };
                
                try {
                    const info = await transporter.sendMail(mailOptions);
                    this._rateState(userId).sentCount += 1;
                    sentCount++;
                    trackingService.confirmSent(tracked.id, { delivered: true }, userId);

                    results.push({
                        recipient,
                        messageId: info.messageId || messageId,
                        status: 'sent'
                    });

                    if (onStatus) {
                        onStatus({
                            type: 'sent',
                            recipient,
                            messageId: info.messageId || messageId,
                            progress: i + 1,
                            total: validRecipients.length,
                            sentCount: sentCount,
                            failedCount: failedCount
                        });
                    }
                } catch (error) {
                    failedCount++;
                    trackingService.discard(tracked.id, userId);
                    results.push({
                        recipient,
                        status: 'failed',
                        error: error.message
                    });

                    if (onStatus) {
                        onStatus({
                            type: 'failed',
                            recipient,
                            error: error.message,
                            progress: i + 1,
                            total: validRecipients.length,
                            sentCount: sentCount,
                            failedCount: failedCount
                        });
                    }
                }

                if (i < validRecipients.length - 1) {
                    if (onStatus) {
                        onStatus({
                            type: 'delay',
                            delay: delayMs,
                            nextRecipient: validRecipients[i + 1]
                        });
                    }
                    await this.sleep(delayMs);
                }
            }
            
            if (onStatus) {
                onStatus({
                    type: 'complete',
                    total: validRecipients.length,
                    sentCount: sentCount,
                    failedCount: failedCount,
                    message: `Completed! ${sentCount} sent, ${failedCount} failed.`
                });
            }

            activityService.recordSend('email', {
                sentCount,
                failedCount,
                recipientsCount: validRecipients.length
            }, { userId });
            
            return {
                success: true,
                recipientsCount: validRecipients.length,
                sentCount,
                failedCount,
                timestamp: new Date().toISOString(),
                sandbox: !!config.sandbox,
                results
            };
            
        } catch (error) {
            if (onStatus) {
                onStatus({
                    type: 'error',
                    error: error.message
                });
            }
            throw error;
        }
    }

    async testConnection(userId) {
        const uid = userId || getUserId();
        if (uid && getUserId() !== uid) {
            return runWithTenant({ userId: uid, businessId: uid }, () => this.testConnection(uid));
        }
        if (!isConfigured(uid)) {
            throw new Error('SMTP not configured. Please configure SMTP settings first.');
        }

        const transporter = createTransporter(getEmailConfig(uid));

        try {
            await transporter.verify();
            return { success: true, message: 'Connected to SMTP successfully' };
        } catch (error) {
            throw new Error(`Connection failed: ${error.message}`);
        }
    }
}

module.exports = new NamecheapEmailService();
