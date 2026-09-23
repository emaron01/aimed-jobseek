export const NORMAL_JOB_POSTING = `Senior Product Engineer
Acme Robotics
Location: Austin, TX
Work arrangement: Hybrid
Employment type: Full-time
Seniority: Senior
Compensation: $160,000–$190,000
Reports to: Director of Engineering

Responsibilities:
- Build the motion-planning service
- Review designs with the robotics team

Requirements:
- 5 years of Python
- Experience shipping production services

Preferred:
- ROS2 experience

The mission of this role is to make warehouse robots reliable.`;

export const AGENCY_JOB_POSTING = `Staffing agency posting
Our client is hiring a Senior Product Engineer.
Location: Austin, TX
Work arrangement: Hybrid
Employment type: Full-time

Requirements:
- 5 years of Python

Preferred:
- ROS2 experience

This recruiting firm will submit your materials to the client.`;

export const CONFIDENTIAL_JOB_POSTING = `Senior Product Engineer
The employer is undisclosed.
Location: Austin, TX
Work arrangement: Remote
Employment type: Full-time
Seniority: Senior

Requirements:
- 5 years of Python

Preferred:
- Experience with distributed systems

Company name is withheld until the first interview.`;

export const NURSE_MANAGER_POSTING = `Clinical Nurse Manager
Riverside Community Hospital
Location: Portland, OR
Work arrangement: On-site
Employment type: Full-time
Seniority: Manager
Reports to: Director of Nursing

Responsibilities:
- Staff the medical-surgical floor
- Review incident reports with the charge nurses

Requirements:
- Current RN license
- Five years of inpatient nursing

The mission of this role is to keep the medical-surgical unit staffed and safe.`;

export const FINANCIAL_CONTROLLER_POSTING = `Financial Controller
Northwind Books
Location: Chicago, IL
Work arrangement: Hybrid
Employment type: Full-time
Seniority: Manager
Reports to: Chief Financial Officer

Responsibilities:
- Close the monthly books
- Review audit workpapers with the accounting team

Requirements:
- CPA
- Experience with multi-entity consolidations

The mission of this role is to keep the monthly close accurate and on time.`;

export const NORMAL_JOB_MODEL = {
  title: "Senior Product Engineer",
  companyName: "Acme Robotics",
  location: "Austin, TX",
  workArrangement: "Hybrid",
  employmentType: "Full-time",
  seniority: "Senior",
  compensationRange: "$160,000–$190,000",
  reportingLine: "Director of Engineering",
  responsibilities: [
    "Build the motion-planning service",
    "Review designs with the robotics team",
  ],
  requiredItems: ["5 years of Python", "Experience shipping production services"],
  preferredItems: ["ROS2 experience"],
  scorecard: {
    mission: {
      text: "make warehouse robots reliable",
      inferred: false,
    },
    outcomes: [
      {
        text: "Ship a motion-planning service used by warehouse robots",
        inferred: true,
      },
    ],
    competencies: [
      { text: "5 years of Python", inferred: false },
      { text: "Leads incident response", inferred: false },
    ],
  },
};

export const NURSE_MANAGER_MODEL = {
  title: "Clinical Nurse Manager",
  companyName: "Riverside Community Hospital",
  location: "Portland, OR",
  workArrangement: "On-site",
  employmentType: "Full-time",
  seniority: "Manager",
  compensationRange: null,
  reportingLine: "Director of Nursing",
  responsibilities: [
    "Staff the medical-surgical floor",
    "Review incident reports with the charge nurses",
  ],
  requiredItems: ["Current RN license", "Five years of inpatient nursing"],
  preferredItems: [],
  scorecard: {
    mission: { text: "keep the medical-surgical unit staffed and safe", inferred: false },
    outcomes: [
      { text: "Keep the floor staffed across all shifts", inferred: true },
    ],
    competencies: [
      { text: "Current RN license", inferred: false },
      { text: "Reviews incident reports", inferred: false },
    ],
  },
};

export const FINANCIAL_CONTROLLER_MODEL = {
  title: "Financial Controller",
  companyName: "Northwind Books",
  location: "Chicago, IL",
  workArrangement: "Hybrid",
  employmentType: "Full-time",
  seniority: "Manager",
  compensationRange: null,
  reportingLine: "Chief Financial Officer",
  responsibilities: [
    "Close the monthly books",
    "Review audit workpapers with the accounting team",
  ],
  requiredItems: ["CPA", "Experience with multi-entity consolidations"],
  preferredItems: [],
  scorecard: {
    mission: { text: "keep the monthly close accurate and on time", inferred: false },
    outcomes: [
      { text: "Close the books on the published calendar", inferred: true },
    ],
    competencies: [
      { text: "CPA", inferred: false },
      { text: "Reviews audit workpapers", inferred: false },
    ],
  },
};
