import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import * as React from "react";
import { Button } from "./button";

describe("Button", () => {
  it("should render child content correctly", () => {
    render(<Button>Click me</Button>);
    expect(screen.getByRole("button", { name: /click me/i })).toBeInTheDocument();
  });

  it("should trigger onClick callback when clicked", () => {
    const handleClick = vi.fn();
    render(<Button onClick={handleClick}>Click me</Button>);
    
    const button = screen.getByRole("button", { name: /click me/i });
    fireEvent.click(button);
    
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it("should support disabled state and prevent onClick", () => {
    const handleClick = vi.fn();
    render(<Button onClick={handleClick} disabled>Disabled Button</Button>);
    
    const button = screen.getByRole("button", { name: /disabled button/i });
    expect(button).toBeDisabled();
    expect(button).toHaveClass("disabled:pointer-events-none");
    expect(button).toHaveClass("disabled:opacity-50");
    
    fireEvent.click(button);
    expect(handleClick).not.toHaveBeenCalled();
  });

  it("should apply variant and size classes", () => {
    const { container: containerDestructive } = render(
      <Button variant="destructive" size="sm">
        Destructive
      </Button>
    );
    const btnDestructive = containerDestructive.firstChild;
    expect(btnDestructive).toHaveClass("bg-destructive");
    expect(btnDestructive).toHaveClass("h-9");

    const { container: containerGhost } = render(
      <Button variant="ghost" size="lg">
        Ghost
      </Button>
    );
    const btnGhost = containerGhost.firstChild;
    expect(btnGhost).toHaveClass("hover:bg-accent");
    expect(btnGhost).toHaveClass("h-11");
  });

  it("should forward ref correctly", () => {
    const ref = React.createRef<HTMLButtonElement>();
    render(<Button ref={ref}>Ref Button</Button>);
    expect(ref.current).toBeInstanceOf(HTMLButtonElement);
    expect(ref.current?.textContent).toBe("Ref Button");
  });

  it("should render as a child element when asChild is true", () => {
    render(
      <Button asChild data-testid="aschild-btn">
        <a href="/dashboard">Navigate</a>
      </Button>
    );
    
    const link = screen.getByTestId("aschild-btn");
    expect(link.tagName).toBe("A");
    expect(link).toHaveAttribute("href", "/dashboard");
    expect(link).toHaveTextContent("Navigate");
    // Ensure button styles are merged into the anchor
    expect(link).toHaveClass("inline-flex");
    expect(link).toHaveClass("items-center");
  });
});
