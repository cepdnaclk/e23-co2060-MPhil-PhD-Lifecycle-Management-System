# Postgraduate Research Lifecycle System: Viva Demonstration Guide

This guide provides a step-by-step demonstration walkthrough for presenting the **Postgraduate Research Lifecycle Management System** during an academic viva or evaluation panel. 

It covers the complete student lifecycle from public admissions to degree completion across all **five user roles** (`Student`, `Supervisor`, `Examiner`, `Head of Department / HOD`, and `Administrator`).

---

## 📋 Pre-Demonstration Setup

Before starting the viva demonstration, ensure the application is initialized with clean sample database records:

1. **Start the local development server:**
   ```bash
   npm run dev
   ```
2. **Reset sample database records (Optional clean state):**
   ```bash
   npm run database:reset
   ```
3. Open your web browser at: `http://localhost:3000`

---

## 👤 Quick Access Portals & Roles Summary

| Role | Portal URL | Primary Responsibilities in Demonstration |
| :--- | :--- | :--- |
| **Public Applicant / Student** | `/apply` / `/dashboard/student` | Application submission, proposal creation, progress report filing, thesis upload, correction uploads. |
| **Supervisor** | `/dashboard/supervisor` | Supervisor consent, proposal evaluations, progress report sign-offs, ethics recommendations, readiness certification, correction sign-offs. |
| **Head of Department (HOD)** | `/dashboard/hod` | Application endorsements, progress table monitoring, ethics confirmations, thesis readiness clearances, degree completion approvals. |
| **Examiner** | `/dashboard/examiner` | Signed thesis URL review, thesis report submission, viva panel evaluation, post-viva correction approval. |
| **Administrator** | `/dashboard/admin` | User account seeding/deactivation, admissions review, supervisor/examiner assignment, viva scheduling, outbox monitoring, system reports. |

---

## 🎬 Step-by-Step Viva Demonstration Workflow

---

### Phase 1: Admissions & Account Provisioning

#### Step 1.1: Public Application & Draft Persistence (Applicant)
1. Navigate to `http://localhost:3000/apply`.
2. Fill out **Step 1 (Personal Details)** and **Step 2 (Academic Background)**.
3. Show draft autosave capability: reload the page or click **Save Draft**, then demonstrate field restoration.
4. Select **Program Type** (`MPhil` or `PhD`), enter the **Proposed Research Title**, select a **Proposed Supervisor**, and upload a sample proposal PDF.
5. Click **Submit Application** and verify redirection to `/apply/success`.

#### Step 1.2: Supervisor Application Consent (Supervisor)
1. Log in as **Supervisor** at `/login` (or switch role context).
2. Navigate to `/dashboard/supervisor`.
3. Locate the incoming candidate under **Pending Application Consents**.
4. Click **Review Proposal**, inspect candidate details, and click **Record Consent** (`CONSENTED`).

#### Step 1.3: Department Application Endorsement (HOD)
1. Log in as **Head of Department (HOD)** at `/login`.
2. Navigate to `/dashboard/hod/applications`.
3. View the application entry showing supervisor consent recorded.
4. Click **Endorse Application** (`APPROVED`) and provide optional HOD remarks.

#### Step 1.4: Admission Finalization & Account Seeding (Administrator)
1. Log in as **Administrator** at `/login`.
2. Navigate to `/dashboard/admin`.
3. Open **Application Management**, select the endorsed application, and click **Grant Admission**.
4. Show automatic user account creation: navigate to **User Management** (`/dashboard/admin`) to highlight the newly provisioned student record linked to PostgreSQL and Firebase Auth.

---

### Phase 2: Proposal & Ethics Governance

#### Step 2.1: Proposal Submission (Student)
1. Log in as **Student** at `/login`.
2. Navigate to `/dashboard/student`.
3. Show the **Milestone Progress Timeline** (currently at Stage 1: Proposal Submission).
4. Click **Submit Research Proposal**, enter proposal details, attach version PDF, and click **Submit**. (Status becomes `UNDER_REVIEW`).

