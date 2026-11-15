'use client';

import { useState } from 'react';
import Image from 'next/image';
import { HIVE_MAP_AREAS, MAP_W, MAP_H } from '@/lib/hive-map-areas';
import { PUBLIC_ROOMS } from './public-rooms';
import styles from './touchscreen.module.css';

const publicRoomCodes = new Set(PUBLIC_ROOMS.map(room => room.code));
const officeAreas = new Map(HIVE_MAP_AREAS
    .filter(area => !publicRoomCodes.has(area.code) && Number.isFinite(area.x))
    .map(area => [area.code, area]));

function OfficeBadge({ office, name, logoUrl }) {
    const [failedLogo, setFailedLogo] = useState('');
    const hasLogo = logoUrl && failedLogo !== logoUrl;
    const words = name.trim().split(/\s+/).filter(Boolean);
    const initials = (words.length > 1 ? words[0][0] + words[1][0] : words[0]?.slice(0, 2) || 'H').toUpperCase();

    return (
        <div
            className={`${styles.officeBadge} ${hasLogo ? styles.officeBadgeWithLogo : ''}`}
            role="img"
            aria-label={`${name}, office ${office.code}`}
            title={name}
            style={{
                left: `${(office.x + office.width / 2) / MAP_W * 100}%`,
                top: `${(office.y + office.height / 2) / MAP_H * 100}%`
            }}
        >
            {hasLogo ? (
                <Image src={logoUrl} alt="" width={48} height={48} unoptimized onError={() => setFailedLogo(logoUrl)} />
            ) : (
                <span aria-hidden="true">{initials}</span>
            )}
        </div>
    );
}

export default function OfficeBadges({ tenants }) {
    return tenants.flatMap(tenant => (tenant.officeCodes || []).map(code => {
        const office = officeAreas.get(code);
        if (!office) return null;
        return (
            <OfficeBadge
                key={code}
                office={office}
                name={tenant.profileName || tenant.name}
                logoUrl={tenant.logoUrl}
            />
        );
    }));
}
