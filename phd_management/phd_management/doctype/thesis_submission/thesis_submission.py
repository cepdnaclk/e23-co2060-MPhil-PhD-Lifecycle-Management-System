# Copyright (c) 2026, DevOps and contributors
# For license information, please see license.txt

# import frappe
from frappe.model.document import Document


class ThesisSubmission(Document):
	# begin: auto-generated types
	# This code is auto-generated. Do not modify anything in this block.

	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from frappe.types import DF

		research_student: DF.Link
		status: DF.Literal["Draft", "Submitted", "Under Examination"]
		submission_date: DF.Date
		supervisor: DF.Link
		thesis_document: DF.Attach | None
		thesis_title: DF.Text
		turnitin_score: DF.Percent
	# end: auto-generated types
	pass
