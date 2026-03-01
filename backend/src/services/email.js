const sgMail = require('@sendgrid/mail');
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

const severityConfig = {
  low:    { color: '#16a34a', label: 'LOW',    border: '#bbf7d0' },
  medium: { color: '#d97706', label: 'MEDIUM', border: '#fde68a' },
  high:   { color: '#dc2626', label: 'HIGH',   border: '#fecaca' }
};

async function sendViolationNotice({ property, violation, bill }) {
  const sev = severityConfig[violation.severity] || severityConfig.low;

  const deadline = new Date(violation.created_at || Date.now());
  deadline.setDate(deadline.getDate() + violation.deadline_days);
  const deadlineStr = deadline.toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric'
  });

  const financeBlock = bill ? `
    <div style="background:#f0f9ff;border:1px solid #bae6fd;border-left:4px solid #0284c7;padding:16px 20px;border-radius:6px;margin-bottom:24px;">
      <p style="margin:0 0 4px;font-size:11px;text-transform:uppercase;color:#6b7280;letter-spacing:0.05em;">Financial Summary</p>
      <p style="margin:0 0 6px;color:#374151;">Fine for this violation: <strong>$${parseFloat(violation.fine_amount ?? 0).toFixed(2)}</strong></p>
      <p style="margin:0 0 6px;color:#374151;">Current monthly bill: <strong>$${parseFloat(bill.total_amount ?? 0).toFixed(2)}</strong>
        (due ${new Date(bill.due_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })})</p>
      <p style="margin:0;color:#374151;">Combined property score: <strong>${property.combined_score ?? '—'}</strong></p>
    </div>
  ` : '';

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
      <div style="background:#1e3a5f;padding:24px 32px;color:white;">
        <h1 style="margin:0;font-size:20px;font-weight:bold;">HOA Compliance Notice</h1>
        <p style="margin:6px 0 0;opacity:0.75;font-size:14px;">
          ${new Date().toLocaleDateString('en-US', { year:'numeric', month:'long', day:'numeric' })}
        </p>
      </div>
      <div style="padding:28px 32px;background:#f9fafb;">
        <p style="margin:0 0 8px;">Dear <strong>${property.owner_name}</strong>,</p>
        <p style="margin:0 0 20px;">A compliance issue has been identified at:</p>
        <p style="margin:0 0 24px;font-size:16px;font-weight:bold;color:#1e3a5f;">${property.address}</p>
        <div style="background:white;border:1px solid ${sev.border};border-left:4px solid ${sev.color};padding:16px 20px;border-radius:6px;margin-bottom:24px;">
          <p style="margin:0 0 4px;font-size:11px;text-transform:uppercase;color:#6b7280;letter-spacing:0.05em;">Violation</p>
          <p style="margin:0 0 8px;font-size:18px;font-weight:bold;color:#111827;">
            ${violation.category.charAt(0).toUpperCase() + violation.category.slice(1)}
          </p>
          <span style="background:${sev.color};color:white;font-size:11px;font-weight:bold;padding:3px 10px;border-radius:999px;">
            ${sev.label} SEVERITY
          </span>
        </div>
        <h3 style="margin:0 0 8px;color:#1e3a5f;">What Was Observed</h3>
        <p style="margin:0 0 20px;color:#374151;">${violation.description}</p>
        ${violation.rule_cited ? `<h3 style="margin:0 0 8px;color:#1e3a5f;">Applicable Rule</h3>
        <p style="margin:0 0 20px;background:white;border:1px solid #e5e7eb;padding:12px 16px;border-radius:6px;font-style:italic;color:#374151;">${violation.rule_cited}</p>` : ''}
        <h3 style="margin:0 0 8px;color:#1e3a5f;">Required Action</h3>
        <p style="margin:0 0 20px;color:#374151;">${violation.remediation}</p>
        <div style="background:#fffbeb;border:1px solid #fbbf24;padding:16px 20px;border-radius:6px;margin-bottom:24px;">
          <p style="margin:0;font-weight:bold;color:#92400e;">Resolution Deadline: ${deadlineStr}</p>
          <p style="margin:6px 0 0;color:#92400e;font-size:14px;">Please address this within ${violation.deadline_days} days of this notice date.</p>
        </div>
        ${financeBlock}
        ${violation.image_url ? `<h3 style="margin:0 0 8px;color:#1e3a5f;">Photo on File</h3>
        <img src="${violation.image_url}" alt="Violation photo" style="max-width:100%;border-radius:6px;border:1px solid #e5e7eb;margin-bottom:24px;" />` : ''}
        <p style="color:#374151;">If you have questions or believe this notice was sent in error, please contact the HOA office.</p>
        <p style="color:#374151;">Thank you for your cooperation.</p>
        <p style="font-weight:bold;color:#1e3a5f;">HOA Management</p>
      </div>
      <div style="padding:16px 32px;background:#f3f4f6;text-align:center;font-size:12px;color:#6b7280;">
        This is an official notice from your Homeowners Association.
      </div>
    </div>
  `;

  await sgMail.send({
    to:      property.owner_email,
    from:    process.env.FROM_EMAIL,
    subject: `HOA Compliance Notice — ${property.address}`,
    html
  });
}

async function sendOverdueReminder({ property, bill }) {
  const monthStr = new Date(bill.billing_month).toLocaleDateString('en-US', {
    month: 'long', year: 'numeric', timeZone: 'UTC'
  });
  const dueDateStr = new Date(bill.due_date).toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC'
  });

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
      <div style="background:#7f1d1d;padding:24px 32px;color:white;">
        <h1 style="margin:0;font-size:20px;font-weight:bold;">Payment Overdue Notice</h1>
        <p style="margin:6px 0 0;opacity:0.75;font-size:14px;">
          ${new Date().toLocaleDateString('en-US', { year:'numeric', month:'long', day:'numeric' })}
        </p>
      </div>
      <div style="padding:28px 32px;background:#f9fafb;">
        <p style="margin:0 0 8px;">Dear <strong>${property.owner_name}</strong>,</p>
        <p style="margin:0 0 20px;">Your HOA payment for <strong>${property.address}</strong> is overdue.</p>
        <div style="background:#fef2f2;border:1px solid #fecaca;border-left:4px solid #dc2626;padding:16px 20px;border-radius:6px;margin-bottom:24px;">
          <p style="margin:0 0 6px;color:#374151;">Billing period: <strong>${monthStr}</strong></p>
          <p style="margin:0 0 6px;color:#374151;">Base fee: <strong>$${parseFloat(bill.base_amount).toFixed(2)}</strong></p>
          ${parseFloat(bill.violation_fines) > 0 ? `<p style="margin:0 0 6px;color:#374151;">Violation fines: <strong>$${parseFloat(bill.violation_fines).toFixed(2)}</strong></p>` : ''}
          <p style="margin:0 0 6px;color:#374151;">Total due: <strong>$${parseFloat(bill.total_amount).toFixed(2)}</strong></p>
          <p style="margin:0;color:#dc2626;font-weight:bold;">Due date: ${dueDateStr} — PAST DUE</p>
        </div>
        <p style="color:#374151;">Your property score has been updated to reflect this outstanding balance. Please contact the HOA office to arrange payment as soon as possible.</p>
        <p style="font-weight:bold;color:#7f1d1d;">HOA Management</p>
      </div>
      <div style="padding:16px 32px;background:#f3f4f6;text-align:center;font-size:12px;color:#6b7280;">
        This is an official notice from your Homeowners Association.
      </div>
    </div>
  `;

  await sgMail.send({
    to:      property.owner_email,
    from:    process.env.FROM_EMAIL,
    subject: `Payment Overdue — ${property.address}`,
    html
  });
}

