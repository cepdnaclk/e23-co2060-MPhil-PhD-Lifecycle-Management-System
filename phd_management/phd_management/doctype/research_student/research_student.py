# Copyright (c) 2026, DevOps and contributors
# For license information, please see license.txt

# import frappe
from frappe.model.document import Document


class ResearchStudent(Document):
	# begin: auto-generated types
	# This code is auto-generated. Do not modify anything in this block.

	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from frappe.types import DF

		email: DF.Data
		enrolment_date: DF.Date | None
		faculty: DF.Link | None
		first_name: DF.Data
		last_name: DF.Data | None
		program: DF.Literal["Mphil", "PhD"]
		proposal_defense: DF.Date | None
		proposal_status: DF.Literal["Pending", "Approved", "Revision Required"]
		status: DF.Literal["Active", "On Leave", "Completed"]
		supervisor: DF.Link | None
		thesis_submission: DF.Date | None
		viva_voce_date: DF.Date | None
	# end: auto-generated types
	pass
