/* eslint-disable react/no-unescaped-entities */

export const POLICY_SECTIONS = [
    {
        id: 'mission',
        label: 'Mission & goals',
        render: () => (
            <>
                <h2 style={{ marginTop: 0 }}>Mission & goals</h2>
                <p className="platform-subtitle" style={{ marginTop: 0 }}>
                    HIVE HQ exists to build a thriving local network of builders, creatives, and small teams who want a supportive place to work and grow.
                </p>
                <ul>
                    <li>Run a welcoming, respectful, and productive coworking space.</li>
                    <li>Make the “ops” of coworking transparent, trackable, and community-driven.</li>
                    <li>Support member businesses through connection, shared knowledge, and (soon) negotiated benefits.</li>
                    <li>Build local-first tooling that works without needing members to be technical.</li>
                </ul>
            </>
        )
    },
    {
        id: 'conduct',
        label: 'Code of conduct',
        render: () => (
            <>
                <h2 style={{ marginTop: 0 }}>Code of conduct (coworking space)</h2>
                <p className="platform-subtitle" style={{ marginTop: 0 }}>
                    This code of conduct applies to all members, guests, and visitors. It exists to protect the community and keep HIVE HQ a great place to work.
                </p>

                <h3>Be respectful</h3>
                <ul>
                    <li>Treat everyone with respect. No harassment, discrimination, bullying, or intimidation.</li>
                    <li>Assume good intent, but be open to feedback if your impact isn’t matching your intent.</li>
                    <li>If a conflict arises, keep it calm and private. If you need help, raise a ticket.</li>
                </ul>

                <h3>Leave spaces as you found them</h3>
                <ul>
                    <li>Reset desks, chairs, and meeting rooms after use.</li>
                    <li>Take your belongings with you. Lost property may be moved to a holding area.</li>
                    <li>Rubbish is cleared out each weekend; help by keeping bins usable and taking overflow away when needed.</li>
                    <li>General cleaning happens each weekend; please do your part daily (wipe surfaces, return dishes, tidy shared areas).</li>
                </ul>

                <h3>Kitchen, coffee, and koha</h3>
                <ul>
                    <li>Coffee is filled weekly. Milk is provided twice a week.</li>
                    <li>We have a HIVE HQ koha bowl. If you use more than your fair share of shared supplies, please leave a koha so we can replace it for everyone.</li>
                    <li>Label your food. Remove anything perished or messy.</li>
                </ul>

                <h3>Noise and focus</h3>
                <ul>
                    <li>Be mindful with calls. Use meeting rooms when possible, or keep calls short and quiet.</li>
                    <li>Use headphones for audio.</li>
                </ul>

                <h3>Security and access</h3>
                <ul>
                    <li>Opening hours on the locks are <span className="platform-mono">8am–6pm Monday to Friday</span>.</li>
                    <li>You should have a door code. If you are the first to open a door for the day, it may remain unlocked until later—stay aware of who enters.</li>
                    <li>Ensure all doors close behind you.</li>
                    <li>All private areas have locks. If it’s locked, leave it locked. This protects your security and everyone else’s.</li>
                </ul>

                <h3>Bookings and shared resources</h3>
                <ul>
                    <li>Book rooms via the platform and honour your booking times.</li>
                    <li>Leave rooms tidy: clear whiteboards (if requested), remove rubbish, and reset furniture.</li>
                    <li>Report broken equipment or issues via a ticket.</li>
                </ul>

                <h3>Enforcement</h3>
                <p className="platform-subtitle" style={{ marginTop: 0 }}>
                    The HIVE HQ team may take action to protect members and the space, including warnings, temporary access limits, or membership termination for serious or repeated breaches.
                </p>
            </>
        )
    },
    {
        id: 'safety',
        label: 'Health & safety',
        render: () => (
            <>
                <h2 style={{ marginTop: 0 }}>Health & safety plan</h2>
                <p className="platform-subtitle" style={{ marginTop: 0 }}>
                    Your safety matters. If there’s an emergency, call emergency services first. After any incident (including near misses), record it via a ticket.
                </p>
                <h3>Fire</h3>
                <ul>
                    <li>Fire assembly point: <span className="platform-mono">the back of Watt Street</span>, on the opposite side of the road by the museum.</li>
                    <li>Fire warden: <span className="platform-mono">Michael Law</span>.</li>
                    <li>Do not re-enter until told it’s safe.</li>
                </ul>
                <h3>First aid / medical</h3>
                <ul>
                    <li>Medical kits are located in both kitchens.</li>
                    <li>If there has been an injury, raise a ticket to record it (include what happened, where, and any follow-up needed).</li>
                </ul>
                <h3>Heating, cooling, and appliances</h3>
                <ul>
                    <li>Do not change the temperatures on the air con units.</li>
                    <li>Due to fire safety, personal air con units or heaters are not permitted in HIVE HQ.</li>
                    <li>Report temperature issues via a ticket so we can manage it safely.</li>
                </ul>
            </>
        )
    }
];

