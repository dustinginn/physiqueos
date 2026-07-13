import Link from "next/link";
import { ChevronRight } from "lucide-react";

export default function BreadcrumbTrail({ items = [] }) {
  const compactItems = items.filter((item) => item?.label);

  if (compactItems.length <= 1) return null;

  return (
    <nav aria-label="Breadcrumb" className="min-w-0">
      <ol className="flex min-w-0 items-center gap-1 overflow-hidden text-[11px] font-extrabold text-slate-400">
        {compactItems.map((item, index) => {
          const isCurrent = index === compactItems.length - 1;

          return (
            <li
              className="flex min-w-0 items-center gap-1"
              key={`${item.href ?? item.label}-${index}`}
            >
              {index > 0 && (
                <ChevronRight
                  aria-hidden="true"
                  className="shrink-0 text-slate-300"
                  size={12}
                />
              )}
              {isCurrent || !item.href ? (
                <span
                  aria-current={isCurrent ? "page" : undefined}
                  className="truncate text-slate-500"
                >
                  {item.label}
                </span>
              ) : (
                <Link
                  className="truncate text-slate-400 transition hover:text-indigo-600"
                  href={item.href}
                >
                  {item.label}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
