export const events = [
    {
        slug: 'hackathons-design-camps',
        title: 'Hackathons & Design Camps',
        stage: 'Discover',
        copy: 'Open challenge sprints where people learn by solving a real Whanganui problem, building a prototype, and pitching what should happen next.',
        image: '/hackathon.jpg',
        format: 'Weekend hackathon, design sprint, or school/community camp format',
        cadence: 'Scheduled around partner themes',
        price: 'TBD',
        idealFor: ['First-time founders', 'Students and career switchers', 'Designers, builders, and subject experts', 'Teams testing whether an idea has energy'],
        entryCriteria: [
            'Aged appropriately for the event stream, with guardian consent for under-18 participants',
            'Willing to work in a team, interview users, and present publicly',
            'No startup, coding, or design experience required',
            'A problem, theme, skill, or curiosity that can be worked on during the sprint'
        ],
        exitCriteria: [
            'A clear problem statement and named user group',
            'A tested prototype, storyboard, service map, or technical proof of concept',
            'A short demo or pitch with next steps',
            'A decision on whether the idea should stop, continue, or enter incubation'
        ],
        certificate: [
            'Attend the required sessions',
            'Contribute to the team build and final showcase',
            'Submit a one-page build log with prototype evidence, user feedback, and personal contribution',
            'Receive mentor sign-off after the final demo'
        ],
        outcomes: [
            'Prototype and pitch evidence',
            'Confidence using design thinking and rapid testing',
            'A pathway into Startup Weekend or Incubators',
            'New collaborators, mentors, and local problem owners'
        ],
        syllabus: [
            {
                title: 'Problem discovery',
                bullets: [
                    'Use empathy interviews and observation to understand the user',
                    'Turn a broad theme into a sharp problem statement',
                    'Define what success would look like by the end of the sprint'
                ]
            },
            {
                title: 'Ideas and team formation',
                bullets: [
                    'Generate multiple options before choosing one direction',
                    'Map team roles across design, build, research, and pitch',
                    'Choose the smallest useful prototype that can prove or disprove the idea'
                ]
            },
            {
                title: 'Prototype and test',
                bullets: [
                    'Build a clickable, physical, no-code, or coded prototype',
                    'Run quick user tests and capture the strongest learning',
                    'Refine the solution based on real feedback'
                ]
            },
            {
                title: 'Showcase and next step',
                bullets: [
                    'Tell the story: problem, user, solution, evidence, and ask',
                    'Demo the prototype clearly',
                    'Choose a progression path: stop, sprint again, Startup Weekend, or Incubator'
                ]
            }
        ],
        progression: 'Strong projects can move into Startup Weekend for a deeper venture sprint or into Incubators once the idea has a scalable customer problem.'
    },
    {
        slug: 'startup-weekend',
        title: 'Startup Weekend',
        stage: 'Discover',
        copy: 'A founder sprint for pitching ideas, forming teams, building an MVP, validating with customers, and presenting the venture opportunity.',
        image: 'https://images.unsplash.com/photo-1515187029135-18ee286d815b?auto=format&fit=crop&w=1200&q=80',
        format: 'Three-day founder sprint',
        cadence: 'Occasional major event',
        price: 'TBD',
        idealFor: ['Aspiring founders', 'People with an idea to pitch', 'Builders who want a team', 'Designers, sellers, students, and operators who want the founder experience'],
        entryCriteria: [
            'Open to people with or without an idea to pitch',
            'Able to commit to the full weekend and work in a team',
            'Willing to validate with real potential users or customers',
            'Prepared to present the team result at the final showcase'
        ],
        exitCriteria: [
            'A minimum viable product, demo, landing page, or service prototype',
            'Customer discovery evidence and a refined value proposition',
            'A simple business model and first testable offer',
            'A final pitch that explains the next 30 days'
        ],
        certificate: [
            'Participate across the full weekend program',
            'Complete the MVP, validation, and final pitch checkpoints',
            'Submit the team canvas, prototype link or evidence, and customer learning notes',
            'Receive facilitator sign-off after final judging'
        ],
        outcomes: [
            'MVP and venture pitch',
            'Early customer validation',
            'Team, mentor, and founder network',
            'Incubator invitation for ideas with a scalable customer problem'
        ],
        syllabus: [
            {
                title: 'Pitch and form teams',
                bullets: [
                    'Pitch problems and vote on the strongest opportunities',
                    'Form balanced teams around founder energy and useful skills',
                    'Define the MVP, risk assumptions, and customer interview plan'
                ]
            },
            {
                title: 'Build and validate',
                bullets: [
                    'Create a business model canvas and test the riskiest assumptions',
                    'Prototype the smallest useful product or service',
                    'Interview customers and adapt the solution from evidence'
                ]
            },
            {
                title: 'Pitch and progress',
                bullets: [
                    'Build the final story: customer, problem, product, traction, model, and ask',
                    'Demo the MVP and explain what changed through validation',
                    'Choose the pathway into Incubators, further sprinting, or direct launch'
                ]
            }
        ],
        progression: 'Startup Weekend graduates with a scalable idea, clear customer segment, and evidence of demand can apply for Incubators.'
    },
    {
        slug: 'youth-coding-camps',
        title: 'Youth Coding Camps',
        stage: 'Discover',
        copy: 'School-linked coding camps that help young people create portfolio projects, gather evidence, and see a pathway into HIVE programs.',
        image: '/youth2.jpg',
        format: 'School-linked camp, holiday block, or partner cohort',
        cadence: 'Aligned with schools and holiday windows',
        price: 'TBD',
        idealFor: ['Intermediate and secondary learners', 'Curious beginners', 'Students building NCEA-ready evidence', 'Young creators who want to make websites, apps, games, or data projects'],
        entryCriteria: [
            'School nomination, teacher referral, or open enrolment where places are available',
            'Guardian consent for under-18 learners',
            'Access to a laptop or a school/HIVE device for the camp',
            'Beginner-friendly attitude: curiosity, attendance, and willingness to debug'
        ],
        exitCriteria: [
            'A working digital outcome such as a webpage, game, app, data story, or interactive prototype',
            'Documented purpose, users, requirements, and testing evidence',
            'A short demo to classmates, whānau, teachers, or HIVE mentors',
            'A next-step plan into advanced coding, hackathons, work experience, or startup pathways'
        ],
        certificate: [
            'Attend the required camp sessions',
            'Ship a working project and keep a small project journal',
            'Submit evidence such as screenshots, testing notes, code links, planning boards, or a short demo video',
            'Receive mentor and, where relevant, teacher sign-off for a HIVE certificate of completion'
        ],
        schoolLink: {
            title: 'Linked with schools',
            copy: 'HIVE supplies the project brief, mentor support, and evidence pack. Schools can align the work with their local curriculum and decide whether evidence is suitable for their own assessment processes.',
            bullets: [
                'Maps to computational thinking and designing/developing digital outcomes',
                'Uses school-safe attendance, consent, and teacher checkpoint processes',
                'Creates evidence students can discuss with their teacher, including purpose, users, specifications, testing, and reflection',
                'Keeps certification separate from formal school credit unless the school chooses to assess it'
            ]
        },
        outcomes: [
            'Portfolio project',
            'Evidence pack for school conversations',
            'Confidence with code, testing, and debugging',
            'Pathway into hackathons, design camps, internships, and future startup programs'
        ],
        syllabus: [
            {
                title: 'Digital foundations',
                bullets: [
                    'Safe setup, files, tools, source control basics, and debugging habits',
                    'Computational thinking: sequences, variables, selection, loops, functions, and decomposition',
                    'Digital citizenship, accessibility, and responsible use of AI-assisted tools where appropriate'
                ]
            },
            {
                title: 'Make a digital outcome',
                bullets: [
                    'Choose a domain: web, game, app, data, robotics, or creative technology',
                    'Define users, requirements, and specifications before building',
                    'Build iteratively and test basic functionality as the project grows'
                ]
            },
            {
                title: 'Test, refine, and demo',
                bullets: [
                    'Trial the outcome with users and record what was learned',
                    'Improve fitness for purpose through testing evidence',
                    'Prepare a demo, screenshots, reflection, and next learning goal'
                ]
            }
        ],
        progression: 'Graduates can join HIVE hackathons, design camps, internships, Startup Weekend teams, or advanced school-linked projects.'
    },
    {
        slug: 'incubators',
        title: 'Incubators',
        stage: 'Incubate',
        copy: 'Milestone-based support for approved scalable ideas, moving founders from evidence and prototype to the first dollar of revenue.',
        image: 'https://images.unsplash.com/photo-1519389950473-47ba0277781c?auto=format&fit=crop&w=1200&q=80',
        format: 'Milestone-based, no fixed timeframe',
        cadence: 'Applications reviewed by idea readiness and mentor capacity',
        price: 'TBD',
        idealFor: ['Founders with a serious idea', 'Teams with early customer learning', 'Builders ready to sell a first offer', 'Projects leaving hackathons, design camps, or Startup Weekend'],
        entryCriteria: [
            'Approved idea with a clear customer problem and potential to scale beyond one-off local delivery',
            'Evidence of customer pain through interviews, observation, waitlist, letters of intent, or early trials',
            'A founder or team willing to test weekly and share progress metrics',
            'A believable path to a first paid customer, grant, contract, pre-order, or transaction',
            'Basic capability to build, source, or deliver the first version ethically and legally'
        ],
        exitCriteria: [
            'Make the first $1 of real revenue or equivalent paid commitment',
            'Define the target customer, first offer, pricing, and delivery model',
            'Ship a working MVP, pilot, service package, or validated prototype',
            'Show enough customer evidence to decide whether to accelerate, keep incubating, or stop'
        ],
        certificate: [
            'Complete the discovery, MVP, offer, and revenue checkpoints',
            'Maintain a progress log covering interviews, assumptions, experiments, and evidence',
            'Provide proof of first revenue or paid commitment',
            'Pass a mentor review and present the venture at a HIVE review table'
        ],
        outcomes: [
            'First revenue milestone',
            'Validated customer and offer',
            'MVP or pilot ready for repeated selling',
            'Accelerator readiness decision'
        ],
        syllabus: [
            {
                title: 'Customer and market proof',
                bullets: [
                    'Map customer segments, pain intensity, alternatives, and willingness to pay',
                    'Run structured customer discovery and keep evidence clean',
                    'Size the first niche and the wider scalable opportunity'
                ]
            },
            {
                title: 'MVP and first offer',
                bullets: [
                    'Choose the smallest product, service, or workflow that can prove value',
                    'Set pricing, packaging, and a clear first offer',
                    'Run build-measure-learn loops without overbuilding'
                ]
            },
            {
                title: 'First revenue',
                bullets: [
                    'Create a sales script, simple landing page, or proposal',
                    'Ask for payment, pre-order, grant, contract, or paid pilot',
                    'Review evidence and decide whether the company is ready to accelerate'
                ]
            }
        ],
        progression: 'Incubator graduates who are making money can apply for Accelerators.'
    },
    {
        slug: 'accelerators',
        title: 'Accelerators',
        stage: 'Accelerate',
        copy: 'Milestone-based support for approved companies that are already making money and need a repeatable growth flywheel.',
        image: '/accelerator.jpg',
        format: 'Milestone-based, no fixed timeframe',
        cadence: 'Accepted companies progress by metrics and readiness',
        price: 'TBD',
        idealFor: ['Revenue-generating companies', 'Founders ready to scale sales and delivery', 'Teams preparing for investment', 'Companies with evidence that customers will pay repeatedly'],
        entryCriteria: [
            'Approved company or trading venture already making money',
            'Clear customer segment, value proposition, and repeatable offer',
            'Baseline metrics for revenue, margin, acquisition, delivery capacity, and customer retention where available',
            'Founder commitment to weekly operating cadence, transparent metrics, and rapid experiments',
            'A plausible flywheel hypothesis: every $1 spent on the right activity can return more than $1 over time'
        ],
        exitCriteria: [
            'Prove a growth flywheel where the next $1 spent can return more than $1 through sales, margin, retention, or repeatable acquisition',
            'Maintain an operating dashboard covering revenue, costs, pipeline, conversion, margin, and customer learning',
            'Prepare investor-grade materials, financial model, growth plan, and due diligence folder',
            'Present at the end-of-year Dragons Den investment event and become eligible for May Whanganui Innovation Awards recognition'
        ],
        certificate: [
            'Complete the operating cadence, growth, finance, and investment-readiness checkpoints',
            'Submit evidence of revenue, unit economics, growth experiments, and learning decisions',
            'Complete a mentor/investor readiness review',
            'Present at Dragons Den or an equivalent HIVE investment review'
        ],
        outcomes: [
            'Repeatable revenue flywheel',
            'Investor-ready metrics and pitch',
            'Scale plan for hiring, systems, and capital',
            'Pathway to Dragons Den investment and Whanganui Innovation Awards recognition'
        ],
        syllabus: [
            {
                title: 'Metrics and unit economics',
                bullets: [
                    'Set the operating dashboard: revenue, gross margin, acquisition cost, payback, retention, and capacity',
                    'Identify the highest-leverage growth constraint',
                    'Separate one-off wins from repeatable growth signals'
                ]
            },
            {
                title: 'Growth flywheel',
                bullets: [
                    'Design experiments across sales, partnerships, content, referrals, product loops, or channel spend',
                    'Track whether each dollar of effort or spend creates more revenue, margin, or pipeline value',
                    'Build the repeatable system: scripts, process, automation, fulfilment, and customer success'
                ]
            },
            {
                title: 'Capital and scale readiness',
                bullets: [
                    'Prepare financial model, use of funds, hiring plan, and risk register',
                    'Build the investor story from evidence, not hope',
                    'Rehearse for Dragons Den and May Whanganui Innovation Awards presentation opportunities'
                ]
            }
        ],
        progression: 'Accelerator graduates move toward investment, larger customers, hiring, and public recognition through Dragons Den and the Whanganui Innovation Awards.'
    }
];

export const eventsBySlug = Object.fromEntries(events.map(event => [event.slug, event]));

const eventAliases = {
    'tri-annual-incubators': 'incubators',
    '13-week-accelerator': 'accelerators'
};

export function getEventBySlug(slug) {
    return eventsBySlug[slug] ?? eventsBySlug[eventAliases[slug]] ?? null;
}
