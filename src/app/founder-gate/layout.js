// Nested layouts cannot remove chrome the root layout already renders
// (the floating nav/theme switch still appear - they're static, contain no
// Founder data, and every link they show is itself gated). This file exists
// so the login route has its own explicit, minimal layout rather than
// silently inheriting whatever the root layout does in the future.
export default function FounderGateLayout({ children }) {
  return children;
}
