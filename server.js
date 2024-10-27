require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const twilio = require("twilio");

const app = express();
const port = process.env.PORT || 3000;

app.use(bodyParser.urlencoded({ extended: false }));

app.post("/voice", (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();
  twiml.say("Hello! This is your bot speaking. How can I help you today?");

  res.type("text/xml");
  res.send(twiml.toString());
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
