'use client';

import { Suspense, useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import RoomBookingClient from './room/room-booking-client';

export default function RoomBookingModalButton() {
    const [open, setOpen] = useState(false);
    const titleId = useId();
    const triggerRef = useRef(null);
    const closeRef = useRef(null);

    const closeModal = useCallback(() => {
        setOpen(false);
    }, []);

    useEffect(() => {
        if (!open) return undefined;

        const previousOverflow = document.body.style.overflow;
        const trigger = triggerRef.current;
        document.body.style.overflow = 'hidden';
        closeRef.current?.focus();

        const onKeyDown = event => {
            if (event.key !== 'Escape') return;
            const openOverlays = document.querySelectorAll('.platform-modal-overlay');
            if (openOverlays.length > 1) return;
            closeModal();
        };

        window.addEventListener('keydown', onKeyDown);
        return () => {
            window.removeEventListener('keydown', onKeyDown);
            document.body.style.overflow = previousOverflow;
            trigger?.focus();
        };
    }, [closeModal, open]);

    return (
        <>
            <button ref={triggerRef} className="btn primary" type="button" onClick={() => setOpen(true)}>
                Book now
            </button>
            {open && typeof document !== 'undefined'
                ? createPortal(
                      <div
                          className="platform-modal-overlay booking-launcher-overlay"
                          role="presentation"
                          onMouseDown={event => {
                              if (event.target === event.currentTarget) closeModal();
                          }}
                      >
                          <div
                              className="platform-modal booking-launcher-modal"
                              role="dialog"
                              aria-modal="true"
                              aria-labelledby={titleId}
                              onMouseDown={event => event.stopPropagation()}
                          >
                              <div className="platform-modal-header booking-launcher-header">
                                  <div>
                                      <p className="eyebrow">Bookings</p>
                                      <h2 id={titleId}>Book a room</h2>
                                      <p>See availability, choose a time, and confirm your booking instantly.</p>
                                  </div>
                                  <button ref={closeRef} className="btn ghost" type="button" onClick={closeModal}>
                                      Close
                                  </button>
                              </div>
                              <Suspense fallback={<p>Loading booking…</p>}>
                                  <RoomBookingClient />
                              </Suspense>
                          </div>
                      </div>,
                      document.body
                  )
                : null}
        </>
    );
}
