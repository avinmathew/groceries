import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AddGroceryDialog } from "@/components/add-grocery-dialog";
import { offlineFetch } from "@/lib/client/offline-fetch";

jest.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: jest.fn(),
  }),
}));

jest.mock("@/hooks/use-toast", () => ({
  useToast: () => ({
    toast: jest.fn(),
  }),
}));

jest.mock("@/lib/sync-provider", () => ({
  useSync: () => ({
    isOnline: true,
    sync: jest.fn(),
    updatePendingCount: jest.fn(),
  }),
}));

jest.mock("@/lib/client/offline-fetch", () => ({
  offlineFetch: jest.fn(),
  queueMutation: jest.fn(),
}));

jest.mock("@/lib/offline-db", () => ({
  offlineDB: {
    shoppingListItems: {
      add: jest.fn(),
    },
  },
}));

const mockedOfflineFetch = jest.mocked(offlineFetch);

describe("AddGroceryDialog", () => {
  beforeAll(() => {
    window.HTMLElement.prototype.scrollIntoView = jest.fn();
  });

  beforeEach(() => {
    mockedOfflineFetch.mockReset();
  });

  it("refreshes autocomplete results whenever the dialog opens", async () => {    mockedOfflineFetch
      .mockResolvedValueOnce([
        {
          name: "Apples",
          categoryId: null,
          shoppingLists: [],
        },
      ])
      .mockResolvedValueOnce([
        {
          name: "Bananas",
          categoryId: null,
          shoppingLists: [],
        },
      ]);

    render(<AddGroceryDialog shoppingListId="shopping-list-1" variant="link" />);

    expect(mockedOfflineFetch).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Add an item..." }));

    expect(await screen.findByText("Apples")).toBeInTheDocument();
    expect(mockedOfflineFetch).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    await waitFor(() => {
      expect(screen.queryByText("Apples")).not.toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Add an item..." }));

    expect(await screen.findByText("Bananas")).toBeInTheDocument();
    expect(screen.queryByText("Apples")).not.toBeInTheDocument();
    expect(mockedOfflineFetch).toHaveBeenCalledTimes(2);
  });

  describe("token-based filtering", () => {
    const groceries = [
      { name: "Brown Onions", categoryId: null, shoppingLists: [] },
      { name: "Red Onion", categoryId: null, shoppingLists: [] },
      { name: "Garlic Cloves", categoryId: null, shoppingLists: [] },
      { name: "Peanut Butter", categoryId: null, shoppingLists: [] },
    ];

    async function openDialogWithGroceries() {
      mockedOfflineFetch.mockResolvedValue(groceries);
      render(<AddGroceryDialog shoppingListId="list-1" variant="link" />);
      fireEvent.click(screen.getByRole("button", { name: "Add an item..." }));
      // Wait for the async fetch to settle and items to appear
      await screen.findByText("Brown Onions");
    }

    it("matches reversed token order — 'onion brown' finds 'Brown Onions'", async () => {
      await openDialogWithGroceries();
      fireEvent.change(screen.getByPlaceholderText("Type to search..."), {
        target: { value: "onion brown" },
      });
      expect(await screen.findByText("Brown Onions")).toBeInTheDocument();
      expect(screen.queryByText("Red Onion")).not.toBeInTheDocument();
    });

    it("matches partial tokens — 'oni bro' finds 'Brown Onions'", async () => {
      await openDialogWithGroceries();
      fireEvent.change(screen.getByPlaceholderText("Type to search..."), {
        target: { value: "oni bro" },
      });
      expect(await screen.findByText("Brown Onions")).toBeInTheDocument();
    });

    it("is case-insensitive — 'BROWN ONION' finds 'Brown Onions'", async () => {
      await openDialogWithGroceries();
      fireEvent.change(screen.getByPlaceholderText("Type to search..."), {
        target: { value: "BROWN ONION" },
      });
      expect(await screen.findByText("Brown Onions")).toBeInTheDocument();
    });

    it("excludes items where any query token is absent — 'onion garlic' does not match 'Brown Onions'", async () => {
      await openDialogWithGroceries();
      fireEvent.change(screen.getByPlaceholderText("Type to search..."), {
        target: { value: "onion garlic" },
      });
      await waitFor(() => {
        expect(screen.queryByText("Brown Onions")).not.toBeInTheDocument();
      });
      expect(screen.queryByText("Red Onion")).not.toBeInTheDocument();
      // garlic cloves matches the "garlic" token but not "onion"
      expect(screen.queryByText("Garlic Cloves")).not.toBeInTheDocument();
    });

    it("matches a single-token query across all relevant items — 'onion' finds both onion items", async () => {
      await openDialogWithGroceries();
      fireEvent.change(screen.getByPlaceholderText("Type to search..."), {
        target: { value: "onion" },
      });
      expect(await screen.findByText("Brown Onions")).toBeInTheDocument();
      expect(await screen.findByText("Red Onion")).toBeInTheDocument();
      expect(screen.queryByText("Garlic Cloves")).not.toBeInTheDocument();
    });

    it("partial token matches within a single word — 'nut' finds 'Peanut Butter'", async () => {
      await openDialogWithGroceries();
      fireEvent.change(screen.getByPlaceholderText("Type to search..."), {
        target: { value: "nut" },
      });
      expect(await screen.findByText("Peanut Butter")).toBeInTheDocument();
    });
  });
});