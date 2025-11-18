export interface IcsOptions {
    title: string;
    start: Date;
    end: Date;
    location: string;
    description: string;
    timeZone: string;
}

export function buildIcsEvent(options: IcsOptions): string {
    const { title, start, end, location, description, timeZone } = options;

    const format = (date: Date) => {
        const parts = new Intl.DateTimeFormat('en-NZ', {
            timeZone,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
        })
            .formatToParts(date)
            .reduce<Record<string, string>>((acc, part) => {
                if (part.type !== 'literal') acc[part.type] = part.value;
                return acc;
            }, {});

        return `${parts.year}${parts.month}${parts.day}T${parts.hour}${parts.minute}${parts.second}`;
    };

    const dtStamp = format(new Date());
    const uid = `${Date.now()}@hivehq.nz`;

    return [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//HIVE//RSVP//EN',
        'CALSCALE:GREGORIAN',
        'METHOD:PUBLISH',
        'BEGIN:VEVENT',
        `UID:${uid}`,
        `DTSTAMP;TZID=${timeZone}:${dtStamp}`,
        `DTSTART;TZID=${timeZone}:${format(start)}`,
        `DTEND;TZID=${timeZone}:${format(end)}`,
        `SUMMARY:${title}`,
        `LOCATION:${location}`,
        `DESCRIPTION:${description}`,
        'END:VEVENT',
        'END:VCALENDAR'
    ].join('\r\n');
}
