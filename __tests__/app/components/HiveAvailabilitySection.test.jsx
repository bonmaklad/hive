/** @jest-environment jsdom */
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import HiveAvailabilitySection from '@/app/components/HiveAvailabilitySection';
import HiveWorkUnitMap from '@/app/platform/admin/work-units/HiveWorkUnitMap';

const mapUnits = [
    { id: 'empty', building: '122', unit_number: 1, capacity: 1, occupied_count: 0, slots_remaining: 1 },
    { id: 'full', building: '116', unit_number: 8, capacity: 1, occupied_count: 1, slots_remaining: 0 },
    { id: 'partial', building: '122', unit_number: 18, capacity: 4, occupied_count: 2, slots_remaining: 2 }
];
let currentMapUnits;

const area = (container, code) => container.querySelector(`[data-unit-code="${code}"]`);

beforeEach(() => {
    jest.useFakeTimers();
    currentMapUnits = mapUnits.map(unit => ({ ...unit }));
    global.fetch = jest.fn(async url => {
        if (url === '/HIVE.svg') return { ok: true, text: async () => '<svg viewBox="0 0 2115.21 1432"></svg>' };
        if (url === '/api/availability') return {
            ok: true,
            json: async () => ({
                units: currentMapUnits.filter(unit => unit.slots_remaining > 0).map(unit => ({ ...unit, unit_type: 'desk' })),
                map_units: currentMapUnits
            })
        };
        throw new Error(`Unexpected URL: ${url}`);
    });
});

afterEach(() => jest.useRealTimers());

function expectStatuses(container) {
    expect(area(container, '122.1').querySelector('.status-available')).not.toBeNull();
    expect(area(container, '116.8').querySelector('.status-taken')).not.toBeNull();
    expect(area(container, '122.18').querySelectorAll('.status-partial')).toHaveLength(4);
    expect(area(container, '116.9').querySelector('.status-untracked')).not.toBeNull();
}

test('the homepage preview and enlarged map show the same availability overlays as admin', async () => {
    await act(async () => { render(<HiveAvailabilitySection />); });
    const preview = screen.getByRole('button', { name: 'Explore HIVE map with workspace availability' });
    expectStatuses(preview);
    expect(area(preview, '116.8').querySelector('title').textContent).toContain('Taken (1/1 slots filled)');
    const table = screen.getByRole('table');
    expect(within(table).getAllByRole('row')).toHaveLength(3);

    await act(async () => { fireEvent.click(preview); });
    const dialog = screen.getByRole('dialog', { name: 'HIVE map viewer' });
    expectStatuses(dialog);

    const onUnitSelect = jest.fn();
    let admin;
    await act(async () => { admin = render(<HiveWorkUnitMap units={mapUnits} onUnitSelect={onUnitSelect} />); });
    expectStatuses(admin.container);
    fireEvent.click(area(admin.container, '116.8').querySelector('rect'));
    expect(onUnitSelect).toHaveBeenCalledWith(mapUnits[1]);

    fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).toBeNull();
});

test('availability refreshes update both maps while the enlarged map stays open', async () => {
    await act(async () => { render(<HiveAvailabilitySection />); });
    const preview = screen.getByRole('button', { name: 'Explore HIVE map with workspace availability' });
    await act(async () => { fireEvent.click(preview); });
    currentMapUnits = currentMapUnits.map(unit => ({ ...unit, occupied_count: 0, slots_remaining: unit.capacity }));
    await act(async () => { jest.advanceTimersByTime(60_000); });
    const dialog = screen.getByRole('dialog', { name: 'HIVE map viewer' });
    for (const container of [preview, dialog]) {
        expect(area(container, '116.8').querySelector('.status-available')).not.toBeNull();
        expect(area(container, '122.18').querySelectorAll('.status-available')).toHaveLength(4);
    }
});

test('failed availability loads leave rooms untracked instead of marking them available', async () => {
    global.fetch.mockRejectedValue(new Error('Availability unavailable'));
    await act(async () => { render(<HiveAvailabilitySection />); });
    const preview = screen.getByRole('button', { name: 'Explore HIVE map with workspace availability' });
    expect(preview.querySelector('.status-available')).toBeNull();
    expect(area(preview, '122.1').querySelector('.status-untracked')).not.toBeNull();
    expect(screen.getByText('Availability unavailable')).not.toBeNull();
});
