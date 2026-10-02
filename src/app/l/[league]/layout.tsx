/**
 * No chrome of its own: every league page renders its own `AppShell`. It
 * exists so `revalidateLeague()` has one layout to invalidate beneath.
 */
export default function LeagueLayout({ children }: LayoutProps<"/l/[league]">) {
  return children;
}
