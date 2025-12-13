'use client';

import { useEffect, useState } from 'react';

const CONTACT_WEBHOOK = 'https://default0e0b3a79370449f29479196dbc8677.af.environment.api.powerplatform.com:443/powerautomate/automations/direct/workflows/54d9568b936b4920a428e69659871612/triggers/manual/paths/invoke?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=BpeMk2K0gj7HMpwJPzS1zNR33Qkc4twQV-eqF1eJI68';

export default function ContactForm({
    eventName,
    subject = 'New contact from hivehq.nz',
    from = 'HIVE Website',
    submitLabel = 'Send'
}) {
    const [toastVisible, setToastVisible] = useState(false);

    useEffect(() => {
        if (!toastVisible) return undefined;
        const timeout = setTimeout(() => setToastVisible(false), 2600);
        return () => clearTimeout(timeout);
    }, [toastVisible]);

    const handleSubmit = async event => {
        event.preventDefault();
        const form = event.currentTarget;
        const formData = new FormData(form);

        const message = String(formData.get('message') ?? '');
        const fullMessage = eventName ? `Event: ${eventName}\n\n${message}` : message;

        const payload = {
            name: formData.get('name'),
            email: formData.get('email'),
            message: fullMessage,
            subject,
            from
        };

        try {
            const res = await fetch(CONTACT_WEBHOOK, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!res.ok) {
                const text = await res.text().catch(() => '');
                throw new Error(`Request failed: ${res.status} ${res.statusText}${text ? ` - ${text}` : ''}`);
            }

            form.reset();
            setToastVisible(true);
        } catch (err) {
            console.error(err);
            alert('Sending failed. Please email info@hivehq.nz');
        }
    };

    return (
        <>
            <form className="contact-form" onSubmit={handleSubmit}>
                <label>
                    Name
                    <input type="text" name="name" required />
                </label>
                <label>
                    Email
                    <input type="email" name="email" required />
                </label>
                <label>
                    How can we help?
                    <textarea name="message" rows={4} required />
                </label>
                <button type="submit" className="btn primary">
                    {submitLabel}
                </button>
            </form>

            {toastVisible && <div className="toast visible">Thanks! We will be in touch shortly.</div>}
        </>
    );
}
