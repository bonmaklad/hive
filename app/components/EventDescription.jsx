import { eventDescriptionHtml } from '@/lib/eventDescription';

export default function EventDescription({ value }) {
    return <div className="event-rich-text" dangerouslySetInnerHTML={{ __html: eventDescriptionHtml(value) }} />;
}
