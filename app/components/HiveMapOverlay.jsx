'use client';

import { useMemo } from 'react';

export const MAP_W = 2115.21;
export const MAP_H = 1432;

export const HIVE_MAP_AREAS = [
    { code: '122.1', name: 'Hive Corner', x: 37.56, y: 437.17, width: 195.14, height: 95.49 },
    { code: '122.2', name: 'Nikau', x: 37.56, y: 227.66, width: 195.14, height: 203.51 },
    { code: '122.3', name: 'MIKE!', x: 37.56, y: 90.4, width: 195.14, height: 131.27 },
    { code: '122.4', name: 'Whanganui Tech', x: 238.7, y: 84.41, width: 120.91, height: 143.25 },
    { code: '122.5', name: 'Whanganui Tech', x: 365.6, y: 90.4, width: 242.1, height: 142.17 },
    { code: '122.6', name: 'Members Storeroom', x: 613.7, y: 90.4, width: 158.18, height: 142.17 },
    { code: '122.7', name: 'HIVE Storage', x: 771.88, y: 90.4, width: 135.14, height: 142.17 },
    { code: '122.8', name: 'Kauri', x: 913.02, y: 91.4, width: 152.96, height: 141.17 },
    { code: '122.10', name: 'Open Office', x: 1224.94, y: 90.4, width: 199.82, height: 141.17 },
    { code: '122.11', name: 'Hot Desks', x: 1430.75, y: 84.41, width: 170.29, height: 153.16 },
    { code: '122.12', name: 'David', x: 1607.03, y: 90.4, width: 199.82, height: 141.17 },
    { code: '122.13', name: 'Epoch 37', x: 1607.03, y: 237.56, width: 199.82, height: 108.83 },
    { code: '122.14', name: 'Bustle', x: 1645.42, y: 352.38, width: 161.43, height: 108.83 },
    { code: '122.15', name: 'Zone 2', x: 1430.75, y: 237.56, width: 176.28, height: 393.96 },
    { code: '122.16', name: 'Backhouse Boardroom', x: 1277.59, y: 437.17, width: 147.16, height: 188.35 },
    { code: '122.17', name: 'Lamp Studio', x: 1224.94, y: 290.01, width: 199.82, height: 141.17 },
    {
        code: '122.18',
        name: 'Hot Desk Pod',
        labelX: 1112,
        labelY: 357,
        desks: [
            { x: 1072.18, y: 285.73, width: 39.97, height: 79.93 },
            { x: 1112.14, y: 285.73, width: 39.97, height: 79.93 },
            { x: 1112.14, y: 365.66, width: 39.97, height: 79.93 },
            { x: 1072.18, y: 365.66, width: 39.97, height: 79.93 }
        ]
    },
    { code: '122.9', name: 'Hot Desks', x: 1071.97, y: 90.4, width: 146.98, height: 148.16 },
    { code: '116.1', name: 'Hot Desks', x: 19.93, y: 740.62, width: 310.04, height: 177.3 },
    { code: '116.2', name: 'WDETT', x: 36.1, y: 923.91, width: 214.03, height: 233.58 },
    { code: '116.3', name: 'WDETT', x: 36.1, y: 1163.49, width: 214.03, height: 233.58 },
    { code: '116.4', name: 'WDETT', x: 256.14, y: 1214.01, width: 234.1, height: 189.06 },
    { code: '116.5', name: 'TMA', x: 496.23, y: 1220, width: 174.22, height: 177.07 },
    { code: '116.6', name: 'TMA', x: 676.45, y: 1220, width: 174.22, height: 177.07 },
    { code: '116.7', name: 'Aritzo', x: 856.67, y: 1220, width: 174.22, height: 177.07 },
    { code: '116.8', name: 'Open Office', x: 1036.89, y: 1220, width: 174.22, height: 177.07 },
    { code: '116.9', name: 'Open Office', x: 1217.11, y: 1220, width: 174.22, height: 177.07 },
    { code: '116.10', name: 'Open Office', x: 1397.33, y: 1220, width: 174.22, height: 177.07 },
    { code: '116.11', name: 'Open Office', x: 1576.94, y: 1220, width: 225.88, height: 177.07 },
    { code: '116.12', name: 'Watering Hole', x: 1808.52, y: 948.55, width: 201.43, height: 448.42 },
    { code: '116.13', name: 'HIVE Training Room', x: 1454.73, y: 740.62, width: 307.55, height: 199.82 },
    { code: '116.14', name: 'Manukau', x: 1248.92, y: 740.62, width: 199.82, height: 199.82 },
    { code: '116.15', name: 'Nga Remu', x: 1112.84, y: 740.62, width: 130.09, height: 199.82 },
    { code: '116.16', name: 'Open Office', x: 970.36, y: 741.74, width: 136.49, height: 198.7 },
    {
        code: '116.17',
        name: 'Server Room',
        path: 'M1277.59,734.62v-256.15h-420.92v182.44h113.69v10.8h-5.99v52.11h5.99v10.8h307.23Z',
        labelX: 1035,
        labelY: 610
    },
    { code: '116.18', name: 'Design Lab', x: 562.45, y: 478.47, width: 288.23, height: 256.15 },
    { code: '116.19', name: 'Store Room', x: 335.96, y: 478.47, width: 220.49, height: 256.15 },
    { code: '116.20', name: 'WDETT', x: 562.45, y: 741.87, width: 150.88, height: 199.82 },
    { code: '116.21', name: 'TMA', x: 719.32, y: 741.87, width: 131.35, height: 199.82 },
    { code: '116.22', name: 'HIVE Mini Lounge', x: 455.66, y: 947.68, width: 395.08, height: 266.33 },
    { code: '116.23', name: 'Billy', x: 1120.95, y: 1006.59, width: 189.89, height: 145.66 },
    { code: '116.24', name: 'Heni', x: 1316.83, y: 1006.59, width: 183.53, height: 145.66 },
    { code: '116.25', name: 'CFO4U', x: 1506.36, y: 1006.59, width: 168.03, height: 145.66 }
];

