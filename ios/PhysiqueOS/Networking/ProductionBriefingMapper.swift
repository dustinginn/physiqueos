import Foundation

/// Lossless JSON boundary for the cadence-discriminated Briefing contract.
/// The server intentionally returns a finished presentation for Weekly and
/// Midweek, while Monthly and event reads carry their frozen persisted
/// presentation/narrative. Keeping that union here prevents screens from
/// understanding transport metadata or re-running server business logic.
indirect enum BriefingJSONValue: Decodable, Sendable {
    case object([String: BriefingJSONValue])
    case array([BriefingJSONValue])
    case string(String)
    case number(Double)
    case bool(Bool)
    case null

    init(from decoder: Decoder) throws {
        let value = try decoder.singleValueContainer()
        if value.decodeNil() { self = .null }
        else if let object = try? value.decode([String: BriefingJSONValue].self) { self = .object(object) }
        else if let array = try? value.decode([BriefingJSONValue].self) { self = .array(array) }
        else if let string = try? value.decode(String.self) { self = .string(string) }
        else if let bool = try? value.decode(Bool.self) { self = .bool(bool) }
        else if let number = try? value.decode(Double.self) { self = .number(number) }
        else { throw DecodingError.dataCorruptedError(in: value, debugDescription: "Unsupported Briefing JSON value") }
    }

    subscript(_ key: String) -> BriefingJSONValue? {
        guard case .object(let object) = self else { return nil }
        return object[key]
    }

    var object: [String: BriefingJSONValue]? { if case .object(let value) = self { value } else { nil } }
    var array: [BriefingJSONValue] { if case .array(let value) = self { value } else { [] } }
    var string: String? {
        switch self {
        case .string(let value): value
        case .number(let value): value.formatted(.number.grouping(.never))
        default: nil
        }
    }
    var double: Double? {
        switch self {
        case .number(let value): value
        case .string(let value): Double(value)
        default: nil
        }
    }
    var int: Int? { double.map { Int($0) } }
    var bool: Bool? { if case .bool(let value) = self { value } else { nil } }
}

struct ProductionBriefingPayload: Decodable, Sendable {
    let value: BriefingJSONValue
    init(from decoder: Decoder) throws { value = try BriefingJSONValue(from: decoder) }
}

enum ProductionBriefingMapper {
    static func detail(_ root: BriefingJSONValue) throws -> BriefingReadModel? {
        if let cadence = root["artifact"]?["cadence"]?.string,
           let presentation = root["presentation"] {
            return try finishedDetail(root, cadence: cadence, presentation: presentation)
        }
        guard let artifact = root["artifact"], artifact.object != nil else { return nil }
        return try persistedDetail(artifact: artifact, context: root)
    }

    static func photoEvent(_ root: BriefingJSONValue) throws -> BriefingReadModel? {
        guard let narrative = root["narrative"], narrative.object != nil else { return nil }
        let artifactId = root["artifactId"]?.string ?? "photo-event"
        return try makeBase(
            id: artifactId,
            cadence: .event,
            generatedAt: narrative["generatedAt"]?.string ?? narrative["eventDate"]?.string ?? "",
            window: eventWindow(date: narrative["eventDate"]?.string),
            attribution: attribution(from: narrative["goalContext"], fallbackTitle: "Goal at publication"),
            confidence: confidence(from: narrative["goalConfidence"]),
            photo: photo(from: narrative, completion: root["completion"])
        )
    }

    private static func finishedDetail(
        _ root: BriefingJSONValue,
        cadence: String,
        presentation: BriefingJSONValue
    ) throws -> BriefingReadModel {
        guard let artifact = root["artifact"], let id = artifact["artifactId"]?.string else {
            throw ProductionNativeError.invalidResponse
        }
        let window = evidenceWindow(from: artifact["evidenceWindow"], publicationDate: artifact["publicationDate"]?.string)
        let attributionValue = root["goalPhaseAttribution"]
        if cadence == "weekly" {
            let hero = presentation["hero"]
            return try makeBase(
                id: id, cadence: .weekly,
                generatedAt: artifact["publicationDate"]?.string ?? "",
                window: window,
                attribution: attribution(from: attributionValue, fallbackTitle: hero?["goalLabel"]?.string ?? "Goal at publication"),
                confidence: confidence(from: hero?["confidence"]),
                weekly: weekly(from: presentation)
            )
        }
        guard cadence == "midweek" else { throw ProductionNativeError.invalidResponse }
        let activeGoal = presentation["activeGoal"]
        return try makeBase(
            id: id, cadence: .midweek,
            generatedAt: artifact["publicationDate"]?.string ?? "",
            window: window,
            attribution: attribution(from: attributionValue, fallbackTitle: activeGoal?["title"]?.string ?? activeGoal?["name"]?.string ?? "Goal at publication", phaseName: presentation["activePhase"]?["name"]?.string),
            confidence: confidence(from: presentation["goalConfidence"]),
            midweek: midweek(from: presentation, window: window)
        )
    }

