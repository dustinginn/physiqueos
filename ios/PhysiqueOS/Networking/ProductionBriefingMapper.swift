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
    var literalString: String? { if case .string(let value) = self { value } else { nil } }
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
            confidence: try confidence(from: narrative["goalConfidence"]),
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
                confidence: try confidence(from: hero?["confidence"]),
                weekly: weekly(from: presentation)
            )
        }
        guard cadence == "midweek" else { throw ProductionNativeError.invalidResponse }
        let activeGoal = presentation["activeGoal"]
        let midweek = try midweek(from: presentation, window: window,
                                  artifactId: id)
        let midweekConfidence = midweek.presentationContract == nil
            ? try confidence(from: presentation["goalConfidence"])
            : try confidence(
                from: midweek.presentationContract?.lead.confidence,
                goalId: attributionValue?["goalId"]?.string ??
                    "historical-goal",
                phaseId: attributionValue?["phaseId"]?.string
            )
        return try makeBase(
            id: id, cadence: .midweek,
            generatedAt: artifact["publicationDate"]?.string ?? "",
            window: window,
            attribution: attribution(from: attributionValue, fallbackTitle: activeGoal?["title"]?.string ?? activeGoal?["name"]?.string ?? "Goal at publication", phaseName: presentation["activePhase"]?["name"]?.string),
            confidence: midweekConfidence,
            midweek: midweek
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
                confidence: try confidence(from: presentation["hero"]?["confidence"]),
                monthly: monthly(from: presentation, strategicSummaryV3: briefing?["monthlyNarrative"]?["strategicSummaryV3"])
            )
        case .event:
            if let narrative = briefing?["dexaEventNarrative"] {
                return try makeBase(
                    id: id, cadence: .event, generatedAt: generatedAt, window: window,
                    attribution: attribution(from: rawAttribution, fallbackTitle: goalTitle),
                    confidence: try confidence(from: narrative["goalConfidence"] ?? narrative["hero"]?["confidence"]),
                    dexa: dexa(from: narrative)
                )
            }
            if let narrative = briefing?["photoEventNarrative"] {
                return try makeBase(
                    id: id, cadence: .event, generatedAt: generatedAt, window: window,
                    attribution: attribution(from: rawAttribution, fallbackTitle: goalTitle),
                    confidence: try confidence(from: narrative["goalConfidence"]),
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

    private static func confidence(from value: BriefingJSONValue?) throws -> BriefingConfidenceReadModel? {
        guard let value, let score = value["score"]?.int, let band = value["band"]?.string else { return nil }
        let rawMovement = value["movementDirection"]?.string ?? value["movement"]?.string ?? "initial"
        let movement: BriefingConfidenceReadModel.MovementDirection
        switch rawMovement {
        case "increased", "increase": movement = .increased
        case "decreased", "decrease": movement = .decreased
        case "held", "no_meaningful_change", "stable": movement = .held
        default: movement = .initial
        }
        let presentationExplanation = value["presentationExplanation"]?.string
            ?? value["explanationModel"]?["summary"]?.string
        let presentationMovementLabel = value["movementLabel"]?.string
            ?? value["explanationModel"]?["movementLabel"]?.string
        guard let presentationExplanation, !presentationExplanation.isEmpty,
              let presentationMovementLabel, !presentationMovementLabel.isEmpty else {
            throw ProductionNativeError.invalidResponse
        }
        let supporting = factorTexts(value["explanationModel"]?["supportingFactors"])
        let limiting = factorTexts(value["explanationModel"]?["limitingFactors"])
        let uncertainty = factorTexts(value["unresolvedUncertainty"])
        let decisive = factorTexts(value["explanationModel"]?["nextDecisiveEvidence"])
        let historical = value["explanationModel"]?["historicalContext"]?["summary"]?.string
            ?? value["explanationModel"]?["historicalContext"]?["text"]?.string
        return .init(
            score: score,
            band: band,
            priorScore: value["priorScore"]?.int,
            delta: value["delta"]?.int,
            movementDirection: movement,
            primaryReason: presentationExplanation,
            supportingReasons: supporting.isEmpty ? strings(value["supportingReasons"]) : supporting,
            limitingReasons: limiting.isEmpty ? strings(value["limitingReasons"]) : limiting,
            unresolvedUncertainty: uncertainty,
            goalId: value["goalId"]?.string ?? value["assessmentContext"]?["goalId"]?.string ?? "historical-goal",
            phaseId: value["phaseId"]?.string ?? value["assessmentContext"]?["phaseId"]?.string,
            capturedAt: value["assessmentDate"]?.string ?? value["assessmentTimestamp"]?.string ?? value["capturedAt"]?.string ?? "",
            source: value["source"]?.string ?? "canonical_pi_snapshot",
            presentationExplanation: presentationExplanation,
            presentationMovementLabel: presentationMovementLabel,
            nextDecisiveEvidence: decisive,
            historicalContext: historical
        )
    }

    private static func weekly(from value: BriefingJSONValue) -> WeeklyBriefingContent {
        let isCanonicalV3 = value["presentationModel"]?.literalString == canonicalNarrativeV3
        let hero = value["hero"]
        let energy = value["energy"]
        let weight = value["weight"]
        let photos = value["photos"]
        let training = value["training"]
        let body = value["bodyComposition"]
        let coach = value["coachInsight"]
        let period = hero?["periodLabel"]?.string ?? "Completed week"
        let periodParts = period.split(separator: "\n", maxSplits: 1).map(String.init)
        let energySection: WeeklyEnergySection?
        if let averageIntakeValue = energy?["averageIntake"]?.double,
           let averageExpenditureValue = energy?["averageExpenditure"]?.double {
            let averageIntake = Int(averageIntakeValue.rounded())
            let averageExpenditure = Int(averageExpenditureValue.rounded())
            let energyDays = energy?["chart"]?["points"]?.array ?? energy?["days"]?.array ?? []
            let pairedDayCount = energy?["pairedDayCount"]?.int ?? energyDays.filter { $0["complete"]?.bool == true }.count
            let eligibleDayCount = energy?["eligibleDayCount"]?.int ?? energyDays.count
            let averageBalance = energy?["averageBalance"]?.double.map { Int($0.rounded()) } ?? (averageIntake - averageExpenditure)
            let narrative = energy?["narrative"]?.string ?? ""
            let dailyBalances = dailyEnergyPoints(energy?["chart"]?["points"] ?? energy?["days"])
            let headline = energy?["headline"]?.string ?? energy?["title"]?.string
            let balanceHeadline = energy?["balanceHeadline"]?.string ?? energy?["primaryResult"]?.string
            let comparisonNarrative = energy?["comparisonNarrative"]?.string ?? energy?["comparison"]?["narrative"]?.string
            let methodology = energy?["methodology"]?.string ?? energy?["methodologyNote"]?.string
            energySection = WeeklyEnergySection(
                pairedDayCount: pairedDayCount,
                eligibleDayCount: eligibleDayCount,
                averageIntakeKcal: averageIntake,
                averageExpenditureKcal: averageExpenditure,
                averageBalanceKcal: averageBalance,
                narrative: narrative,
                dailyBalances: dailyBalances,
                headline: headline,
                balanceHeadline: balanceHeadline,
                comparisonNarrative: comparisonNarrative,
                methodology: methodology,
                canonicalV3: isCanonicalV3 ? energyStrategy(value["energyStrategy"]) : nil
            )
        } else {
            energySection = nil
        }
        let weightSection: WeeklyWeightSection?
        if let averageWeight = weight?["weeklyAverage"]?.double ?? weight?["averageWeight"]?.double {
            weightSection = .init(
                averageWeightLb: averageWeight,
                changeLb: weight?["change"]?.double ?? weight?["changeFromPriorComparable"]?.double ?? 0,
                narrative: weight?["narrative"]?.string ?? ""
            )
        } else {
            weightSection = nil
        }
        let photosSection: WeeklyPhotosSection? = photos?.object == nil ? nil : .init(
            narrative: photos?["narrative"]?.string ?? photos?["summary"]?.string ?? "",
            photoEventDestination: nil
        )
        let trainingReadModel: WeeklyTrainingSection? = training?.object == nil ? nil : trainingSection(training)
        let bodySection: WeeklyBodyCompositionSection? = body?.object == nil ? nil : .init(
            scanDate: body?["date"]?.string ?? "",
            bodyFatPercent: measurement(body?["bodyFat"]?.double, suffix: "%"),
            leanMassLb: measurement(body?["leanMass"]?.double, suffix: " lb"),
            fatMassLb: measurement(body?["fatMass"]?.double, suffix: " lb"),
            objective: body?["objective"]?.string ?? "",
            narrative: body?["narrative"]?.string ?? ""
        )
        return WeeklyBriefingContent(
            periodLabel: periodParts.first ?? "Completed week",
            reportingRangeLabel: periodParts.count > 1 ? periodParts[1] : period,
            heroHeadline: hero?["headline"]?.string ?? "Weekly Briefing",
            heroBody: hero?["body"]?.string ?? "",
            strategyPhaseLabel: hero?["strategy"]?["name"]?.string,
            strategyWeekLabel: hero?["strategy"]?["weekLabel"]?.string,
            strategyNextMilestone: hero?["strategy"]?["reviewLabel"]?.string,
            energy: energySection,
            weight: weightSection,
            photos: photosSection,
            training: trainingReadModel,
            bodyComposition: bodySection,
            coachTake: .init(
                biggestTakeaway: coach?["biggestWin"]?.string ?? "",
                recommendation: coach?["keepBuilding"]?.string ?? coach?["watchNextWeek"]?.string ?? "",
                intoNextWeek: strings(coach?["actionItems"])
            ),
            uncertainty: isCanonicalV3 ? uncertaintyItems(value["uncertainty"]) : nil
        )
    }

    private static func midweek(from value: BriefingJSONValue,
                                window: BriefingEvidenceWindowReadModel,
                                artifactId: String) throws -> MidweekBriefingContent {
        let narrativeV3: CanonicalNarrativeV3ReadModel?
        if value["presentationModel"]?.string == canonicalNarrativeV3 {
            let narrative = value["narrativeV3"]
            guard
                let summary = nonEmptyString(narrative?["summary"]),
                let result = nonEmptyString(narrative?["sections"]?["result"]),
                let meaning = nonEmptyString(narrative?["sections"]?["meaning"]),
                let action = nonEmptyString(narrative?["sections"]?["action"]),
                let watch = nonEmptyString(narrative?["sections"]?["watch"]),
                let confidence = nonEmptyString(narrative?["sections"]?["confidence"]),
                let coachTake = nonEmptyString(narrative?["coachTake"])
            else { throw ProductionNativeError.invalidResponse }
            narrativeV3 = .init(
                summary: summary, detail: nonEmptyString(narrative?["detail"]), result: result, meaning: meaning,
                action: action, watch: watch, confidence: confidence, coachTake: coachTake
            )
        } else {
            narrativeV3 = nil
        }
        let energy = value["energyBalance"]
        let training = value["training"]
        let coach = value["coachTake"]
        let intake = energy?["averageIntake"]?.int ?? energy?["comparison"]?["averageIntake"]?.int
        let expenditure = energy?["estimatedAverageExpenditure"]?.int ?? energy?["comparison"]?["averageExpenditure"]?.int
        let balance = energy?["estimatedDailyBalanceMidpoint"]?.int ?? energy?["estimatedAverageDailyBalance"]?.int ?? energy?["comparison"]?["averageBalance"]?.int
        let energySection: WeeklyEnergySection? = intake == nil || expenditure == nil || balance == nil ? nil : .init(
            pairedDayCount: energy?["comparableDays"]?.int ?? energy?["chartPoints"]?.array.filter { $0["complete"]?.bool == true }.count ?? 0,
            eligibleDayCount: energy?["chartPoints"]?.array.count ?? 0,
            averageIntakeKcal: intake!,
            averageExpenditureKcal: expenditure!,
            averageBalanceKcal: balance!,
            narrative: energy?["interpretation"]?.string ?? "",
            dailyBalances: dailyEnergyPoints(energy?["chartPoints"]),
            headline: energy?["headline"]?.string,
            balanceHeadline: energy?["balanceHeadline"]?.string,
            comparisonNarrative: energy?["comparisonNarrative"]?.string,
            methodology: energy?["rmrProvenance"]?["strategy"]?.string,
            chartTitle: energy?["chartTitle"]?.string
        )
        let weight = value["weightContext"]
        let body = value["bodyComposition"]
        let bodyScan = body?["newScan"] ?? body?["baseline"]
        let weightSection: WeeklyWeightSection?
        if let averageWeight = weight?["averageWeight"]?.double {
            weightSection = .init(
                averageWeightLb: averageWeight,
                changeLb: weight?["changeFromPriorComparable"]?.double ?? 0,
                narrative: weight?["interpretation"]?.string ?? ""
            )
        } else {
            weightSection = nil
        }
        let trainingReadModel: WeeklyTrainingSection? = training?.object == nil ? nil : trainingSection(training)
        let bodySection: WeeklyBodyCompositionSection? = bodyScan?.object == nil ? nil : .init(
            scanDate: bodyScan?["date"]?.string ?? "",
            bodyFatPercent: measurement(bodyScan?["bodyFatPercentage"]?.double ?? bodyScan?["bodyFat"]?.double, suffix: "%"),
            leanMassLb: measurement(bodyScan?["leanMass"]?.double, suffix: " lb"),
            fatMassLb: measurement(bodyScan?["fatMass"]?.double, suffix: " lb"),
            objective: body?["objective"]?.string ?? "",
            narrative: body?["interpretation"]?.string ?? ""
        )
        let contract = try midweekPresentationContract(
            value["presentationContract"], artifactId: artifactId
        )
        return MidweekBriefingContent(
            reportingRangeLabel: dateRange(window.startDate, window.endDate),
            heroVerdict: value["hero"]?["verdict"]?.string ?? "Midweek Briefing",
            heroSummary: value["hero"]?["summary"]?.string ?? "",
            energy: energySection,
            weightContextNarrative: weight?["interpretation"]?.string ?? weight?["narrative"]?.string ?? weight?["summary"]?.string,
            trainingResponseNarrative: training?["interpretation"]?.string,
            weight: weightSection,
            training: trainingReadModel,
            bodyComposition: bodySection,
            coachTakeNarrative: coach?["biggestTakeaway"]?.string ?? "",
            coachRecommendation: coach?["recommendation"]?.string,
            prioritiesThroughSunday: strings(value["prioritiesThroughSunday"]),
            narrativeV3: narrativeV3,
            uncertainty: narrativeV3 == nil ? nil : uncertaintyItems(value["uncertainty"] ?? value["narrativeV3"]?["uncertainty"]),
            presentationContract: contract
        )
    }

    private static func midweekPresentationContract(
        _ value: BriefingJSONValue?, artifactId: String
    ) throws -> MidweekPresentationContract? {
        guard let value else { return nil }
        guard value["schemaVersion"]?.literalString ==
                MidweekPresentationContract.schemaVersion,
              value["artifactId"]?.literalString == artifactId,
              let headline = nonEmptyString(value["lead"]?["headline"])
        else { throw ProductionNativeError.invalidResponse }
        let assessmentId = nonEmptyString(value["assessmentId"])

        let confidenceValue = value["lead"]?["confidence"]
        let confidence: MidweekPresentationContract.Lead.Confidence?
        if confidenceValue?.object != nil {
            guard let claimId = nonEmptyString(confidenceValue?["claimId"]),
                  let boundAssessmentId = nonEmptyString(
                    confidenceValue?["assessmentId"]),
                  assessmentId != nil, boundAssessmentId == assessmentId,
                  let score = confidenceValue?["score"]?.int,
                  let band = nonEmptyString(confidenceValue?["band"]),
                  let movement = nonEmptyString(confidenceValue?["movement"]),
                  let movementDirection = nonEmptyString(
                    confidenceValue?["movementDirection"]),
                  let movementLabel = nonEmptyString(
                    confidenceValue?["movementLabel"])
            else { throw ProductionNativeError.invalidResponse }
            confidence = .init(
                claimId: claimId, assessmentId: boundAssessmentId,
                score: score, band: band, movement: movement,
                movementDirection: movementDirection,
                delta: confidenceValue?["delta"]?.int,
                reason: nonEmptyString(confidenceValue?["reason"]),
                movementLabel: movementLabel
            )
        } else {
            confidence = nil
        }

        let modules = try (value["modules"]?.array ?? []).map { item in
            guard let id = nonEmptyString(item["id"]),
                  let payloadKey = nonEmptyString(item["payloadKey"]),
                  let included = item["included"]?.bool,
                  let reasonCode = nonEmptyString(item["reasonCode"]),
                  let order = item["order"]?.int
            else { throw ProductionNativeError.invalidResponse }
            return MidweekPresentationContract.Module(
                id: id, payloadKey: payloadKey, included: included,
                reasonCode: reasonCode, order: order,
                pairedDayCount: item["pairedDayCount"]?.int,
                chartIncluded: item["chartIncluded"]?.bool,
                chartReason: item["chartReason"]?.literalString,
                observationCount: item["observationCount"]?.int
            )
        }
        let allowedModules = Set([
            "energy", "weight", "body_composition", "training", "recovery"
        ])
        guard !modules.isEmpty,
              Set(modules.map(\.id)).count == modules.count,
              modules.allSatisfy({ allowedModules.contains($0.id) }),
              modules.map(\.order) == modules.map(\.order).sorted()
        else { throw ProductionNativeError.invalidResponse }

        let coaching = try (value["coaching"]?.array ?? []).map { item in
            guard let section = nonEmptyString(item["section"]),
                  let label = nonEmptyString(item["label"]),
                  let claimId = nonEmptyString(item["claimId"]),
                  let text = nonEmptyString(item["text"])
            else { throw ProductionNativeError.invalidResponse }
            return MidweekPresentationContract.CoachingItem(
                section: section, label: label, claimId: claimId, text: text
            )
        }
        guard Set(coaching.map(\.claimId)).count == coaching.count
        else { throw ProductionNativeError.invalidResponse }

        let uncertainty = MidweekPresentationContract.Uncertainty(
            visibleItems: uncertaintyItems(
                value["uncertainty"]?["visibleItems"]),
            coveredIds: strings(value["uncertainty"]?["coveredIds"])
        )
        return .init(
            artifactId: artifactId, assessmentId: assessmentId,
            lead: .init(
                headlineClaimId: value["lead"]?["headlineClaimId"]?.literalString,
                headline: headline,
                meaningClaimId: value["lead"]?["meaningClaimId"]?.literalString,
                meaning: nonEmptyString(value["lead"]?["meaning"]),
                confidence: confidence
            ),
            modules: modules, coaching: coaching, uncertainty: uncertainty
        )
    }

    private static func confidence(
        from value: MidweekPresentationContract.Lead.Confidence?,
        goalId: String, phaseId: String?
    ) throws -> BriefingConfidenceReadModel? {
        guard let value else { return nil }
        let movement: BriefingConfidenceReadModel.MovementDirection
        switch value.movementDirection {
        case "increased", "increase": movement = .increased
        case "decreased", "decrease": movement = .decreased
        case "held", "no_meaningful_change", "stable": movement = .held
        default: movement = .initial
        }
        guard let movementLabel = value.movementLabel,
              !movementLabel.isEmpty else { return nil }
        let reason = value.reason ?? ""
        return .init(
            score: value.score, band: value.band, priorScore: nil,
            delta: value.delta, movementDirection: movement,
            primaryReason: reason, supportingReasons: [], limitingReasons: [],
            unresolvedUncertainty: [], goalId: goalId, phaseId: phaseId,
            capturedAt: "", source: MidweekPresentationContract.schemaVersion,
            presentationExplanation: value.reason,
            presentationMovementLabel: movementLabel
        )
    }

    private static func trainingSection(_ value: BriefingJSONValue?) -> WeeklyTrainingSection {
        let status = value?["status"]
        return .init(
            comparableCategoryCount: value?["comparableCategoryCount"]?.int ?? value?["prioritySignals"]?.array.count ?? value?["highlights"]?.array.count ?? 0,
            improvingCount: status?["improving"]?.int ?? value?["prioritySignals"]?.array.filter { $0["status"]?.string == "improving" }.count ?? 0,
            steadyCount: status?["stable"]?.int ?? status?["steady"]?.int ?? value?["prioritySignals"]?.array.filter { ["stable", "steady"].contains($0["status"]?.string ?? "") }.count ?? 0,
            narrative: value?["conclusion"]?.string ?? value?["interpretation"]?.string ?? "",
            headline: value?["performanceHeadline"]?.string ?? value?["title"]?.string,
            trainingDayCount: value?["trainingDayCount"]?.int ?? value?["completedSessionCount"]?.int ?? value?["sessionsCompleted"]?.int,
            plateauingCount: status?["plateauing"]?.int,
            regressingCount: status?["regressing"]?.int,
            insufficientCount: value?["insufficientCount"]?.int,
            highlights: value?["highlights"]?.array.compactMap(trainingHighlight),
            priorityGroups: (value?["priorityCategories"] ?? value?["prioritySignals"])?.array.compactMap(trainingPriority),
            watch: value?["watch"]?.object == nil ? nil : .init(
                exercise: value?["watch"]?["exercise"]?.string,
                status: value?["watch"]?["status"]?.string,
                message: value?["watch"]?["message"]?.string ?? ""
            )
        )
    }

    private static func trainingHighlight(_ value: BriefingJSONValue) -> BriefingTrainingHighlight? {
        guard let id = value["canonicalExerciseId"]?.string ?? value["exerciseId"]?.string ?? value["exercise"]?.string else { return nil }
        let rawValue = value["performanceValue"]?.literalString ?? value["value"]?.literalString
            ?? value["value"]?.double.map { groupedMeasurement($0, suffix: value["unit"]?.string.map { " \($0)" } ?? "") }
        let unit = value["unit"]?.string
        let absoluteDelta = value["delta"]?.double
        let percentChange = value["percentChange"]?.double
        let delta = value["delta"]?.string
            ?? absoluteDelta.map { signedMeasurement($0, suffix: unit.map { " \($0)" } ?? "") }
            ?? percentChange.map { signedMeasurement($0, suffix: "%") }
            ?? ""
        return .init(
            canonicalExerciseId: id,
            exerciseName: value["exerciseName"]?.string ?? value["exercise"]?.string ?? value["label"]?.string ?? "Exercise",
            recordType: value["recordType"]?.string ?? value["label"]?.string ?? value["type"]?.string ?? "Performance",
            performanceValue: rawValue,
            absoluteDelta: absoluteDelta,
            percentChange: percentChange,
            unit: unit,
            icon: value["icon"]?.string,
            headline: value["headline"]?.string ?? value["detail"]?.string ?? "",
            detail: value["detail"]?.string ?? value["message"]?.string ?? "",
            delta: delta,
            tone: value["tone"]?.string ?? value["statusTone"]?.string ?? "evidence"
        )
    }

    private static func trainingPriority(_ value: BriefingJSONValue) -> BriefingTrainingPriorityGroup? {
        guard let id = value["areaId"]?.string ?? value["categoryId"]?.string ?? value["id"]?.string ?? value["key"]?.string else { return nil }
        let evidenceStatus = value["conclusionStatus"]?.string ?? value["evidenceStatus"]?.string
        if let evidenceStatus,
           ["insufficient", "absent", "no_evidence", "withheld"].contains(evidenceStatus) {
            return nil
        }
        let comparableExerciseCount = value["comparableExerciseCount"]?.int ?? value["exerciseCount"]?.int
        if let comparableExerciseCount, comparableExerciseCount <= 0 {
            return nil
        }
        return .init(
            areaId: id,
            label: value["label"]?.string ?? "Training area",
            statusLabel: value["statusLabel"]?.string ?? value["status"]?.string ?? "",
            comparableExerciseCount: comparableExerciseCount,
            tone: value["tone"]?.string ?? value["statusTone"]?.string ?? "evidence"
        )
    }

    private static func monthly(from value: BriefingJSONValue, strategicSummaryV3: BriefingJSONValue? = nil) -> MonthlyBriefingContent {
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
            highlights: training?["highlights"]?.array.compactMap(trainingHighlight),
            whyItMatters: training?["interpretation"]?.string ?? training?["next"]?.string
        )
        let weeks: [MonthlyEnergyEvolutionSection.WeekBar] = (energy?["weekly"]?.array ?? [])
            .filter { $0["missing"]?.bool != true }
            .compactMap { week in
                guard let intake = week["intake"]?.int, let expenditure = week["expenditure"]?.int else { return nil }
                return .init(
                    weekLabel: week["label"]?.string ?? "Week",
                    averageIntakeKcal: intake,
                    averageExpenditureKcal: expenditure,
                    averageBalanceKcal: week["balance"]?.int,
                    coverageLabel: week["observedCount"]?.int.map { "\($0) observed days" }
                )
            }
        let summaryIntake = summaryMetric("Avg intake", in: energy)
        let summaryExpenditure = summaryMetric("Avg expenditure", in: energy)
        let summaryBalance = summaryMetric("Avg balance", in: energy)
        let energyEvolution: MonthlyEnergyEvolutionSection? = summaryIntake == nil || summaryExpenditure == nil || summaryBalance == nil ? nil : .init(
            weeks: weeks,
            averageIntakeKcal: summaryIntake!,
            averageExpenditureKcal: summaryExpenditure!,
            averageBalanceKcal: summaryBalance!,
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
            return .init(dateLabel: date, title: title, narrative: item["body"]?.string ?? "", icon: monthlyIcon(item["tone"]?.string))
        }
        let actions: [MonthlyActionCard] = (ahead?["guidance"]?.array ?? []).enumerated().map { index, item in
            .init(domain: item["tone"]?.string ?? "action-\(index)", title: item["label"]?.string ?? "Next", narrative: [item["value"]?.string, item["detail"]?.string].compactMap { $0 }.joined(separator: " · "), icon: monthlyIcon(item["tone"]?.string))
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
            monthAheadActions: actions,
            heroHighlights: (hero?["highlights"]?.array ?? []).compactMap { item in
                guard let label = item["label"]?.string, let displayValue = item["value"]?.string else { return nil }
                return .init(
                    label: label,
                    value: displayValue,
                    detail: item["detail"]?.string ?? "",
                    icon: monthlyIcon(item["icon"]?.string),
                    tone: item["tone"]?.string ?? "primary"
                )
            },
            strategicSummaryV3: monthlyStrategicSummary(strategicSummaryV3)
        )
    }

    private static func monthlyStrategicSummary(_ value: BriefingJSONValue?) -> MonthlyStrategicSummaryV3? {
        guard let value, value.object != nil else { return nil }
        let sections = value["sections"]
        return .init(
            result: nonEmptyString(sections?["result"]),
            meaning: nonEmptyString(sections?["meaning"]),
            action: nonEmptyString(sections?["action"]),
            watch: nonEmptyString(sections?["watch"]),
            confidence: nonEmptyString(sections?["confidence"]),
            coachTake: nonEmptyString(value["coachTake"]),
            energyStatement: nonEmptyString(value["energy"]?["statement"]),
            uncertainty: uncertaintyItems(value["uncertainty"])
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
                weightLb: metricText(snapshot?["weight"], suffix: " lb", precision: 1),
                bodyFatPercent: metricText(snapshot?["bodyFat"] ?? snapshot?["bodyFatPercentage"], suffix: "%", precision: 1),
                fatMassLb: metricText(snapshot?["fatMass"], suffix: " lb", precision: 1),
                leanMassLb: metricText(snapshot?["leanMass"], suffix: " lb", precision: 1),
                restingMetabolicRateKcal: optionalMetricText(snapshot?["rmr"] ?? snapshot?["restingMetabolicRate"], suffix: " cal/day", precision: 0)
            ),
            progress: .init(
                headline: comparisons(progress?["headline"]),
                regionalFat: regional(progress?["regionalFat"]),
                regionalLean: regional(progress?["regionalLean"]),
                supplemental: comparisons(progress?["supplemental"]),
                timeline: .init(
                    timelineLabel: progress?["timelineLabel"]?.string ?? timeline?["label"]?.string ?? timeline?["timelineLabel"]?.string ?? "Body-composition timeline",
                    isSimulated: timeline?["simulated"]?.bool ?? false,
                    baselineDate: timeline?["scans"]?.array.first?["date"]?.string ?? "",
                    currentDate: timeline?["scans"]?.array.last?["date"]?.string ?? "",
                    elapsedDays: timeline?["elapsedDays"]?.int ?? 0,
                    scans: timeline?["scans"]?.array.compactMap(timelinePoint) ?? [],
                    metrics: (timeline?["metrics"]?.array ?? []).compactMap(timelineMetric),
                    summary: dexaTimelineSummary(timeline?["summary"])
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
                hasPairedData: item["complete"]?.bool ?? item["hasPairedData"]?.bool ?? false,
                balanceKcal: item["balance"]?.int,
                label: item["label"]?.string
            )
        } ?? []
        return points.isEmpty ? nil : points
    }

    private static func stat(_ value: BriefingJSONValue) -> BriefingStat? {
        guard let label = value["label"]?.string else { return nil }
        return .init(label: label, value: value["value"]?.string ?? "", detail: value["detail"]?.string)
    }

    private static func summaryMetric(_ label: String, in energy: BriefingJSONValue?) -> Int? {
        energy?["summaryMetrics"]?.array.first(where: { $0["label"]?.string == label })?["value"]?.int
    }

    private static func monthlyIcon(_ value: String?) -> String {
        switch value {
        case "training": "dumbbell.fill"
        case "energy": "bolt.fill"
        case "weight": "scalemass.fill"
        case "photos": "camera.fill"
        case "baseline": "scope"
        case "completion": "trophy.fill"
        default: "sparkles"
        }
    }

    private static func comparisons(_ value: BriefingJSONValue?) -> [DEXAComparisonMetric] {
        value?.array.compactMap { item in
            guard let label = item["label"]?.string else { return nil }
            let unit = item["displayUnit"]?.string ?? item["unit"]?.string ?? ""
            let suffix = unit == "%" ? "%" : unit.isEmpty ? "" : " \(unit)"
            let precision = item["precision"]?.int ?? (unit == "cal/day" ? 0 : unit.isEmpty ? 2 : 1)
            return .init(
                label: label,
                previous: metricText(item["previous"], suffix: suffix, precision: precision),
                current: metricText(item["current"], suffix: suffix, precision: precision),
                delta: signedMetricText(item["delta"], suffix: item["unit"]?.string.map { $0.isEmpty ? "" : " \($0)" } ?? suffix, precision: precision)
            )
        } ?? []
    }

    private static func regional(_ value: BriefingJSONValue?) -> [DEXARegionalChangeMetric] {
        value?.array.compactMap { item in
            guard let region = item["region"]?.string ?? item["label"]?.string else { return nil }
            let precision = item["precision"]?.int ?? 1
            return .init(region: region, previous: metricText(item["previous"], suffix: " lb", precision: precision), current: metricText(item["current"], suffix: " lb", precision: precision), delta: signedMetricText(item["delta"], suffix: " lb", precision: precision))
        } ?? []
    }

    private static func timelinePoint(_ value: BriefingJSONValue) -> DEXATimelinePoint? {
        guard let id = value["scanId"]?.string ?? value["id"]?.string, let date = value["date"]?.string else { return nil }
        return .init(scanId: id, date: date, value: metricText(value["value"] ?? value["bodyFat"], suffix: "", precision: 1))
    }

    private static func timelineMetric(_ value: BriefingJSONValue) -> DEXATimelineMetricTrack? {
        guard let label = value["label"]?.string ?? value["key"]?.string else { return nil }
        return .init(
            label: label,
            unit: value["unit"]?.string ?? "",
            points: value["points"]?.array.compactMap(timelinePoint) ?? [],
            delta: signedMetricText(value["delta"], suffix: value["unit"]?.string.map { $0.isEmpty ? "" : " \($0)" } ?? "", precision: 1)
        )
    }

    private static func metricText(_ value: BriefingJSONValue?, suffix: String, precision: Int? = nil) -> String {
        if let string = value?.string, value?.double == nil { return string }
        let number = value?.double ?? value?["value"]?.double
        return measurement(number, suffix: suffix, precision: precision)
    }

    private static func signedMetricText(_ value: BriefingJSONValue?, suffix: String, precision: Int) -> String {
        guard let number = value?.double ?? value?["value"]?.double else { return "—" }
        let sign = number > 0 ? "+" : number < 0 ? "−" : ""
        return sign + measurement(abs(number), suffix: suffix, precision: precision)
    }

    private static func optionalMetricText(_ value: BriefingJSONValue?, suffix: String, precision: Int? = nil) -> String? {
        guard value != nil, value?.object != nil || value?.double != nil || value?.string != nil else { return nil }
        return metricText(value, suffix: suffix, precision: precision)
    }

    private static func measurement(_ value: Double?, suffix: String, precision: Int? = nil) -> String {
        guard let value else { return "—" }
        let formatted: String
        if let precision {
            formatted = String(format: "%.*f", precision, value)
        } else {
            formatted = value.rounded() == value ? String(Int(value)) : String(format: "%.2f", value).replacingOccurrences(of: #"0+$"#, with: "", options: .regularExpression).replacingOccurrences(of: #"\.$"#, with: "", options: .regularExpression)
        }
        return formatted + suffix
    }

    private static func signedMeasurement(_ value: Double, suffix: String) -> String {
        let sign = value > 0 ? "+" : value < 0 ? "−" : ""
        return sign + measurement(abs(value), suffix: suffix)
    }

    private static func groupedMeasurement(_ value: Double, suffix: String) -> String {
        let formatter = NumberFormatter()
        formatter.numberStyle = .decimal
        formatter.maximumFractionDigits = value.rounded() == value ? 0 : 2
        formatter.minimumFractionDigits = 0
        return (formatter.string(from: NSNumber(value: value)) ?? measurement(value, suffix: "")) + suffix
    }

    private static func dexaTimelineSummary(_ value: BriefingJSONValue?) -> String {
        guard let bodyFat = value?["bodyFat"], let fatMass = value?["fatMass"], let leanMass = value?["leanMass"] else { return "" }
        return "Across this body-composition timeline, body fat moved from \(metricText(bodyFat["previous"], suffix: "%", precision: 1)) to \(metricText(bodyFat["current"], suffix: "%", precision: 1)), fat mass changed \(signedMetricText(fatMass["delta"], suffix: " lb", precision: 1)), and measured lean tissue changed \(signedMetricText(leanMass["delta"], suffix: " lb", precision: 1))."
    }

    private static func strings(_ value: BriefingJSONValue?) -> [String] {
        value?.array.compactMap(\.string) ?? []
    }

    private static func nonEmptyString(_ value: BriefingJSONValue?) -> String? {
        guard let text = value?.literalString?.trimmingCharacters(in: .whitespacesAndNewlines),
              !text.isEmpty else { return nil }
        return text
    }

    private static let canonicalNarrativeV3 = "canonical_narrative_v3"

    /// Server `uncertainty[]` items, decoded losslessly. Text is the Server's;
    /// items without text stay in the model (and are simply not presentable).
    private static func uncertaintyItems(_ value: BriefingJSONValue?) -> [BriefingUncertaintyItem] {
        (value?.array ?? []).enumerated().compactMap { index, item in
            guard item.object != nil else { return nil }
            return .init(
                id: item["uncertaintyId"]?.literalString ?? "uncertainty-\(index)",
                type: item["type"]?.literalString,
                domain: item["domain"]?.literalString,
                materiality: item["materiality"]?.literalString,
                text: nonEmptyString(item["text"]),
                surfaced: item["surfaced"]?.bool ?? false,
                surfacedIn: item["surfacedIn"]?.literalString,
                suppressionReason: item["suppressionReason"]?.literalString
            )
        }
    }

    /// The Server's goal-relative Energy result. Always returned for a V3
    /// briefing (empty when the Server sent none) so the presentation knows
    /// to render Server Energy authority only.
    private static func energyStrategy(_ value: BriefingJSONValue?) -> BriefingEnergyStrategyReadModel {
        let findings = (value?["findings"]?.array ?? []).enumerated().compactMap { index, item -> BriefingEnergyStrategyReadModel.Finding? in
            guard let dimension = item["dimension"]?.literalString,
                  let state = item["state"]?.literalString,
                  let observed = item["observedValue"]?.double,
                  let target = item["targetValue"]?.double else { return nil }
            return .init(
                id: item["findingId"]?.literalString ?? "finding-\(index)",
                dimension: dimension, state: state,
                observedValue: observed, targetValue: target,
                unit: item["unit"]?.literalString
            )
        }
        let estimate = value?["estimate"]
        return .init(
            statement: nonEmptyString(value?["statement"]),
            findings: findings,
            estimateAverageKcalPerDay: estimate?["averageKcalPerDay"]?.double,
            estimatePairedDayCount: estimate?["pairing"]?["pairedDayCount"]?.int,
            estimateEligibleDayCount: estimate?["pairing"]?["eligibleDayCount"]?.int,
            ambiguity: uncertaintyItems(value?["ambiguity"])
        )
    }

    private static func factorTexts(_ value: BriefingJSONValue?) -> [String] {
        value?.array.compactMap { factor in
            factor.string
                ?? factor["text"]?.string
                ?? factor["summary"]?.string
                ?? factor["label"]?.string
                ?? factor["title"]?.string
        } ?? []
    }

    private static func dateRange(_ start: String, _ end: String) -> String {
        guard !start.isEmpty else { return "" }
        return start == end ? start : "\(start)–\(end)"
    }
}
