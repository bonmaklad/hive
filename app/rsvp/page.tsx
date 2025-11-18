'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { buildIcsEvent } from '@/lib/ics';

type InviteStatus = 'PENDING' | 'YES' | 'NO';

interface InviteResponse {
    status: InviteStatus;
    guestCount: number;
    guestNames: string[];
}

// Prefer proxy route to avoid CORS and normalize responses
const RSVP_ENDPOINT = '/api/rsvp';
const MAX_EXTRAS = 3; // kept for compatibility with InviteResponse, but UI now uses a counter
const EVENT_DETAILS = {
    title: 'HIVE Launch Event',
    start: new Date('2025-12-12T17:30:00+13:00'),
    end: new Date('2025-12-12T22:00:00+13:00'),
    location: 'The HIVE, Whanganui',
    description: 'Where collaboration meets momentum',
    timeZone: 'Pacific/Auckland'
};

export default function RsvpPage() {
    const params = useSearchParams();
    const emailParam = params?.get('email') ?? '';
    const email = useMemo(() => emailParam.trim().toLowerCase(), [emailParam]);

    const [loadState, setLoadState] = useState<'idle' | 'loading' | 'ready' | 'not_found' | 'missing_email' | 'error'>('idle');
    const [invite, setInvite] = useState<InviteResponse | null>(null);
    // Replace free-text guest names with a simple attendee counter (1-4 total, incl. host)
    const [guestCount, setGuestCount] = useState<number>(1);
    const [error, setError] = useState('');
    const [toast, setToast] = useState('');
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        if (!emailParam) {
            setLoadState('missing_email');
            setInvite(null);
            return;
        }

        if (!RSVP_ENDPOINT) {
            setLoadState('error');
            setError('RSVP endpoint is not configured. Set NEXT_PUBLIC_RSVP_ENDPOINT.');
            return;
        }

        const fetchInvite = async () => {
            setLoadState('loading');
            setError('');
            try {
                const res = await fetch(`${RSVP_ENDPOINT}?email=${encodeURIComponent(email)}`);

                if (res.status === 404) {
                    setLoadState('not_found');
                    setInvite(null);
                    return;
                }

                if (!res.ok) throw new Error('Unable to look up invite.');

                const data = (await res.json()) as InviteResponse;
                setInvite(data);
                // Initialize counter from server, clamp 1..4
                const initialCount = Math.min(Math.max(Number(data.guestCount || 1), 1), 4);
                setGuestCount(initialCount);
                setLoadState('ready');
            } catch (err) {
                console.error(err);
                setError('Something went wrong loading your invite. Please try again.');
                setLoadState('error');
            }
        };

        fetchInvite();
    }, [email, emailParam]);

    const confirmed = invite?.status === 'YES';
    const canRsvp = loadState === 'ready';

    // No free-text guest names; user selects a total headcount (including host)

    const handleSubmit = async () => {
        if (!canRsvp || !RSVP_ENDPOINT) return;
        setSubmitting(true);
        setError('');

        const payload = {
            email,
            guestCount: Math.min(Math.max(guestCount, 1), 4),
            guestNames: [] as string[]
        };

        try {
            const res = await fetch(RSVP_ENDPOINT, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (res.status === 404) {
                setLoadState('not_found');
                setInvite(null);
                setError('This RSVP link is no longer valid.');
                return;
            }

            if (!res.ok) throw new Error('Unable to save RSVP.');

            setInvite(prev => ({
                ...(prev ?? { status: 'YES', guestCount: payload.guestCount, guestNames: [] }),
                status: 'YES',
                guestCount: payload.guestCount,
                guestNames: []
            }));
            setToast('RSVP saved! See you at the launch & holiday bash.');
            setTimeout(() => setToast(''), 4000);
        } catch (err) {
            console.error(err);
            setError('Could not submit your RSVP. Please retry in a moment.');
        } finally {
            setSubmitting(false);
        }
    };

    const handleCalendar = () => {
        const ics = buildIcsEvent(EVENT_DETAILS);
        const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'hive-launch-event.ics';
        link.click();
        URL.revokeObjectURL(url);
    };

    const renderBody = () => {
        if (loadState === 'missing_email') {
            return <p className="card-copy">This RSVP link is missing your email address. Please use the button from your invitation.</p>;
        }

        if (loadState === 'loading') {
            return <p className="card-copy">Checking the guest list…</p>;
        }

        if (loadState === 'not_found') {
            return (
                <div className="card-copy">
                    <h2>Oops — this RSVP link is not recognised.</h2>
                    <p>You are not on the guestlist.</p>
                    <p>If you think this is an error, email <a href="mailto:events@hivehq.nz">events@hivehq.nz</a>.</p>
                </div>
            );
        }

        if (loadState === 'error') {
            return <p className="card-copy">{error || 'Something went wrong. Please refresh the page.'}</p>;
        }

        if (!canRsvp || !invite) return null;

        return (
            <>
                <div className="status-copy">
                    <p className="eyebrow">HIVE Launch & Christmas Celebration</p>
                    <h2>{confirmed ? 'Already Confirmed 👍' : "You’re on the list! 🎄"}</h2>
                    <p>{confirmed ? 'You have already RSVP’d for this event. You can update your headcount below.' : "You're confirmed for the HIVE launch event."}</p>
                    <div className="event-meta">
                        <p>
                            <strong>When:</strong> 12 December 2025 · 5:30 pm — 10:00 pm NZDT
                        </p>
                        <p>
                            <strong>Where:</strong> The HIVE · 120 Victoria Ave, Whanganui
                        </p>
                        {/* <p>
                            <strong>Dress code:</strong> Festive founder chic ✨
                        </p> */}
                    </div>
                </div>

                <div className="guest-form">
                    {/* <label>Your email</label> */}
                    <div className="email-readonly" aria-readonly="true">{emailParam}</div>
                    <div className="slider-group">
                        <div className="slider-header">
                            <label htmlFor="guest-count">Attendees (including you): </label>
                            
                        </div>
                        <input
                            id="guest-count"
                            type="range"
                            min={1}
                            max={4}
                            value={guestCount}
                            onChange={event => setGuestCount(Number(event.target.value))}
                        />
                        <span className="slider-value" aria-live="polite">{guestCount}</span>
                        {/* <div className="slider-marks">
                            {[1, 2, 3, 4].map(mark => (
                                <span key={mark}>{mark}</span>
                            ))}
                        </div> */}
                        <p className="help"></p>
                    </div>
                    <div className="actions">
                        <button type="button" className="btn secondary" onClick={handleCalendar}>
                            Add to calendar
                        </button>
                       
                        <button type="button" className="btn primary" onClick={handleSubmit} disabled={submitting}>
                            {submitting ? 'Saving…' : confirmed ? 'Update RSVP' : 'Confirm RSVP'}
                        </button>
                    </div>
                    {toast && <p className="toast">{toast}</p>}
                    {error && <p className="error">{error}</p>}
                </div>
            </>
        );
    };

    return (
        <main className="rsvp-wrap">
            <div className="rsvp-card">
                <header>
                    <p className="eyebrow">HIVE HQ · Whanganui</p>
                    <h1>RSVP</h1>
                    <p className="card-copy">Launch night meets holiday sparkle. Let us know you’re joining us.</p>
                </header>
                {renderBody()}
            </div>
            <style jsx>{`
                .rsvp-wrap {
                    min-height: 100vh;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    padding: 2rem;
                    background: radial-gradient(circle at top, rgba(255, 255, 255, 0.12), transparent),
                        linear-gradient(120deg, #101434, #1c1f3f 50%, #34152c);
                    color: #f6f7fb;
                }
                .rsvp-card {
                    width: min(720px, 100%);
                    background: rgba(6, 8, 18, 0.85);
                    border: 1px solid rgba(255, 255, 255, 0.08);
                    border-radius: 32px;
                    padding: clamp(1.5rem, 4vw, 3rem);
                    box-shadow: 0 30px 80px rgba(0, 0, 0, 0.45);
                    backdrop-filter: blur(16px);
                }
                header h1 {
                    font-size: clamp(2rem, 5vw, 3rem);
                    margin: 0.25rem 0;
                }
                .card-copy {
                    color: #c9cde8;
                    line-height: 1.6;
                }
                .status-copy h2 {
                    margin-bottom: 0.25rem;
                    font-size: clamp(1.8rem, 4vw, 2.4rem);
                }
                .status-copy p {
                    margin: 0.4rem 0;
                }
                .eyebrow {
                    text-transform: uppercase;
                    letter-spacing: 0.4em;
                    font-size: 0.75rem;
                    color: #ffddc8;
                }
                .event-meta {
                    margin-top: 1rem;
                    padding: 1rem;
                    border-radius: 16px;
                    background: rgba(255, 255, 255, 0.05);
                }
                .guest-form {
                    margin-top: 2rem;
                    display: flex;
                    flex-direction: column;
                    gap: 0.75rem;
                }
                .slider-group {
                    margin-top: 1rem;
                }
                .slider-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 0.35rem;
                }
                .slider-value {
                    font-weight: 700;
                    color: #ffe2b9;
                }
                .email-readonly {
                    padding: 0.75rem 0.9rem;
                    border-radius: 12px;
                    border: 1px solid rgba(255, 255, 255, 0.12);
                    background: rgba(12, 15, 32, 0.5);
                    color: #fff;
                    font-size: 1rem;
                    user-select: text;
                }
                label {
                    font-size: 0.85rem;
                    color: #b7bdd9;
                    display: block;
                    margin-bottom: 0.2rem;
                }
                input[readonly] {
                    opacity: 0.75;
                }
                input[type='range'] {
                    width: 100%;
                    -webkit-appearance: none;
                    appearance: none;
                    height: 6px;
                    border-radius: 999px;
                    background: rgba(255, 255, 255, 0.2);
                }
                input[type='range']::-webkit-slider-thumb {
                    -webkit-appearance: none;
                    appearance: none;
                    width: 22px;
                    height: 22px;
                    border-radius: 50%;
                    background: linear-gradient(120deg, #ff8c4d, #ffd27b);
                    border: 2px solid #0b0f26;
                    cursor: pointer;
                    box-shadow: 0 8px 18px rgba(255, 140, 77, 0.35);
                }
                input[type='range']::-moz-range-thumb {
                    width: 22px;
                    height: 22px;
                    border-radius: 50%;
                    background: linear-gradient(120deg, #ff8c4d, #ffd27b);
                    border: 2px solid #0b0f26;
                    cursor: pointer;
                    box-shadow: 0 8px 18px rgba(255, 140, 77, 0.35);
                }
                .slider-marks {
                    display: flex;
                    justify-content: space-between;
                    font-size: 0.75rem;
                    color: #9ea6cc;
                    margin-top: 0.25rem;
                }
                .help {
                    margin: 0.35rem 0 0;
                    color: #c9cde8;
                    font-size: 0.8rem;
                    opacity: 0.85;
                }
                .actions {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 0.75rem;
                    margin-top: 1rem;
                }
                .btn {
                    border: none;
                    border-radius: 999px;
                    padding: 0.95rem 1.9rem;
                    font-weight: 600;
                    letter-spacing: 0.05em;
                    cursor: pointer;
                    transition: transform 0.2s ease, box-shadow 0.2s ease, background 0.2s ease;
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    gap: 0.35rem;
                }
                .btn:disabled {
                    opacity: 0.6;
                    cursor: not-allowed;
                }
                .btn.primary {
                    background: linear-gradient(120deg, #ff8c4d, #ffd27b);
                    color: #1a0c1c;
                    box-shadow: 0 12px 30px rgba(255, 108, 61, 0.3);
                }
                .btn.secondary {
                    background: rgba(255, 255, 255, 0.06);
                    color: #ffe8d2;
                    border: 1px solid rgba(255, 255, 255, 0.2);
                }
                .btn:not(:disabled):hover {
                    transform: translateY(-2px);
                    box-shadow: 0 12px 30px rgba(0, 0, 0, 0.3);
                }
                .actions {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 0.75rem;
                    margin-top: 1rem;
                }
                button {
                    border: none;
                    border-radius: 999px;
                    padding: 0.85rem 1.8rem;
                    font-weight: 600;
                    letter-spacing: 0.05em;
                    cursor: pointer;
                    transition: transform 0.2s ease, box-shadow 0.2s ease;
                }
                button:disabled {
                    opacity: 0.6;
                    cursor: not-allowed;
                }
                button.primary {
                    background: linear-gradient(120deg, #ff6b3d, #ffaf45);
                    color: #1a0c1c;
                }
                button.secondary {
                    background: transparent;
                    color: #ffe8d2;
                    border: 1px solid rgba(255, 255, 255, 0.3);
                }
                button:not(:disabled):hover {
                    transform: translateY(-2px);
                    box-shadow: 0 15px 30px rgba(0, 0, 0, 0.25);
                }
                .toast {
                    color: #8ff7c0;
                    font-weight: 600;
                }
                .error {
                    color: #ff9a9a;
                }
                @media (max-width: 640px) {
                    .rsvp-card {
                        border-radius: 24px;
                    }
                    .actions {
                        flex-direction: column;
                    }
                    button {
                        width: 100%;
                        justify-content: center;
                    }
                }
            `}</style>
        </main>
    );
}