    private static func persistedDetail(artifact: BriefingJSONValue, context: BriefingJSONValue) throws -> BriefingReadModel? {
        guard let id = artifact["id"]?.string else { throw ProductionNativeError.invalidResponse }
        let cadence = BriefingCadence(rawValue: artifact["cadence"]?.string ?? "") ?? .event
        let generatedAt = artifact["deliveryDate"]?.string ?? artifact["generatedAt"]?.string ?? artifact["createdAt"]?.string ?? ""
        let window = evidenceWindow(from: artifact["evidenceWindow"], publicationDate: generatedAt)
        let briefing = artifact["briefing"]
        let rawAttribution = artifact["goalContext"]
        let goalTitle = goalTitle(id: rawAttribution?["goalId"]?.string, in: context) ?? "Goal at publication"
        switch cadence {
        case .monthly:
            guard let presentation = briefing?["monthlyPresentation"] else { return nil }
            return try makeBase(
                id: id, cadence: .monthly, generatedAt: generatedAt, window: window,
                attribution: attribution(from: rawAttribution, fallbackTitle: presentation["hero"]?["goal"]?.string ?? goalTitle),
                confidence: confidence(from: presentation["hero"]?["confidence"]),
                monthly: monthly(from: presentation)
            )
        case .event:
            if let narrative = briefing?["dexaEventNarrative"] {
                return try makeBase(
                    id: id, cadence: .event, generatedAt: generatedAt, window: window,
                    attribution: attribution(from: rawAttribution, fallbackTitle: goalTitle),
                    confidence: confidence(from: narrative["goalConfidence"] ?? narrative["hero"]?["confidence"]),
                    dexa: dexa(from: narrative)
                )
            }
            if let narrative = briefing?["photoEventNarrative"] {
                return try makeBase(
                    id: id, cadence: .event, generatedAt: generatedAt, window: window,
                    attribution: attribution(from: rawAttribution, fallbackTitle: goalTitle),
                    confidence: confidence(from: narrative["goalConfidence"]),
                    photo: photo(from: narrative, completion: nil)
                )
            }
            return nil
        default:
            return nil
        }
    }

    private static func makeBase(
        id: String, cadence: BriefingCadence, generatedAt: String,
        window: BriefingEvidenceWindowReadModel,
        attribution: BriefingGoalAttribution,
        confidence: BriefingConfidenceReadModel?,
        weekly: WeeklyBriefingContent? = nil,
        midweek: MidweekBriefingContent? = nil,
        monthly: MonthlyBriefingContent? = nil,
        dexa: DEXABriefingContent? = nil,
        photo: PhotoBriefingContent? = nil
    ) throws -> BriefingReadModel {
        guard !id.isEmpty else { throw ProductionNativeError.invalidResponse }
        return BriefingReadModel(
            id: id,
            occurrence: .init(value: id),
            cadence: cadence,
            generatedAt: generatedAt,
            evidenceWindow: window,
            lifecycleState: .published,
            attribution: attribution,
            confidence: confidence,
            revisionProvenance: nil,
            replacedHistory: [],
            weekly: weekly,
            midweek: midweek,
            monthly: monthly,
            dexa: dexa,
            photo: photo
        )
    }

    private static func evidenceWindow(from value: BriefingJSONValue?, publicationDate: String?) -> BriefingEvidenceWindowReadModel {
        let start = value?["startDate"]?.string ?? value?["briefingMonth"]?.string ?? String((publicationDate ?? "").prefix(10))
        let end = value?["endDate"]?.string ?? start
        let delivery = value?["deliveryDate"]?.string ?? String((publicationDate ?? end).prefix(10))
        return .init(
            id: value?["id"]?.string ?? "briefing:\(start)",
            startDate: start,
            endDate: end,
            briefingDate: delivery,
            relativeLabel: value?["briefingMonth"]?.string ?? dateRange(start, end),
            timeZone: value?["timeZone"]?.string ?? "America/Los_Angeles"
        )
    }

    private static func eventWindow(date: String?) -> BriefingEvidenceWindowReadModel {
        let value = date ?? ""
        return .init(id: "event:\(value)", startDate: value, endDate: value, briefingDate: value, relativeLabel: value, timeZone: "America/Los_Angeles")
    }