export function normalizeCode(value) {
    return typeof value === 'string' ? value.trim().replace(/\s+/g, '') : '';
}

function toCode(unit) {
    const building = typeof unit?.building === 'string' ? unit.building.trim() : String(unit?.building ?? '').trim();
    const number = unit?.unit_number === null || unit?.unit_number === undefined ? '' : String(unit.unit_number).trim();
    return building && number ? `${building}.${number}` : '';
}

function unitHasVacancy(unit) {
    if (!unit) return false;
    if (unit?.active === false || unit?.is_active === false) return false;
    const remaining = Number(unit?.slots_remaining);
    if (Number.isFinite(remaining)) return remaining > 0;
    if (unit?.is_full === true) return false;
    if (unit?.is_vacant === true || unit?.is_occupied === false) return true;
    return unit?.is_occupied !== true;
}

function getOccupancyCounts(unit) {
    const capacity = Number(unit?.capacity);
    const occupied = Number(unit?.occupied_count);
    const remaining = Number(unit?.slots_remaining);
    return {
        capacity: Number.isFinite(capacity) ? capacity : null,
        occupied: Number.isFinite(occupied) ? occupied : null,
        remaining: Number.isFinite(remaining) ? remaining : null
    };
}

export function getAreaStatus(unit) {
    if (!unit) return 'untracked';
    if (unit?.active === false || unit?.is_active === false) return 'inactive';
    const { capacity, occupied, remaining } = getOccupancyCounts(unit);
    if (capacity !== null && occupied !== null && remaining !== null) {
        if (remaining <= 0 || occupied >= capacity) return 'taken';
        if (occupied > 0 && remaining > 0) return 'partial';
        return 'available';
    }
    if (unit?.is_full === true) return 'taken';
    if (unit?.is_occupied === true && unitHasVacancy(unit)) return 'partial';
    return unitHasVacancy(unit) ? 'available' : 'taken';
}

