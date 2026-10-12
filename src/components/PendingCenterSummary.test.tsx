import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("@/hooks/usePendingCenter", () => ({ usePendingCenter: (...args: unknown[]) => { mocks.query(...args); return { data: undefined, isPending: true, isError: false }; } }));
import PendingCenterSummary from "./PendingCenterSummary";
afterEach(() => vi.useRealTimers());
describe("Saturday pending summary", () => {
  it("checks the last Saturday on a Monday and links to the same date and scope", () => {
    vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date(2026, 9, 12, 14));
    render(<MemoryRouter><PendingCenterSummary scope={{ kind: "paroquia", paroquia_id: "p" }} /></MemoryRouter>);
    expect(mocks.query).toHaveBeenLastCalledWith("2026-10-10", { kind: "paroquia", paroquia_id: "p" });
    expect(screen.getByRole("link")).toHaveAttribute("href", "/pendencias?date=2026-10-10&paroquia=p");
  });
});