    private static func attribution(from value: BriefingJSONValue?, fallbackTitle: String, phaseName: String? = nil) -> BriefingGoalAttribution {
        .init(
            goalId: value?["goalId"]?.string ?? "historical-goal",
            goalTitle: fallbackTitle,
            phaseId: value?["phaseId"]?.string,
            phaseName: phaseName
        )
    }

    private static func goalTitle(id: String?, in context: BriefingJSONValue) -> String? {
        guard let id else { return nil }
        return context["goals"]?.array.first(where: { $0["id"]?.string == id })?["title"]?.string
    }

    private static func confidence(from value: BriefingJSONValue?) -> BriefingConfidenceReadModel? {
        guard let value, let score = value["score"]?.int, let band = value["band"]?.string else { return nil }
        let rawMovement = value["movementDirection"]?.string ?? value["movement"]?.string ?? "initial"
        let movement: BriefingConfidenceReadModel.MovementDirection
        switch rawMovement {
        case "increased", "increase": movement = .increased
        case "decreased", "decrease": movement = .decreased
        case "held", "no_meaningful_change", "stable": movement = .held
        default: movement = .initial
        }
        return .init(
            score: score,
            band: band,
            priorScore: value["priorScore"]?.int,
            delta: value["delta"]?.int,
            movementDirection: movement,
            primaryReason: value["primaryReason"]?.string ?? value["presentationExplanation"]?.string ?? "",
            supportingReasons: strings(value["supportingReasons"]),
            limitingReasons: strings(value["limitingReasons"]),
            unresolvedUncertainty: strings(value["unresolvedUncertainty"]),
            goalId: value["goalId"]?.string ?? value["assessmentContext"]?["goalId"]?.string ?? "historical-goal",
            phaseId: value["phaseId"]?.string ?? value["assessmentContext"]?["phaseId"]?.string,
            capturedAt: value["assessmentDate"]?.string ?? value["assessmentTimestamp"]?.string ?? value["capturedAt"]?.string ?? "",
            source: value["source"]?.string ?? "canonical_pi_snapshot"
        )
    }

    private static func weekly(from value: BriefingJSONValue) -> WeeklyBriefingContent {
        let hero = value["hero"]
        let energy = value["energy"]
        let weight = value["weight"]
        let photos = value["photos"]
        let training = value["training"]
        let body = value["bodyComposition"]
        let coach = value["coachInsight"]
        let period = hero?["periodLabel"]?.string ?? "Completed week"
        let periodParts = period.split(separator: "\n", maxSplits: 1).map(String.init)
        return .init(
            periodLabel: periodParts.first ?? "Completed week",
            reportingRangeLabel: periodParts.count > 1 ? periodParts[1] : period,
            heroHeadline: hero?["headline"]?.string ?? "Weekly Briefing",
            heroBody: hero?["body"]?.string ?? "",
            strategyPhaseLabel: hero?["strategy"]?["name"]?.string,
            strategyWeekLabel: hero?["strategy"]?["weekLabel"]?.string,
            strategyNextMilestone: hero?["strategy"]?["reviewLabel"]?.string,
            energy: energy?.object == nil ? nil : .init(
                pairedDayCount: energy?["pairedDayCount"]?.int ?? 0,
                eligibleDayCount: energy?["eligibleDayCount"]?.int ?? 7,
                averageIntakeKcal: Int(energy?["averageIntake"]?.double ?? 0),
                averageExpenditureKcal: Int(energy?["averageExpenditure"]?.double ?? 0),
                averageBalanceKcal: Int(energy?["averageBalance"]?.double ?? 0),
                narrative: energy?["narrative"]?.string ?? "",
                dailyBalances: dailyEnergyPoints(energy?["days"])
            ),
            weight: weight?.object == nil ? nil : .init(
                averageWeightLb: weight?["weeklyAverage"]?.double ?? weight?["averageWeight"]?.double ?? 0,
                changeLb: weight?["change"]?.double ?? 0,
                narrative: weight?["narrative"]?.string ?? ""
            ),
            photos: photos?.object == nil ? nil : .init(narrative: photos?["narrative"]?.string ?? photos?["summary"]?.string ?? "", photoEventDestination: nil),
            training: training?.object == nil ? nil : trainingSection(training),
            bodyComposition: body?.object == nil ? nil : .init(
                scanDate: body?["date"]?.string ?? "",
                bodyFatPercent: measurement(body?["bodyFat"]?.double, suffix: "%"),
                leanMassLb: measurement(body?["leanMass"]?.double, suffix: " lb"),
                fatMassLb: measurement(body?["fatMass"]?.double, suffix: " lb"),
                objective: body?["objective"]?.string ?? "",
                narrative: body?["narrative"]?.string ?? ""
            ),
            coachTake: .init(
                biggestTakeaway: coach?["biggestWin"]?.string ?? "",
                recommendation: coach?["keepBuilding"]?.string ?? coach?["watchNextWeek"]?.string ?? "",
                intoNextWeek: strings(coach?["actionItems"])
            )
        )
    }

