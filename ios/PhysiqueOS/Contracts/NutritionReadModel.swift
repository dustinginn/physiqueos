import Foundation

/// Native transport mirror of the web's live Nutrition Evidence experience
/// (`/progress/nutrition`, `ProgressPlaceholderScreen.jsx`'s
/// `report.id === "nutrition"` render path →
/// `NutritionEvidenceContextService.getNutritionTimelineReport` →
/// `ProgressReportingService.getPlaceholderReport("nutrition", ...)`), read
/// directly from source — not inferred from filenames. One route under
/// `src/app/progress/nutrition/**` was confirmed NOT part of the live,
/// navigable product and is deliberately not ported: `enrichment-review`
/// (zero inbound links anywhere in the web app — an internal ops/
/// reprocessing-eligibility tool, not a Founder-facing screen).
///
/// The three `reporting/[reportId]` deep report screens (Calories/Macros/
/// Meals) ARE genuinely live and ARE ported — see
/// `NutritionReportingReadModel.swift`/`NutritionReportingView.swift`. The
/// `library/[[...path]]` Nutrition Areas browse pages remain out of scope
/// for this pass (their own rows stay informational, see
/// `NutritionInfoLink`) — a smaller, disclosed deviation than the prior
/// revision's, which had reduced Reporting to informational rows too.
struct NutritionLandingReadModel: Codable, Equatable {
    /// `report.title` — "Nutrition".
    var title: String
    /// `report.subtitle` — not confirmed live on the server's nutrition
    /// stream object during this port's audit (only Weight's literal
    /// subtitle string was independently verified); `nil` here falls back
    /// to the header's existing default copy, the same safe behavior
    /// `TrainingLandingReadModel.subtitle` already relies on for the
    /// identical reason.
    var subtitle: String?
    var tone: HomeColorToken
    /// `evidenceContext` — the same shared "Build Lean Mass" / "Visible
    /// Abs" / "All Nutrition" scope selector every Evidence stream shows
    /// (`EvidenceChronology.swift`).
    var scope: TrainingScopeContext
    /// `report.latestNutritionDay` (via `getNutritionHistoryPresentation`)
    /// — always the true latest day regardless of the selected scope,
    /// matching Weight's confirmed "Latest" asymmetry (unscoped even in a
    /// goal-scoped view). `nil` when no nutrition evidence exists yet.
    var latestNutritionDay: NutritionDayRecord?
    /// `report.nutritionReportingLinks` — informational only in this pass
    /// (see the type-level doc comment); `destination == nil`.
    var reportingLinks: [NutritionInfoLink]
    /// `report.nutritionLibrary` ("Nutrition Areas") — informational only
    /// in this pass, same reasoning.
    var nutritionAreas: [NutritionInfoLink]
    /// `getNutritionDayEntries()`, already newest-first — used for the
    /// "Recent Nutrition History" preview (`NUTRITION_HISTORY_PREVIEW_LIMIT
    /// = 3`) and its "Show All" sheet (`NutritionHistorySheet`).
    var nutritionHistory: [NutritionDayRecord]
    var dataSources: [NutritionDataSource]
}

/// A "Reporting"/"Nutrition Areas" row. `destination` is populated for the
/// 3 real Reporting rows (Calories/Macros/Meals — routed through
/// `.progressStream(streamId: "nutrition/reporting/<id>")`, the same
/// catch-all pattern `.trainingDay`/`.activityDay` already use) and left
/// `nil` for Nutrition Areas rows, which stay informational-only: the
/// honest non-navigating treatment `ActivityAreaSummary` already
/// established for a different reason (dead web links) — here the web
/// links ARE live, this port's own scope just doesn't extend to the
/// Nutrition Library browse screens yet.
struct NutritionInfoLink: Codable, Equatable, Identifiable {
    var id: String
    var label: String
    var detail: String
    var destination: AppDestination?
}

struct NutritionDataSource: Codable, Equatable, Identifiable {
    var name: String
    var status: String

    var id: String { name }
}

