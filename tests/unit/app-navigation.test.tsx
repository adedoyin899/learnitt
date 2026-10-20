import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AppNavigation, MAIN_NAV_ITEMS } from "@/components/navigation/app-navigation";

const mockUsePathname = vi.fn();

vi.mock("next/navigation", () => ({
  usePathname: () => mockUsePathname(),
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

// Mock next-themes
vi.mock("next-themes", () => ({
  useTheme: () => ({
    theme: "dark",
    setTheme: vi.fn(),
  }),
}));

describe("AppNavigation Component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUsePathname.mockReturnValue("/today");

    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
  });

  it("does not render when on /login or /auth routes", () => {
    mockUsePathname.mockReturnValue("/login");
    const { container: loginContainer } = render(<AppNavigation />);
    expect(loginContainer.firstChild).toBeNull();

    mockUsePathname.mockReturnValue("/auth/callback");
    const { container: authContainer } = render(<AppNavigation />);
    expect(authContainer.firstChild).toBeNull();
  });

  it("renders brand logo and all primary navigation links with icons", () => {
    render(<AppNavigation />);

    // Brand logo
    expect(screen.getByLabelText("Learnitt Home")).toBeInTheDocument();
    expect(screen.getByText("Learnitt")).toBeInTheDocument();

    // Main navigation landmarks
    const navs = screen.getAllByRole("navigation");
    expect(navs.length).toBeGreaterThanOrEqual(1);

    // Verify all primary navigation labels exist
    for (const item of MAIN_NAV_ITEMS) {
      const links = screen.getAllByText(item.label);
      expect(links.length).toBeGreaterThanOrEqual(1);
    }

    // Settings link
    expect(screen.getByRole("link", { name: "Settings" })).toBeInTheDocument();
  });

  it("highlights the active link according to current pathname", () => {
    mockUsePathname.mockReturnValue("/progress");
    render(<AppNavigation />);

    // Get all links matching Progress
    const progressLinks = screen.getAllByRole("link", { name: /progress/i });
    const activeProgressLink = progressLinks.find(
      (el) => el.getAttribute("aria-current") === "page"
    );
    expect(activeProgressLink).toBeDefined();

    // Today should not be active
    const todayLinks = screen.getAllByRole("link", { name: /today/i });
    const activeTodayLink = todayLinks.find(
      (el) => el.getAttribute("aria-current") === "page"
    );
    expect(activeTodayLink).toBeUndefined();
  });

  it("opens mobile drawer when clicking the mobile menu trigger and displays all links with descriptions", () => {
    render(<AppNavigation />);

    const menuButton = screen.getByLabelText("Open navigation menu");
    fireEvent.click(menuButton);

    // Drawer dialog should be open
    expect(screen.getByRole("dialog", { name: "Site Navigation" })).toBeInTheDocument();
    expect(screen.getByText("Daily learning loop & focus session")).toBeInTheDocument();
    expect(screen.getByText("Adaptive schedule & milestones")).toBeInTheDocument();
  });
});
