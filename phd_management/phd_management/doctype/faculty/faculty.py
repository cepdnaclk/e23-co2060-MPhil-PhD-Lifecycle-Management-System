# Copyright (c) 2026, DevOps and contributors
# For license information, please see license.txt

# import frappe
from frappe.model.document import Document


class Faculty(Document):
	# begin: auto-generated types
	# This code is auto-generated. Do not modify anything in this block.

	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from frappe.types import DF

		contact_email: DF.Data | None
		dean: DF.Data | None
		faculty_code: DF.Data
		faculty_name: DF.Data
	# end: auto-generated types
	pass
