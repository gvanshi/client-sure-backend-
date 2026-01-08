import dotenv from "dotenv";
import dbConnect from "../src/config/db.js";
import cron from "node-cron";

dotenv.config();

async function testCronSchedule() {
  try {
    console.log("🔍 Testing cron schedule...\n");

    // Test if the cron expression is valid
    const cronExpression = "0 1 * * *"; // 1:00 AM daily
    const isValid = cron.validate(cronExpression);

    console.log(`Cron expression: "${cronExpression}"`);
    console.log(`Is valid: ${isValid ? "✅ Yes" : "❌ No"}\n`);

    // Get current time in IST
    const now = new Date();
    const istTime = new Date(
      now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" })
    );

    console.log(`Current UTC time: ${now.toUTCString()}`);
    console.log(
      `Current IST time: ${istTime.toLocaleString("en-IN", {
        timeZone: "Asia/Kolkata",
      })}\n`
    );

    // Create a test cron job that runs every minute
    console.log(
      "Creating test cron job (runs every minute for 3 minutes)...\n"
    );

    let runCount = 0;
    const testCron = cron.schedule(
      "* * * * *",
      () => {
        runCount++;
        const time = new Date().toLocaleString("en-IN", {
          timeZone: "Asia/Kolkata",
        });
        console.log(`✅ Test cron executed at ${time} (Run #${runCount})`);

        if (runCount >= 3) {
          console.log("\n✅ Test cron is working! Stopping test...");
          testCron.stop();
          process.exit(0);
        }
      },
      {
        timezone: "Asia/Kolkata",
      }
    );

    console.log("⏰ Waiting for cron executions...\n");

    // Timeout after 4 minutes
    setTimeout(() => {
      console.log("❌ Timeout - cron did not execute as expected");
      testCron.stop();
      process.exit(1);
    }, 240000);
  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  }
}

testCronSchedule();
