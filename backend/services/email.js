const nodemailer = require('nodemailer');

/**
 * Email delivery, behind a provider interface.
 *
 * EMAIL_PROVIDER selects the transport:
 *   console  - writes the message to stdout. No credentials, no network. This is
 *              the default in development so signup verification and OTP login
 *              are testable without an email account.
 *   sendgrid - real delivery over SendGrid SMTP. Requires SENDGRID_API_KEY.
 *   smtp     - authenticated SMTP, including GoDaddy Professional Email.
 *
 * Production refuses to start on the console provider: silently "sending" a
 * verification code to a terminal nobody reads would let users lock themselves
 * out with no visible failure.
 */

const PROVIDERS = {
  CONSOLE: 'console',
  SENDGRID: 'sendgrid',
  SMTP: 'smtp',
};

const DEFAULT_FROM = 'admin@finlytix.in';

function isProduction() {
  return process.env.NODE_ENV === 'production';
}

function resolveProviderId() {
  const explicit = String(process.env.EMAIL_PROVIDER || '')
    .trim()
    .toLowerCase();

  if (explicit) {
    return explicit;
  }
  // No explicit choice: use SendGrid if a key is present, otherwise fall back to
  // the console so local development works out of the box.
  return process.env.SENDGRID_API_KEY ? PROVIDERS.SENDGRID : PROVIDERS.CONSOLE;
}

function getFromAddress() {
  return process.env.EMAIL_FROM || process.env.SENDGRID_FROM_EMAIL || DEFAULT_FROM;
}

let sendgridTransport;

function getSendgridTransport() {
  if (!sendgridTransport) {
    sendgridTransport = nodemailer.createTransport({
      host: 'smtp.sendgrid.net',
      port: 587,
      secure: false,
      auth: {
        user: 'apikey',
        pass: process.env.SENDGRID_API_KEY,
      },
    });
  }
  return sendgridTransport;
}

/**
 * Strips tags so the console provider prints something readable, and so every
 * message carries a text/plain alternative.
 */
function htmlToText(html) {
  return String(html)
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h1|h2|h3|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n');
}

const consoleProvider = {
  id: PROVIDERS.CONSOLE,
  label: 'Console (development)',
  isConfigured: () => true,
  async send({ to, subject, html }) {
    const body = htmlToText(html);
    const rule = '='.repeat(72);
    // Deliberately noisy: this is the only way to read the message in dev.
    console.log(
      `\n${rule}\n📧 EMAIL (console provider — not actually sent)\n${rule}\n` +
        `To:      ${to}\nFrom:    ${getFromAddress()}\nSubject: ${subject}\n` +
        `${'-'.repeat(72)}\n${body}\n${rule}\n`,
    );
    return { accepted: [to], provider: PROVIDERS.CONSOLE };
  },
};

const sendgridProvider = {
  id: PROVIDERS.SENDGRID,
  label: 'SendGrid',
  isConfigured: () => Boolean(process.env.SENDGRID_API_KEY),
  async send({ to, subject, html }) {
    if (!process.env.SENDGRID_API_KEY) {
      throw new Error('Email service is not configured');
    }

    try {
      const result = await getSendgridTransport().sendMail({
        from: getFromAddress(),
        to,
        subject,
        html,
        text: htmlToText(html),
      });
      console.log(`✅ Email sent to ${to}:`, result.messageId);
      return { accepted: result.accepted, provider: PROVIDERS.SENDGRID };
    } catch (error) {
      console.error('❌ Failed to send email:', error);

      if (
        error.responseCode === 550 &&
        typeof error.response === 'string' &&
        error.response.includes('verified Sender Identity')
      ) {
        throw new Error('SendGrid sender identity is not verified');
      }

      throw new Error('Failed to send email');
    }
  },
};

function smtpOptions() {
  const port = Number(process.env.SMTP_PORT || 465);
  const secure = process.env.SMTP_SECURE || (port === 465 ? 'true' : 'false');
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('SMTP_PORT must be a valid port number');
  }
  if (!['true', 'false'].includes(secure)) {
    throw new Error('SMTP_SECURE must be true or false');
  }
  return {
    host: process.env.SMTP_HOST,
    port,
    secure: secure === 'true',
    requireTLS: secure === 'false',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 30000,
  };
}

const smtpProvider = {
  id: PROVIDERS.SMTP,
  label: 'SMTP',
  isConfigured: () => {
    smtpOptions();
    return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASSWORD);
  },
  async send({ to, subject, html }) {
    if (!smtpProvider.isConfigured()) {
      throw new Error('SMTP requires SMTP_HOST, SMTP_USER, and SMTP_PASSWORD');
    }
    const transport = nodemailer.createTransport(smtpOptions());
    try {
      const result = await transport.sendMail({
        from: getFromAddress(),
        to,
        subject,
        html,
        text: htmlToText(html),
      });
      if (!result.accepted?.length || result.rejected?.length) {
        throw new Error('SMTP recipient rejected');
      }
      return { accepted: result.accepted, provider: PROVIDERS.SMTP };
    } catch {
      // Do not expose provider responses or authentication details in logs/API errors.
      throw new Error('SMTP email delivery failed. Check mailbox credentials and SMTP access.');
    } finally {
      transport.close();
    }
  },
};

const PROVIDER_REGISTRY = {
  [PROVIDERS.CONSOLE]: consoleProvider,
  [PROVIDERS.SENDGRID]: sendgridProvider,
  [PROVIDERS.SMTP]: smtpProvider,
};

function getProvider() {
  const id = resolveProviderId();
  const provider = Object.prototype.hasOwnProperty.call(PROVIDER_REGISTRY, id)
    ? PROVIDER_REGISTRY[id]
    : null;

  if (!provider) {
    throw new Error(
      `Unknown EMAIL_PROVIDER "${id}". Supported providers: ${Object.keys(PROVIDER_REGISTRY).join(', ')}.`,
    );
  }

  return provider;
}

function isEmailConfigured() {
  try {
    return getProvider().isConfigured();
  } catch {
    return false;
  }
}

/**
 * Called at startup so a misconfigured deployment fails loudly and immediately
 * rather than at the moment a user tries to sign up.
 */
function assertEmailConfigured() {
  const provider = getProvider();

  if (isProduction() && provider.id === PROVIDERS.CONSOLE) {
    throw new Error(
      'EMAIL_PROVIDER is "console" but NODE_ENV is production. Verification ' +
        'codes would be written to the server log instead of delivered. Set ' +
        'EMAIL_PROVIDER=smtp with SMTP credentials, or sendgrid with SENDGRID_API_KEY.',
    );
  }

  if (!provider.isConfigured()) {
    throw new Error(
      `Email provider "${provider.id}" is selected but not configured. ` +
        (provider.id === PROVIDERS.SMTP
          ? 'Set SMTP_HOST, SMTP_USER, and SMTP_PASSWORD.'
          : 'Set SENDGRID_API_KEY, or use EMAIL_PROVIDER=console for local development.'),
    );
  }

  return provider;
}

async function sendMail({ to, subject, html }) {
  if (!to || !subject || !html) {
    throw new Error('sendMail requires to, subject, and html');
  }
  return getProvider().send({ to, subject, html });
}

module.exports = {
  EMAIL_PROVIDERS: PROVIDERS,
  sendMail,
  getProvider,
  isEmailConfigured,
  assertEmailConfigured,
  htmlToText,
  getFromAddress,
};
