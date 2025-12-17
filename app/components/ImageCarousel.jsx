'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';

import styles from './ImageCarousel.module.css';

function shuffledSequence(length, excludeIndex) {
    const sequence = [];
    for (let index = 0; index < length; index += 1) {
        if (index !== excludeIndex) {
            sequence.push(index);
        }
    }

    for (let index = sequence.length - 1; index > 0; index -= 1) {
        const swapIndex = Math.floor(Math.random() * (index + 1));
        [sequence[index], sequence[swapIndex]] = [sequence[swapIndex], sequence[index]];
    }

    return sequence;
}

export default function ImageCarousel({
    images,
    alt = 'HIVE space',
    intervalMs = 4500,
    fadeMs = 650,
    priority = false,
    sizes = '(max-width: 960px) 100vw, 800px',
    quality = 60
}) {
    const normalizedImages = useMemo(() => {
        if (!Array.isArray(images)) {
            return [];
        }

        return images.filter(Boolean);
    }, [images]);

    const [currentIndex, setCurrentIndex] = useState(() => {
        return 0;
    });
    const [nextIndex, setNextIndex] = useState(null);
    const [isTransitioning, setIsTransitioning] = useState(false);
    const sequenceRef = useRef([]);

    const currentIndexRef = useRef(currentIndex);
    useEffect(() => {
        currentIndexRef.current = currentIndex;
    }, [currentIndex]);

    useEffect(() => {
        if (normalizedImages.length <= 1) {
            return undefined;
        }

        sequenceRef.current = shuffledSequence(normalizedImages.length, currentIndexRef.current);
        const id = setInterval(() => {
            let next = sequenceRef.current.shift();
            if (next === undefined) {
                sequenceRef.current = shuffledSequence(normalizedImages.length, currentIndexRef.current);
                next = sequenceRef.current.shift();
            }

            if (next === undefined) {
                return;
            }

            setNextIndex(next);
            setIsTransitioning(true);
        }, intervalMs);

        return () => clearInterval(id);
    }, [intervalMs, normalizedImages.length]);

    useEffect(() => {
        if (!isTransitioning || nextIndex === null) {
            return undefined;
        }

        const timeoutId = setTimeout(() => {
            setCurrentIndex(nextIndex);
            setNextIndex(null);
            setIsTransitioning(false);
        }, fadeMs);

        return () => clearTimeout(timeoutId);
    }, [fadeMs, isTransitioning, nextIndex]);

    const currentSrc = normalizedImages[currentIndex] ?? normalizedImages[0];
    const upcomingSrc = nextIndex === null ? null : normalizedImages[nextIndex];

    if (!currentSrc) {
        return null;
    }

    return (
        <div className={styles.frame} style={{ '--fade-ms': `${fadeMs}ms` }}>
            <Image
                className={styles.image}
                src={currentSrc}
                alt={alt}
                fill
                priority={priority}
                sizes={sizes}
                quality={quality}
            />
            {upcomingSrc && (
                <Image
                    className={`${styles.image} ${styles.next} ${isTransitioning ? styles.active : ''}`}
                    src={upcomingSrc}
                    alt={alt}
                    fill
                    sizes={sizes}
                    quality={quality}
                />
            )}
        </div>
    );
}
