/** @jest-environment jsdom */
import { act, render, screen } from '@testing-library/react';
import HomeSpacesGallery from '@/app/components/HomeSpacesGallery';

jest.mock('@/app/components/ImageCarousel', () => ({
    __esModule: true,
    default: ({ images }) => <div data-testid="gallery">{images.join(',')}</div>
}));

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

test('the gallery clears room photos when the last visible space is hidden', async () => {
    global.fetch = jest.fn()
        .mockResolvedValueOnce({ ok: true, json: async () => ({ spaces: [{ image: '/visible-room.jpg', images: ['/visible-room.jpg'] }] }) })
        .mockResolvedValue({ ok: true, json: async () => ({ spaces: [] }) });
    await act(async () => { render(<HomeSpacesGallery />); });
    expect(screen.getByTestId('gallery').textContent).toBe('/visible-room.jpg');
    await act(async () => { jest.advanceTimersByTime(60_000); });
    expect(screen.queryByTestId('gallery')).toBeNull();
});

test('failed room loads do not expose hardcoded hidden-room photos', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('Unavailable'));
    await act(async () => { render(<HomeSpacesGallery />); });
    expect(screen.queryByTestId('gallery')).toBeNull();
});
