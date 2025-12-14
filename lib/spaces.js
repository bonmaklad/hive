export const spaces = [
    {
        slug: 'nikau-room',
        title: 'Nikau Room',
        copy: 'A flexible seminar room with big energy and views down Victoria Avenue.',
        headerImage: '/nikau1.jpg',
        capacity: 'Up to 12 seated (layout dependent)',
        pricing: { halfDay: 120, fullDay: 200 },
        layouts: [
            { label: 'Boardroom', capacity: '10 people' },
            { label: 'Cafe style', capacity: '12 people (3 tables)' },
            { label: 'Classroom', capacity: '8 people (2 rows)' }
        ],
        highlights: ['Whiteboard', 'TV with casting', 'Natural light + street views'],
        bestFor: ['Workshops', 'Planning sessions', 'Team offsites', 'Client meetings'],
        images: [
            '/nikau1.jpg',
            '/nikau2.jpg',
            '/nikau3.jpg'
        ]
    },
    {
        slug: 'backhouse-boardroom',
        title: 'Backhouse Boardroom',
        copy: 'Executive boardroom for 6–8 people with conferencing-grade audio visual.',
        headerImage: 'https://images.unsplash.com/photo-1524758631624-e2822e304c36?auto=format&fit=crop&w=1600&q=80',
        capacity: '6–8 people',
        pricing: { halfDay: 100, fullDay: 180 },
        layouts: [{ label: 'Executive boardroom', capacity: '6–8 people' }],
        highlights: ['Large TV', 'Camera, microphones, speakers', 'Cast or plug in a laptop', 'Custom Whanganui-made boardroom table'],
        bestFor: ['Board meetings', 'Investor calls', 'Strategy sessions', 'Remote conferences'],
        images: [
            'https://images.unsplash.com/photo-1524758631624-e2822e304c36?auto=format&fit=crop&w=1600&q=80',
            'https://images.unsplash.com/photo-1557804506-669a67965ba0?auto=format&fit=crop&w=1600&q=80',
            'https://images.unsplash.com/photo-1556761175-b413da4baf72?auto=format&fit=crop&w=1600&q=80'
        ]
    },
    {
        slug: 'hive-training-room',
        title: 'Hive Training Room',
        copy: 'A 15-person desk setup with monitors, projector, and a whiteboard—built for learning.',
        headerImage: 'https://images.unsplash.com/photo-1516321497487-e288fb19713f?auto=format&fit=crop&w=1600&q=80',
        capacity: '15 people',
        pricing: { halfDay: 80, fullDay: 150 },
        layouts: [{ label: 'Training desks', capacity: '15 desks' }],
        highlights: ['Monitors', 'Projector', 'Whiteboard'],
        bestFor: ['Training days', 'Team enablement', 'Hands-on workshops', 'Study groups'],
        images: [
            'https://images.unsplash.com/photo-1516321497487-e288fb19713f?auto=format&fit=crop&w=1600&q=80',
            'https://images.unsplash.com/photo-1524178232363-1fb2b075b655?auto=format&fit=crop&w=1600&q=80',
            'https://images.unsplash.com/photo-1588072432836-2fdc0fbb2b2c?auto=format&fit=crop&w=1600&q=80'
        ]
    },
    {
        slug: 'design-lab',
        title: 'Hive Design Lab',
        headerImage: '/design1.jpg',
        copy: 'A 30-person space designed to spark creativity—floor-to-ceiling whiteboards and room to move.',
        capacity: 'Up to 30 people',
        pricing: { halfDay: 150, fullDay: 280 },
        layouts: [{ label: 'Studio / workshop', capacity: 'Up to 30 people' }],
        highlights: ['Floor-to-ceiling whiteboards', 'TV', 'Built for strategic + product sessions'],
        bestFor: ['Innovation learning', 'Product development', 'Strategic planning', 'Design sprints'],
        images: [
            '/design1.jpg'
        ]
    },
    {
        slug: 'hive-lounge',
        title: 'Hive Lounge',
        copy: 'After-hours event space for up to 50 people—ideal for talks, launches, and community nights.',
        headerImage: '/lounge1.jpg',
        capacity: 'Up to 50 people (5pm–10pm)',
        pricing: { perEvent: 500 },
        layouts: [{ label: 'Event-style seating', capacity: 'Up to 50 people' }],
        highlights: ['Whiteboards', 'TVs on wheels', 'PA system', 'Optional staff for food + drinks service'],
        bestFor: ['Evening talks', 'Product launches', 'Community meetups', 'Celebrations'],
        images: [
            '/lounge1.jpg',
            '/lounge3.jpg'
        ]
    }
];

export const spacesBySlug = Object.fromEntries(spaces.map(space => [space.slug, space]));

export function getSpaceBySlug(slug) {
    return spacesBySlug[slug] ?? null;
}

export const bookingInclusions = [
    'Water + tea/coffee',
    'Hyperfibre connection',
    'Use of the Hive Lounge for breaks',
    'Disability access (elevator available if required)',
    'Outside catering or self-catering welcome (or we can arrange catering)'
];
