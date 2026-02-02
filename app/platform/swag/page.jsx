import SwagStore from '../components/SwagStore';

export const dynamic = 'force-dynamic';

export default function SwagPage() {
    return (
        <main className="platform-main">
            <div className="platform-title-row">
                <div>
                    <h1>SWAG</h1>
                    <p className="platform-subtitle">Spend tokens on HIVE merch and gear.</p>
                </div>
            </div>
            <SwagStore />
        </main>
    );
}
