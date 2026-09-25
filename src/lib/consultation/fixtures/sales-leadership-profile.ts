import type { CandidateProfile } from "@/lib/product-research/candidate-profile";

const source = { sourceId: "src_sales_resume" };

function fact(id: string, text: string) {
  return { id, kind: "FACT" as const, text, provenance: [source] };
}

export function fixtureSalesLeadershipResumeText(): string {
  return `Jordan Hale
Senior Director of Sales

Senior Director of Sales, Northwind Revenue
Dec 2022 – Present
Built a front-line manager bench and held a weekly forecast call using MEDDIC.

Vice President, Enterprise Sales, Contoso Cloud
Apr 2015 - Dec 2021
Opened new-logo accounts and expanded existing renewals.

Director of Sales, Fabrikam Continuity
2009 – 2014
Sold business continuity and compliance solutions to risk-driven buyers.

Regional Sales Manager, Adventure Works
2006 – 2009

Account Executive, Wide World Importers
2002 – 2006

Sales Representative, Litware
1999 – 2002

Sales Development Representative, Tailspin
1997 – 1999

Account Manager, Alpine Ski House
1995 – 1997

Inside Sales Representative, Woodgrove Bank
1993 – 1995
`;
}

export function fixtureSalesLeadershipProfile(): CandidateProfile {
  return {
    schemaVersion: 1,
    identity: {
      name: fact("id_name", "Jordan Hale"),
      headline: fact("id_headline", "Senior Director of Sales"),
      location: fact("id_location", "Chicago, IL"),
      email: null,
      phone: null,
      cityState: fact("id_city", "Chicago, IL"),
      linkedinUrl: null,
      personalSite: null,
      workArrangementPreference: null,
      relocationOpenness: null,
    },
    positioning: fact(
      "id_pos",
      "Sales leader who builds front-line managers and runs a disciplined enterprise forecast.",
    ),
    direction: {
      targetTitles: [fact("id_title", "Senior Director of Sales")],
      seniority: fact("id_seniority", "Senior Director"),
      functions: [fact("id_fn", "Sales")],
      careerGoals: [],
    },
    experience: [
      {
        id: "role_northwind",
        kind: "FACT",
        employer: "Northwind Revenue",
        title: "Senior Director of Sales",
        startDate: "Dec 2022",
        endDate: "Present",
        location: "Chicago, IL",
        summary: "Leads enterprise sales and a front-line manager bench.",
        achievements: [
          fact(
            "ach_meddic",
            "Ran the weekly forecast using MEDDIC and built front-line managers.",
          ),
        ],
        reasonForLeaving: null,
        provenance: [source],
      },
      {
        id: "role_contoso",
        kind: "FACT",
        employer: "Contoso Cloud",
        title: "Vice President, Enterprise Sales",
        startDate: "Apr 2015",
        endDate: "Dec 2021",
        location: null,
        summary: "Opened new logos and expanded renewals.",
        achievements: [
          fact("ach_logos", "Opened new-logo accounts and expanded existing renewals."),
        ],
        reasonForLeaving: null,
        provenance: [source],
      },
      {
        id: "role_fabrikam",
        kind: "FACT",
        employer: "Fabrikam Continuity",
        title: "Director of Sales",
        startDate: "2009",
        endDate: "2014",
        location: null,
        summary: "Sold business continuity and compliance solutions.",
        achievements: [
          fact(
            "ach_risk",
            "Sold business continuity and compliance solutions to risk-driven buyers.",
          ),
        ],
        reasonForLeaving: null,
        provenance: [source],
      },
      {
        id: "role_adventure",
        kind: "FACT",
        employer: "Adventure Works",
        title: "Regional Sales Manager",
        startDate: "2006",
        endDate: "2009",
        location: null,
        summary: null,
        achievements: [],
        reasonForLeaving: null,
        provenance: [source],
      },
      {
        id: "role_importers",
        kind: "FACT",
        employer: "Wide World Importers",
        title: "Account Executive",
        startDate: "2002",
        endDate: "2006",
        location: null,
        summary: null,
        achievements: [],
        reasonForLeaving: null,
        provenance: [source],
      },
      {
        id: "role_litware",
        kind: "FACT",
        employer: "Litware",
        title: "Sales Representative",
        startDate: "1999",
        endDate: "2002",
        location: null,
        summary: null,
        achievements: [],
        reasonForLeaving: null,
        provenance: [source],
      },
      {
        id: "role_tailspin",
        kind: "FACT",
        employer: "Tailspin",
        title: "Sales Development Representative",
        startDate: "1997",
        endDate: "1999",
        location: null,
        summary: null,
        achievements: [],
        reasonForLeaving: null,
        provenance: [source],
      },
      {
        id: "role_alpine",
        kind: "FACT",
        employer: "Alpine Ski House",
        title: "Account Manager",
        startDate: "1995",
        endDate: "1997",
        location: null,
        summary: null,
        achievements: [],
        reasonForLeaving: null,
        provenance: [source],
      },
      {
        id: "role_woodgrove",
        kind: "FACT",
        employer: "Woodgrove Bank",
        title: "Inside Sales Representative",
        startDate: "1993",
        endDate: "1995",
        location: null,
        summary: null,
        achievements: [],
        reasonForLeaving: null,
        provenance: [source],
      },
    ],
    skills: [
      fact("sk_meddic", "MEDDIC"),
      fact("sk_forecast", "Forecast discipline"),
      fact("sk_managers", "Building front-line managers"),
    ],
    problemsSolved: [],
    differentiators: [],
    education: [],
    credentials: [],
    domainVocabulary: [],
    compensation: null,
    gaps: [],
  };
}
