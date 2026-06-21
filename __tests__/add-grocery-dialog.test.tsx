import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AddGroceryDialog } from "@/components/add-grocery-dialog";
import { offlineFetch, queueMutation } from "@/lib/client/offline-fetch";

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
const mockedQueueMutation = jest.mocked(queueMutation);

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

  describe("quantity stepper", () => {
    beforeEach(() => {
      mockedOfflineFetch.mockResolvedValue([]);
      mockedQueueMutation.mockResolvedValue(null);
    });

    it("shows quantity stepper with default value of 1 when the dialog opens", async () => {
      render(<AddGroceryDialog shoppingListId="list-1" variant="link" />);
      fireEvent.click(screen.getByRole("button", { name: "Add an item..." }));
      await screen.findByPlaceholderText("Type to search...");

      expect(screen.getByLabelText("Decrease quantity")).toBeInTheDocument();
      expect(screen.getByLabelText("Increase quantity")).toBeInTheDocument();
      expect(screen.getByText("1")).toBeInTheDocument();
    });

    it("increments quantity when + is clicked", async () => {
      render(<AddGroceryDialog shoppingListId="list-1" variant="link" />);
      fireEvent.click(screen.getByRole("button", { name: "Add an item..." }));
      await screen.findByPlaceholderText("Type to search...");

      fireEvent.click(screen.getByLabelText("Increase quantity"));
      fireEvent.click(screen.getByLabelText("Increase quantity"));
      expect(screen.getByText("3")).toBeInTheDocument();
    });

    it("cannot decrease below 1", async () => {
      render(<AddGroceryDialog shoppingListId="list-1" variant="link" />);
      fireEvent.click(screen.getByRole("button", { name: "Add an item..." }));
      await screen.findByPlaceholderText("Type to search...");

      const decreaseBtn = screen.getByLabelText("Decrease quantity");
      expect(decreaseBtn).toBeDisabled();
      fireEvent.click(decreaseBtn);
      expect(screen.getByText("1")).toBeInTheDocument();
    });

    it("submits the chosen quantity in the request payload when creating a new item", async () => {
      render(<AddGroceryDialog shoppingListId="list-1" variant="link" />);
      fireEvent.click(screen.getByRole("button", { name: "Add an item..." }));
      await screen.findByPlaceholderText("Type to search...");

      fireEvent.click(screen.getByLabelText("Increase quantity"));
      fireEvent.click(screen.getByLabelText("Increase quantity"));

      fireEvent.change(screen.getByPlaceholderText("Type to search..."), {
        target: { value: "Milk" },
      });
      fireEvent.click(await screen.findByRole("button", { name: /Create "Milk"/ }));

      await waitFor(() => {
        expect(mockedQueueMutation).toHaveBeenCalledWith(
          "POST",
          expect.stringContaining("/api/grocery-items"),
          expect.objectContaining({ name: "Milk", quantity: 3 }),
          expect.any(Function)
        );
      });
    });

    it("resets quantity to 1 after the dialog closes", async () => {
      render(<AddGroceryDialog shoppingListId="list-1" variant="link" />);
      fireEvent.click(screen.getByRole("button", { name: "Add an item..." }));
      await screen.findByPlaceholderText("Type to search...");

      fireEvent.click(screen.getByLabelText("Increase quantity"));
      fireEvent.click(screen.getByLabelText("Increase quantity"));
      expect(screen.getByText("3")).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "Close" }));
      await waitFor(() => {
        expect(screen.queryByPlaceholderText("Type to search...")).not.toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole("button", { name: "Add an item..." }));
      await screen.findByPlaceholderText("Type to search...");
      expect(screen.getByText("1")).toBeInTheDocument();
    });
  });
});