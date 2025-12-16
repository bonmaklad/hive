export default function StatusBadge({ status }) {
    const normalized = String(status || '').trim().toLowerCase();

    const variant =
        !normalized || normalized.includes('no deployment') || normalized === 'none'
            ? 'neutral'
            : normalized === 'ready' || normalized === 'success'
            ? 'success'
            : normalized === 'failed' || normalized === 'error'
            ? 'error'
            : normalized
            ? 'pending'
            : 'neutral';

    return <span className={`badge ${variant}`}>{status || '—'}</span>;
}
