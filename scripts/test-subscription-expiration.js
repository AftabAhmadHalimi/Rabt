/**
 * Subscription expiration & renewal scenarios (manual 1 Month / 3 Months plans).
 * Run: node scripts/test-subscription-expiration.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const authService = require('../services/authService');
const billing = require('../services/billingService');

const PAYMENTS_FILE = path.join(__dirname, '..', 'config', 'payments.json');
const TEST_EMAIL = 'sub-expiry-test-' + Date.now() + '@rabt.test';

let passed = 0;
let failed = 0;

function assert(cond, label) {
    if (cond) {
        passed += 1;
        console.log('  PASS:', label);
    } else {
        failed += 1;
        console.error('  FAIL:', label);
    }
}

function approxSameDay(a, b) {
    const da = new Date(a);
    const db = new Date(b);
    return Math.abs(da.getTime() - db.getTime()) < 5000;
}

function monthDiffApprox(from, to, months) {
    const expected = billing.addMonths(new Date(from), months);
    const actual = new Date(to);
    return Math.abs(expected.getTime() - actual.getTime()) < 5000;
}

function fakeReceipt() {
    return {
        buffer: Buffer.from('%PDF-1.4 fake receipt ' + crypto.randomBytes(4).toString('hex')),
        originalname: 'receipt.pdf'
    };
}

function insertPendingPayment(user, planId) {
    const plan = billing.getPlan(planId);
    const id = 'pay-test-' + Date.now() + '-' + crypto.randomBytes(2).toString('hex');
    const items = JSON.parse(fs.readFileSync(PAYMENTS_FILE, 'utf-8') || '[]');
    const row = {
        id,
        userId: user.id,
        businessId: user.businessId || user.id,
        name: user.name,
        email: user.email,
        phone: '1234567890',
        company: '',
        country: 'AF',
        notes: 'subscription test',
        planId: plan.id,
        planName: plan.name,
        amount: plan.amount,
        currency: 'USD',
        status: 'pending',
        submittedAt: new Date().toISOString(),
        receiptStoredName: id + '.pdf',
        receiptOriginalName: 'receipt.pdf',
        receiptMime: 'application/pdf',
        receiptSize: 32
    };
    const dir = path.join(__dirname, '..', 'storage', 'billing', 'receipts', String(user.id));
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, row.receiptStoredName), Buffer.from('test'));
    items.unshift(row);
    fs.writeFileSync(PAYMENTS_FILE, JSON.stringify(items, null, 2));
    return id;
}

function cleanupPayments(userId) {
    try {
        const items = JSON.parse(fs.readFileSync(PAYMENTS_FILE, 'utf-8') || '[]');
        fs.writeFileSync(
            PAYMENTS_FILE,
            JSON.stringify(items.filter((row) => row.userId !== userId), null, 2)
        );
    } catch (_) {}
    try {
        const dir = path.join(__dirname, '..', 'storage', 'billing', 'receipts', String(userId));
        if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
    } catch (_) {}
}

async function main() {
    console.log('\nSubscription expiration tests\n');

    const created = authService.adminCreateUser({
        name: 'Sub Expiry Test',
        email: TEST_EMAIL,
        password: 'TestPass123!',
        verified: true
    });
    const userId = created.id || (created.user && created.user.id) || created;
    let user = authService.getRawUserById(typeof userId === 'string' ? userId : userId.id);
    if (!user && created && created.id) user = authService.getRawUserById(created.id);
    if (!user && typeof created === 'object') user = authService.getRawUserById(created.id);
    // adminCreateUser may return public user
    if (!user) {
        const listed = authService.adminListUsers().find((u) => u.email === TEST_EMAIL);
        user = listed ? authService.getRawUserById(listed.id) : null;
    }
    if (!user) throw new Error('Failed to create test user');

    const marker = 'keep-me-' + crypto.randomBytes(4).toString('hex');
    authService.patchUser(user.id, { phone: marker, onboardingCompleted: true });

    try {
        // 1) Approve 1-month payment
        console.log('1) Approve 1-month payment → correct expiration');
        authService.patchUser(user.id, {
            phone: marker,
            subscriptionStatus: 'pending',
            planId: 'monthly',
            planName: '1 Month',
            subscriptionAmount: 14,
            subscriptionStartedAt: null,
            subscriptionExpiresAt: null
        });
        const pay1 = insertPendingPayment(user, 'monthly');
        const before1 = Date.now();
        const result1 = billing.approvePayment(pay1, 'test-admin');
        user = authService.getRawUserById(user.id);
        assert(user.subscriptionStatus === 'active', 'status active after 1-month approve');
        assert(user.planId === 'monthly', 'plan is monthly');
        assert(monthDiffApprox(before1, user.subscriptionExpiresAt, 1), 'expires ~+1 month');
        assert(approxSameDay(user.subscriptionStartedAt, before1), 'start ≈ approval time');
        const access1 = billing.accessFromUser(user);
        assert(access1.ok === true && access1.code === 'ACTIVE', 'access allowed while active');

        // 2) Approve 3-month on a fresh window (force expired then approve quarterly)
        console.log('2) Approve 3-month payment → correct expiration');
        authService.patchUser(user.id, {
            subscriptionStatus: 'expired',
            subscriptionExpiresAt: new Date(Date.now() - 86400000).toISOString()
        });
        const pay3 = insertPendingPayment(user, 'quarterly');
        const before3 = Date.now();
        billing.approvePayment(pay3, 'test-admin');
        user = authService.getRawUserById(user.id);
        assert(user.planId === 'quarterly', 'plan is quarterly');
        assert(monthDiffApprox(before3, user.subscriptionExpiresAt, 3), 'expires ~+3 months');
        assert(billing.accessFromUser(user).ok === true, 'access works on 3-month plan');

        // 3) Expired → access blocked
        console.log('3) Expired subscription → access blocked');
        const savedExpires = user.subscriptionExpiresAt;
        authService.patchUser(user.id, {
            subscriptionStatus: 'active',
            subscriptionExpiresAt: new Date(Date.now() - 60000).toISOString()
        });
        user = billing.expireIfNeeded(authService.getRawUserById(user.id));
        assert(user.subscriptionStatus === 'expired', 'marked expired');
        const accessExpired = billing.accessFromUser(user);
        assert(accessExpired.ok === false && accessExpired.code === 'EXPIRED', 'paid features blocked');
        assert(/expired/i.test(accessExpired.message || ''), 'clear expired message');

        // 4) Active → access works (restore)
        console.log('4) Active subscription → access works');
        authService.patchUser(user.id, {
            subscriptionStatus: 'active',
            subscriptionExpiresAt: savedExpires
        });
        user = authService.getRawUserById(user.id);
        assert(billing.accessFromUser(user).ok === true, 'active access ok');

        // 5) Renew before expiration → extend from current expiry
        console.log('5) Renew before expiration → period extends');
        const prevExp = user.subscriptionExpiresAt;
        const prevStart = user.subscriptionStartedAt;
        const payRenew = insertPendingPayment(user, 'monthly');
        // Keep active while pending renewal (simulate submitPayment covered path)
        authService.patchUser(user.id, { subscriptionStatus: 'active' });
        const renew = billing.approvePayment(payRenew, 'test-admin');
        user = authService.getRawUserById(user.id);
        assert(renew.extended === true, 'renewal flagged as extended');
        assert(approxSameDay(renew.startedAt, prevExp), 'new period starts at previous expiry');
        assert(monthDiffApprox(prevExp, user.subscriptionExpiresAt, 1), 'new expiry = old expiry + 1 month');
        assert(user.subscriptionStartedAt === prevStart, 'overall start date preserved while extending');

        // 6) Renew after expiration → new period from approval
        console.log('6) Renew after expiration → new period from approval');
        authService.patchUser(user.id, {
            subscriptionStatus: 'expired',
            subscriptionExpiresAt: new Date(Date.now() - 3600000).toISOString()
        });
        const payAfter = insertPendingPayment(user, 'monthly');
        const afterT = Date.now();
        const renewAfter = billing.approvePayment(payAfter, 'test-admin');
        user = authService.getRawUserById(user.id);
        assert(renewAfter.extended === false, 'post-expiry renew is not an extend');
        assert(approxSameDay(user.subscriptionStartedAt, afterT), 'start resets to approval');
        assert(monthDiffApprox(afterT, user.subscriptionExpiresAt, 1), 'new +1 month from approval');
        assert(billing.accessFromUser(user).ok === true, 'access restored after renew');

        // 7) User data intact
        console.log('7) User data remains intact');
        user = authService.getRawUserById(user.id);
        assert(user.phone === marker, 'user marker field intact');
        assert(user.onboardingCompleted === true, 'onboarding flag intact');
        assert(user.email === TEST_EMAIL, 'email intact');

        // 8) Super Admin view fields
        console.log('8) Super Admin sees accurate subscription information');
        const adminView = authService.adminListUsers().find((u) => u.id === user.id);
        assert(!!adminView, 'admin can list user');
        assert(adminView.planName === '1 Month' || adminView.planId === 'monthly', 'admin plan shown');
        assert(adminView.subscriptionStatus === 'active', 'admin subscription status');
        assert(!!adminView.subscriptionStartedAt, 'admin start date');
        assert(!!adminView.subscriptionExpiresAt, 'admin expiration date');
        assert(typeof adminView.daysRemaining === 'number' && adminView.daysRemaining > 0, 'admin days remaining');
        assert(Array.isArray(adminView.paymentHistory) && adminView.paymentHistory.length >= 4, 'admin payment history');
        assert(adminView.paymentStatus === 'approved', 'admin payment status');
    } finally {
        cleanupPayments(user.id);
        try {
            authService.adminDeleteUser(user.id);
        } catch (err) {
            console.warn('Cleanup warning:', err.message || err);
        }
    }

    console.log('\nResult:', passed, 'passed,', failed, 'failed\n');
    process.exit(failed ? 1 : 0);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
