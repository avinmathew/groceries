# MyGroceries App Requirements

## General

The MyGroceries App takes cues from the OurGroceries iPhone app.
Use a headless browser that supports Javascript as prices from stores are loaded via Javascript.
This is a web app that will run on a Digital Ocean droplet.
Regresion tests should be written for each feature.

## Home view

The home view shows a link to the shopping list. Multiple shopping lists can be created, and the number of items in the shopping list is shown as a badge on the list. 
On the right of each shopping list is an info icon that will bring up the shopping list edit view.

### Header
A header in the home view shows icons to :
* Allows users to navigate to the Admin view.
* Add a new shopping list.

## Shopping List edit view
Users can change the name of the shopping list.
There is a button to delete this shopping list, with a prompt.
Clicking Save will bring the user back to the Home view.

## Shopping List view

The first interface the user is presented with is a Main List of groceries. The groceries are grouped by category. The category header is sticky as the user scrolls down the page.
Under the grocery list is an option to "Add an item...". This presents a list where the user types and filters to matching groceries. When a user clicks on the grocery, it is added to the main list, under the correct category. If the user adds an item that already exists on the shopping list, then the quantity of that item is incremented by 1.
Categories are ordered based on a user specified order (number) in the Category edit page.
If a grocery does not have a allocated category, it is added to an "Uncategorised" category at the bottom of the list.
On the right of each grocery is an info icon that will bring up an edit view.
Notes are shown in small grey text under the grocery item name.
The grocery item shows the lowest price for Woolworths, Coles and Aldi (in that order). Show the icon, and then the price. The lowest price for the grocery item can be highlighted. The price is multiplied by the quantity. Align this to the right.
The total using the lowest price per store should be shown at the bottom of the list, above the "Add an item..."

### Header
In a non-scrolling header:
There is a Refresh Prices icon button. See Refresh Prices section for what it does.
Also in the header is a Add Grocery icon button, which will do the same as "Add an item...".
There is also an Edit button, which will show each grocery item with a delete icon and a grab control to reorder within a category or re-assign to another category.

### Crossed off section
Under the "Add an item...", there is a "Crossed off" category header, which is all previously groceries marked as "done". These groceries have a strikethrough font.
Clicking on a grocery in the main list, will move it to the Crossed Off section. Clicking on a grocery in the Crossed Off section will move it to the Main List.
The crossed off groceries are ordered by last crossed off being at the top.

## Info/Edit view

In the info/edit view, the user can rename the grocery.
There are Less and More buttons to indicate the quantity required. If there is only one item, then the grocery name is shown. If there are two or more items, then the grocery name with the number in parantheses is shown, e.g. `apples (2)` for two apples.
There is a dropdown to select the category.
There is a single line (no newline) free-text Note textbox.
There is the ability to add links to product pages from Woolworths, Coles and Aldi. Multiple links for a store can be added. Regular prices and discount prices are shown next to each link. The date of last price refresh is shown next to the price in "days ago".
There is a Refresh Prices button that allows all the links for this grocery to be refreshed.
Clicking Save will bring the user back to the shopping list page.
There is a button to delete this grocery item, with a prompt.
Prices are tracked over time, and a chart/table shows how prices change over time.

## Refresh Prices

When the Refresh Prices button is clicked:
If done from the Info/Edit view, it only refreshes for that particular grocery.
If done from the Main interface, it refreshes all groceries

If price refresh has been done since the last Wednesday, then the price won't be refreshed. This is because stores only change discounted items on Wednesdays.

## Admin page

The admin page brings up settings for the app.

There is only one item - Categories, which navigates to the Edit Categories view.

### Edit Categories view

A list of Categories is presented.
At the top in the header, is a Add Category icon button. This prompts for a category name.
On the left of the category name, users have a delete icon to delete the category. Any grocery items using this category will then be marked as Uncategorised.
On the right of the category name, is a drag handle that allows reordering of categories.

