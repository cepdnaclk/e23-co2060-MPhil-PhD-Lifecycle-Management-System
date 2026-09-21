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

## 🔑 Mock Account Credentials & Passwords

The system uses Firebase Auth for identity authentication linked with PostgreSQL database user records.

### 1. Pre-configured Sample Accounts (from `Passwords.txt`)

| Role | Email Address | Password |
| :--- | :--- | :--- |
| **Student** | `student@gmail.com` | `8%nS#2f!rZrU!UcAVx` |
| **Supervisor** | `supervisor@gmail.com` | `UjqyvM3F^6P&XY765Z` |

---

### 2. Admin-Seeded Accounts

When creating new accounts via the **Admin Portal** (`/dashboard/admin` -> **User Management**):
- The system automatically generates a secure **one-time Firebase password setup link**.
- The account setup link is sent to the target email address via Nodemailer SMTP.
- **Audit/Demo Shortcut**: If SMTP is disabled locally, you can view the sent welcome email (which contains the setup link) directly inside **Admin Notification Logs** (`/dashboard/admin` -> **Notification Logs**).

---

### 3. Custom E2E / Firebase Test Accounts

- For automated test suites (`npm run test:e2e:external` or `npm run test:e2e:lifecycle`), test credentials can be configured via environment variables (`PGLMS_SEED_USERS_JSON` or `PGLMS_E2E_CREDENTIALS_FILE`).

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

#### Step 2.1: Proposal Submission & Ethics Declaration (Student)
1. Log in as **Student** at `/login`.
2. Navigate to `/dashboard/student`.
3. Show the **Milestone Progress Timeline** (currently at Stage 1: Proposal Submission).
4. Click **Submit Research Proposal**, enter proposal details, attach version PDF, and click **Submit**.
5. Complete the **Ethics Applicability Declaration** (select `REQUIRED` or `NOT_REQUIRED` with compliance details) and submit.

#### Step 2.2: Proposal Evaluation & Ethics Recommendation (Supervisor)
1. Log in as **Supervisor** at `/login`.
2. Navigate to `/dashboard/supervisor`.
3. Open **Proposal Evaluations**, select the submitted proposal, fill out the numerical evaluation rubric, and submit (`APPROVED`).
4. Open **Ethics Reviews**, inspect the student's ethics declaration, and submit a **Supervisor Recommendation** (`RECOMMENDED`).

#### Step 2.3: Ethics Confirmation (HOD)
1. Log in as **Head of Department (HOD)** at `/login`.
2. Navigate to `/dashboard/hod/ethics`.
3. Select the pending ethics record, review the supervisor's recommendation, and click **Confirm Ethics Clearance** (`HOD_CONFIRMED`).

#### Step 2.4: Proposal Approval (Administrator)
1. Log in as **Administrator** at `/login`.
2. Navigate to `/dashboard/admin`.
3. Open **Proposal Approvals**, review supervisor score aggregations, and click **Approve Proposal** (`ProposalStatus.APPROVED`).
4. Log back in as **Student** to show the **Proposal Milestone Card** turning **Green (Approved)**.

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

#### Step 3.3: Department Progress Oversight (HOD)
1. Log in as **Head of Department (HOD)** at `/login`.
2. Navigate to `/dashboard/hod/progress`.
3. Highlight the **Department Progress Table**: demonstrate filtering by registration status, monitoring active candidate milestones, and checking overdue alert flags.

#### Step 3.4: Thesis Readiness Certification (Supervisor)
1. Log in as **Supervisor** at `/login`.
2. Navigate to `/dashboard/supervisor`.
3. Select the student, verify all prerequisite criteria (approved proposal, ethics clearance, signed progress reports), and click **Certify Thesis Readiness**.

#### Step 3.5: Thesis Readiness Approval (HOD)
1. Log in as **Head of Department (HOD)** at `/login`.
2. Navigate to `/dashboard/hod/examinations`.
3. Select the readiness request and click **Approve Readiness for Examination** (`ReadinessDecision.HOD_APPROVED`).

---

### Phase 4: Thesis Submission, Examination & Viva Defense

#### Step 4.1: Thesis Document Upload (Student)
1. Log in as **Student** at `/login`.
2. Navigate to `/dashboard/student`.
3. Notice that the **Thesis Submission Portal** is now unlocked due to HOD readiness approval.
4. Upload the Thesis PDF document version and click **Submit Thesis**.

#### Step 4.2: Examiner Assignment & Viva Scheduling (Administrator)
1. Log in as **Administrator** at `/login`.
2. Navigate to `/dashboard/admin`.
3. Open **Thesis & Examiner Management**, select the submitted thesis, and assign external/internal **Examiners**.
4. Open **Viva Scheduling**, set the **Defense Date**, **Time**, **Venue/Link**, assign panel members, and click **Schedule Viva**.
5. Show automated event dispatch: open **Notification Logs** (`/dashboard/admin`) to show email alerts queued in the outbox.

#### Step 4.3: Secure Thesis Review & Report Submission (Examiner)
1. Log in as **Examiner** at `/login`.
2. Navigate to `/dashboard/examiner`.
3. Open the assigned thesis workspace.
4. Click **Download Thesis PDF**: highlight security feature—the download button opens a **15-minute expiring signed Supabase URL**.
5. Enter examination feedback, upload formal Examiner Report PDF, select recommendation (`MINOR_CORRECTIONS`), and submit.

#### Step 4.4: Oral Defense & Viva Outcome Recording (Administrator / Chair)
1. Log in as **Administrator** at `/login`.
2. Navigate to `/dashboard/admin`.
3. Open **Viva Management**, select the completed viva, and click **Record Viva Outcome**.
4. Select outcome: **Pass with Minor Corrections** (`MINOR_CORRECTIONS`), enter panel remarks, and click **Finalize Outcome**.
5. Show state engine transition: thesis status automatically transitions to `ThesisStatus.CORRECTIONS_REQUIRED`.

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
2. Navigate to `/dashboard/admin`.
3. Show candidate record: student `academicStatus` is updated to **`GRADUATED`**, thesis status is **`COMPLETED`**, and student candidate record is safely archived.

---

## 💡 Key Architectural Highlights to Mention in Viva

When demonstrating each step to examiners, highlight these technical strengths:

1. **Role-Based Security (`withAuth` & Firebase Claims):** Every API endpoint and dashboard page enforces role authorization claims (`STUDENT`, `SUPERVISOR`, `EXAMINER`, `ADMINISTRATOR`, `HOD`) combined with active database checks (`isActive`).
2. **Shared Zod Validation:** Client input forms and backend API handlers use identical Zod validation schemas, preventing invalid state mutations.
3. **Decoupled Outbox Notification System:** Emails are dispatched asynchronously via Nodemailer and recorded in `NotificationLog`. If SMTP is delayed, the outbox worker retries delivery without locking the user interface.
4. **Document Upload & Storage Security:** Uploads use session chunking, malware scan status tracking (`CLEAN`), and 15-minute expiring signed URLs for private file access.
5. **State Engine Integrity:** Milestone transitions are enforced by strict prerequisite checks (e.g., Thesis submission requires HOD Readiness Clearance; Completion requires certified Post-Viva Corrections).