    private static func midweek(from value: BriefingJSONValue, window: BriefingEvidenceWindowReadModel) -> MidweekBriefingContent {
        let energy = value["energyBalance"]
        let training = value["training"]
        let coach = value["coachTake"]
        let energySection: WeeklyEnergySection? = energy?.object == nil ? nil : .init(
            pairedDayCount: energy?["pairedDayCount"]?.int ?? energy?["chartPoints"]?.array.count ?? 0,
            eligibleDayCount: energy?["eligibleDayCount"]?.int ?? 3,
            averageIntakeKcal: Int(energy?["averageIntake"]?.double ?? 0),
            averageExpenditureKcal: Int(energy?["averageExpenditure"]?.double ?? 0),
            averageBalanceKcal: Int(energy?["estimatedDailyBalanceMidpoint"]?.double ?? energy?["averageBalance"]?.double ?? 0),
            narrative: energy?["interpretation"]?.string ?? energy?["summary"]?.string ?? "",
            dailyBalances: dailyEnergyPoints(energy?["chartPoints"])
        )
        let coachNarrative = [coach?["biggestTakeaway"]?.string, coach?["recommendation"]?.string]
            .compactMap { $0 }
            .joined(separator: " ")
        return .init(
            reportingRangeLabel: dateRange(window.startDate, window.endDate),
            heroVerdict: value["hero"]?["verdict"]?.string ?? "Midweek Briefing",
            heroSummary: value["hero"]?["summary"]?.string ?? "",
            energy: energySection,
            weightContextNarrative: value["weightContext"]?["narrative"]?.string ?? value["weightContext"]?["summary"]?.string,
            trainingResponseNarrative: training?["interpretation"]?.string,
            training: training?.object == nil ? nil : trainingSection(training),
            bodyComposition: nil,
            coachTakeNarrative: coachNarrative,
            prioritiesThroughSunday: strings(value["prioritiesThroughSunday"])
        )
    }

    private static func trainingSection(_ value: BriefingJSONValue?) -> WeeklyTrainingSection {
        let status = value?["status"]
        return .init(
            comparableCategoryCount: value?["comparableCategoryCount"]?.int ?? 0,
            improvingCount: status?["improving"]?.int ?? 0,
            steadyCount: status?["stable"]?.int ?? status?["steady"]?.int ?? 0,
            narrative: value?["conclusion"]?.string ?? value?["interpretation"]?.string ?? "",
            headline: value?["title"]?.string,
            trainingDayCount: value?["trainingDayCount"]?.int,
            plateauingCount: status?["plateauing"]?.int,
            insufficientCount: value?["insufficientCount"]?.int,
            highlights: value?["highlights"]?.array.compactMap(trainingHighlight),
            priorityGroups: value?["priorityCategories"]?.array.compactMap(trainingPriority)
        )
    }

    private static func trainingHighlight(_ value: BriefingJSONValue) -> BriefingTrainingHighlight? {
        guard let id = value["canonicalExerciseId"]?.string ?? value["exerciseId"]?.string else { return nil }
        return .init(
            canonicalExerciseId: id,
            exerciseName: value["exerciseName"]?.string ?? value["label"]?.string ?? value["exercise"]?.string ?? "Exercise",
            recordType: value["recordType"]?.string ?? value["type"]?.string ?? "Performance",
            performanceValue: value["performanceValue"]?.string ?? value["value"]?.string,
            headline: value["headline"]?.string ?? value["detail"]?.string ?? "",
            detail: value["detail"]?.string ?? value["message"]?.string ?? "",
            delta: value["delta"]?.string ?? "",
            tone: value["tone"]?.string ?? "evidence"
        )
    }

    private static func trainingPriority(_ value: BriefingJSONValue) -> BriefingTrainingPriorityGroup? {
        guard let id = value["areaId"]?.string ?? value["categoryId"]?.string ?? value["id"]?.string else { return nil }
        return .init(
            areaId: id,
            label: value["label"]?.string ?? "Training area",
            statusLabel: value["statusLabel"]?.string ?? value["status"]?.string ?? "",
            comparableExerciseCount: value["comparableExerciseCount"]?.int ?? value["exerciseCount"]?.int ?? 0,
            tone: value["tone"]?.string ?? "evidence"
        )
    }

