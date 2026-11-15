'use client';

import { useMemo } from 'react';

import { MAP_W, MAP_H, HIVE_MAP_AREAS } from '@/lib/hive-map-areas';

export { MAP_W, MAP_H, HIVE_MAP_AREAS };

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
