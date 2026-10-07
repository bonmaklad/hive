export function createSpaceStore(rows) {
    const tables = { spaces: rows.map(row => ({ ...row })), space_images: [] };
    const operations = [];
    const client = {
        from(table) {
            if (!tables[table]) throw new Error(`Unexpected table: ${table}`);
            let filters = [];
            let updates = null;
            let inserted = null;
            let deleting = false;
            let single = false;
            let returning = false;
            const ordering = [];
            const execute = () => {
                let matches = tables[table].filter(row => filters.every(filter => filter(row)));
                if (deleting) {
                    return { data: null, error: { code: '23503', message: 'Booking foreign key prevents deletion.' } };
                }
                if (inserted) {
                    if (tables[table].some(row => row.slug === inserted.slug)) {
                        return { data: null, error: { code: '23505', message: 'Duplicate slug.' } };
                    }
                    const row = { deleted_at: null, ...inserted };
                    tables[table].push(row);
                    matches = [row];
                }
                if (updates) matches.forEach(row => Object.assign(row, updates));
                for (const [key, ascending] of ordering.slice().reverse()) {
                    matches = matches.slice().sort((a, b) => String(a[key]).localeCompare(String(b[key])) * (ascending ? 1 : -1));
                }
                const data = updates && !returning ? null : single ? matches[0] || null : matches;
                return { data, error: null };
            };
            const query = {
                select() { returning = true; return query; },
                eq(key, value) { filters.push(row => row[key] === value); return query; },
                is(key, value) { filters.push(row => (row[key] ?? null) === value); return query; },
                order(key, { ascending = true } = {}) { ordering.push([key, ascending]); return query; },
                update(values) { updates = values; operations.push({ table, action: 'update', values }); return query; },
                insert(values) { inserted = values; operations.push({ table, action: 'insert', values }); return query; },
                delete() { deleting = true; operations.push({ table, action: 'delete' }); return query; },
                single() { single = true; return query; },
                maybeSingle() { single = true; return query; },
                then(resolve, reject) { return Promise.resolve(execute()).then(resolve, reject); }
            };
            return query;
        }
    };
    return { client, tables, operations };
}
