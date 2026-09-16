import nodemailer from 'nodemailer';

let cachedTransporter = null;
let cachedKey = '';

function readSmtpConfig() {
  const host = String(process.env.SMTP_HOST || '').trim();
  const port = Number(process.env.SMTP_PORT || 0);
  const user = String(process.env.SMTP_USER || '').trim();
  const pass = String(process.env.SMTP_PASS || '').trim();
  const from = String(process.env.SMTP_FROM || '').trim();
  const secure = String(process.env.SMTP_SECURE || 'false').trim().toLowerCase() === 'true';
  return { host, port, user, pass, from, secure };
}

function makeConfigKey(cfg) {
  return `${cfg.host}|${cfg.port}|${cfg.user}|${cfg.from}|${cfg.secure}`;
}

function getTransporter() {
  const cfg = readSmtpConfig();
  if (!cfg.host || !cfg.port || !cfg.from) return null;
  const key = makeConfigKey(cfg);
  if (cachedTransporter && cachedKey === key) {
    return { transporter: cachedTransporter, from: cfg.from };
  }

  cachedTransporter = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: cfg.user || cfg.pass ? { user: cfg.user, pass: cfg.pass } : undefined
  });
  cachedKey = key;
  return { transporter: cachedTransporter, from: cfg.from };
}

function normalizeAddressList(value) {
  if (Array.isArray(value)) {
    return value
      .map((x) => {
        if (!x) return '';
        if (typeof x === 'string') return x.trim();
        if (typeof x === 'object' && x.address) return String(x.address).trim();
        return String(x).trim();
      })
      .filter(Boolean);
  }
  if (!value) return [];
  return [String(value).trim()].filter(Boolean);
}

export async function sendEmailLoginCode({ email, code, ttlSec = 300, appName = 'ggb_ai' }) {
  const kit = getTransporter();
  if (!kit) {
    return {
      sent: false,
      reason: 'smtp_not_configured'
    };
  }

  const subject = `${appName} 登录验证码`;
  const text = [
    `你的验证码：${code}`,
    `有效期：${Math.max(60, Number(ttlSec) || 300)} 秒`,
    '如果不是你本人操作，请忽略此邮件。'
  ].join('\n');
  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.6;">
      <h2 style="margin: 0 0 8px 0;">${appName} 登录验证码</h2>
      <p>你的验证码是：</p>
      <p style="font-size: 28px; letter-spacing: 4px; font-weight: 700;">${code}</p>
      <p>有效期：${Math.max(60, Number(ttlSec) || 300)} 秒。</p>
      <p style="color:#666;">如果不是你本人操作，请忽略此邮件。</p>
    </div>
  `.trim();

  const info = await kit.transporter.sendMail({
    from: kit.from,
    to: email,
    subject,
    text,
    html
  });
  const accepted = normalizeAddressList(info?.accepted);
  const rejected = normalizeAddressList(info?.rejected);
  const target = String(email || '').trim().toLowerCase();
  const delivered = accepted.some((addr) => addr.toLowerCase() === target);
  if (!delivered || rejected.some((addr) => addr.toLowerCase() === target)) {
    return {
      sent: false,
      reason: 'smtp_rejected_recipient',
      accepted,
      rejected,
      messageId: info?.messageId || ''
    };
  }
  return {
    sent: true,
    accepted,
    rejected,
    messageId: info?.messageId || ''
  };
}
