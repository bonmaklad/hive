export const EVENT_TYPES = [
    { value: 'discover', label: 'Discover' },
    { value: 'incubate', label: 'Incubate' },
    { value: 'accelerate', label: 'Accelerate' },
    { value: 'scale', label: 'Scale' },
    { value: 'community', label: 'Community' }
];

export const PROGRAM_STAGES = EVENT_TYPES.filter(type => type.value !== 'community');

export const EVENT_TOPICS = [
    'Future Industries',
    'Big Data',
    'Robotics',
    'Software Automation',
    'AI & Applied ML',
    'Gaming',
    'Tech',
    'Design'
];

export const EVENT_VISIBILITIES = [
    { value: 'public', label: 'Public' },
    { value: 'members', label: 'Members' }
];

export const HIVE_LOCATION = {
    name: 'HIVE Whanganui',
    address: 'Level 2, 120 Victoria Avenue, Whanganui 4500, New Zealand'
};

export function eventTypeLabel(value) {
    const found = EVENT_TYPES.find(type => type.value === value);
    return found?.label || 'Discover';
}

export function eventTypeFromStage(stage) {
    const value = String(stage || '').trim().toLowerCase();
    if (value === 'discover' || value === 'incubate' || value === 'accelerate' || value === 'scale' || value === 'community') {
        return value;
    }
    return 'discover';
}

export function mapsSearchUrl(address) {
    const query = String(address || HIVE_LOCATION.address).trim() || HIVE_LOCATION.address;
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

export function mapsEmbedUrl(address) {
    const query = String(address || HIVE_LOCATION.address).trim() || HIVE_LOCATION.address;
    return `https://www.google.com/maps?q=${encodeURIComponent(query)}&output=embed`;
}
