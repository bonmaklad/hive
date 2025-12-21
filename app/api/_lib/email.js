import { Resend } from 'resend';

function escapeHtml(value) {
    return String(value || '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

export function getFromEmail() {
    return process.env.RESEND_FROM || 'HIVE HQ <info@hivehq.nz>';
}

export function canSendEmail() {
    return Boolean(process.env.RESEND_API_KEY);
}

export async function sendPublicRoomBookingConfirmationEmail({
    to,
    customerName,
    spaceTitle,
    bookingDate,
    startTime,
    endTime,
    invoiceUrl,
    manageUrl
}) {
    if (!process.env.RESEND_API_KEY) return { ok: false, skipped: true, error: 'Missing RESEND_API_KEY' };

    const resend = new Resend(process.env.RESEND_API_KEY);
    const safeTo = typeof to === 'string' ? to.trim() : '';
    if (!safeTo) return { ok: false, error: 'Missing recipient email.' };

    const subject = `Booking confirmed: ${spaceTitle} on ${bookingDate}`;
    const name = escapeHtml(customerName || 'there');
    const room = escapeHtml(spaceTitle || 'Room');
    const date = escapeHtml(bookingDate || '');
    const time = `${escapeHtml(startTime || '')}–${escapeHtml(endTime || '')}`;

    const invoiceLink = invoiceUrl ? `<p><strong>Invoice:</strong> <a href="${escapeHtml(invoiceUrl)}">View invoice</a></p>` : '';
    const manageLink = manageUrl ? `<p><strong>Manage:</strong> <a href="${escapeHtml(manageUrl)}">View bookings</a></p>` : '';

    const html = `
        <div style="font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial;">
            <h2 style="margin: 0 0 12px;">Booking confirmed</h2>
            <p style="margin: 0 0 12px;">Hi ${name},</p>
            <p style="margin: 0 0 12px;">
                You’re booked in for <strong>${room}</strong> on <strong>${date}</strong> (${time}).
            </p>
            ${invoiceLink}
            ${manageLink}
            <p style="margin: 18px 0 0; color: #4b5563;">
                If you need to make a change, reply to this email and we’ll help.
            </p>
        </div>
    `;

    await resend.emails.send({
        from: getFromEmail(),
        to: [safeTo],
        subject,
        html
    });

    return { ok: true };
}
