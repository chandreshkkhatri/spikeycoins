import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AccountSelector from "./AccountSelector";

const mockAccounts = [
  {
    _id: "acc-binance",
    accountName: "My Binance",
    accountType: "binance" as const,
    isActive: true,
  },
  {
    _id: "acc-upstox",
    accountName: "My Upstox",
    accountType: "upstox" as const,
    isActive: true,
  },
  {
    _id: "acc-demo",
    accountName: "Demo Account",
    accountType: "binance" as const,
    isActive: true,
    isDemo: true,
  },
];

describe("AccountSelector Component", () => {
  it("renders selected account name and icon correctly", () => {
    render(
      <AccountSelector
        accounts={mockAccounts}
        selectedAccount={mockAccounts[0]}
        onAccountSelect={vi.fn()}
      />
    );

    expect(screen.getByText("My Binance")).toBeInTheDocument();
    expect(screen.getByText("🟡")).toBeInTheDocument();
  });

  it("renders demo accounts with game controller emoji and DEMO badge", () => {
    render(
      <AccountSelector
        accounts={mockAccounts}
        selectedAccount={mockAccounts[2]}
        onAccountSelect={vi.fn()}
      />
    );

    expect(screen.getByText("Demo Account")).toBeInTheDocument();
    expect(screen.getByText("🎮")).toBeInTheDocument();
    expect(screen.getByText("DEMO")).toBeInTheDocument();
  });

  it("renders 'No accounts' state when list is empty", () => {
    render(
      <AccountSelector
        accounts={[]}
        selectedAccount={null}
        onAccountSelect={vi.fn()}
      />
    );

    expect(screen.getByText("No accounts")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add" })).toBeInTheDocument();
  });

  it("calls onAccountSelect when an account option is chosen", async () => {
    const user = userEvent.setup();
    const handleSelect = vi.fn();

    render(
      <AccountSelector
        accounts={mockAccounts}
        selectedAccount={mockAccounts[0]}
        onAccountSelect={handleSelect}
      />
    );

    const trigger = screen.getByRole("combobox");
    expect(trigger).toBeInTheDocument();

    await user.click(trigger);

    const option = screen.getByRole("option", { name: /My Upstox/i });
    expect(option).toBeInTheDocument();

    await user.click(option);

    expect(handleSelect).toHaveBeenCalledWith(mockAccounts[1]);
  });
});
