# Copyright (c) 2026, DevOps and contributors
# For license information, please see license.txt

# import frappe
from frappe.model.document import Document


class ResearchSupervisor(Document):
	# begin: auto-generated types
	# This code is auto-generated. Do not modify anything in this block.

	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from frappe.types import DF

		amended_from: DF.Link | None
		department: DF.Link | None
		designation: DF.Literal["Professor", "Associate Professor", "Senior Lecturer"]
		email: DF.Data
		faculty: DF.Link | None
		full_name: DF.Data
	# end: auto-generated types
	pass
