const NAVIGATION_ENTRIES = [
  {
    breadcrumbLabel: "Evidence",
    depth: 0,
    parentRoute: null,
    route: "/progress",
    section: "Evidence",
    title: "Evidence Hub",
  },
  {
    breadcrumbLabel: "Training",
    depth: 1,
    parentRoute: "/progress",
    route: "/progress/training",
    section: "Evidence",
    title: "Training",
  },
  {
    breadcrumbLabel: "Training Library",
    depth: 2,
    parentRoute: "/progress/training",
    route: "/progress/training/library",
    section: "Training",
    title: "Training Library",
  },
];

const ENTRY_BY_ROUTE = new Map(
  NAVIGATION_ENTRIES.map((entry) => [normalizeRoute(entry.route), entry])
);

export function getNavigationEntry(route) {
  return ENTRY_BY_ROUTE.get(normalizeRoute(route)) ?? null;
}

export function getBreadcrumbTrail(route) {
  const trail = [];
  let entry = getNavigationEntry(route);
  const seen = new Set();

  while (entry && !seen.has(entry.route)) {
    trail.unshift({
      href: entry.route,
      label: entry.breadcrumbLabel ?? entry.title,
    });
    seen.add(entry.route);
    entry = entry.parentRoute ? getNavigationEntry(entry.parentRoute) : null;
  }

  return trail;
}

export function buildTrainingLibraryNavigation(path = []) {
  const segments = Array.isArray(path) ? path.filter(Boolean) : [];
  const baseRoute = "/progress/training/library";
  const route = [baseRoute, ...segments].join("/");
  const entry = getNavigationEntry(baseRoute);
  const breadcrumbs = buildCompactTrainingLibraryCrumbs(segments, baseRoute);
  const currentLabel =
    segments.length > 0 ? breadcrumbs.at(-1)?.label ?? "Training Library" : "Training Library";
  const parentRoute =
    segments.length > 0
      ? [baseRoute, ...segments.slice(0, -1)].join("/")
      : entry?.parentRoute ?? "/progress/training";

  return {
    breadcrumbs,
    depth: (entry?.depth ?? 2) + segments.length,
    parentRoute,
    route,
    section: "Training",
    title: currentLabel,
  };
}

export function buildTrainingSessionNavigation(session) {
  const trainingEntry = getNavigationEntry("/progress/training");
  const label = session?.label ?? "Workout Detail";

  return {
    breadcrumbs: [
      ...getBreadcrumbTrail("/progress/training"),
      {
        href: session?.href ?? "/progress/training",
        label,
      },
    ],
    depth: (trainingEntry?.depth ?? 1) + 1,
    parentRoute: "/progress/training",
    route: session?.href ?? "/progress/training",
    section: "Training",
    title: label,
  };
}

function buildCompactTrainingLibraryCrumbs(segments, baseRoute) {
  const crumbs = [
    {
      href: "/progress/training",
      label: "Training",
    },
  ];
  const displaySegments = getCompactTrainingDisplaySegments(segments);

  displaySegments.forEach(({ index, label }) => {
    crumbs.push({
      href: [baseRoute, ...segments.slice(0, index + 1)].join("/"),
      label,
    });
  });

  return crumbs;
}

function getCompactTrainingDisplaySegments(segments) {
  const hiddenSegments = new Set(["resistance", "cardio"]);

  return segments
    .map((segment, index) => ({
      index,
      label: getTrainingSegmentLabel(segment),
      segment,
    }))
    .filter(({ segment }) => !hiddenSegments.has(segment));
}

function getTrainingSegmentLabel(segment) {
  const knownLabels = {
    cardio: "Cardio",
    resistance: "Resistance",
    "upper-body": "Upper Body",
    "lower-body": "Lower Body",
  };

  return knownLabels[segment] ?? toTitle(segment);
}

function normalizeRoute(route) {
  const value = String(route ?? "").trim();
  if (!value || value === "/") return "/";
  return value.replace(/\/+$/g, "");
}

function toTitle(value) {
  return String(value ?? "")
    .replaceAll("-", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
