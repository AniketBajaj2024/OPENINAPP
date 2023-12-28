const { google } = require("googleapis");
const { CLIENT_ID, CLIENT_SECRET, REDIRECT_URI, REFRESH_TOKEN } = require("./Google_Auth_credentials");

// Initialize OAuth2 client
const oAuth2Client = new google.auth.OAuth2(
  CLIENT_ID,
  CLIENT_SECRET,
  REDIRECT_URI
);
oAuth2Client.setCredentials({ refresh_token: REFRESH_TOKEN });

// Set to keep track of users who have been replied to
const repliedUsers = new Set();

// Function to check emails and send replies
async function checkEmailsAndSendReplies() {
  try {
    const gmail = google.gmail({ version: "v1", auth: oAuth2Client });

    // Get the list of unread messages
    const res = await gmail.users.messages.list({
      userId: "me",
      q: "is:unread",
    });
    const messages = res.data.messages;

    if (messages && messages.length > 0) {
      // Iterate over unread messages
      for (const message of messages) {
        const email = await gmail.users.messages.get({
          userId: "me",
          id: message.id,
        });

        // Extract relevant email headers
        const from = email.data.payload.headers.find(
          (header) => header.name === "From"
        );
        const toHeader = email.data.payload.headers.find(
          (header) => header.name === "To"
        );
        const Subject = email.data.payload.headers.find(
          (header) => header.name === "Subject"
        );

        // Extract sender, recipient, and subject
        const From = from.value;
        const toEmail = toHeader.value;
        const subject = Subject.value;

        console.log("Email came From:", From);
        console.log("To Email:", toEmail);

        // Check if the user has already been replied to
        if (repliedUsers.has(From)) {
          continue;
        }

        // Check if the email has any replies
        const thread = await gmail.users.threads.get({
          userId: "me",
          id: message.threadId,
        });
        const replies = thread.data.messages.slice(1);

        if (replies.length === 0) {
          // Reply to the email
          await gmail.users.messages.send({
            userId: "me",
            requestBody: {
              raw: await createReplyRaw(toEmail, From, subject),
            },
          });

          // Add a label to the email
          const labelName = "Replied";
          await gmail.users.messages.modify({
            userId: "me",
            id: message.id,
            requestBody: {
              addLabelIds: [await createLabelIfNeeded(labelName)],
            },
          });

          console.log("Sent reply to email:", From);
          // Add the user to replied users set
          repliedUsers.add(From);
        }
      }
    }
  } catch (error) {
    console.error("Error occurred:", error);
  }
}

// Function to create a base64EncodedEmail format for the reply
async function createReplyRaw(from, to, subject) {
  const emailContent = `From: ${from}\nTo: ${to}\nSubject: ${subject}\n\nThank you for your message. I am unavailable right now, but will respond as soon as possible...`;
  const base64EncodedEmail = Buffer.from(emailContent)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

  return base64EncodedEmail;
}

// Function to generate a random interval between min and max
function getRandomInterval(min, max) {
  return Math.floor(Math.random() * (max - min + 1) + min);
}

// Function to create a label if it doesn't exist
async function createLabelIfNeeded(labelName) {
  const gmail = google.gmail({ version: "v1", auth: oAuth2Client });

  // Check if the label already exists
  const res = await gmail.users.labels.list({ userId: "me" });
  const labels = res.data.labels;

  const existingLabel = labels.find((label) => label.name === labelName);
  if (existingLabel) {
    return existingLabel.id;
  }

  // Create the label if it doesn't exist
  const newLabel = await gmail.users.labels.create({
    userId: "me",
    requestBody: {
      name: labelName,
      labelListVisibility: "labelShow",
      messageListVisibility: "show",
    },
  });

  return newLabel.data.id;
}

// Set interval to run the email checking function at random intervals
setInterval(checkEmailsAndSendReplies, getRandomInterval(1,2) * 1000);
