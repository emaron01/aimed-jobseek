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
