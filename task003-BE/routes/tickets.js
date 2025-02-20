const express = require("express");
const router = express.Router();
const ticketController = require("../controllers/ticketController");

router.get("/:ticketId/history", ticketController.getTicketRevisionHistory);

module.exports = router;
