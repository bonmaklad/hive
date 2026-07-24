import { NextResponse } from 'next/server';
import { requireAdmin } from '../../_lib/adminGuard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

const GST_RATE = 0.15;
const GST_DIVISOR = 1 + GST_RATE;
const OFFICE_UNIT_TYPES = new Set(['premium_office', 'private_office', 'small_office']);
const OFFICE_PLANS = new Set(['office', 'premium']);
const INCOME_GROUPS = ['members', 'office_116', 'office_122', 'office_unallocated'];
const NO_STORE_HEADERS = {
    'Cache-Control': 'no-store, no-cache, max-age=0, must-revalidate'
};

function noStoreJson(body, init = {}) {
    return NextResponse.json(body, {
        ...init,
        headers: {
            ...init.headers,
            ...NO_STORE_HEADERS
        }
    });
}

function toInt(value, fallback = 0) {
    const n = Number.isFinite(value) ? value : Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.floor(n);
}

function toNonNegativeInt(value, fallback = 0) {
    return Math.max(0, toInt(value, fallback));
}

function moneyFromGross(grossCents) {
    const gross = toNonNegativeInt(grossCents, 0);
    const net = Math.round(gross / GST_DIVISOR);
    return {
        gross_cents: gross,
        net_cents: net,
        gst_cents: Math.max(0, gross - net)
    };
}

function createMoneyNode(extra = {}) {
    return {
        ...extra,
        gross_cents: 0,
        net_cents: 0,
        gst_cents: 0,
        count: 0
    };
}

function addMoney(node, grossCents, count = 1) {
    const money = moneyFromGross(grossCents);
    node.gross_cents += money.gross_cents;
    node.net_cents += money.net_cents;
    node.gst_cents += money.gst_cents;
    node.count += count;
}

function normalizeBuilding(value) {
    const v = String(value || '').trim();
    if (v === '116' || v.startsWith('116.')) return '116';
    if (v === '122' || v.startsWith('122.')) return '122';
    return 'unallocated';
}

function getCurrentMonthKey() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function parseMonth(rawMonth) {
    return typeof rawMonth === 'string' && /^\d{4}-\d{2}$/.test(rawMonth) ? rawMonth : getCurrentMonthKey();
}