    private static func monthly(from value: BriefingJSONValue) -> MonthlyBriefingContent {
        let hero = value["hero"]
        let milestone = value["milestone"]
        let training = value["training"]
        let energy = value["energy"]
        let baseline = value["newBaseline"]
        let changes = value["changes"]?["themes"]?.array ?? []
        let moments = value["moments"]?["moments"]?.array ?? []
        let ahead = value["monthAhead"]
        let monthLabel = hero?["period"]?.string?.components(separatedBy: " · ").first ?? "Monthly"
        let factPairs: [(String, String)] = (baseline?["facts"]?.array ?? []).compactMap { item in
            guard let key = item["label"]?.string, let val = item["value"]?.string else { return nil }
            return (key.lowercased(), val)
        }
        let facts = Dictionary<String, String>(uniqueKeysWithValues: factPairs)
        let goalMilestone: MonthlyGoalMilestoneSection? = milestone?.object == nil ? nil : .init(
            title: [milestone?["label"]?.string, milestone?["goalName"]?.string].compactMap { $0 }.joined(separator: " · "),
            narrative: [milestone?["result"]?.string, milestone?["date"]?.string].compactMap { $0 }.joined(separator: " · "),
            destination: nil
        )
        let trainingProgress: MonthlyTrainingProgressSection? = training?.object == nil ? nil : .init(
            narrative: training?["summary"]?.string ?? "",
            stats: (training?["stats"]?.array ?? []).compactMap(stat),
            headline: training?["title"]?.string,
            highlights: nil,
            whyItMatters: training?["interpretation"]?.string ?? training?["next"]?.string
        )
        let weeks: [MonthlyEnergyEvolutionSection.WeekBar] = (energy?["weekly"]?.array ?? [])
            .filter { $0["missing"]?.bool != true }
            .map { week in
                .init(
                    weekLabel: week["label"]?.string ?? "Week",
                    averageIntakeKcal: week["intake"]?.int ?? 0,
                    averageExpenditureKcal: week["expenditure"]?.int ?? 0,
                    averageBalanceKcal: week["balance"]?.int,
                    coverageLabel: nil
                )
            }
        let energyEvolution: MonthlyEnergyEvolutionSection? = energy?.object == nil ? nil : .init(
            weeks: weeks,
            averageIntakeKcal: summaryMetric("Avg intake", in: energy),
            averageExpenditureKcal: summaryMetric("Avg expenditure", in: energy),
            averageBalanceKcal: summaryMetric("Avg balance", in: energy),
            headline: energy?["title"]?.string,
            phaseLabel: energy?["phaseLabel"]?.string,
            phaseDateLabel: energy?["phaseDates"]?.string,
            narrative: energy?["summary"]?.string,
            insight: energy?["whyItMatters"]?.string
        )
        let newBaseline: MonthlyNewBaselineSection? = baseline?.object == nil ? nil : .init(
            referenceDateLabel: facts["reference date"] ?? "",
            bodyFatPercent: facts["body fat"] ?? "—",
            leanMassLb: facts["lean mass"] ?? "—",
            fatMassLb: facts["fat mass"] ?? "—",
            narrative: baseline?["summary"]?.string ?? "",
            headline: baseline?["title"]?.string,
            interpretation: baseline?["callout"]?.string
        )
        let changedSections: [MonthlyChangeSection] = changes.compactMap { item in
            guard let domain = item["tone"]?.string ?? item["label"]?.string else { return nil }
            return .init(domain: domain, title: item["label"]?.string ?? "Update", headline: item["title"]?.string ?? "", narrative: item["body"]?.string ?? "", tone: item["tone"]?.string ?? "primary")
        }
        let momentDetails: [MonthlyDefiningMoment] = moments.compactMap { item in
            guard let date = item["date"]?.string, let title = item["label"]?.string else { return nil }
            return .init(dateLabel: date, title: title, narrative: item["body"]?.string ?? "", icon: "calendar")
        }
        let actions: [MonthlyActionCard] = (ahead?["guidance"]?.array ?? []).enumerated().map { index, item in
            .init(domain: item["tone"]?.string ?? "action-\(index)", title: item["label"]?.string ?? "Next", narrative: item["detail"]?.string ?? item["value"]?.string ?? "", icon: "target")
        }
        return .init(
            monthLabel: monthLabel,
            heroHeadline: hero?["title"]?.string ?? "Monthly Briefing",
            heroBody: hero?["thesis"]?.string ?? "",
            heroGoalLabel: hero?["goal"]?.string ?? "Goal at publication",
            goalMilestone: goalMilestone,
            trainingProgress: trainingProgress,
            energyEvolution: energyEvolution,
            newBaseline: newBaseline,
            whatChanged: changes.compactMap { $0["body"]?.string },
            definingMoments: moments.compactMap { item in
                guard let label = item["date"]?.string, let value = item["label"]?.string else { return nil }
                return .init(label: label, value: value)
            },
            monthAhead: (ahead?["guidance"]?.array ?? []).compactMap { $0["detail"]?.string },
            whatChangedSections: changedSections,
            definingMomentDetails: momentDetails,
            monthAheadIntroduction: ahead?["thesis"]?.string,
            monthAheadActions: actions
        )
    }

