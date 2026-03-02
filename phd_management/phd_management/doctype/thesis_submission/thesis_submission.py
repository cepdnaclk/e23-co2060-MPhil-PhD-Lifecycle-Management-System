# Copyright (c) 2026, DevOps and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document

class ThesisSubmission(Document):
    # begin: auto-generated types
    # This code is auto-generated. Do not modify anything in this block.

    from typing import TYPE_CHECKING

    if TYPE_CHECKING:
        from frappe.types import DF

        research_student: DF.Link
        status: DF.Literal["Draft", "Submitted", "Under Examination", "Completed", "Inactive"]
        submission_date: DF.Date
        supervisor: DF.Link
        thesis_document: DF.Attach | None
        thesis_title: DF.Text
        turnitin_score: DF.Percent
        viva_date: DF.Date | None
    # end: auto-generated types

    def before_save(self):
        # Automation: If a supervisor is assigned and status is still Draft
        if self.supervisor and self.status == "Draft":
            self.status = "Under Examination"

            # This will show a blue popup in the browser
            frappe.msgprint(
                msg=f"Supervisor assigned! Status updated to <b>Under Examination</b> for {self.name}.",
                title="Lifecycle Update",
                indicator="blue"
            )

    def validate(self):
        # 1. Security: Prevent self-approval (Email-to-Email comparison)
        student_email = frappe.db.get_value("Research Student", self.research_student, "email")

        if self.status == "Approved" and frappe.session.user == student_email:
            frappe.throw("Research Students are strictly prohibited from approving their own thesis!")

        # 2. Process Logic: Ensure the Viva Date follows the Submission Date
        if self.viva_date and self.viva_date < self.submission_date:
            frappe.throw("The <b>Viva Date</b> cannot be earlier than the submission date!")

        # 3. Warning: If Under Examination, remind them to set a date
        if self.status == "Under Examination" and not self.viva_date:
            frappe.msgprint("Note: Please set a <b>Viva Date</b> for the oral examination.", indicator="orange")