#### Step 2.2: Proposal Evaluation & Approval (Supervisor & Administrator)
1. Log in as **Supervisor** at `/login`, navigate to `/dashboard/supervisor`, open **Proposal Evaluations**, fill out evaluation rubric, and submit.
2. Log in as **Administrator** at `/login`, navigate to `/dashboard/admin`, open **Proposal Approvals**, and click **Approve Proposal** (`ProposalStatus.APPROVED`).
3. Log back in as **Student** to show the **Proposal Milestone Card** turning **Green (Approved)**.

#### Step 2.3: Ethics Applicability Declaration (Student)
1. As **Student** at `/dashboard/student`, open **Ethics Declaration** (unlocked once proposal is `APPROVED`).
2. Complete the **Ethics Applicability Declaration** (select `REQUIRED` or `NOT_REQUIRED` with compliance details) and submit. (Stage becomes `SUPERVISOR_RECOMMENDATION`).

#### Step 2.4: Ethics Review, PG Coordinator Record & HOD Clearance (Supervisor, Admin, HOD)
1. Log in as **Supervisor** at `/login`, navigate to `/dashboard/supervisor/ethics`, select the declaration, and click **Record Recommendation** (`RECOMMENDED`). (Stage becomes `COORDINATOR_RECORD`).
2. Log in as **Administrator** at `/login`, navigate to `/dashboard/admin/ethics`, and click **Record Status** (`EXEMPT` or `APPROVED`). (Stage becomes `HOD_CONFIRMATION`).
3. Log in as **Head of Department (HOD)** at `/login`, navigate to `/dashboard/hod/ethics`, and click **Confirm Ethics Clearance** (`CONFIRMED`). (Final Status becomes `EXEMPT` / `APPROVED`).

---

### Phase 3: Progress Monitoring & Thesis Readiness

#### Step 3.1: Progress Report Filing (Student)
1. Log in as **Student** at `/login`.
2. Navigate to `/dashboard/student`.
3. Click **Submit Progress Report**, fill out reporting period achievements, publications, research challenges, and submit report.

#### Step 3.2: Progress Report Sign-Off (Supervisor)
1. Log in as **Supervisor** at `/login`.
2. Navigate to `/dashboard/supervisor`.
3. Open **Progress Reports**, review the student submission, type supervisor comments, and click **Sign Off Progress Report**.
4. Repeat Steps 3.1 and 3.2 until every scheduled progress milestone is signed off; thesis readiness remains blocked while any milestone is incomplete.

#### Step 3.3: Department Progress Oversight (HOD)
1. Log in as **Head of Department (HOD)** at `/login`.
2. Navigate to `/dashboard/hod/progress`.
3. Highlight the **Department Progress Table**: demonstrate filtering by registration status, monitoring active candidate milestones, and checking overdue alert flags.

#### Step 3.4: Thesis Readiness Certification (Supervisor)
1. Log in as **Student** at `/login`, open **Thesis Submission** (`/dashboard/student/theses/submit`), and click **Request Thesis Readiness**. The request becomes `REQUESTED` and goes to the student's active primary Supervisor.
2. Log in as that **primary Supervisor** at `/login` and open **Thesis Readiness** (`/dashboard/supervisor/readiness`).
3. Locate the student request and verify all four checklist items: approved proposal, all fixed progress milestones complete, department ethics gate satisfied, and examination copy ready for submission.
4. Tick all four checklist items, add optional notes, and click **Certify Thesis Readiness**. The request becomes `CERTIFIED` and is now available for HOD approval in Step 3.5. Any prerequisite marked **Not satisfied** must be resolved before certification.

**Before Step 3.5:** A student request alone does not appear in the HOD's readiness approval queue. If the HOD page says **"No Supervisor-certified requests await HOD approval."** immediately after the student requests readiness, this is expected: complete the primary Supervisor certification above, then refresh the HOD page.

#### Step 3.5: Thesis Readiness Approval (HOD)
1. Log in as **Head of Department (HOD)** at `/login`.
2. Navigate to `/dashboard/hod/examinations`.
3. Under **Examination readiness**, locate the student request showing the certifying Supervisor, review the notes, and click **Approve for examination** (`ReadinessDecision.HOD_APPROVED`).
4. Return to the Student account and proceed to thesis submission in Step 4.1.