    private static func dexa(from value: BriefingJSONValue) -> DEXABriefingContent {
        let snapshot = value["snapshot"]
        let progress = value["progress"]
        let timeline = progress?["timeline"]
        let interpretation = value["interpretation"]
        let coach = value["coachInsight"]
        return .init(
            scanId: value["scanId"]?.string ?? snapshot?["scanId"]?.string ?? "scan",
            priorScanId: value["priorScanId"]?.string,
            scanDate: snapshot?["scanDate"]?.string ?? value["eventDate"]?.string ?? "",
            priorScanDate: value["priorScanDate"]?.string,
            daysBetweenScans: snapshot?["daysBetweenScans"]?.int ?? value["daysBetweenScans"]?.int ?? 0,
            hero: .init(
                title: value["hero"]?["title"]?.string ?? "DEXA Event Briefing",
                body: value["hero"]?["body"]?.string ?? "",
                results: (value["hero"]?["results"]?.array ?? []).compactMap { item in
                    guard let label = item["label"]?.string else { return nil }
                    return .init(emoji: item["emoji"]?.string ?? "", label: label, value: item["value"]?.string ?? measurement(item["value"]?.double, suffix: item["unit"]?.string.map { " \($0)" } ?? ""), context: item["context"]?.string ?? "")
                },
                milestones: (value["milestones"]?.array ?? []).compactMap { $0["label"]?.string ?? $0["title"]?.string }
            ),
            snapshot: .init(
                scanDate: snapshot?["scanDate"]?.string ?? "",
                daysBetweenScans: snapshot?["daysBetweenScans"]?.int ?? 0,
                weightLb: metricText(snapshot?["weight"], suffix: " lb"),
                bodyFatPercent: metricText(snapshot?["bodyFat"] ?? snapshot?["bodyFatPercentage"], suffix: "%"),
                fatMassLb: metricText(snapshot?["fatMass"], suffix: " lb"),
                leanMassLb: metricText(snapshot?["leanMass"], suffix: " lb"),
                restingMetabolicRateKcal: optionalMetricText(snapshot?["rmr"] ?? snapshot?["restingMetabolicRate"], suffix: " kcal")
            ),
            progress: .init(
                headline: comparisons(progress?["headline"]),
                regionalFat: regional(progress?["regionalFat"]),
                regionalLean: regional(progress?["regionalLean"]),
                supplemental: comparisons(progress?["supplemental"]),
                timeline: .init(
                    timelineLabel: timeline?["label"]?.string ?? timeline?["timelineLabel"]?.string ?? "Body-composition timeline",
                    isSimulated: timeline?["simulated"]?.bool ?? false,
                    baselineDate: timeline?["scans"]?.array.first?["date"]?.string ?? "",
                    currentDate: timeline?["scans"]?.array.last?["date"]?.string ?? "",
                    elapsedDays: timeline?["elapsedDays"]?.int ?? 0,
                    scans: timeline?["scans"]?.array.compactMap(timelinePoint) ?? [],
                    metrics: (timeline?["metrics"]?.array ?? []).compactMap(timelineMetric),
                    summary: timeline?["summaryText"]?.string ?? interpretation?["opening"]?.string ?? ""
                )
            ),
            interpretation: .init(
                opening: interpretation?["opening"]?.string ?? "",
                fatLoss: interpretation?["fatLoss"]?.string ?? "",
                leanMass: interpretation?["leanMass"]?.string ?? "",
                regional: interpretation?["regional"]?.string ?? "",
                phaseMeaning: interpretation?["phaseMeaning"]?.string,
                stoodOut: interpretation?["stoodOut"]?.string,
                supportingEvidence: interpretation?["supportingEvidence"]?.string ?? "",
                uncertainty: interpretation?["uncertainty"]?.string ?? "",
                goalProgress: interpretation?["goalProgress"]?.string,
                guardrailStatus: interpretation?["guardrailStatus"]?.string
            ),
            coachInsight: .init(
                biggestWin: coach?["biggestWin"]?.string ?? "",
                protect: coach?["protect"]?.string ?? "",
                watch: coach?["watch"]?.string ?? "",
                next: coach?["next"]?.string ?? ""
            ),
            phaseReview: nil,
            goalCompletionHandoff: nil,
            semanticGoalType: value["semanticGoalType"]?.string
        )
    }

