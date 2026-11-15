import Image from 'next/image';
import DirectoryClient from '../directory/DirectoryClient';
import { getTenantDirectory } from '@/lib/tenants';
import styles from './touchscreen.module.css';

export const metadata = {
    title: 'HIVE Touchscreen Directory',
    description: 'Find your way around HIVE HQ and meet the teams who call it home.',
    robots: { index: false, follow: false }
};

export const dynamic = 'force-dynamic';

export default async function TouchscreenPage() {
    let tenants = [];
    let error = '';

    try {
        tenants = await getTenantDirectory({ includeBuildings: true });
    } catch {
        error = 'The directory is temporarily unavailable. Please try again shortly.';
    }

    return (
        <main className={styles.screen}>
            <div className={styles.frame}>
                <section className={styles.map} aria-label="HIVE HQ floor plan">
                    <div className={styles.masthead}>
                        <Image
                            className={styles.logo}
                            src="/logo-square.png"
                            alt="HIVE Whanganui logo"
                            width={108}
                            height={108}
                            priority
                        />
                    </div>
                    <Image
                        className={styles.floorPlan}
                        src="/HIVE.svg"
                        alt="HIVE HQ floor plan showing rooms and offices at 116 and 122 Victoria Avenue"
                        width={2115}
                        height={1432}
                        priority
                        unoptimized
                    />
                </section>

                <section className={styles.directory} aria-labelledby="touchscreen-directory-title">
                    <header className={styles.directoryHeader}>
                        <div>
                            <p className={styles.eyebrow}>The HIVE community</p>
                            <h1 id="touchscreen-directory-title">Find your people.</h1>
                        </div>
                        <p className={styles.scrollHint}>
                            Swipe to explore <span aria-hidden="true">↓</span>
                        </p>
                    </header>
                    <div className={styles.directoryScroll} role="region" aria-label="Company directory" tabIndex={0}>
                        <DirectoryClient
                            tenants={tenants}
                            error={error}
                            totalCount={tenants.length}
                            showDescriptions={false}
                            showKeyContact={false}
                            showDirections
                            compactContacts
                        />
                    </div>
                </section>
            </div>
        </main>
    );
}
