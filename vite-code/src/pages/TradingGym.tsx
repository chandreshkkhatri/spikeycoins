import PageLayout from "@/components/layout/PageLayout";
import { Badge } from "@/components/ui/badge";

export default function TradingGymPage() {
  return (
    <PageLayout>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "32px",
          padding: "32px 0",
        }}
      >
        <header
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "12px",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "12px",
              flexWrap: "wrap",
            }}
          >
            <h1
              style={{
                fontSize: "2.25rem",
                fontWeight: 700,
                margin: 0,
                color: "var(--fs-text-primary)",
              }}
            >
              Trading Gym
            </h1>
            <Badge variant="warning" tone="soft">
              Under construction
            </Badge>
          </div>
          <p
            style={{
              fontSize: "1.1rem",
              color: "var(--fs-text-secondary, #4b5563)",
              margin: 0,
              maxWidth: "720px",
            }}
          >
            We are building a gamified playground where you can practice chart
            reading, test trade execution habits, and level up your technical
            analysis skills without risking real capital.
          </p>
        </header>

        <section
          style={{
            border: "1px dashed var(--fs-border-muted, #d1d5db)",
            borderRadius: "16px",
            padding: "32px",
            background: "var(--fs-surface, rgba(255,255,255,0.9))",
          }}
        >
          <p
            style={{
              fontSize: "1rem",
              lineHeight: 1.6,
              color: "var(--fs-text-secondary, #4b5563)",
              marginBottom: "16px",
            }}
          >
            The Trading Gym will let you:
          </p>
          <ul
            style={{
              margin: 0,
              paddingLeft: "20px",
              display: "flex",
              flexDirection: "column",
              gap: "8px",
              color: "var(--fs-text-primary, #1f2937)",
              fontSize: "1rem",
            }}
          >
            <li>Run timed chart-reading sessions with immediate feedback.</li>
            <li>Compete in score-based scenarios to sharpen pattern recognition.</li>
            <li>Earn streaks for consistent practice before placing real orders.</li>
          </ul>
        </section>

        <footer
          style={{
            padding: "20px",
            borderRadius: "12px",
            background: "var(--fs-surface-accent, #f3f4f6)",
            color: "var(--fs-text-secondary, #4b5563)",
            fontSize: "0.95rem",
          }}
        >
          In the meantime, explore the Trading Panel to track real markets while
          we finish crafting this immersive practice experience.
        </footer>
      </div>
    </PageLayout>
  );
}