**Screen distinction:** The **Confirm** and **Decline** buttons under **Examiner confirmations** apply to examiner assignments for submitted theses. They do not approve the student's readiness request. The sequence is **Student request → primary Supervisor certification → HOD readiness approval → Student thesis submission**.

---

### Phase 4: Thesis Submission, Examination & Viva Defense

#### Step 4.1: Thesis Document Upload (Student)
1. Log in as **Student** at `/login`.
2. Navigate to `/dashboard/student`.
3. Notice that the **Thesis Submission Portal** is now unlocked due to HOD readiness approval.
4. Upload the Thesis PDF document version and click **Submit Thesis**.

#### Step 4.2: Examiner Assignment, HOD Confirmation & Viva Scheduling (Administrator and HOD)
1. Log in as **Administrator** at `/login`.
2. Navigate to **Examiner Assignments** (`/dashboard/admin/assignments/examiners`).
3. Select the submitted thesis (for example, the thesis belonging to `sandun@gmail.com`), select an Examiner, and click **Add Assignment**. Repeat this for a second independent Examiner because the final HOD outcome requires at least two complete Examiner records. Each assignment is created with status `PENDING`, while the thesis remains `SUBMITTED`.
4. Log in as **Head of Department (HOD)** and navigate to **Examination decisions** (`/dashboard/hod/examinations`).
5. Under **Examiner confirmations**, locate the thesis and click **Confirm** for both Examiner assignments. The first accepted assignment changes the thesis status to `UNDER_EXAMINATION`; both Examiners must later submit their independent evidence before the final outcome.
6. Log back in as **Administrator** and open **Schedule Vivas** (`/dashboard/admin/vivas/schedule`).
7. Select the now-visible thesis, set the **Defense Date**, **Time**, and **Venue/Link**, then click **Schedule Viva**.
8. Show automated event dispatch: open **Notification Logs** (`/dashboard/admin`) to show email alerts queued in the outbox.

**If the thesis is missing from Schedule Vivas:** This page lists only theses with status `UNDER_EXAMINATION`. A newly submitted thesis or a thesis with a `PENDING` examiner assignment will not appear. Complete the HOD **Examiner confirmations → Confirm** action in Step 4.2.5, then refresh the Schedule Vivas page.

#### Step 4.3: Secure Thesis Review, Independent Report & Viva Recommendation (Examiner)
1. Log in as **Examiner** at `/login`.
2. Navigate to **Assigned Vivas** (`/dashboard/examiner/vivas`).
3. Locate the scheduled viva and review the candidate and thesis details.
4. Click **Download Thesis PDF**: highlight security feature—the download button opens a **15-minute expiring signed Supabase URL**.
5. Under **Independent thesis report**, select the report recommendation (for example, `MINOR_CORRECTIONS`), enter a report of at least 20 characters, attach the formal Examiner Report PDF, and click **Submit Report**.
6. After the report is marked **Submitted**, select the viva **Recommendation**, enter a rationale of at least 20 characters, and click **Submit Recommendation**. Review the confirmation dialog and confirm the submission.

**Required order:** The independent thesis report and viva recommendation are separate records. If the system displays **"Submit the independent thesis report before the viva recommendation,"** complete Step 4.3.5 first, refresh the page if needed, and then complete Step 4.3.6.

Repeat Step 4.3 while logged in as every confirmed Examiner. A report from only one Examiner is insufficient when two or more assignments were confirmed. Existing reports created before formal PDF upload was required show **Attach formal report PDF**; attach the PDF before continuing.

