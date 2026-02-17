import sgMail from '@sendgrid/mail';
import { readFileSync } from 'fs';
import { join } from 'path';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY ?? '';
const FROM_EMAIL = process.env.FROM_EMAIL ?? 'noreply@hourtracker.app';

if (SENDGRID_API_KEY) {
  sgMail.setApiKey(SENDGRID_API_KEY);
}

// ---------------------------------------------------------------------------
// Template loader
// ---------------------------------------------------------------------------

const templateCache = new Map<string, string>();

function loadTemplate(name: string): string {
  const cached = templateCache.get(name);
  if (cached) return cached;

  const templatePath = join(process.cwd(), 'src', 'lib', 'email', 'templates', `${name}.html`);
  const content = readFileSync(templatePath, 'utf-8');
  templateCache.set(name, content);
  return content;
}

/**
 * Replace `{{variable}}` placeholders in a template string with provided values.
 */
function interpolate(
  template: string,
  variables: Record<string, string>,
): string {
  return Object.entries(variables).reduce(
    (result, [key, value]) =>
      result.replace(new RegExp(`{{${key}}}`, 'g'), value),
    template,
  );
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Send a tenant invitation email to a new user.
 */
export async function sendInvitation(
  to: string,
  inviterName: string,
  tenantName: string,
  inviteLink: string,
): Promise<void> {
  const html = interpolate(loadTemplate('invitation'), {
    inviterName,
    tenantName,
    inviteLink,
  });

  const msg = {
    to,
    from: FROM_EMAIL,
    subject: `You've been invited to join ${tenantName} on Hour Tracker`,
    html,
  };

  try {
    await sgMail.send(msg);
    console.log(`[Email] Invitation sent to ${to} for tenant "${tenantName}"`);
  } catch (err) {
    console.error(`[Email] Failed to send invitation to ${to}:`, err);
    throw new Error('Failed to send invitation email.');
  }
}

/**
 * Send a password-reset email with a one-time link.
 */
export async function sendPasswordReset(
  to: string,
  resetLink: string,
): Promise<void> {
  const html = interpolate(loadTemplate('password-reset'), {
    resetLink,
  });

  const msg = {
    to,
    from: FROM_EMAIL,
    subject: 'Reset your Hour Tracker password',
    html,
  };

  try {
    await sgMail.send(msg);
    console.log(`[Email] Password-reset sent to ${to}`);
  } catch (err) {
    console.error(`[Email] Failed to send password-reset to ${to}:`, err);
    throw new Error('Failed to send password-reset email.');
  }
}

/**
 * Report data shape expected by {@link sendReport}.
 */
export interface ReportData {
  dateRange: string;
  totalEntries: number;
  totalDuration: string;
  projectCount: number;
  userCount: number;
}

/**
 * Send a report email (with optional PDF attachment) to one or more recipients.
 */
export async function sendReport(
  to: string[],
  subject: string,
  reportData: ReportData,
  pdfAttachment?: Buffer,
): Promise<void> {
  const html = interpolate(loadTemplate('report'), {
    dateRange: reportData.dateRange,
    totalEntries: String(reportData.totalEntries),
    totalDuration: reportData.totalDuration,
    projectCount: String(reportData.projectCount),
    userCount: String(reportData.userCount),
  });

  const msg: sgMail.MailDataRequired = {
    to,
    from: FROM_EMAIL,
    subject,
    html,
    ...(pdfAttachment
      ? {
          attachments: [
            {
              content: pdfAttachment.toString('base64'),
              filename: 'report.pdf',
              type: 'application/pdf',
              disposition: 'attachment',
            },
          ],
        }
      : {}),
  };

  try {
    await sgMail.send(msg);
    console.log(
      `[Email] Report sent to ${to.join(', ')} — subject: "${subject}"`,
    );
  } catch (err) {
    console.error(`[Email] Failed to send report to ${to.join(', ')}:`, err);
    throw new Error('Failed to send report email.');
  }
}
