import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

function DummyComponent() {
  return <h1>Spikey Coins Trading</h1>;
}

describe("DummyComponent", () => {
  it("renders correctly", () => {
    render(<DummyComponent />);
    expect(screen.getByText("Spikey Coins Trading")).toBeInTheDocument();
  });
});
