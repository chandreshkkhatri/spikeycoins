import PageLayout from "@/components/layout/PageLayout";
import { Badge } from "@/components/ui/badge";

export default function TradingGymPage() {
  return (
    <PageLayout>
      <div className="flex flex-col gap-6 py-6 md:gap-8 md:py-8">
        <header className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-bold text-foreground md:text-4xl">
              Trading Gym
            </h1>
            <Badge variant="warning" tone="soft" className="text-sm">
              Under construction
            </Badge>
          </div>
          <p className="text-lg text-muted-foreground max-w-2xl leading-relaxed">
            We are building a gamified playground where you can practice chart
            reading, test trade execution habits, and level up your technical
            analysis skills without risking real capital.
          </p>
        </header>

        <section className="rounded-xl border border-dashed border-border bg-card/50 p-6 md:p-8">
          <p className="mb-4 text-base text-muted-foreground">
            The Trading Gym will let you:
          </p>
          <ul className="flex flex-col gap-2 list-disc pl-5 text-foreground">
            <li>Run timed chart-reading sessions with immediate feedback.</li>
            <li>
              Compete in score-based scenarios to sharpen pattern recognition.
            </li>
            <li>
              Earn streaks for consistent practice before placing real orders.
            </li>
          </ul>
        </section>

        <footer className="rounded-xl bg-muted/50 p-5 text-sm text-muted-foreground md:text-base">
          In the meantime, explore the Trading Panel to track real markets while
          we finish crafting this immersive practice experience.
        </footer>
      </div>
    </PageLayout>
  );
}
