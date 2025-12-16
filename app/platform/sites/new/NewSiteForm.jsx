'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { createSite } from './actions';

function SubmitButton() {
    const { pending } = useFormStatus();
    return (
        <button className="btn primary" type="submit" disabled={pending}>
            {pending ? 'Creating…' : 'Create site'}
        </button>
    );
}

export default function NewSiteForm() {
    const [state, formAction] = useFormState(createSite, { error: '' });

    return (
        <form className="contact-form" action={formAction}>
            <label>
                GitHub repo
                <input type="text" name="repo" placeholder="owner/repo" autoComplete="off" required />
            </label>
            <label>
                Framework
                <select name="framework" defaultValue="next" required>
                    <option value="next">next</option>
                    <option value="static">static</option>
                    <option value="node">node</option>
                </select>
            </label>
            <label>
                Domain
                <input type="text" name="domain" placeholder="example.com" autoComplete="off" required />
            </label>

            {state?.error && <p className="platform-message error">{state.error}</p>}

            <div className="platform-actions">
                <SubmitButton />
            </div>
        </form>
    );
}

