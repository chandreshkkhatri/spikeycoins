import cron from "node-cron";
import ResearchService from "../crypto/services/ResearchService";

let isRunning = false;

export function startResearchCron(): void {
  // Run every 2 hours at the top of the hour
  cron.schedule("0 */2 * * *", async () => {
    if (isRunning) {
      console.log("[Cron] Research job already running, skipping...");
      return;
    }

    console.log("[Cron] Starting automated research job...");
    isRunning = true;

    try {
      const service = ResearchService.getInstance();
      await service.runAutomatedResearch();
      console.log("[Cron] Research job completed successfully");
    } catch (error) {
      console.error("[Cron] Research job failed:", error);
    } finally {
      isRunning = false;
    }
  });

  console.log("[Cron] Research job scheduled to run every 2 hours");
}

export async function runResearchNow(): Promise<{
  success: boolean;
  message: string;
  error?: string;
}> {
  if (isRunning) {
    return {
      success: false,
      message: "Research job is already running",
    };
  }

  console.log("[Admin] Manually triggered research job...");
  isRunning = true;

  try {
    const service = ResearchService.getInstance();
    await service.runAutomatedResearch();
    console.log("[Admin] Research job completed successfully");
    return {
      success: true,
      message: "Research job completed successfully",
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error("[Admin] Research job failed:", error);
    return {
      success: false,
      message: "Research job failed",
      error: errorMessage,
    };
  } finally {
    isRunning = false;
  }
}

export function isResearchRunning(): boolean {
  return isRunning;
}
