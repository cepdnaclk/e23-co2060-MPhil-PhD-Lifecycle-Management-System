# Copyright (c) 2026, DevOps and contributors
# For license information, please see license.txt

# import frappe
from frappe.model.document import Document


class ProgressReview(Document):
	# begin: auto-generated types
	# This code is auto-generated. Do not modify anything in this block.

	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from frappe.types import DF

		feedback: DF.TextEditor | None
		research_student: DF.Link
		review_date: DF.Date
		review_period: DF.Literal["6 Months", "12 Months", "18 Months"]
		status: DF.Literal["Draft", "Submitted", "Satisfactory", "Unsatisfactory"]
		supervisor: DF.Link
	# end: auto-generated types
	pass