    private static func photo(from value: BriefingJSONValue, completion: BriefingJSONValue?) -> PhotoBriefingContent {
        let cards = value["cardContent"]
        let views = value["activeViews"]?.array ?? []
        let eventDate = value["eventDate"]?.string ?? ""
        return .init(
            photoSessionId: value["photoSessionId"]?.string ?? "photo-session",
            eventDate: eventDate,
            completionLabel: value["completion"]?.string ?? "Photo set",
            weightLabel: value["supportingEvidence"]?["weight"]?.string ?? "—",
            poseLabels: strings(cards?["snapshot"]?["poses"]),
            conditionsSummary: cards?["snapshot"]?["conditions"]?.string ?? "",
            activeViews: views.compactMap { item in
                guard let id = item["id"]?.string, let poseRaw = item["poseId"]?.string,
                      let pose = PhotoPoseID(rawValue: poseRaw) else { return nil }
                return .init(
                    id: id, poseId: pose,
                    setId: value["photoSessionId"]?.string ?? "photo-session",
                    captureDate: eventDate,
                    headline: item["headline"]?.string ?? "",
                    supportingObservations: strings(item["supportingObservations"]),
                    comparisonStatus: item["comparisonStatus"]?.string ?? "unknown",
                    establishesBaseline: item["establishesBaseline"]?.bool ?? false,
                    goalRelevance: item["goalRelevance"]?.string ?? "supporting",
                    mediaId: item["media"]?["mediaId"]?.string
                )
            },
            heroTitle: cards?["hero"]?["title"]?.string ?? "Photo Event Briefing",
            heroBody: cards?["hero"]?["body"]?.string ?? "",
            snapshotTitle: cards?["snapshot"]?["title"]?.string ?? "Snapshot",
            progressTitle: cards?["progress"]?["title"]?.string ?? "Progress",
            progressBody: cards?["progress"]?["body"]?.string ?? "",
            ordinaryComparisons: (cards?["progress"]?["comparisons"]?.array ?? []).compactMap { item in photoComparison(item, eventDate: eventDate) },
            interpretationTitle: cards?["interpretation"]?["title"]?.string ?? "Interpretation",
            interpretationParagraphs: strings(cards?["interpretation"]?["paragraphs"]),
            coachInsightBody: cards?["coachInsight"]?["body"]?.string ?? "",
            nextMilestoneLabel: value["nextMilestone"]?["label"]?.string,
            completionExperience: photoCompletion(from: value["completionExperience"], completed: completion)
        )
    }

    private static func photoComparison(_ item: BriefingJSONValue, eventDate: String) -> PhotoComparisonEntry? {
        guard let id = item["id"]?.string,
              let poseRaw = item["poseId"]?.string,
              let pose = PhotoPoseID(rawValue: poseRaw) else { return nil }
        return .init(
            id: id, poseId: pose,
            priorSetId: item["previousSessionId"]?.string,
            priorDate: item["previousDate"]?.string,
            currentSetId: item["photoSessionId"]?.string ?? "",
            currentDate: eventDate,
            roleLabel: nil,
            narrative: item["headline"]?.string ?? strings(item["supportingObservations"]).first ?? "",
            priorMediaId: item["previousMedia"]?["mediaId"]?.string,
            currentMediaId: item["media"]?["mediaId"]?.string
        )
    }