async function sendCommunityAnnouncement({ authorName, authorRole, category, title, recipients }) {
  const categoryLabel = {
    safety: 'Safety Alert',
    lost_pet: 'Lost Pet',
    wildlife: 'Wildlife',
    infrastructure: 'Infrastructure',
    hoa_notice: 'HOA Notice',
    general: 'General',
  }[category] || category;

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
      <div style="background:#1e3a5f;padding:24px 32px;color:white;">
        <h1 style="margin:0;font-size:20px;font-weight:bold;">New Community Post — ${categoryLabel}</h1>
        <p style="margin:6px 0 0;opacity:0.75;font-size:14px;">
          ${new Date().toLocaleDateString('en-US', { year:'numeric', month:'long', day:'numeric' })}
        </p>
      </div>
      <div style="padding:28px 32px;background:#f9fafb;">
        <p style="margin:0 0 16px;color:#374151;">
          <strong>${authorName}</strong> (${authorRole === 'admin' ? 'HOA Management' : 'Resident'}) posted a new announcement:
        </p>
        <div style="background:white;border:1px solid #e5e7eb;border-left:4px solid #1e3a5f;padding:16px 20px;border-radius:6px;margin-bottom:24px;">
          <p style="margin:0;font-size:16px;font-weight:bold;color:#111827;">${title}</p>
        </div>
        <p style="color:#374151;">Log in to the HOA portal to read the full post and join the community board.</p>
        <p style="font-weight:bold;color:#1e3a5f;">HOA Management</p>
      </div>
      <div style="padding:16px 32px;background:#f3f4f6;text-align:center;font-size:12px;color:#6b7280;">
        This notification was sent by your Homeowners Association.
      </div>
    </div>
  `;

  await Promise.allSettled(
    recipients.map(email =>
      sgMail.send({
        to:      email,
        from:    process.env.FROM_EMAIL,
        subject: `New HOA Community Post — ${categoryLabel}`,
        html,
      })
    )
  );
}

module.exports = { sendViolationNotice, sendOverdueReminder, sendCommunityAnnouncement };
