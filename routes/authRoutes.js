const express = require('express');
const router = express.Router();
const authService = require('../services/authService');
const superAdmin = require('../services/superAdminService');
const { requirePaid } = require('../middleware/auth');

router.get('/platform-status', (req, res) => {
    res.json({ success: true, ...superAdmin.publicPlatformStatus() });
});

router.post('/signup', async (req, res) => {
    try {
        const status = superAdmin.publicPlatformStatus();
        if (!status.signupEnabled) {
            return res.status(403).json({
                success: false,
                code: 'SIGNUP_CLOSED',
                message: 'New signups are currently closed by the platform administrator.'
            });
        }
        if (status.maintenanceMode) {
            return res.status(503).json({
                success: false,
                code: 'MAINTENANCE',
                message: status.maintenanceMessage || 'Rabط is temporarily unavailable.'
            });
        }
        const result = await authService.signup(req.body || {}, req);
        res.json({
            success: true,
            needsVerification: true,
            message: 'Account created. Check your email for a verification link and a 6-digit code.',
            user: result.user
        });
    } catch (err) {
        const mailFailed = err.code === 'MAIL_FAILED';
        const status = mailFailed ? 202 : (err.statusCode || 400);
        res.status(status).json({
            success: mailFailed,
            needsVerification: mailFailed,
            code: err.code || undefined,
            message: err.message || 'Sign up failed',
            user: err.user || null
        });
    }
});

router.post('/login', (req, res) => {
    try {
        const status = superAdmin.publicPlatformStatus();
        if (status.maintenanceMode) {
            return res.status(503).json({
                success: false,
                code: 'MAINTENANCE',
                message: status.maintenanceMessage || 'Rabط is temporarily unavailable.'
            });
        }
        const result = authService.login(req.body || {}, req);
        res.setHeader('Set-Cookie', authService.cookieHeader(result.token));
        res.json({
            success: true,
            message: 'Signed in successfully.',
            user: result.user,
            platformAccess: !!(result.user && result.user.platformAccess),
            next: (result.user && result.user.nextPath) || '/'
        });
    } catch (err) {
        const status = err.statusCode || (err.code === 'UNVERIFIED' ? 403 : err.code === 'DISABLED' ? 403 : 401);
        res.status(status).json({
            success: false,
            code: err.code || undefined,
            message: err.message || 'Sign in failed'
        });
    }
});

router.get('/verify', (req, res) => {
    res.status(400).json({
        success: false,
        message: 'Enter the 6-digit code from your email on the verification page.'
    });
});

router.post('/verify', (req, res) => {
    try {
        const body = req.body || {};
        const result = authService.verifyEmail({ email: body.email, code: body.code, token: body.token });
        res.setHeader('Set-Cookie', authService.cookieHeader(result.token));
        res.json({
            success: true,
            message: 'Email verified. Choose a plan to continue.',
            user: result.user,
            next: (result.user && result.user.nextPath) || '/pricing.html'
        });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message || 'Verification failed' });
    }
});

router.post('/forgot-password', async (req, res) => {
    try {
        const status = superAdmin.publicPlatformStatus();
        if (status.maintenanceMode) {
            return res.status(503).json({
                success: false,
                code: 'MAINTENANCE',
                message: status.maintenanceMessage || 'Rabط is temporarily unavailable.'
            });
        }
        await authService.requestPasswordReset(req.body || {}, req);
        res.json({
            success: true,
            message: 'If an account exists for that email, a reset code is on its way.'
        });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message || 'Could not send reset code' });
    }
});

router.post('/reset-password', (req, res) => {
    try {
        const status = superAdmin.publicPlatformStatus();
        if (status.maintenanceMode) {
            return res.status(503).json({
                success: false,
                code: 'MAINTENANCE',
                message: status.maintenanceMessage || 'Rabط is temporarily unavailable.'
            });
        }
        authService.resetPasswordWithOtp(req.body || {}, req);
        res.json({
            success: true,
            message: 'Password updated. You can sign in with your new password.'
        });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message || 'Password reset failed' });
    }
});

router.post('/resend-verification', async (req, res) => {
    try {
        await authService.resendVerification(req.body || {}, req);
        res.json({
            success: true,
            message: 'If that email needs verification, a new code is on its way.'
        });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message || 'Could not resend verification email' });
    }
});

router.post('/logout', (req, res) => {
    authService.destroySession(authService.getTokenFromRequest(req));
    res.setHeader('Set-Cookie', authService.clearCookieHeader());
    res.json({ success: true, message: 'Signed out.' });
});

router.get('/me', (req, res) => {
    const user = authService.getUserFromRequest(req);
    const verified = !!(user && user.emailVerified !== false);
    res.json({
        success: true,
        authenticated: verified,
        platformAccess: !!(user && user.platformAccess),
        user: verified ? user : null
    });
});

router.get('/invite', requirePaid, (req, res) => {
    try {
        res.json({ success: true, data: authService.getInviteSummary(req.user.id) });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message || 'Could not load invite link' });
    }
});

module.exports = router;
