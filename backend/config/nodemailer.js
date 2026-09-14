import nodemailer from 'nodemailer';
import dns from 'dns';
import shared from 'nodemailer/lib/shared/index.js';

if (dns && dns.setDefaultResultOrder) {
    dns.setDefaultResultOrder('ipv4first');
}

// Force Nodemailer to strictly use IPv4 and never pick unreachable IPv6 addresses
if (shared && shared.networkInterfaces) {
    const orig = shared.networkInterfaces;
    const ipv4Only = {};
    for (const [k, v] of Object.entries(orig)) {
        ipv4Only[k] = v.filter(i => i.family === 'IPv4' || i.family === 4);
    }
    shared.networkInterfaces = ipv4Only;
}

let transporter = null;

export const getTransporter = () => {
    if (!transporter) {
        const user = process.env.SMTP_USER;
        const pass = process.env.SMTP_PASS;

        if (user && pass) {
            const host = process.env.SMTP_HOST || 'smtp.gmail.com';
            const port = Number(process.env.SMTP_PORT) || 465;

            transporter = nodemailer.createTransport({
                host,
                port,
                secure: port === 465,
                auth: { user, pass },
                pool: true,
                maxConnections: 5,
                maxMessages: Infinity,
                family: 4, // Strictly force IPv4
                lookup: (hostname, options, callback) => {
                    dns.lookup(hostname, { family: 4 }, callback);
                },
                tls: {
                    rejectUnauthorized: false
                }
            });
        }
    }
    return transporter;
};

/**
 * Sends an email safely with IPv4-only enforcement and automatic retry.
 * Never throws — always returns { success, messageId? , simulated?, error? }.
 */
export const sendMailSafe = async ({ to, subject, html, text, headers = {} }, retries = 2) => {
    try {
        // ─────────────────────────────────────────────────────────────
        // 1. Resend API via HTTPS (Port 443 — 100% supported on Render Free tier)
        // ─────────────────────────────────────────────────────────────
        if (process.env.RESEND_API_KEY) {
            try {
                const resendFrom = process.env.RESEND_FROM || process.env.SENDER_EMAIL || 'Therapique <onboarding@resend.dev>';
                const response = await fetch('https://api.resend.com/emails', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${process.env.RESEND_API_KEY.trim()}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        from: resendFrom,
                        to: Array.isArray(to) ? to : [to],
                        subject,
                        html: html || '',
                        text: text || ''
                    })
                });

                const data = await response.json();
                if (response.ok && data.id) {
                    console.log(`📧 [Resend HTTPS] Email sent to ${to} (ID: ${data.id})`);
                    return { success: true, messageId: data.id };
                } else {
                    console.error(`⚠️ [Resend HTTPS] Response:`, data);
                    // If Resend failed (e.g. key issue), fall through to SMTP
                }
            } catch (resendErr) {
                console.error(`⚠️ [Resend HTTPS] Network error:`, resendErr.message);
            }
        }

        // ─────────────────────────────────────────────────────────────
        // 2. Brevo (Sendinblue) API via HTTPS (Port 443)
        // ─────────────────────────────────────────────────────────────
        if (process.env.BREVO_API_KEY) {
            try {
                const brevoSenderEmail = process.env.BREVO_SENDER_EMAIL || process.env.SMTP_USER || 'therapique.official@gmail.com';
                const brevoSenderName = process.env.BREVO_SENDER_NAME || 'Therapique';
                const response = await fetch('https://api.brevo.com/v3/smtp/email', {
                    method: 'POST',
                    headers: {
                        'api-key': process.env.BREVO_API_KEY.trim(),
                        'Content-Type': 'application/json',
                        'Accept': 'application/json'
                    },
                    body: JSON.stringify({
                        sender: { name: brevoSenderName, email: brevoSenderEmail },
                        to: [{ email: to }],
                        subject,
                        htmlContent: html || '',
                        textContent: text || ''
                    })
                });

                const data = await response.json();
                if (response.ok && (data.messageId || data.id)) {
                    console.log(`📧 [Brevo HTTPS] Email sent to ${to} (ID: ${data.messageId || data.id})`);
                    return { success: true, messageId: data.messageId || data.id };
                } else {
                    console.error(`⚠️ [Brevo HTTPS] Response:`, data);
                }
            } catch (brevoErr) {
                console.error(`⚠️ [Brevo HTTPS] Network error:`, brevoErr.message);
            }
        }

        // ─────────────────────────────────────────────────────────────
        // 3. Fallback to Direct Nodemailer SMTP
        // ─────────────────────────────────────────────────────────────
        const mailer = getTransporter();
        const sender = process.env.SENDER_EMAIL || process.env.SMTP_USER || 'Therapique <support@therapique.com>';

        if (!mailer) {
            console.log('\n📧 [Email — Dev Mode (no SMTP or API configured)]');
            console.log(`   To: ${to}`);
            console.log(`   Subject: ${subject}`);
            console.log('   → Set RESEND_API_KEY or SMTP_USER/SMTP_PASS in .env to send real emails.\n');
            return { success: true, simulated: true };
        }

        // Unique entity reference ID to prevent Gmail from merging distinct transactional messages into conversation threads
        const uniqueRefId = `<${Date.now()}.${Math.random().toString(36).substring(2, 10)}@therapique.com>`;

        const mailOptions = {
            from: sender,
            to,
            subject,
            text: text || '',
            html,
            headers: {
                'X-Entity-Ref-ID': uniqueRefId,
                ...headers
            }
        };

        const info = await mailer.sendMail(mailOptions);
        console.log(`📧 Email sent to ${to} (ID: ${info.messageId})`);
        return { success: true, messageId: info.messageId };
    } catch (error) {
        if (retries > 0) {
            console.warn(`⚠️ Email to ${to} attempt failed (${error.message}). Retrying...`);
            await new Promise(r => setTimeout(r, 800));
            return sendMailSafe({ to, subject, html, text, headers }, retries - 1);
        }
        console.error(`❌ Email to ${to} failed:`, error.message);
        return { success: false, error: error.message };
    }
};

export default getTransporter;
