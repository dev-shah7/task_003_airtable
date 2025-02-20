const express = require("express");
const router = express.Router();
const cookieController = require("../controllers/cookieController");

router.get("/", cookieController.getAirtableCookies);
// router.post("/validate", cookieController.validateCookies);

module.exports = router;
