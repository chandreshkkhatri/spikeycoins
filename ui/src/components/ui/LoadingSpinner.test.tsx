import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import LoadingSpinner from "./LoadingSpinner";

describe("LoadingSpinner", () => {
  it("should render with the default message", () => {
    render(<LoadingSpinner />);
    expect(screen.getByText("Loading...")).toBeInTheDocument();
  });

  it("should render with a custom message", () => {
    render(<LoadingSpinner message="Fetching coins..." />);
    expect(screen.getByText("Fetching coins...")).toBeInTheDocument();
  });

  it("should not render the message paragraph if message is empty", () => {
    const { container } = render(<LoadingSpinner message="" />);
    expect(screen.queryByText("Loading...")).not.toBeInTheDocument();
    const paragraph = container.querySelector(".loading-message");
    expect(paragraph).toBeNull();
  });

  it("should apply default size class (medium) to spinner", () => {
    const { container } = render(<LoadingSpinner />);
    const spinner = container.querySelector(".spinner");
    expect(spinner).toHaveClass("spinner-medium");
    expect(spinner).not.toHaveClass("spinner-small");
    expect(spinner).not.toHaveClass("spinner-large");
  });

  it("should apply correct size classes based on size prop", () => {
    const { container: containerSmall } = render(<LoadingSpinner size="small" />);
    const spinnerSmall = containerSmall.querySelector(".spinner");
    expect(spinnerSmall).toHaveClass("spinner-small");

    const { container: containerLarge } = render(<LoadingSpinner size="large" />);
    const spinnerLarge = containerLarge.querySelector(".spinner");
    expect(spinnerLarge).toHaveClass("spinner-large");
  });

  it("should append custom className to the loading container", () => {
    const { container } = render(<LoadingSpinner className="my-custom-class" />);
    const loadingContainer = container.querySelector(".loading-container");
    expect(loadingContainer).toHaveClass("my-custom-class");
    expect(loadingContainer).toHaveClass("loading-container");
  });
});