/// `getNutritionDayEntries()`'s per-day shape
/// (`ProgressReportingService.js:1534-1549`), used identically for the
/// Latest Nutrition Day card, every history/"Show All" row, and the day
/// detail screen — the same "one shared record shape across list and
/// detail" convention `ActivityDayRecord` already established.
struct NutritionDayRecord: Codable, Equatable, Identifiable {
    var id: String
    /// `day.date` (`= observed_at`) — a bare `yyyy-MM-dd` calendar-day key,
    /// UTC-anchored (see `ActivityDayRecord.date`'s identical note).
    var date: String
    /// Already server-formatted: `"{calories} calories"`.
    var value: String
    /// Already server-formatted: `formatNutritionDayDetail` — e.g. "180g
    /// protein · 220g carbs · 90g fat · 4 meals".
    var detail: String
    var sourceEvidence: [String]
    var totals: NutritionMacroTotals
    var meals: [NutritionMealRecord]
    /// Goal/Phase chronology (see `EvidenceChronology.swift`) — populated
    /// centrally by `FixtureNutritionAPI` from `date`, the same convention
    /// every other vertical's day/entry records now carry.
    var attributedScope: EvidenceScopeAttribution? = nil

    var destination: AppDestination { .nutritionDay(dayId: id) }
}

/// `daily_totals` / a meal's own `totals` — the identical shape at both
/// the day level and the per-meal level on the web
/// (`nutritionDayEvidence.js`), so this one struct serves both rather than
/// two near-duplicate ones.
struct NutritionMacroTotals: Codable, Equatable {
    var calories: Double?
    var proteinG: Double?
    var carbsG: Double?
    var fatG: Double?
    var fiberG: Double?
}

/// A meal within a nutrition day — `meals[]` on the canonical evidence
/// object. `slot` mirrors the 4 fixed presentation slots
/// (`nutritionMealPresentation.js:8-41`); `name` is a genuine, distinct
/// field the web preserves separately from the slot (a free-text meal
/// name, when captured) — never conflated with `slot.label` here either.
struct NutritionMealRecord: Codable, Equatable, Identifiable {
    var id: String
    var slot: NutritionMealSlot
    var name: String?
    /// `"partial" | "complete"` — drives the templated completeness copy
    /// ("Meal identified." / "Partial meal identified."), matching
    /// `NutritionKnowledgeScreen.jsx`'s structured-field-driven copy, never
    /// a free-form LLM narrative (verified directly: Nutrition reporting
    /// carries no narrative/intelligence fields at all — see final report).
    var completeness: String
    var totals: NutritionMacroTotals
    var foods: [NutritionFoodRecord]
    var additionalFoodsDetected: Bool
}

/// The 4 fixed meal slots (`nutritionMealPresentation.js:8-41`) — a closed
/// set on the web (glyph + color per slot), unlike Training's freeform
/// execution variants.
enum NutritionMealSlot: String, Codable, Equatable {
    case breakfast, lunch, dinner, snacks

    var label: String {
        switch self {
        case .breakfast: "Breakfast"
        case .lunch: "Lunch"
        case .dinner: "Dinner"
        case .snacks: "Snacks"
        }
    }

    /// The literal glyphs `nutritionMealPresentation.js` uses — not SF
    /// Symbols, matching the web's own plain-character icons exactly.
    var glyph: String {
        switch self {
        case .breakfast: "☀"
        case .lunch: "◐"
        case .dinner: "☾"
        case .snacks: "•"
        }
    }
}

/// A food within a meal — `foods[]`. `servings`/`servingSize` are kept
/// separate (matching the canonical `serving_size`/`servings` fields)
/// rather than pre-joined into one display string, so the view controls
/// formatting the same way every other native read model keeps raw values
/// alongside (not instead of) server-formatted strings where both exist.
struct NutritionFoodRecord: Codable, Equatable, Identifiable {
    var id: String
    var name: String
    var brand: String?
    var servingSize: String?
    var servings: Double?
}
