const express = require("express");
const router = express.Router();
const tablesController = require("../controllers/tablesController");

router.get("/:baseId", tablesController.getBaseTables);

module.exports = router;
