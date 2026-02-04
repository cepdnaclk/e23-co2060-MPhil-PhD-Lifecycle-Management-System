---
layout: home
permalink: index.html

# Please update this with your repository name and project title
repository-name: e23-co2060-MPhil-PhD-Lifecycle-Management-System
title: MPhil & PhD Lifecycle Management System

---

[comment]: # "This is the standard layout for the project, but you can clean this and use your own template, and add more information required for your own project"

<!-- Once you fill the index.json file inside /docs/data, please make sure the syntax is correct. (You can use this tool to identify syntax errors)

Please include the "correct" email address of your supervisors. (You can find them from https://people.ce.pdn.ac.lk/ )

Please include an appropriate cover page image ( cover_page.jpg ) and a thumbnail image ( thumbnail.jpg ) in the same folder as the index.json (i.e., /docs/data ). The cover page image must be cropped to 940×352 and the thumbnail image must be cropped to 640×360 . Use https://croppola.com/ for cropping and https://squoosh.app/ to reduce the file size.

If your followed all the given instructions correctly, your repository will be automatically added to the department's project web site (Update daily)

A HTML template integrated with the given GitHub repository templates, based on github.com/cepdnaclk/eYY-project-theme . If you like to remove this default theme and make your own web page, you can remove the file, docs/_config.yml and create the site using HTML. -->

# Project Title

---

## Team
-  E / 23 / 442, D.K.G.P.C.B. Wijerathne, [email](mailto:e23442@eng.pdn.ac.lk)
-  E / 23 / 178, S.N.R. Kodituwakku, [email](mailto:e23178@eng.pdn.ac.lk)
-  E / 23 / 118, D.A.A. Gunawardana, [email](mailto:e23118@eng.pdn.ac.lk)
-  E / 23 / 023, M.N.P.V. Aththanayake, [email](mailto:e23023@eng.pdn.ac.lk)

<!-- Image (photo/drawing of the final hardware) should be here -->

<!-- This is a sample image, to show how to add images to your page. To learn more options, please refer [this](https://projects.ce.pdn.ac.lk/docs/faq/how-to-add-an-image/) -->

<!-- ![Sample Image](./images/sample.png) -->

#### Table of Contents
1. [Introduction](#introduction)
2. [Solution Architecture](#solution-architecture )
3. [Software Designs](#hardware-and-software-designs)
4. [Testing](#testing)
5. [Conclusion](#conclusion)
6. [Links](#links)

## Introduction

Managing MPhil and PhD students involves long-term, multi-stage processes such as registration, supervision, progress monitoring, ethics approvals, and thesis examination. In many faculties, these processes are handled using fragmented documents, spreadsheets, and email communication, leading to inefficiencies, poor visibility, and compliance risks.

The MPhil & PhD Lifecycle Management System addresses this problem by providing a centralized, web-based platform to manage postgraduate research students throughout their entire academic lifecycle. The system improves transparency, reduces administrative workload, and ensures consistent compliance with university regulations, benefiting students, supervisors, coordinators, and faculty administrators.

## Solution Architecture

The system follows a centralized web application architecture, potentially built on ERPNext, to ensure scalability, security, and long-term data integrity.

At a high level, the architecture consists of:

- A web-based user interface for all stakeholder roles
- A backend application layer handling business logic and workflows
- A secure database for long-term academic records and documents
- Role-based access control and audit logging mechanisms
- Notification and automation services for milestone tracking

The architecture ensures clear separation of concerns, secure document storage, and reliable tracking of multi-year postgraduate data.

## Software Designs

The system is designed using modular and role-based principles.

User Roles

- PG Student: Submissions, progress updates, document uploads
- Supervisor: Reviews, approvals, progress monitoring
- PG Coordinator: Oversight, scheduling, compliance checks
- Faculty Admin: System management, reporting, governance

Core Modules

- Student Registration & Supervisor Assignment
- Research Proposal Submission & Approval Workflow
- Progress Review Scheduling and Reporting
- Ethics Approval Tracking
- Thesis Submission and Examination Management
- Document Management with Version Control
- Dashboards and Reporting
- Audit Trails and Approval History

Each module enforces validation rules, workflow states, and approval hierarchies to maintain data integrity and institutional compliance.

## Testing

Testing was conducted at multiple levels to ensure reliability and correctness:

- Unit Testing: Validation of individual modules and workflows
- Integration Testing: Verification of interactions between lifecycle stages
- Role-Based Access Testing: Ensuring correct permissions and data isolation
- User Acceptance Testing (UAT): Feedback from academic stakeholders
- Workflow Testing: End-to-end lifecycle scenarios across multiple years

Test results confirmed correct workflow enforcement, secure access control, accurate status transitions, and reliable notification handling.

## Conclusion

This project successfully delivers a centralized and transparent solution for managing the complete MPhil and PhD research lifecycle at faculty level. It significantly reduces administrative overhead, improves coordination, and enhances regulatory compliance.

Future developments include university-wide deployment, advanced analytics for research performance, integration with institutional systems, and support for commercialization as a configurable postgraduate research management platform for higher education institutions.

## Links

- [Project Repository](https://github.com/cepdnaclk/e23-co2060-MPhil-PhD-Lifecycle-Management-System)
- [Project Page](https://cepdnaclk.github.io/e23-co2060-MPhil-PhD-Lifecycle-Management-System/)
- [Department of Computer Engineering](http://www.ce.pdn.ac.lk/)
- [University of Peradeniya](https://eng.pdn.ac.lk/)

[//]: # (Please refer this to learn more about Markdown syntax)
[//]: # (https://github.com/adam-p/markdown-here/wiki/Markdown-Cheatsheet)
