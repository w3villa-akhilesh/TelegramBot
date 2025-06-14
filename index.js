require("dotenv").config();
const TelegramBot = require("node-telegram-bot-api");
const schedule = require("node-schedule");
const { GoogleGenerativeAI } = require("@google/generative-ai");

// === ENV VARIABLES ===
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const CHAT_ID = process.env.CHAT_ID;

if (!TELEGRAM_BOT_TOKEN || !GEMINI_API_KEY || !CHAT_ID) {
  console.error(
    ":x: Missing required environment variables. Please check your .env file."
  );
  process.exit(1);
}

// === Init Gemini SDK ===
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const model = genAI.getGenerativeModel({
  model: "gemini-1.5-flash",
  generationConfig: {
    temperature: 0.9, // Controls creativity
    maxOutputTokens: 512, // Optional, limits length
    topK: 40, // Optional
    topP: 0.95, // Optional
  },
});

// === TELEGRAM BOT INIT ===
const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: true });
console.log("Telegram bot started...");

// === Generate Quiz with Gemini ===
const topics = [
  "HTML",
  "CSS",
  "JavaScript",
  "React",
  "Node.js",
  "Express",
  "Databases",
  "APIs",
  "Authentication",
  "Frontend",
  "Backend",
  "Full Stack",
];

async function webDevQuiz() {
  try {
    const topic = topics[Math.floor(Math.random() * topics.length)];
    console.log(
      `:satellite_antenna: Requesting quiz on ${topic} from Gemini...`
    );

    const result = await model.generateContent([
      `Generate a Web Development multiple choice question related to ${topic} with exactly 4 options (A, B, C, D).
Clearly specify the correct answer using the format below:
Output format:
Question: <your question here>
A) <option A>
B) <option B>
C) <option C>
D) <option D>
Answer: <Correct Option Letter>`,
    ]);

    const response = await result.response;
    const text = response.text();
    if (!text) throw new Error("Empty response from Gemini.");
    console.log("Quiz received.");
    return text;
  } catch (error) {
    console.error(":x: Gemini SDK Error:", error.message || error);
    return ":x: Could not generate quiz. Please try again later.";
  }
}

// === Send Quiz to Telegram as Quiz Poll ===
async function sendQuiz(chatId = CHAT_ID) {
  console.log(
    `:hourglass_flowing_sand: Generating quiz for chat ID: ${chatId}...`
  );
  const quizMarkdown = await webDevQuiz();
  try {
    const lines = quizMarkdown
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    const questionLine = lines.find((line) =>
      line.toLowerCase().startsWith("question:")
    );
    const question = questionLine?.split("Question:")[1]?.trim();
    const options = [];
    for (let label of ["A", "B", "C", "D"]) {
      const optLine = lines.find((l) => l.startsWith(`${label})`));
      if (optLine) options.push(optLine.split(`${label})`)[1].trim());
    }
    const answerLine = lines.find((line) => /^answer:/i.test(line));
    const correctLabel = answerLine?.split(":")[1]?.trim().toUpperCase();
    const correctOptionIndex = ["A", "B", "C", "D"].indexOf(correctLabel);
    // Validate
    if (!question || options.length !== 4 || correctOptionIndex === -1) {
      throw new Error(":warning: Gemini quiz format is invalid.");
    }
    // Send Telegram quiz poll
    await bot.sendPoll(chatId, question, options, {
      type: "quiz",
      correct_option_id: correctOptionIndex,
      is_anonymous: false,
      explanation: `:white_check_mark: Correct answer: ${options[correctOptionIndex]}`,
    });
    console.log(":white_check_mark: Quiz poll sent!");
  } catch (error) {
    console.error(":x: Failed to send quiz poll:", error.message);
    await bot.sendMessage(
      chatId,
      `:x: Failed to send quiz in poll format. Here's the quiz in text:\n\n${quizMarkdown}`,
      {
        parse_mode: "Markdown",
      }
    );
  }
}

// === Schedule quiz every 5 minutes ===
schedule.scheduleJob("*/1 * * * *", () => {
  console.log(":clock5: Scheduled quiz at", new Date().toLocaleTimeString());
  sendQuiz();
});

// === /start command ===
bot.onText(/\/start/, (msg) => {
  console.log(":envelope_with_arrow: /start from:", msg.chat.id);
  bot.sendMessage(
    msg.chat.id,
    ":wave: Welcome! You'll receive a Web Developement quiz every 5 minutes. Type /question to get one immediately."
  );
});

// === /question command ===
bot.onText(/\/question/, (msg) => {
  console.log(":envelope_with_arrow: /question from:", msg.chat.id);
  sendQuiz(msg.chat.id);
});
