---
name: ui-states
description: BasaManager's rules for loading, navigation, empty, error and success states with React Router 7 + TanStack Query — so a click always gets instant feedback, navigation shows the new page's skeleton immediately instead of freezing on the old page, cached pages are instant, and nothing flickers or jumps. Includes the slow-network e2e spec that proves it. Use when building or reviewing any page, data hook, mutation or route.
---

# UI states and navigation

## The bug this prevents
"I click, nothing happens for 5–6 seconds, then the new page appears all at once." That's almost never one
bug. It's one or more of these, all common in agent-written React:
1. **Blocking route loaders.** A React Router `loader` that `await`s API data holds the *old* page on screen
   until the data arrives. With no pending UI, it looks frozen.
2. **Suspense inside a transition.** React Router runs navigations in `startTransition`. If the new route
   suspends (a lazy chunk, `useSuspenseQuery`) and the nearest `<Suspense>` boundary is *above* the router
   outlet, React deliberately keeps showing the old UI instead of the fallback.
3. **Lazy chunk download on click.** The route's JS is fetched only when clicked, with no preload.
4. **Waterfalls.** The page fetches A, then B after A, then C; or the layout waits for everything before rendering.
5. **Slow API.** N+1 queries, missing indexes, or measuring against the Vite **dev** server (it compiles on
   first visit and is much slower than the production build).

## Rules

### 1. Navigation feedback within 100 ms
- Clicking a link changes the URL and the active nav item **immediately** and renders the destination's
  layout + skeleton. Data never blocks rendering the route.
- **No awaited data in loaders.** If a loader is used, it only starts fetching (`queryClient.prefetchQuery(...)`
  without `await`, or `ensureQueryData` *only* when the data is already cached). The component reads it with
  `useQuery` and shows its skeleton while `isPending`.
- `<Suspense>` boundaries sit **inside** each layout, around the `<Outlet />`, with that route's skeleton as the
  fallback, so the shell (sidebar, top bar, bottom nav) never disappears and the content area shows a skeleton.
- Avoid `useSuspenseQuery` for page content. Use `useQuery` + explicit skeletons (predictable, no transition surprises).
- A global **top progress bar** (2 px, accent token) appears if a navigation or route-chunk load takes
  more than 150 ms (`useNavigation().state !== 'idle'`), and finishes when the route renders.

### 2. Make the common path instant
- **Preload on intent:** every nav link and list-row link uses `<PrefetchLink>` (`lib/router/PrefetchLink.tsx`). On
  `pointerenter`, `focus` and `touchstart` it preloads the route's lazy chunk and calls `queryClient.prefetchQuery`
  for the destination's main query. After first paint, idle-preload the chunks of the role's bottom-nav/sidebar routes.
- **Cache defaults** (`lib/api/queryClient.ts`): `staleTime: 30_000`, `gcTime: 5 * 60_000`, `refetchOnWindowFocus: true`,
  `retry: 2` for queries (never for 4xx), `retry: 0` for mutations. Back/forward between visited pages is instant from cache.
- **Detail from list:** detail queries use `placeholderData` from the list cache (title, status, amount), so the
  header renders immediately while the full record loads.
- **Filters, tabs, month pickers, pagination:** `placeholderData: keepPreviousData`. Keep the old results visible
  (dimmed to 60% with `aria-busy`) instead of flashing a skeleton.
- **Parallel, not waterfall:** independent queries on a page start together. Only chain when data truly depends.

### 3. The four states, everywhere
Each data region (not just each page) has all four designed states:

| State | When | Show |
|---|---|---|
| **Pending** | `isPending` and no placeholder | Skeleton **matching the final layout** (same heights, same grid) so nothing jumps when data lands. Marked `data-skeleton`, `aria-busy="true"` |
| **Refreshing** | `isFetching && !isPending` | Content stays; a small inline spinner or the top bar. Never replace content with a skeleton |
| **Error** | `isError` | No data yet → inline error card with the API `message` + **Retry** (`refetch`). Data present → keep it, show a toast |
| **Empty** | success, no items | Designed empty state with one primary action |
| **Success** | data | Content. Fade in at most 150 ms (respect reduced motion) |

- Skeletons appear immediately for uncached data. Spinners are only for actions inside buttons.
- Each route has an `errorElement` (route error boundary) with Retry and a link home, so nothing crashes to a white screen.
- Layout shift budget: CLS < 0.05 on every page (reserve space for images, maps, charts, badges).

### 4. Mutations
- The button enters its pending state in the same frame as the click (`isPending` from `useMutation`): disabled,
  spinner, label kept (width doesn't change). Double submits are impossible.
- **Optimistic** (update cache first, roll back on error with a toast): mark notification read, mark all read,
  add comment, notification preference toggles, notice pin. **Not optimistic** for money (payments, bills,
  void, issue) or permissions: these wait for the server and show progress.
- On success: invalidate the exact query keys affected (key factory in `lib/api/keys.ts`), show a toast, and move
  focus sensibly (e.g. to the new item).
- Long operations (PDF render, bulk issue): return immediately, show "Preparing…" with progress, update through the
  socket event, never block the screen.

### 5. Real-time and offline
- Socket events invalidate queries; the changed item gets a brief highlight. No full-page reloads.
- Offline: banner + cached data stays readable; mutations disabled with "You're offline".

### 6. Speed budgets (measured on the production build)
- API reads p95 < 300 ms on seed data (integration tests log any request > 200 ms). List endpoints run a fixed
  number of queries regardless of page size (an integration test counts Prisma queries: no N+1).
- Initial JS ≤ 200 KB gzip, each route chunk ≤ 100 KB gzip (build fails above, via a size check).
- Never judge speed on the Vite dev server.

## The proof: `tests/e2e/states.spec.ts`
For every role's main navigation, on both projects:
1. **Slow API:** `page.route('**/api/**', r => setTimeout(() => r.continue(), 2000))`. Click each nav item and
   assert within **300 ms**: the URL changed, the active nav item changed, and `main` contains `[data-skeleton]`
   or real content, never empty. Then assert content replaces the skeleton without layout shift
   (`PerformanceObserver` layout-shift sum < 0.05).
2. **Slow chunks:** clear cache, delay `**/assets/*.js` by 1.5 s, navigate to a not-yet-visited route: the shell
   stays, the content area shows the route skeleton, the progress bar is visible.
3. **Cached back navigation:** visit A → B → back to A with the API delayed: A's content shows instantly from cache.
4. **Errors:** API returns 500 for a page's main query → inline error with Retry; Retry (now 200) shows content.
5. **Mutation pending:** delay a mutation 2 s → the button is disabled and shows progress within one frame; a second click sends nothing.
6. **Filters:** change the month filter with the API delayed → old results stay visible (dimmed), then update.

## Definition of done (states)
Every new page/region has the four states built (and in `design/states.html`), uses `PrefetchLink`, has no awaited
loader data, and `states.spec.ts` covers its route.
