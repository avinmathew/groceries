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

  it("refreshes autocomplete results whenever the dialog opens", async () => {
    mockedOfflineFetch
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
});