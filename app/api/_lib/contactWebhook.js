const DEFAULT_CONTACT_WEBHOOK_URL =
    'https://default0e0b3a79370449f29479196dbc8677.af.environment.api.powerplatform.com:443/powerautomate/automations/direct/workflows/54d9568b936b4920a428e69659871612/triggers/manual/paths/invoke?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=BpeMk2K0gj7HMpwJPzS1zNR33Qkc4twQV-eqF1eJI68';

function safeText(value, limit = 5000) {
    const v = typeof value === 'string' ? value.trim() : '';
    return v.slice(0, limit);
}

function getWebhookUrl() {
    const envUrl = safeText(process.env.CONTACT_WEBHOOK_URL, 4000);
    return envUrl || DEFAULT_CONTACT_WEBHOOK_URL;
}

export async function sendContactStyleWebhook({
    name = 'HIVE member',
    email = 'info@hivehq.nz',
    subject = 'HIVE platform event',
    from = 'HIVE Platform',
    message = ''
}) {
    const webhookUrl = getWebhookUrl();
    if (!webhookUrl) return { ok: false, error: 'Missing contact webhook URL.' };

    const payload = {
        name: safeText(name, 120) || 'HIVE member',
        email: safeText(email, 254) || 'info@hivehq.nz',
        subject: safeText(subject, 180) || 'HIVE platform event',
        from: safeText(from, 120) || 'HIVE Platform',
        message: safeText(message, 8000)
    };

    try {
        const res = await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!res.ok) {
            const body = await res.text().catch(() => '');
            return { ok: false, error: `Webhook failed (${res.status}): ${body || res.statusText}` };
        }

        return { ok: true };
    } catch (err) {
        return { ok: false, error: err?.message || 'Webhook request failed.' };
    }
}