function addMonths(month, delta) {
    const [yearRaw, monthRaw] = month.split('-');
    const date = new Date(Date.UTC(Number(yearRaw), Number(monthRaw) - 1 + delta, 1));
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function getMonthWindow(month) {
    const [yearRaw, monthRaw] = month.split('-');
    const year = Number(yearRaw);
    const monthIndex = Number(monthRaw) - 1;
    const fromDate = new Date(Date.UTC(year, monthIndex, 1));
    const nextDate = new Date(Date.UTC(year, monthIndex + 1, 1));
    return {
        month,
        from: fromDate.toISOString().slice(0, 10),
        next: nextDate.toISOString().slice(0, 10),
        from_iso: fromDate.toISOString(),
        next_iso: nextDate.toISOString()
    };
}

function getTrendMonths(selectedMonth, count = 12) {
    const months = [];
    for (let offset = count - 1; offset >= 0; offset -= 1) {
        months.push(addMonths(selectedMonth, -offset));
    }
    return months;
}

function pickLatestMembershipByOwner(rows) {
    const byOwner = new Map();
    for (const row of rows || []) {
        const ownerId = typeof row?.owner_id === 'string' ? row.owner_id : null;
        if (!ownerId) continue;
        const nextTs = Date.parse(row?.updated_at || row?.created_at || '');
        const prev = byOwner.get(ownerId);
        const prevTs = prev ? Date.parse(prev?.updated_at || prev?.created_at || '') : 0;
        const next = Number.isFinite(nextTs) ? nextTs : 0;
        const current = Number.isFinite(prevTs) ? prevTs : 0;
        if (!prev || next >= current) byOwner.set(ownerId, row);
    }
    return byOwner;
}

function isLiveMembership(membership) {
    return String(membership?.status || '').trim().toLowerCase() === 'live';
}

function groupRowsBy(rows, keyGetter) {
    const map = new Map();
    for (const row of rows || []) {
        const key = keyGetter(row);
        if (!key) continue;
        if (!map.has(key)) map.set(key, []);
        map.get(key).push(row);
    }
    return map;
}

function resolveTenantIdForOwner(ownerId, tenantUsersByOwner) {
    const rows = tenantUsersByOwner.get(ownerId) || [];
    const sorted = rows.slice().sort((a, b) => {
        const at = Date.parse(a?.created_at || '');
        const bt = Date.parse(b?.created_at || '');
        return (Number.isFinite(at) ? at : 0) - (Number.isFinite(bt) ? bt : 0);
    });
    return (
        sorted.find(row => row.role === 'owner')?.tenant_id
        || sorted.find(row => row.role === 'admin')?.tenant_id
        || sorted[0]?.tenant_id
        || null
    );
}

function workUnitCode(allocation) {
    const unit = allocation?.work_unit || {};
    const building = typeof unit?.building === 'string' ? unit.building.trim() : String(unit?.building ?? '').trim();
    const number = unit?.unit_number === null || unit?.unit_number === undefined ? '' : String(unit.unit_number).trim();
    if (!building || !number) return '';
    return `${building}.${number}`;
}

function allocationWeight(allocation) {
    const unit = allocation?.work_unit || {};
    return (
        toNonNegativeInt(allocation?.price_cents, 0)
        || toNonNegativeInt(unit?.price_cents, 0)
        || toNonNegativeInt(unit?.custom_price_cents, 0)
        || toNonNegativeInt(unit?.base_price_cents, 0)
        || 1
    );
}

function distributeOfficeIncome(totalCents, allocations) {
    const total = toNonNegativeInt(totalCents, 0);
    const rows = (Array.isArray(allocations) ? allocations : [])
        .map(allocation => ({
            allocation,
            building: normalizeBuilding(allocation?.work_unit?.building),
            unit_type: allocation?.work_unit?.unit_type || allocation?.work_unit?.type,
            weight: allocationWeight(allocation)
        }))
        .filter(row => row.allocation && OFFICE_UNIT_TYPES.has(row.unit_type));

    if (!rows.length || total <= 0) {
        return [{ group: 'office_unallocated', gross_cents: total, allocations: [] }];
    }

    const totalWeight = rows.reduce((acc, row) => acc + row.weight, 0);
    const shares = rows.map(row => {
        const exact = totalWeight > 0 ? (total * row.weight) / totalWeight : total / rows.length;
        return {
            ...row,
            gross_cents: Math.floor(exact),
            remainder: exact - Math.floor(exact)
        };
    });

    let leftover = total - shares.reduce((acc, row) => acc + row.gross_cents, 0);
    shares
        .slice()
        .sort((a, b) => b.remainder - a.remainder)
        .forEach(row => {
            if (leftover <= 0) return;
            row.gross_cents += 1;
            leftover -= 1;
        });

    const byGroup = new Map();
    for (const row of shares) {
        const group = row.building === '116' ? 'office_116' : row.building === '122' ? 'office_122' : 'office_unallocated';
        const current = byGroup.get(group) || { group, gross_cents: 0, allocations: [] };
        current.gross_cents += row.gross_cents;
        current.allocations.push(row.allocation);
        byGroup.set(group, current);
    }

    return Array.from(byGroup.values()).filter(row => row.gross_cents > 0);
}

function isOfficeMembership(membership, allocations) {
    const plan = typeof membership?.plan === 'string' ? membership.plan : '';
    if (OFFICE_PLANS.has(plan)) return true;
    return (Array.isArray(allocations) ? allocations : []).some(allocation => {
        const unitType = allocation?.work_unit?.unit_type || allocation?.work_unit?.type;
        return OFFICE_UNIT_TYPES.has(unitType);
    });
}

function createCurrentBillingSummary() {
    return {
        total: createMoneyNode({ id: 'total', label: 'Total income being billed' }),
        members: createMoneyNode({ id: 'members', label: 'Members' }),
        office: createMoneyNode({ id: 'office', label: 'Offices / tenants' }),
        floors: {
            '116': createMoneyNode({ id: '116', label: '116 office income' }),
            '122': createMoneyNode({ id: '122', label: '122 office income' }),
            unallocated: createMoneyNode({ id: 'unallocated', label: 'Office income not mapped to a floor' })
        },
        groups: {
            members: createMoneyNode({ id: 'members', label: 'Members' }),
            office_116: createMoneyNode({ id: 'office_116', label: 'Office 116' }),
            office_122: createMoneyNode({ id: 'office_122', label: 'Office 122' }),
            office_unallocated: createMoneyNode({ id: 'office_unallocated', label: 'Office unallocated' })
        }
    };
}

function finalizeCurrentBilling(summary) {
    return {
        total: summary.total,
        split: [summary.members, summary.office],
        floors: [summary.floors['116'], summary.floors['122'], summary.floors.unallocated],
        groups: INCOME_GROUPS.map(group => summary.groups[group])
    };
}

function createTrendRow(month) {
    const [year, monthNum] = month.split('-');
    const date = new Date(Number(year), Number(monthNum) - 1, 1);
    const label = Number.isNaN(date.getTime()) ? month : date.toLocaleDateString('en-NZ', { month: 'short', year: '2-digit' });
    return {
        month,
        label,
        total_gross_cents: 0,
        members_gross_cents: 0,
        office_gross_cents: 0,
        office_116_gross_cents: 0,
        office_122_gross_cents: 0,
        office_unallocated_gross_cents: 0
    };
}

function addToTrend(row, group, grossCents) {
    const gross = toNonNegativeInt(grossCents, 0);
    if (!gross) return;
    row.total_gross_cents += gross;
    if (group === 'members') row.members_gross_cents += gross;
    if (group === 'office_116') {
        row.office_gross_cents += gross;
        row.office_116_gross_cents += gross;
    }
    if (group === 'office_122') {
        row.office_gross_cents += gross;
        row.office_122_gross_cents += gross;
    }
    if (group === 'office_unallocated') {
        row.office_gross_cents += gross;
        row.office_unallocated_gross_cents += gross;
    }
}

export async function GET(request) {
    const guard = await requireAdmin(request);
    if (!guard.ok) return noStoreJson({ error: guard.error }, { status: guard.status });

    const url = new URL(request.url);
    const selectedMonth = parseMonth(url.searchParams.get('month'));
    const selectedWindow = getMonthWindow(selectedMonth);
    const trendMonths = getTrendMonths(selectedMonth, 12);
    const trendFrom = getMonthWindow(trendMonths[0]).from_iso;
    const trendNext = getMonthWindow(addMonths(selectedMonth, 1)).from_iso;
    const warnings = [];

    try {
        const { data: membershipRows, error: membershipError } = await guard.admin
            .from('memberships')
            .select('id, owner_id, status, plan, office_id, monthly_amount_cents, currency, created_at, updated_at')
            .order('updated_at', { ascending: false })
            .limit(2000);
        if (membershipError) throw new Error(membershipError.message);

        const memberships = membershipRows || [];
        const membershipById = new Map(memberships.map(row => [row.id, row]));
        const latestByOwner = pickLatestMembershipByOwner(memberships);
        const ownerIds = Array.from(new Set(memberships.map(row => row?.owner_id).filter(Boolean)));

        let tenantUsers = [];
        if (ownerIds.length) {
            const { data, error } = await guard.admin
                .from('tenant_users')
                .select('tenant_id, user_id, role, created_at')
                .in('user_id', ownerIds);
            if (error) throw new Error(error.message);
            tenantUsers = data || [];
        }

        const tenantUsersByOwner = groupRowsBy(tenantUsers, row => row?.user_id);
        const tenantIdByOwner = new Map();
        for (const ownerId of ownerIds) tenantIdByOwner.set(ownerId, resolveTenantIdForOwner(ownerId, tenantUsersByOwner));
        const liveTenantIds = new Set(
            Array.from(latestByOwner.entries())
                .filter(([, membership]) => isLiveMembership(membership))
                .map(([ownerId]) => tenantIdByOwner.get(ownerId))
                .filter(Boolean)
        );

        const tenantIds = Array.from(new Set(Array.from(tenantIdByOwner.values()).filter(Boolean)));
        let tenants = [];
        if (tenantIds.length) {
            const { data, error } = await guard.admin.from('tenants').select('id, name').in('id', tenantIds);
            if (error) throw new Error(error.message);
            tenants = data || [];
        }
        const tenantById = new Map(tenants.map(row => [row.id, row]));

        let activeAllocations = [];
        if (tenantIds.length) {
            const today = new Date().toISOString().slice(0, 10);
            const { data, error } = await guard.admin
                .from('work_unit_allocations')
                .select('tenant_id, work_unit_id, price_cents, start_date, end_date, work_unit:work_units(*)')
                .in('tenant_id', tenantIds)
                .lte('start_date', today)
                .or(`end_date.is.null,end_date.gt.${today}`);
            if (error && error.code !== '42P01') throw new Error(error.message);
            if (error?.code === '42P01') warnings.push('Work unit allocations are not available, so office income cannot be split by 116/122.');
            activeAllocations = data || [];
        }
        const currentAllocations = activeAllocations.filter(row => liveTenantIds.has(row?.tenant_id));
        const allocationsByTenant = groupRowsBy(currentAllocations, row => row?.tenant_id);
        const historicalAllocationsByTenant = groupRowsBy(activeAllocations, row => row?.tenant_id);

        const { data: workUnitsRaw, error: workUnitsError } = await guard.admin
            .from('work_units')
            .select('*')
            .order('building', { ascending: true })
            .order('unit_number', { ascending: true });
        if (workUnitsError && workUnitsError.code !== '42P01') throw new Error(workUnitsError.message);
        if (workUnitsError?.code === '42P01') warnings.push('Work units are not available, so office unit counts are hidden.');
        const workUnits = workUnitsRaw || [];
        const activeOfficeUnits = workUnits.filter(unit => {
            const active = unit?.active ?? unit?.is_active ?? true;
            return active !== false && OFFICE_UNIT_TYPES.has(unit?.unit_type);
        });
        const activeOfficeUnitIds = new Set(activeOfficeUnits.map(unit => unit.id).filter(Boolean));
        const occupiedOfficeUnitIds = new Set(
            currentAllocations
                .filter(row => activeOfficeUnitIds.has(row?.work_unit_id))
                .map(row => row.work_unit_id)
        );
        const totalOfficeUnitCapacity = activeOfficeUnits.reduce((acc, unit) => acc + Math.max(1, toInt(unit?.capacity, 1)), 0);
        const occupiedOfficeSlots = currentAllocations.filter(row => activeOfficeUnitIds.has(row?.work_unit_id)).length;

        const currentBilling = createCurrentBillingSummary();
        const recurringLedger = [];
        let payingMemberCount = 0;
        let officeTenantCount = 0;

        for (const membership of latestByOwner.values()) {
            if (!isLiveMembership(membership)) continue;
            const gross = toNonNegativeInt(membership?.monthly_amount_cents, 0);
            if (!gross) continue;

            const ownerId = membership.owner_id;
            const tenantId = tenantIdByOwner.get(ownerId) || null;
            const tenant = tenantId ? tenantById.get(tenantId) : null;
            const allocations = tenantId ? allocationsByTenant.get(tenantId) || [] : [];
            const isOffice = isOfficeMembership(membership, allocations);

            addMoney(currentBilling.total, gross, 1);

            if (!isOffice) {
                payingMemberCount += 1;
                addMoney(currentBilling.members, gross, 1);
                addMoney(currentBilling.groups.members, gross, 1);
            } else {
                officeTenantCount += 1;
                addMoney(currentBilling.office, gross, 1);
                for (const row of distributeOfficeIncome(gross, allocations)) {
                    const floorKey = row.group === 'office_116' ? '116' : row.group === 'office_122' ? '122' : 'unallocated';
                    addMoney(currentBilling.floors[floorKey], row.gross_cents, 1);
                    addMoney(currentBilling.groups[row.group], row.gross_cents, 1);
                }
            }

            recurringLedger.push({
                id: membership.id,
                tenant_id: tenantId,
                tenant_name: tenant?.name || 'Unassigned tenant',
                owner_id: ownerId,
                plan: membership.plan || 'unknown',
                type: isOffice ? 'office' : 'member',
                work_units: allocations.map(workUnitCode).filter(Boolean),
                monthly_gross_cents: gross,
                ...moneyFromGross(gross)
            });
        }

        const { data: paidInvoices, error: paidInvoicesError } = await guard.admin
            .from('invoices')
            .select('id, owner_id, membership_id, invoice_number, amount_cents, currency, status, issued_on, paid_at, created_at')
            .eq('status', 'paid')
            .gte('paid_at', trendFrom)
            .lt('paid_at', trendNext)
            .order('paid_at', { ascending: true })
            .limit(3000);
        if (paidInvoicesError && paidInvoicesError.code !== '42P01') throw new Error(paidInvoicesError.message);
        if (paidInvoicesError?.code === '42P01') warnings.push('Invoices are not available, so the monthly income chart has no payment history.');

        const trendByMonth = new Map(trendMonths.map(month => [month, createTrendRow(month)]));

        for (const invoice of paidInvoices || []) {
            const gross = toNonNegativeInt(invoice?.amount_cents, 0);
            if (!gross) continue;
            const paidAt = invoice?.paid_at || invoice?.issued_on || invoice?.created_at;
            const month = typeof paidAt === 'string' ? paidAt.slice(0, 7) : '';
            const row = trendByMonth.get(month);
            if (!row) continue;

            const membership = invoice?.membership_id
                ? membershipById.get(invoice.membership_id)
                : latestByOwner.get(invoice?.owner_id);
            if (!membership) continue;

            const ownerId = membership?.owner_id || invoice?.owner_id;
            const tenantId = ownerId ? tenantIdByOwner.get(ownerId) : null;
            const allocations = tenantId ? historicalAllocationsByTenant.get(tenantId) || [] : [];
            const isOffice = isOfficeMembership(membership, allocations);

            if (!isOffice) {
                addToTrend(row, 'members', gross);
                continue;
            }

            for (const split of distributeOfficeIncome(gross, allocations)) {
                addToTrend(row, split.group, split.gross_cents);
            }
        }

        recurringLedger.sort((a, b) => b.monthly_gross_cents - a.monthly_gross_cents);

        return noStoreJson({
            ok: true,
            period: selectedWindow,
            gst: {
                rate: GST_RATE,
                inclusive_divisor: GST_DIVISOR
            },
            summary: {
                current_billing: finalizeCurrentBilling(currentBilling),
                counts: {
                    paying_members: payingMemberCount,
                    office_tenants: officeTenantCount,
                    occupied_office_units: occupiedOfficeUnitIds.size,
                    active_office_units: activeOfficeUnits.length,
                    occupied_office_slots: occupiedOfficeSlots,
                    office_unit_capacity: totalOfficeUnitCapacity
                },
                trend: Array.from(trendByMonth.values())
            },
            ledgers: {
                recurring: recurringLedger.slice(0, 200)
            },
            notes: [
                'Current income uses active live memberships and their monthly billing amount.',
                'Monthly income chart uses paid membership invoices only.',
                'Office income is split by active work-unit allocations into 116 and 122; members stay separate.'
            ],
            warnings
        });
    } catch (err) {
        return noStoreJson({ error: err?.message || 'Failed to load financials.' }, { status: 500 });
    }
}
