import dotenv from "dotenv";
import dbConnect from "../src/config/db.js";
import User from "../src/models/User.js";
import { manualTokenRefresh } from "../src/services/cronJobs.js";

dotenv.config();

async function testTokenRefresh() {
  try {
    console.log("🔍 Connecting to database...");
    await dbConnect();

    console.log("\n📊 Checking users with subscriptions...\n");

    // Find all users with subscriptions
    const users = await User.find({
      "subscription.planId": { $exists: true },
    })
      .populate("subscription.planId")
      .select(
        "email tokens tokensUsedToday subscription.isActive subscription.endDate subscription.lastRefreshedAt subscription.planId"
      )
      .limit(10);

    console.log(`Found ${users.length} users with subscriptions\n`);

    users.forEach((user, index) => {
      const plan = user.subscription.planId;
      const isActive = user.subscription.isActive;
      const endDate = user.subscription.endDate
        ? new Date(user.subscription.endDate).toLocaleDateString()
        : "N/A";
      const lastRefreshed = user.subscription.lastRefreshedAt
        ? new Date(user.subscription.lastRefreshedAt).toLocaleString()
        : "Never";

      console.log(`${index + 1}. ${user.email}`);
      console.log(`   Current Tokens: ${user.tokens}`);
      console.log(`   Tokens Used Today: ${user.tokensUsedToday}`);
      console.log(`   Subscription Active: ${isActive ? "✅ Yes" : "❌ No"}`);
      console.log(
        `   Plan: ${plan ? plan.name : "N/A"} (${
          plan ? plan.dailyTokens : 0
        } daily tokens)`
      );
      console.log(`   End Date: ${endDate}`);
      console.log(`   Last Refreshed: ${lastRefreshed}`);
      console.log("");
    });

    console.log("\n🔄 Running manual token refresh...\n");
    const result = await manualTokenRefresh();

    if (result.success) {
      console.log(`✅ Token refresh completed successfully!`);
      console.log(`   Refreshed ${result.refreshedCount} users\n`);

      // Check users again after refresh
      console.log("📊 Checking users after refresh...\n");
      const usersAfter = await User.find({
        "subscription.planId": { $exists: true },
      })
        .populate("subscription.planId")
        .select(
          "email tokens tokensUsedToday subscription.isActive subscription.endDate subscription.lastRefreshedAt"
        )
        .limit(10);

      usersAfter.forEach((user, index) => {
        const plan = user.subscription.planId;
        console.log(`${index + 1}. ${user.email}`);
        console.log(`   Current Tokens: ${user.tokens}`);
        console.log(`   Tokens Used Today: ${user.tokensUsedToday}`);
        console.log(
          `   Last Refreshed: ${new Date(
            user.subscription.lastRefreshedAt
          ).toLocaleString()}`
        );
        console.log("");
      });
    } else {
      console.log(`❌ Token refresh failed: ${result.error}`);
    }

    process.exit(0);
  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  }
}

testTokenRefresh();
