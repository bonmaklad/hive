'use client';

import { useEffect, useState } from 'react';

const CONTACT_WEBHOOK = 'https://default0e0b3a79370449f29479196dbc8677.af.environment.api.powerplatform.com:443/powerautomate/automations/direct/workflows/54d9568b936b4920a428e69659871612/triggers/manual/paths/invoke?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=BpeMk2K0gj7HMpwJPzS1zNR33Qkc4twQV-eqF1eJI68';

export default function ContactForm({
    eventName,
    subject = 'New contact from hivehq.nz',
    from = 'HIVE Website',
    submitLabel = 'Send',
    mode = 'general',
    minHour = 8,
    maxHour = 22
}) {
    const [toastVisible, setToastVisible] = useState(false);
    const [todayStr, setTodayStr] = useState('');

    useEffect(() => {
        if (!toastVisible) return undefined;
        const timeout = setTimeout(() => setToastVisible(false), 2600);
        return () => clearTimeout(timeout);
    }, [toastVisible]);

    useEffect(() => {
        // Compute local today date in YYYY-MM-DD for min attribute on date input
        const d = new Date();
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        setTodayStr(`${yyyy}-${mm}-${dd}`);
    }, []);

    const handleSubmit = async event => {
        event.preventDefault();
        const form = event.currentTarget;
        const formData = new FormData(form);

        const message = String(formData.get('message') ?? '');
        const preferredDate = formData.get('preferredDate');
        const startTime = formData.get('startTime');
        const endTime = formData.get('endTime');
        const attendees = formData.get('attendees');
        const charity = formData.get('charity') ? 'Yes' : 'No';

        // Note: UI restricts to hour steps via input step; no additional validation enforced here.

        const bookingHeader =
            mode === 'booking'
                ? [
                      `Venue: ${eventName ?? ''}`.trim(),
                      `Preferred date: ${preferredDate || ''}`.trim(),
                      `Time: ${startTime || ''} to ${endTime || ''}`.trim(),
                      `Attendees: ${attendees || ''}`.trim(),
                      `Charity/Not-for-profit: ${charity}`
                  ]
                      .filter(line =>
                          line && !line.endsWith(':') && !line.endsWith('to') && !line.endsWith('Attendees:')
                      )
                      .join('\n')
                : null;

        const fullMessage =
            mode === 'booking'
                ? `${bookingHeader}\n\n${message}`
                : eventName
                ? `Event: ${eventName}\n\n${message}`
                : message;

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
                {mode === 'booking' && (
                    <>
                        <label>
                            Preferred date
                            <input type="date" name="preferredDate" min={todayStr} required />
                        </label>
                        <label>
                            Start time
                            <input
                                type="time"
                                name="startTime"
                                step={3600}
                                min={`${String(minHour).padStart(2, '0')}:00`}
                                max={`${String(maxHour).padStart(2, '0')}:00`}
                                list="hourSteps"
                                required
                            />
                        </label>
                        <label>
                            End time
                            <input
                                type="time"
                                name="endTime"
                                step={3600}
                                min={`${String(minHour).padStart(2, '0')}:00`}
                                max={`${String(maxHour).padStart(2, '0')}:00`}
                                list="hourSteps"
                                required
                            />
                        </label>
                        <datalist id="hourSteps">
                            {Array.from({ length: maxHour - minHour + 1 }, (_, i) => minHour + i).map(h => {
                                const hh = String(h).padStart(2, '0');
                                return <option value={`${hh}:00`} key={hh} />;
                            })}
                        </datalist>
                        <label>
                            Number of people (approx.)
                            <input type="number" name="attendees" min="1" inputMode="numeric" />
                        </label>
                        <label className="checkbox-row">
                            <span>Charity / not-for-profit (discounts available)</span>
                            <input type="checkbox" name="charity" value="yes" />
                        </label>
                    </>
                )}
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
