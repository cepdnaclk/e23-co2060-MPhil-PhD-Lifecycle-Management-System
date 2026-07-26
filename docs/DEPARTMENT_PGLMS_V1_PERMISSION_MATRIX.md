# Department PGLMS Version 1 Permission Matrix

`OWN` means the authenticated Student's record. `ASSIGNED` means an active,
exact relationship. `DEPT` means Department-wide read scope. `OPERATE` means an
operational command after prerequisites. `DECIDE` means the final Department
academic decision.

| Capability | Student | Supervisor | Examiner | Administrator | HOD |
|---|---|---|---|---|---|
| Submit application | Public | — | — | — | — |
| Read application | OWN/released | Proposed relationship | ASSIGNED proposal | DEPT | DEPT |
| Completeness review | — | — | — | OPERATE | Read |
| Supervisor consent | — | Proposed relationship | — | Monitor | Read |
| Assign proposal Reviewer | — | — | — | OPERATE | Read |
| Submit proposal review | — | — | ASSIGNED proposal/version | — | Read submitted |
| Application decision | Released | Released | Own review | Execute only | DECIDE |
| Create Student account | — | — | — | OPERATE after HOD approval | — |
| View milestones | OWN | ASSIGNED | — | DEPT | DEPT |
| Submit progress | OWN milestone | — | — | Monitor | Escalated read |
| Return/approve progress | Read | ASSIGNED primary | — | Monitor | Exceptional audited override |
| Record ethics | Submit evidence | Review | — | OPERATE | DECIDE confirmation |
| Certify thesis readiness | Request/read | ASSIGNED primary | — | Monitor | DECIDE examination |
| Assign thesis Examiner | — | Read | — | OPERATE | DECIDE confirmation |
| Submit thesis report | Released read | Assigned read | ASSIGNED thesis/version | Read | Read |
| Schedule viva | Read | Read | ASSIGNED read | OPERATE | Read |
| Viva recommendation | — | Optional observation | ASSIGNED thesis | — | Read |
| Final viva outcome | Released | Released | Own recommendation | Execute result | DECIDE |
| Submit corrections | OWN | Review | ASSIGNED when required | Monitor | DECIDE closure |
| Completion approval | Released | Recommend | — | Execute only | DECIDE |
| Graduation/archive | Read | Read | — | OPERATE | Oversight |
| Progress CSV/report | Own summary | ASSIGNED | Own assignments | DEPT | DEPT |
| Lifecycle audit | Own limited | Own actions | Own actions | Operational | DEPT |

## Mandatory denial rules

- Role membership alone never grants an Examiner access to a candidate.
- Administrators cannot call HOD decision commands.
- Students cannot alter programme, study mode, enrolment, milestone labels, or
  milestone dates.
- Supervisors cannot access unassigned candidates.
- One Examiner cannot read another Examiner's confidential draft.
- Unreleased review content and attachments are never exposed to the Student.
- Archived records expose no new lifecycle mutations.