function describeUnitStatus(unit) {
    if (!unit) return 'Not in work-unit inventory';
    if (unit?.active === false || unit?.is_active === false) return 'Inactive';
    const { capacity, occupied, remaining } = getOccupancyCounts(unit);
    if (capacity !== null && capacity > 0 && occupied !== null && remaining !== null) {
        if (remaining <= 0 || occupied >= capacity) return `Taken (${occupied}/${capacity} slots filled)`;
        if (occupied > 0) return `Partially available (${remaining}/${capacity} slots free)`;
        return `Available (${remaining}/${capacity} slots free)`;
    }
    return unitHasVacancy(unit) ? 'Available' : 'Taken';
}

function buildAreaTitle(area, unit) {
    const type = typeof unit?.unit_type === 'string' ? unit.unit_type.replace(/_/g, ' ') : '';
    const tenantNames = Array.isArray(unit?.occupied_by_tenant_names)
        ? unit.occupied_by_tenant_names.filter(name => typeof name === 'string' && name.trim())
        : [];
    const tenant = tenantNames.length
        ? `Tenant${tenantNames.length > 1 ? 's' : ''}: ${tenantNames.join(', ')}`
        : '';
    const details = [area.code, area.name, tenant, describeUnitStatus(unit), type].filter(Boolean);
    return details.join(' - ');
}

function getAreaCenter(area) {
    if (Number.isFinite(area.labelX) && Number.isFinite(area.labelY)) {
        return { x: area.labelX, y: area.labelY };
    }
    if (area.desks?.length) {
        const xs = area.desks.flatMap(desk => [desk.x, desk.x + desk.width]);
        const ys = area.desks.flatMap(desk => [desk.y, desk.y + desk.height]);
        return {
            x: (Math.min(...xs) + Math.max(...xs)) / 2,
            y: (Math.min(...ys) + Math.max(...ys)) / 2
        };
    }
    return {
        x: area.x + area.width / 2,
        y: area.y + area.height / 2
    };
}

function renderAreaShape(area, className) {
    if (area.desks?.length) {
        return area.desks.map((desk, index) => (
            <rect
                key={`${area.code}-desk-${index}`}
                className={className}
                x={desk.x}
                y={desk.y}
                width={desk.width}
                height={desk.height}
                rx="6"
                ry="6"
            />
        ));
    }
    if (area.path) {
        return <path className={className} d={area.path} />;
    }
    return <rect className={className} x={area.x} y={area.y} width={area.width} height={area.height} rx="8" ry="8" />;
}

export function buildUnitsByCode(units) {
    const map = new Map();
    for (const unit of units || []) {
        const direct = normalizeCode(unit?.code);
        const fallback = normalizeCode(toCode(unit));
        const code = direct || fallback;
        if (code) map.set(code, unit);
    }
    return map;
}

export default function HiveMapOverlay({ units, onUnitSelect }) {
    const unitsByCode = useMemo(() => buildUnitsByCode(units), [units]);

    return (
        <svg className="hive-map-overlay" viewBox={`0 0 ${MAP_W} ${MAP_H}`} width={MAP_W} height={MAP_H}>
            {HIVE_MAP_AREAS.map((area, index) => {
                const code = normalizeCode(area.code);
                const unit = unitsByCode.get(code);
                const status = getAreaStatus(unit);
                const center = getAreaCenter(area);
                const title = buildAreaTitle(area, unit);
                const className = `hive-map-area status-${status}`;
                return (
                    <g
                        key={`${area.code}-${area.name}-${index}`}
                        data-unit-code={area.code}
                        className={`hive-map-area-group ${unit && onUnitSelect ? 'is-clickable' : ''}`}
                        onClick={onUnitSelect ? event => onUnitSelect(unit, event) : undefined}
                    >
                        <title>{title}</title>
                        {renderAreaShape(area, className)}
                        <text className="hive-map-area-label" x={center.x} y={center.y}>
                            {area.code}
                        </text>
                    </g>
                );
            })}
        </svg>
    );
}