#### Step 4.4: Final Viva Outcome & Correction Order (HOD)
1. Ensure at least two Examiners are confirmed and every confirmed Examiner has completed both actions in Step 4.3: the independent thesis report and the viva recommendation. The HOD cannot record the final outcome until at least two complete independent Examiner records exist.
2. Log in as **Head of Department (HOD)** at `/login`.
3. Navigate to **Examination decisions** (`/dashboard/hod/examinations`).
4. Under **Viva outcomes**, locate the thesis and review each Examiner's formal report PDF, written independent report, report recommendation, viva recommendation, and rationale.
5. Select **Minor Corrections** (`MINOR_CORRECTIONS`) and enter an outcome rationale of at least 10 characters.
6. Click **Review HOD outcome**, verify the decision, and click **Record final outcome**. The HOD decision becomes the authoritative Department viva outcome.
7. After the page refreshes, locate the thesis under **Order corrections**, enter the correction requirements (at least 20 characters), choose whether assigned Examiner review is required, and click **Issue correction order**. Examiner review is mandatory for major corrections.
8. Show the state transition: issuing the correction order changes the thesis status to `ThesisStatus.CORRECTIONS_REQUIRED` and unlocks the Student Corrections Portal used in Step 5.1.

**Role ownership:** Examiners submit independent recommendations, but the **HOD records the final viva outcome**. The Administrator schedules the viva and handles later administrative processing; the Administrator does not select the final academic outcome in the current system.

**If Review HOD outcome is locked:** Read the missing-evidence list shown on the thesis card. Log in as each named Examiner and submit every missing item: the independent report, formal report PDF, and viva recommendation. The action unlocks only when at least two confirmed Examiner records are complete and no confirmed Examiner remains incomplete.

---

### Phase 5: Post-Viva Corrections & Degree Completion

#### Step 5.1: Correction Document Upload (Student)
1. Log in as **Student** at `/login`.
2. Navigate to `/dashboard/student`.
3. Open the **Corrections Portal**, inspect panel feedback, attach the revised Thesis PDF and Correction Compliance Matrix PDF, and click **Submit Corrections**.

#### Step 5.2: Supervisor Correction Certification (Supervisor)
1. Log in as **Supervisor** at `/login`.
2. Navigate to `/dashboard/supervisor`.
3. Review uploaded correction documents, verify compliance against panel remarks, and click **Certify Corrections**.

#### Step 5.3: Examiner Correction Approval (Examiner)
1. Log in as **Examiner** at `/login`.
2. Navigate to `/dashboard/examiner`.
3. Inspect certified corrections and click **Approve Post-Viva Revisions**.

#### Step 5.4: Final Degree Completion Clearance (HOD)
1. Log in as **Head of Department (HOD)** at `/login`.
2. Navigate to `/dashboard/hod/completions`.
3. Select the candidate showing completed corrections, review the final dossier, and click **Grant Degree Completion Clearance** (`CompletionStatus.HOD_APPROVED`).

#### Step 5.5: Graduation & Archiving Verification (Administrator)
1. Log in as **Administrator** at `/login`.
2. Navigate to **Completion Records** at `/dashboard/admin/completions`.
3. Before archiving, show that the candidate has the **`GRADUATED`** badge and record the archive reason.
4. Archive the lifecycle record, refresh **Completion Records**, and show that the candidate remains in the list with both **`GRADUATED`** and **`ARCHIVED`** badges, plus the archive date and reason.

---

## 💡 Key Architectural Highlights to Mention in Viva

When demonstrating each step to examiners, highlight these technical strengths:

1. **Role-Based Security (`withAuth` & Firebase Claims):** Every API endpoint and dashboard page enforces role authorization claims (`STUDENT`, `SUPERVISOR`, `EXAMINER`, `ADMINISTRATOR`, `HOD`) combined with active database checks (`isActive`).
2. **Shared Zod Validation:** Client input forms and backend API handlers use identical Zod validation schemas, preventing invalid state mutations.
3. **Decoupled Outbox Notification System:** Emails are dispatched asynchronously via Nodemailer and recorded in `NotificationLog`. If SMTP is delayed, the outbox worker retries delivery without locking the user interface.
4. **Document Upload & Storage Security:** Uploads use session chunking, malware scan status tracking (`CLEAN`), and 15-minute expiring signed URLs for private file access.
5. **State Engine Integrity:** Milestone transitions are enforced by strict prerequisite checks (e.g., Thesis submission requires HOD Readiness Clearance; Completion requires certified Post-Viva Corrections).