    private static func photoCompletion(from value: BriefingJSONValue?, completed: BriefingJSONValue?) -> PhotoCompletionExperience? {
        guard let value, value.object != nil else { return nil }
        let recent = (value["recentComparisons"]?.array ?? []).compactMap { photoComparison($0, eventDate: $0["currentDate"]?.string ?? "") }
        let journey = (value["journeyComparisons"]?.array ?? []).compactMap { photoComparison($0, eventDate: $0["currentDate"]?.string ?? "") }
        let baselines = (value["newBaselineViews"]?.array ?? []).compactMap { item -> PhotoNewBaselineEntry? in
            guard let id = item["id"]?.string, let raw = item["poseId"]?.string, let pose = PhotoPoseID(rawValue: raw) else { return nil }
            return .init(id: id, poseId: pose, narrative: item["baselineNarrative"]?.string ?? "")
        }
        let decisionValue = value["userDecision"]
        let state: PhotoCompletionDecisionState = completed?.object != nil ? .completed : (decisionValue?.object != nil ? .awaitingDecision : .retry)
        return .init(
            recentComparisons: recent,
            journeyComparisons: journey,
            newBaselines: baselines,
            decision: .init(
                state: state,
                nextGoalTitle: value["nextGoalPreview"]?["title"]?.string,
                nextGoalActionLabel: value["nextGoalPreview"]?["actionLabel"]?.string,
                question: decisionValue?["question"]?.string,
                completeActionLabel: nil,
                keepOpenActionLabel: nil,
                keepOpenDestination: nil,
                retryQuestion: nil,
                retryActionLabel: nil,
                retryDestination: nil
            )
        )
    }

    private static func dailyEnergyPoints(_ value: BriefingJSONValue?) -> [BriefingDailyEnergyPoint]? {
        let points = value?.array.compactMap { item -> BriefingDailyEnergyPoint? in
            guard let date = item["date"]?.string else { return nil }
            return .init(
                date: date,
                intakeKcal: item["intake"]?.int ?? item["intakeKcal"]?.int,
                expenditureKcal: item["expenditure"]?.int ?? item["expenditureKcal"]?.int,
                hasPairedData: item["complete"]?.bool ?? item["hasPairedData"]?.bool ?? false
            )
        } ?? []
        return points.isEmpty ? nil : points
    }

    private static func stat(_ value: BriefingJSONValue) -> BriefingStat? {
        guard let label = value["label"]?.string else { return nil }
        return .init(label: label, value: value["value"]?.string ?? "")
    }

    private static func summaryMetric(_ label: String, in energy: BriefingJSONValue?) -> Int {
        energy?["summaryMetrics"]?.array.first(where: { $0["label"]?.string == label })?["value"]?.int ?? 0
    }

    private static func comparisons(_ value: BriefingJSONValue?) -> [DEXAComparisonMetric] {
        value?.array.compactMap { item in
            guard let label = item["label"]?.string else { return nil }
            let suffix = item["unit"]?.string.map { $0 == "%" ? "%" : " \($0)" } ?? ""
            return .init(label: label, previous: metricText(item["previous"], suffix: suffix), current: metricText(item["current"], suffix: suffix), delta: metricText(item["delta"], suffix: suffix))
        } ?? []
    }

    private static func regional(_ value: BriefingJSONValue?) -> [DEXARegionalChangeMetric] {
        value?.array.compactMap { item in
            guard let region = item["region"]?.string ?? item["label"]?.string else { return nil }
            return .init(region: region, previous: metricText(item["previous"], suffix: " lb"), current: metricText(item["current"], suffix: " lb"), delta: metricText(item["delta"], suffix: " lb"))
        } ?? []
    }

    private static func timelinePoint(_ value: BriefingJSONValue) -> DEXATimelinePoint? {
        guard let id = value["scanId"]?.string ?? value["id"]?.string, let date = value["date"]?.string else { return nil }
        return .init(scanId: id, date: date, value: metricText(value["value"] ?? value["bodyFat"], suffix: ""))
    }

    private static func timelineMetric(_ value: BriefingJSONValue) -> DEXATimelineMetricTrack? {
        guard let label = value["label"]?.string ?? value["key"]?.string else { return nil }
        return .init(
            label: label,
            unit: value["unit"]?.string ?? "",
            points: value["points"]?.array.compactMap(timelinePoint) ?? [],
            delta: metricText(value["delta"], suffix: "")
        )
    }

    private static func metricText(_ value: BriefingJSONValue?, suffix: String) -> String {
        if let string = value?.string, value?.double == nil { return string }
        return measurement(value?.double, suffix: suffix)
    }

    private static func optionalMetricText(_ value: BriefingJSONValue?, suffix: String) -> String? {
        guard value != nil, value?.object != nil || value?.double != nil || value?.string != nil else { return nil }
        return metricText(value, suffix: suffix)
    }

    private static func measurement(_ value: Double?, suffix: String) -> String {
        guard let value else { return "—" }
        let formatted = value.rounded() == value ? String(Int(value)) : String(format: "%.1f", value)
        return formatted + suffix
    }

    private static func strings(_ value: BriefingJSONValue?) -> [String] {
        value?.array.compactMap(\.string) ?? []
    }

    private static func dateRange(_ start: String, _ end: String) -> String {
        guard !start.isEmpty else { return "" }
        return start == end ? start : "\(start)–\(end)"
    }
}
