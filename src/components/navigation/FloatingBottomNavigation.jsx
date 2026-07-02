"use client";

import { usePathname } from "next/navigation";
import { bottomNavigation } from "../../fixtures/bottomNavigation";
import BottomNavigation from "./BottomNavigation";

export default function FloatingBottomNavigation() {
  const pathname = usePathname();
  const items = bottomNavigation.map((item) => ({
    ...item,
    active: isActiveRoute(pathname, item.href),
  }));

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 mx-auto flex max-w-[393px] justify-center px-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
      <div className="pointer-events-auto w-full translate-y-0 transition duration-200 ease-out">
        <BottomNavigation items={items} />
      </div>
    </div>
  );
}

function isActiveRoute(pathname, href) {
  if (href === "/") return pathname === "/";
  if (!href || href.startsWith("#")) return false;

  return pathname === href || pathname.startsWith(`${href}/`);
}
