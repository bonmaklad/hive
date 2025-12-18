import Link from 'next/link';
import MembershipClient from './MembershipClient';

export const dynamic = 'force-dynamic';

export default function PlatformMembershipPage() {
    return (
        <main className="platform-main">
            <div className="platform-title-row">
                <div>
                    <h1>Membership</h1>
                    <p className="platform-subtitle">View your plan, update extras, and review invoices.</p>
                </div>
                <Link className="btn ghost" href="/platform">
                    Back to dashboard
                </Link>
            </div>

            <MembershipClient />
        </main>
    );
}

