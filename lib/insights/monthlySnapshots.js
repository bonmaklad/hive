export const monthlySnapshots = [
    {
        slug: 'april26snapshot',
        reportLabel: '2025/26',
        issueLabel: 'Annual report',
        monthLabel: '2025/26',
        title: 'Whanganui Business Trends Report',
        subtitle:
            'A 2025/26 annual read of Whanganui business conditions: economy, people, firms, sectors, housing, tourism, investment, and local shocks.',
        dataAsOf: '18 May 2026',
        heroNote: '',
        reportNav: [
            { label: 'Overview', href: '#overview' },
            { label: 'Economy', href: '#economy' },
            { label: 'People', href: '#people' },
            { label: 'Business Base', href: '#business-base' },
            { label: 'Sectors', href: '#sectors' },
            { label: 'Visitors', href: '#visitors' },
            { label: 'Investment', href: '#investment' },
            { label: 'Sources', href: '#sources' }
        ],
        keyTakeaways: [
            'Whanganui District GDP is now shown with the Infometrics 2025 annual profile: $2.541B in the year to March 2025, down 0.9% from 2024.',
            'GDP per capita is $51,644 and productivity is $121,007 per filled job in the 2025 profile, both sitting well below the national benchmark.',
            'Population is now estimated at 49,200, with modest growth and positive net internal and international migration in the latest public releases.',
            'The firm count rose to 4,770. The employee-size table shows the gain came from 0-employee businesses, pointing to more solo and microbusiness activity rather than broad hiring expansion.',
            'Retail trade is the weak read: annual retail sales were $927M, down 0.9% while New Zealand rose 3.5%. That makes local demand a watch item for operators.',
            'Filled jobs fell to 20,998 in the 2025 annual profile, while the separate MBIE labour-market pulse shows participation and employment rates improving through December 2025.',
            'Annual tourism expenditure reached $191.8M in the 2025 profile, with 2026 accommodation measures showing occupancy at 50.7%.',
            'Housing is more affordable than New Zealand overall, but rents are still moving up locally. The latest mean house value is $524,186 and mean weekly rent is $491.',
            'The strongest recent local shocks are the public-housing pipeline cut, Sarjeant visitor lift, He Rau Tukutuku settlement progress, and retail softness.'
        ],
        headlineMetrics: [
            {
                label: 'GDP',
                value: '$2.541B',
                change: '-0.9%',
                cadence: 'Year to Mar 2025',
                source: 'Infometrics Regional Economic Profile / Stats NZ',
                theme: 'Economy'
            },
            {
                label: 'GDP per capita',
                value: '$51.6K',
                change: '-1.1%',
                cadence: 'Year to Mar 2025',
                source: 'Infometrics Regional Economic Profile / Stats NZ',
                theme: 'Productivity'
            },
            {
                label: 'Productivity',
                value: '$121K',
                change: '0.0%',
                cadence: 'Year to Mar 2025',
                source: 'Infometrics Regional Economic Profile / Stats NZ',
                theme: 'Output'
            },
            {
                label: 'Population',
                value: '49,200',
                change: '+0.2%',
                cadence: 'Year to Jun 2025',
                source: 'Infometrics / Stats NZ population estimate',
                theme: 'People'
            },
            {
                label: 'Filled jobs',
                value: '20,998',
                change: '-182',
                cadence: 'Year to Mar 2025',
                source: 'Infometrics Regional Economic Profile / Stats NZ',
                theme: 'Workforce'
            },
            {
                label: 'Earnings',
                value: '$68.8K',
                change: '+5.2%',
                cadence: 'Year to Mar 2025',
                source: 'Infometrics Regional Economic Profile / Stats NZ',
                theme: 'Income'
            },
            {
                label: 'Businesses',
                value: '4,770',
                change: '+15',
                cadence: 'Feb 2025',
                source: 'Stats NZ Business Demography via MBIE',
                theme: 'Firms'
            },
            {
                label: 'Retail trade',
                value: '$927M',
                change: '-0.9%',
                cadence: 'Year to Dec 2025',
                source: 'Stats NZ Retail Trade via MBIE',
                theme: 'Demand'
            },
            {
                label: 'Tourism spend',
                value: '$191.8M',
                change: '+4.8%',
                cadence: 'Year to Mar 2025',
                source: 'Infometrics / MBIE Marketview',
                theme: 'Visitors'
            },
            {
                label: 'Employment rate',
                value: '59.5%',
                change: '+1.7 pp',
                cadence: 'Year to Dec 2025',
                source: 'MBIE workforce',
                theme: 'Workforce'
            },
            {
                label: 'House value',
                value: '$524K',
                change: '+0.5%',
                cadence: 'Mar 2026',
                source: 'MBIE / CoreLogic-style house value series',
                theme: 'Housing'
            },
            {
                label: 'Mean rent',
                value: '$491',
                change: '+1.6%',
                cadence: 'Feb 2026',
                source: 'MBIE rent indicators',
                theme: 'Housing'
            },
            {
                label: 'Building consents',
                value: '192',
                change: '+10.3%',
                cadence: 'Year to Feb 2026',
                source: 'Stats NZ Building Consents via MBIE',
                theme: 'Investment'
            }
        ],
        dataCoverage: [
            {
                label: '2025 annual profile',
                value: 'Included',
                detail: 'GDP, GDP per capita, productivity, filled jobs, earnings, household income, tourism, population, rents, and house values.'
            },
            {
                label: '2025 rolling indicators',
                value: 'Included',
                detail: 'Retail, labour-market, migration, business units, and new car registration measures.'
            },
            {
                label: '2026 monthly pulses',
                value: 'Included',
                detail: 'Accommodation, consents, house values, rents, infrastructure decisions, and April local shocks.'
            },
            {
                label: 'MBIE TA GDP audit',
                value: '2024',
                detail: 'MBIE MTAGDP remains the official territorial-authority GDP release, but its 2025 release only runs to March 2024.'
            }
        ],
        dataFreshness: [
            { metric: 'District GDP total', latest: 'Year to Mar 2025', reportValue: '$2.541B', source: 'Infometrics Regional Economic Profile / Stats NZ', status: '2025 district profile number included' },
            { metric: 'GDP per capita', latest: 'Year to Mar 2025', reportValue: '$51,644', source: 'Infometrics Regional Economic Profile / Stats NZ', status: '2025 district profile number included' },
            { metric: 'Productivity', latest: 'Year to Mar 2025', reportValue: '$121,007', source: 'Infometrics Regional Economic Profile / Stats NZ', status: '2025 district profile number included' },
            { metric: 'Filled jobs', latest: 'Year to Mar 2025', reportValue: '20,998', source: 'Infometrics Regional Economic Profile / Stats NZ', status: '2025 district profile number included' },
            { metric: 'Average earnings', latest: 'Year to Mar 2025', reportValue: '$68,808', source: 'Infometrics Regional Economic Profile / Stats NZ', status: '2025 district profile number included' },
            { metric: 'Mean household income', latest: 'Year to Mar 2025', reportValue: '$101,203', source: 'Infometrics Regional Economic Profile', status: '2025 district profile number included' },
            { metric: 'Median household income', latest: 'Year to Mar 2025', reportValue: '$81,467', source: 'Infometrics Regional Economic Profile', status: '2025 district profile number included' },
            { metric: 'Annual tourism expenditure', latest: 'Year to Mar 2025', reportValue: '$191.8M', source: 'Infometrics / MBIE Marketview', status: '2025 district profile number included' },
            { metric: 'Annual mean house value', latest: 'Year to Mar 2025', reportValue: '$468,857', source: 'Infometrics / CoreLogic', status: '2025 district profile number included' },
            { metric: 'Annual mean rent', latest: 'Year to Mar 2025', reportValue: '$488', source: 'Infometrics / MBIE', status: '2025 district profile number included' },
            { metric: 'Official MBIE TA GDP audit', latest: 'Year to Mar 2024', reportValue: '$2.424B', source: 'MBIE MTAGDP 2025 release', status: 'Latest MBIE territorial-authority GDP data year; retained for audit trail' },
            { metric: 'Regional GDP context', latest: 'Year to Mar 2025', reportValue: '$17.146B', source: 'Stats NZ Regional GDP 2025', status: 'Manawatu-Whanganui regional level, not Whanganui District' },
            { metric: 'Population estimate', latest: 'Jun 2025', reportValue: '49,200', source: 'Infometrics / Stats NZ population estimate', status: '2025 number included' },
            { metric: 'Business units', latest: 'Feb 2025', reportValue: '4,770', source: 'Stats NZ Business Demography via MBIE', status: '2025 number included' },
            { metric: 'Retail trade', latest: 'Year to Dec 2025', reportValue: '$927M', source: 'Stats NZ Retail Trade via MBIE', status: '2025 number included' },
            { metric: 'Employment rate', latest: 'Year to Dec 2025', reportValue: '59.5%', source: 'MBIE workforce indicators', status: '2025 number included' },
            { metric: 'Labour force participation', latest: 'Year to Dec 2025', reportValue: '63.0%', source: 'MBIE workforce indicators', status: '2025 number included' },
            { metric: 'Underutilisation', latest: 'Year to Dec 2025', reportValue: '14.3%', source: 'MBIE workforce indicators', status: '2025 number included' },
            { metric: 'NEET rate', latest: 'Year to Dec 2025', reportValue: '15.9%', source: 'MBIE / regional labour indicators', status: 'Regional measure included' },
            { metric: 'Internal migration', latest: 'Jun 2025', reportValue: '+90', source: 'MBIE migration indicators', status: '2025 number included' },
            { metric: 'International migration', latest: 'Jun 2025', reportValue: '+90', source: 'MBIE migration indicators', status: '2025 number included' },
            { metric: 'New car registrations', latest: 'Year to Dec 2025', reportValue: '1,308', source: 'NZTA via MBIE', status: '2025 number included' },
            { metric: 'Tourism spend pulse', latest: 'Year to Feb 2026', reportValue: '$313M', source: 'MBIE tourism spend', status: '2026 rolling pulse kept separate from annual tourism-expenditure profile' },
            { metric: 'Accommodation occupancy', latest: 'Year to Feb 2026', reportValue: '50.7%', source: 'MBIE accommodation indicators', status: '2026 number included' },
            { metric: 'Guest nights per resident', latest: 'Year to Feb 2026', reportValue: '4.4', source: 'MBIE accommodation indicators', status: '2026 number included' },
            { metric: 'All building consents', latest: 'Year to Feb 2026', reportValue: '192', source: 'Stats NZ Building Consents via MBIE', status: '2026 number included' },
            { metric: 'Dwelling consents', latest: 'Year to Feb 2026', reportValue: '153', source: 'Stats NZ Building Consents via MBIE', status: '2026 number included' },
            { metric: 'Mean house value', latest: 'Mar 2026', reportValue: '$524,186', source: 'MBIE house-value series', status: '2026 number included' },
            { metric: 'Mean weekly rent', latest: 'Feb 2026', reportValue: '$491', source: 'MBIE rent indicators', status: '2026 number included' },
            { metric: 'Sector GDP infographic', latest: 'Supplied 2025', reportValue: 'Top 10 sector mix', source: 'Supplied Flourish visualisation', status: 'Kept separate from official headline GDP' }
        ],
        annualProfile: [
            { metric: 'GDP', previous: '$2.564B', current: '$2.541B', change: '-0.9% / -$23.3M', period: 'Year to Mar 2025', source: 'Infometrics / Stats NZ' },
            { metric: 'GDP per capita', previous: '$52,224', current: '$51,644', change: '-1.1% / -$580', period: 'Year to Mar 2025', source: 'Infometrics / Stats NZ' },
            { metric: 'Productivity', previous: '$121,067', current: '$121,007', change: '0.0% / -$60', period: 'Year to Mar 2025', source: 'Infometrics / Stats NZ' },
            { metric: 'Filled jobs', previous: '21,180', current: '20,998', change: '-0.9% / -182', period: 'Year to Mar 2025', source: 'Infometrics / Stats NZ' },
            { metric: 'Average earnings', previous: '$65,410', current: '$68,808', change: '+5.2% / +$3,398', period: 'Year to Mar 2025', source: 'Infometrics / Stats NZ' },
            { metric: 'Mean household income', previous: '$99,861', current: '$101,203', change: '+1.3% / +$1,342', period: 'Year to Mar 2025', source: 'Infometrics' },
            { metric: 'Median household income', previous: '$80,386', current: '$81,467', change: '+1.3% / +$1,081', period: 'Year to Mar 2025', source: 'Infometrics' },
            { metric: 'Population', previous: '49,100', current: '49,200', change: '+0.2% / +100', period: 'Year to Jun 2025', source: 'Infometrics / Stats NZ' },
            { metric: 'Business units', previous: '4,755', current: '4,770', change: '+15', period: 'Feb 2025', source: 'MBIE WEBREAR / Stats NZ' },
            { metric: 'Tourism expenditure', previous: '$183.1M', current: '$191.8M', change: '+4.8% / +$8.7M', period: 'Year to Mar 2025', source: 'Infometrics / MBIE Marketview' },
            { metric: 'Mean house value', previous: '$466,036', current: '$468,857', change: '+0.6% / +$2,821', period: 'Year to Mar 2025', source: 'Infometrics / CoreLogic' },
            { metric: 'Mean weekly rent', previous: '$464', current: '$488', change: '+5.2% / +$24', period: 'Year to Mar 2025', source: 'Infometrics / MBIE' }
        ],
        economyTrends: [
            {
                title: 'GDP growth track',
                subtitle: 'The Infometrics 2025 Whanganui District profile gives the annual district view through March 2025.',
                unit: '$M',
                points: [
                    { label: '2021', value: 2403.4, display: '$2.403B' },
                    { label: '2022', value: 2524.6, display: '$2.525B' },
                    { label: '2023', value: 2572, display: '$2.572B' },
                    { label: '2024', value: 2564.2, display: '$2.564B' },
                    { label: '2025', value: 2540.9, display: '$2.541B' }
                ]
            },
            {
                title: 'GDP per capita',
                subtitle: 'Per-person output eased again in the 2025 profile, reinforcing the productivity challenge.',
                unit: '$',
                points: [
                    { label: '2021', value: 49760, display: '$49,760' },
                    { label: '2022', value: 52269, display: '$52,269' },
                    { label: '2023', value: 52922, display: '$52,922' },
                    { label: '2024', value: 52224, display: '$52,224' },
                    { label: '2025', value: 51644, display: '$51,644' }
                ]
            },
            {
                title: 'Productivity per filled job',
                subtitle: 'Output per filled job was almost flat in 2025, after softening in 2024.',
                unit: '$',
                points: [
                    { label: '2021', value: 118272, display: '$118,272' },
                    { label: '2022', value: 120535, display: '$120,535' },
                    { label: '2023', value: 121838, display: '$121,838' },
                    { label: '2024', value: 121067, display: '$121,067' },
                    { label: '2025', value: 121007, display: '$121,007' }
                ]
            },
            {
                title: 'Filled jobs',
                subtitle: 'Annual filled jobs fell in 2025, making job quality and business growth central watch items.',
                unit: 'jobs',
                points: [
                    { label: '2021', value: 20321, display: '20,321' },
                    { label: '2022', value: 20945, display: '20,945' },
                    { label: '2023', value: 21110, display: '21,110' },
                    { label: '2024', value: 21180, display: '21,180' },
                    { label: '2025', value: 20998, display: '20,998' }
                ]
            },
            {
                title: 'Population track',
                subtitle: 'Population has been broadly stable, with the 2025 MBIE estimate above recent dashboard levels.',
                unit: 'people',
                points: [
                    { label: '2021', value: 48300, display: '48,300' },
                    { label: '2022', value: 48300, display: '48,300' },
                    { label: '2023', value: 48600, display: '48,600' },
                    { label: '2024', value: 49100, display: '49,100' },
                    { label: '2025', value: 49200, display: '49,200' }
                ]
            },
            {
                title: 'Business units',
                subtitle: 'Firm counts continued to edge higher into 2025, led by 0-employee businesses.',
                unit: 'firms',
                points: [
                    { label: '2021', value: 4380, display: '4,380' },
                    { label: '2022', value: 4584, display: '4,584' },
                    { label: '2023', value: 4695, display: '4,695' },
                    { label: '2024', value: 4755, display: '4,755' },
                    { label: '2025', value: 4770, display: '4,770' }
                ]
            },
            {
                title: 'Tourism expenditure',
                subtitle: 'Annual tourism expenditure kept rising in the 2025 profile, though it remains a small share of the local economy.',
                unit: '$M',
                points: [
                    { label: '2021', value: 125.5, display: '$125.5M' },
                    { label: '2022', value: 135.5, display: '$135.5M' },
                    { label: '2023', value: 166.6, display: '$166.6M' },
                    { label: '2024', value: 183.1, display: '$183.1M' },
                    { label: '2025', value: 191.8, display: '$191.8M' }
                ]
            },
            {
                title: 'Average earnings',
                subtitle: 'Earnings are still rising, but this needs to translate into higher-value work and firm productivity.',
                unit: '$',
                points: [
                    { label: '2021', value: 55002, display: '$55,002' },
                    { label: '2022', value: 57862, display: '$57,862' },
                    { label: '2023', value: 61358, display: '$61,358' },
                    { label: '2024', value: 65410, display: '$65,410' },
                    { label: '2025', value: 68808, display: '$68,808' }
                ]
            },
            {
                title: 'Mean weekly rent',
                subtitle: 'Rents rose again in the 2025 annual profile, with the 2026 pulse already at $491.',
                unit: '$',
                points: [
                    { label: '2021', value: 354, display: '$354' },
                    { label: '2022', value: 400, display: '$400' },
                    { label: '2023', value: 435, display: '$435' },
                    { label: '2024', value: 464, display: '$464' },
                    { label: '2025', value: 488, display: '$488' }
                ]
            },
            {
                title: 'Mean house value',
                subtitle: 'The annual profile shows a flat 2025 housing market before the 2026 monthly value pulse lifted to $524K.',
                unit: '$',
                points: [
                    { label: '2021', value: 440287, display: '$440K' },
                    { label: '2022', value: 508583, display: '$509K' },
                    { label: '2023', value: 454920, display: '$455K' },
                    { label: '2024', value: 466036, display: '$466K' },
                    { label: '2025', value: 468857, display: '$469K' }
                ]
            }
        ],
        comparisonTable: [
            { metric: 'GDP', whanganui: '$2.541B', region: '$17.146B', nz: '$431.677B', note: 'Whanganui and NZ from Infometrics 2025 profile; region from Stats NZ Regional GDP 2025' },
            { metric: 'GDP per capita', whanganui: '$51,644', region: '$65,844', nz: '$81,071', note: 'Year to Mar 2025' },
            { metric: 'Productivity', whanganui: '$121,007', region: 'n/a', nz: '$155,707', note: 'Output per filled job, year to Mar 2025' },
            { metric: 'Filled jobs', whanganui: '20,998', region: 'n/a', nz: '2,772,368', note: 'Whanganui down 182 jobs in 2025' },
            { metric: 'Population', whanganui: '49,200', region: '260,700', nz: '5,324,700', note: 'Estimated resident population, Jun 2025' },
            { metric: 'Business units', whanganui: '4,770', region: 'n/a', nz: '654,681', note: 'Whanganui employee-size table +15 from 2024' },
            { metric: 'Average earnings', whanganui: '$68,808', region: 'n/a', nz: '$81,958', note: 'Whanganui +5.2%, NZ +4.2%' },
            { metric: 'Retail trade', whanganui: '$927M', region: '$4.898B', nz: '$124.001B', note: 'Whanganui -0.9%, NZ +3.5%' },
            { metric: 'Employment rate', whanganui: '59.5%', region: '65.9%', nz: '66.8%', note: 'Annual average, Dec 2025' },
            { metric: 'Labour participation', whanganui: '63.0%', region: '69.2%', nz: '70.5%', note: 'Annual average, Dec 2025' },
            { metric: 'Underutilisation', whanganui: '14.3%', region: '12.5%', nz: '12.8%', note: 'Higher than NZ benchmark' },
            { metric: 'Tourism expenditure', whanganui: '$191.8M', region: 'n/a', nz: '$31.106B', note: 'Annual Infometrics / MBIE Marketview, year to Mar 2025' },
            { metric: 'Accommodation occupancy', whanganui: '50.7%', region: '49.9%', nz: '53.7%', note: 'Whanganui up 1.4 pp' },
            { metric: 'Mean weekly rent', whanganui: '$491', region: '$480', nz: '$565', note: 'Feb 2026' }
        ],
        peopleMetrics: [
            { label: 'Filled jobs', value: '20,998', change: '-182', note: 'Infometrics annual profile, year to Mar 2025' },
            { label: 'Average earnings', value: '$68,808', change: '+5.2%', note: 'Below NZ at $81,958' },
            { label: 'Mean household income', value: '$101,203', change: '+1.3%', note: 'Median household income is $81,467' },
            { label: 'Employment rate', value: '59.5%', change: '+1.7 pp', note: 'Below NZ but improving' },
            { label: 'Participation', value: '63.0%', change: '+2.6 pp', note: 'More people attached to the labour market' },
            { label: 'Unemployment', value: '5.6%', change: '-0.3 pp', note: 'Infometrics annual profile, year to Mar 2025' },
            { label: 'Underutilisation', value: '14.3%', change: '+1.8 pp', note: 'Quality and hours remain pressure points' },
            { label: 'NEET rate', value: '15.9%', change: '-1.3 pp', note: 'Manawatu-Wanganui regional measure' },
            { label: 'Self-employment', value: '2,761', change: '-73', note: 'Filled jobs, year to Mar 2025' },
            { label: 'Internal migration', value: '+90', change: '+18', note: 'Net internal migration, Jun 2025' },
            { label: 'International migration', value: '+90', change: '+18', note: 'Net permanent and long-term migration, Jun 2025' }
        ],
        businessSizeBands: [
            { label: '0 employees', previous: 3033, current: 3069, change: 36 },
            { label: '1-5', previous: 972, current: 969, change: -3 },
            { label: '6-9', previous: 309, current: 294, change: -15 },
            { label: '10-19', previous: 249, current: 246, change: -3 },
            { label: '20-49', previous: 138, current: 138, change: 0 },
            { label: '50-99', previous: 33, current: 33, change: 0 },
            { label: '100+', previous: 21, current: 21, change: 0 }
        ],
        businessFacts: [
            { label: 'Total business units', value: '4,770', detail: '+15 from 2024' },
            { label: 'Microbusiness share', value: '64%', detail: '0-employee firms dominate the base' },
            { label: 'Hiring-firm count', value: '1,701', detail: 'Firms with at least one employee' },
            { label: 'Largest shift', value: '+36', detail: '0-employee businesses' }
        ],
        sectorMix: [
            { label: 'Health care and social assistance', value: '$294.2M', gdpMillions: 294.2, share: 13.9, filledJobs: 3488 },
            { label: 'Manufacturing', value: '$261.3M', gdpMillions: 261.3, share: 12.3, filledJobs: 2673 },
            { label: 'Agriculture, forestry and fishing', value: '$225.5M', gdpMillions: 225.5, share: 10.6, filledJobs: 1198 },
            { label: 'Construction', value: '$189.9M', gdpMillions: 189.9, share: 8.9, filledJobs: 2049 },
            { label: 'Retail trade', value: '$177.7M', gdpMillions: 177.7, share: 8.4, filledJobs: 2107 },
            { label: 'Public administration and safety', value: '$166.2M', gdpMillions: 166.2, share: 7.8, filledJobs: 1414 },
            { label: 'Education and training', value: '$136.1M', gdpMillions: 136.1, share: 6.4, filledJobs: 2101 },
            { label: 'Rental, hiring and real estate services', value: '$131.3M', gdpMillions: 131.3, share: 6.2, filledJobs: 273 },
            { label: 'Professional, scientific and technical services', value: '$130.9M', gdpMillions: 130.9, share: 6.2, filledJobs: 964 },
            { label: 'Wholesale trade', value: '$86.3M', gdpMillions: 86.3, share: 4.1, filledJobs: 603 }
        ],
        sectorNote:
            'GDP values use the supplied 2025 Flourish sector infographic. Per-employee reads divide those values by Infometrics 2025 filled jobs.',
        visitorHousingMetrics: [
            { label: 'Annual tourism spend', value: '$191.8M', change: '+4.8%', note: 'Year to Mar 2025' },
            { label: 'Occupancy', value: '50.7%', change: '+1.4 pp', note: 'Below NZ at 53.7%' },
            { label: 'Guest nights per resident', value: '4.4', change: '+2.7%', note: 'NZ benchmark 7.6' },
            { label: 'Annual house value', value: '$468.9K', change: '+0.6%', note: 'Year to Mar 2025 annual profile' },
            { label: 'Latest house value', value: '$524K', change: '+0.5%', note: 'Mar 2026 pulse; 0.58 of NZ average' },
            { label: 'Annual mean rent', value: '$488', change: '+5.2%', note: 'Year to Mar 2025 annual profile' },
            { label: 'Latest mean rent', value: '$491', change: '+1.6%', note: 'Feb 2026 pulse; 0.87 of NZ average' },
            { label: 'New car registrations', value: '1,308', change: '+7.7%', note: 'Year to Dec 2025' }
        ],
        investmentMetrics: [
            { label: 'All building consents', value: '192', change: '+10.3%', note: 'Year to Feb 2026' },
            { label: 'Residential dwelling approvals', value: '153', change: '+18.6%', note: 'Year to Feb 2026' },
            { label: 'New car registrations', value: '1,308', change: '+7.7%', note: 'Year to Dec 2025 confidence proxy' },
            { label: 'Latest house value pulse', value: '$524K', change: '+0.5%', note: 'Mar 2026' },
            { label: 'Wakefield Street bridge', value: '$2.7M', change: 'Funded', note: 'NZTA approved 62% share in Apr 2026' }
        ],
        opportunityCards: [
            {
                title: 'Productivity gap',
                signal: '$51,644 GDP per capita',
                copy: 'The biggest upside is not just more people; it is higher-value firms, exports, tech adoption, and better-paid work.'
            },
            {
                title: 'Microbusiness energy',
                signal: '+36 owner-operator firms',
                copy: 'HIVE can convert solo operators into scalable ventures with shared services, sales support, and founder programming.'
            },
            {
                title: 'Retail caution',
                signal: '-0.9% annual retail trade',
                copy: 'Local demand is softer than the national trend, so events, visitor flows, and destination retail matter.'
            },
            {
                title: 'Visitor upside',
                signal: '$191.8M tourism spend',
                copy: 'Tourism is meaningful, but occupancy and guest nights per resident show room to grow the visitor economy.'
            },
            {
                title: 'Labour quality',
                signal: '20,998 filled jobs',
                copy: 'Pathways into higher-hours, higher-skill, higher-income work should stay central to the economic story.'
            },
            {
                title: 'Investment direction',
                signal: 'Housing + settlement shifts',
                copy: 'Public housing cuts and post-settlement commercial redress both change the long-term investment, land, and partnership story.'
            }
        ],
        aprilWatchlist: [
            {
                title: 'Housing pipeline shock',
                tag: '29 Aug 2025',
                copy: 'Kāinga Ora cut Whanganui’s proposed public-housing pipeline from 138 homes to seven, sharpening the rent, consents, and housing-pressure story.'
            },
            {
                title: 'Sarjeant visitor pull',
                tag: '31 Jul 2025',
                copy: 'The completed Sarjeant Gallery reported 100,000 visitors and an estimated $17.6M annual economic impact, backing the tourism and creative-sector upside.'
            },
            {
                title: 'Iwi settlement step',
                tag: '2 May 2026',
                copy: 'He Rau Tukutuku moved into legislation, with cultural and commercial redress that creates a new long-term investment and partnership base.'
            },
            {
                title: 'Retail softness',
                tag: '2025',
                copy: 'Annual retail trade fell locally while the national series grew, making demand a priority signal.'
            }
        ],
        sourceRegister: [
            {
                label: 'Infometrics Regional Economic Profile',
                owner: 'Infometrics / Stats NZ / MBIE source datasets',
                url: 'https://regions.infometrics.co.nz/whanganui-district/report',
                use: '2025 Whanganui District annual profile for GDP, productivity, jobs, income, tourism, rents, and housing'
            },
            {
                label: 'Infometrics update calendar',
                owner: 'Infometrics',
                url: 'https://regions.infometrics.co.nz/whanganui-district/update-calendar',
                use: 'Confirms which indicators have 2025 annual profile updates and when 2026 updates are expected'
            },
            {
                label: 'MBIE WEBREAR summary',
                owner: 'MBIE / Stats NZ',
                url: 'https://webrear.mbie.govt.nz/summary/wanganui',
                use: 'Regional indicator entry point'
            },
            {
                label: 'MBIE official TA GDP audit',
                owner: 'MBIE MTAGDP',
                url: 'https://www.mbie.govt.nz/business-and-employment/economic-growth/regional-economic-development/modelled-territorial-authority-gross-domestic-product/2025-release',
                use: 'Official territorial-authority GDP release retained for traceability; latest Whanganui District year is March 2024'
            },
            {
                label: 'Stats NZ Regional GDP 2025',
                owner: 'Stats NZ',
                url: 'https://datainfoplus.stats.govt.nz/Item/example.org/8b330fce-64a1-4b90-991d-93835d582a8d/3',
                use: '2025 Manawatu-Whanganui regional GDP and GDP-per-capita context; not a Whanganui District TA replacement'
            },
            {
                label: 'GDP by industry',
                owner: 'Supplied Flourish visualisation',
                url: 'https://public.flourish.studio/visualisation/27656894/',
                use: 'Sector mix source'
            },
            {
                label: 'Employment by industry',
                owner: 'Infometrics / Stats NZ',
                url: 'https://rep.infometrics.co.nz/whanganui-district/employment/structure',
                use: '2025 filled jobs used for sector GDP per employee reads'
            },
            {
                label: 'Businesses by employees',
                owner: 'MBIE WEBREAR / Stats NZ Business Demography',
                url: 'https://webrear.mbie.govt.nz/theme/businesses-by-employees/map/barchart/2025/wanganui/0?left-transform=regionalPercentage&right-transform=absolute',
                use: 'Business count and firm-size movement'
            },
            {
                label: 'Retail trade',
                owner: 'MBIE WEBREAR / Stats NZ',
                url: 'https://webrear.mbie.govt.nz/theme/retail-trade/map/timeseries/2025/wanganui?left-transform=rate&right-transform=absolute',
                use: 'Annual local retail sales'
            },
            {
                label: 'Building consents',
                owner: 'MBIE WEBREAR / Stats NZ',
                url: 'https://webrear.mbie.govt.nz/theme/new-building-consents/map/timeseries/2026/wanganui/all-buildings?left-transform=rate&right-transform=absolute',
                use: 'Construction and investment pulse'
            },
            {
                label: 'New car registrations',
                owner: 'MBIE WEBREAR / NZTA',
                url: 'https://webrear.mbie.govt.nz/theme/new-car-registrations/map/timeseries/2025/wanganui?left-transform=rate&right-transform=absolute',
                use: 'Confidence and replacement-cycle proxy'
            },
            {
                label: 'Discover Whanganui May 2022 dashboard',
                owner: 'Discover Whanganui',
                url: 'https://discoverwhanganui.nz/wp-content/uploads/2022/06/Dashboard-May-2022-3.pdf',
                use: 'Historic GDP, population, jobs, consumer spend, visitor spend'
            },
            {
                label: 'Discover Whanganui May 2023 dashboard',
                owner: 'Discover Whanganui',
                url: 'https://discoverwhanganui.nz/wp-content/uploads/2023/05/May-2023-Dashboard.pdf',
                use: 'Historic annual dashboard comparison'
            },
            {
                label: 'Discover Whanganui May 2024 dashboard',
                owner: 'Discover Whanganui',
                url: 'https://discoverwhanganui.nz/wp-content/uploads/2024/05/May-2024-Dashboard.pdf',
                use: '2023 annual indicators and 2024 consumer spend'
            },
            {
                label: 'Discover Whanganui November 2024 dashboard',
                owner: 'Discover Whanganui',
                url: 'https://discoverwhanganui.nz/wp-content/uploads/2024/12/Nov-2024-Economic-Dashboard-2.pdf',
                use: 'Recent consumer spend, visitor spend, housing, and consents benchmark'
            },
            {
                label: 'MBIE Monthly Regional Tourism Estimates',
                owner: 'MBIE / Marketview',
                url: 'https://www.mbie.govt.nz/immigration-and-tourism/tourism-research-and-data/tourism-data-releases/monthly-regional-tourism-estimates',
                use: 'Tourism spend method context'
            },
            {
                label: 'Kāinga Ora housing review',
                owner: 'Whanganui Chronicle / NZ Herald',
                url: 'https://www.nzherald.co.nz/whanganui-chronicle/news/proposed-whanganui-kainga-ora-homes-slashed-from-138-to-7-in-government-review/AW4Q7CKNERCITL6W7Q676FMUGU/',
                use: 'Public-housing pipeline change from 138 proposed Whanganui homes to seven'
            },
            {
                label: 'Sarjeant Gallery final report',
                owner: 'Whanganui District Council',
                url: 'https://www.whanganui.govt.nz/Your-Council/News-and-Events/News/Final-report-on-gallery-redevelopment',
                use: 'Visitor count, annual economic impact, and cultural-tourism context'
            },
            {
                label: 'Ngā Hapū o Te Iwi o Whanganui settlement bill',
                owner: 'New Zealand Parliament',
                url: 'https://www3.parliament.nz/en/pb/sc/make-a-submission/document/54SCMAOC_SCF_D304044E-2550-4237-51D0-08DEABC64C2A/ng%C4%81-hap%C5%AB-o-te-iwi-o-whanganui-claims-settlement-bill',
                use: 'He Rau Tukutuku cultural and commercial redress context'
            }
        ]
    }
];

export function getMonthlySnapshot(slug) {
    return monthlySnapshots.find(snapshot => snapshot.slug === slug);
}
