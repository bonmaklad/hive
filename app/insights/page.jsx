import { redirect } from 'next/navigation';
import { monthlySnapshots } from '@/lib/insights/monthlySnapshots';

export const metadata = {
    title: '2025/26 Business Trends Report | HIVE Whanganui',
    description: 'Whanganui business and trends report from HIVE.'
};

export default function InsightsPage() {
    const [latestSnapshot] = monthlySnapshots;

    redirect(`/insights/${latestSnapshot.slug}`);
}
