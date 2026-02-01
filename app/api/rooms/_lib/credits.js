function toInt(value, fallback = 0) {
    const n = Number.isFinite(value) ? value : Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.floor(n);
}

export async function fetchCreditsSummary({ admin, ownerId }) {
    if (!ownerId) {
        return { ok: false, error: 'Missing owner_id.' };
    }

    const { data, error } = await admin
        .from('room_credits')
        .select('period_start, tokens_total, tokens_used')
        .eq('owner_id', ownerId);

    if (error) {
        return { ok: false, error: error.message };
    }

    const rows = Array.isArray(data) ? data : [];
    let tokensTotal = 0;
    let tokensUsed = 0;
    let latestRow = null;

    for (const row of rows) {
        tokensTotal += Math.max(0, toInt(row?.tokens_total, 0));
        tokensUsed += Math.max(0, toInt(row?.tokens_used, 0));
        const periodStart = row?.period_start ? String(row.period_start) : '';
        if (periodStart && (!latestRow || periodStart > String(latestRow.period_start))) {
            latestRow = row;
        }
    }

    const tokensLeft = Math.max(0, tokensTotal - tokensUsed);

    return {
        ok: true,
        tokensTotal,
        tokensUsed,
        tokensLeft,
        latestRow
    };
}
