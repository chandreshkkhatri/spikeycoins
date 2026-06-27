import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import * as React from "react";
import { Badge } from "./badge";

describe("Badge", () => {
  it("should render children correctly", () => {
    render(<Badge>Active</Badge>);
    expect(screen.getByText("Active")).toBeInTheDocument();
  });

  it("should apply default variant and tone classes", () => {
    const { container } = render(<Badge>Default Badge</Badge>);
    const badge = container.firstChild;
    expect(badge).toHaveClass("inline-flex");
    expect(badge).toHaveClass("bg-neutral-100");
    expect(badge).toHaveClass("text-neutral-800");
  });

  it("should apply correct classes for custom variants and tones", () => {
    // success variant (soft tone is default)
    const { container: containerSuccess } = render(
      <Badge variant="success">Success</Badge>
    );
    expect(containerSuccess.firstChild).toHaveClass(
      "bg-[hsl(var(--color-price-up))]/15"
    );

    // danger variant with solid tone
    const { container: containerDangerSolid } = render(
      <Badge variant="danger" tone="solid">
        Danger
      </Badge>
    );
    expect(containerDangerSolid.firstChild).toHaveClass("bg-red-600");
    expect(containerDangerSolid.firstChild).toHaveClass("text-white");
  });

  it("should merge and apply custom className prop", () => {
    const { container } = render(
      <Badge className="custom-badge-class">Custom Class</Badge>
    );
    expect(container.firstChild).toHaveClass("custom-badge-class");
    expect(container.firstChild).toHaveClass("inline-flex");
  });

  it("should forward additional HTML attributes", () => {
    render(
      <Badge data-testid="test-badge" title="badge-tooltip" id="my-badge">
        Props
      </Badge>
    );
    const badge = screen.getByTestId("test-badge");
    expect(badge).toHaveAttribute("title", "badge-tooltip");
    expect(badge).toHaveAttribute("id", "my-badge");
  });

  it("should correctly forward ref", () => {
    const ref = React.createRef<HTMLDivElement>();
    render(<Badge ref={ref}>Ref Badge</Badge>);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
    expect(ref.current?.textContent).toBe("Ref Badge");
  });
});
