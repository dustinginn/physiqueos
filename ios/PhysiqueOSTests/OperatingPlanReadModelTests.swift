import XCTest
@testable import PhysiqueOS

@MainActor
final class OperatingPlanReadModelTests: XCTestCase {
    private func makeStore() -> OperatingPlanSandboxStore { OperatingPlanSandboxStore() }

    // MARK: - Fixture integrity / landing

    func testLandingContainsEveryStrategyDomainInWebOrder() throws {
        let store = makeStore()
        XCTAssertEqual(store.landing.sections.map(\.id), [
            "energy", "nutrition", "training", "recovery", "peptide", "supplement", "tracking", "coaching",
        ])
        for section in store.landing.sections {
            XCTAssertFalse(section.items.isEmpty, "\(section.id) should have at least one item")
        }
    }

    func testSupplementsSectionCarriesTheAddSupplementAction() throws {
        let store = makeStore()
        let supplementSection = try XCTUnwrap(store.landing.sections.first { $0.id == "supplement" })
        XCTAssertTrue(supplementSection.supplementsAction)
        let otherSections = store.landing.sections.filter { $0.id != "supplement" }
        XCTAssertTrue(otherSections.allSatisfy { !$0.supplementsAction })
    }

    func testTrackingSectionRoutesToItsWebBackedSupportSurface() throws {
        let store = makeStore()
        let tracking = try XCTUnwrap(store.landing.sections.first { $0.id == "tracking" })
        XCTAssertEqual(tracking.items.first?.destination, .operatingPlanTracking)
        XCTAssertEqual(store.tracking.title, "Morning Weigh-In")
        XCTAssertFalse(store.tracking.completion.isEmpty)
    }

    func testEveryLandingDestinationResolvesToARealDestinationId() throws {
        let store = makeStore()
        let destinations = store.landing.sections.flatMap(\.items).compactMap(\.destination)
        XCTAssertFalse(destinations.isEmpty)
        for destination in destinations {
            XCTAssertTrue(destination.serverDestinationId.hasPrefix("native.operating-plan"))
        }
    }

    // MARK: - Strategy detail: Energy (phase-aware, no editor)

    func testEnergyStrategyHasNoEditorRoute() throws {
        let store = makeStore()
        let energy = try XCTUnwrap(store.strategyDetail(strategyType: "energy", strategyId: "strategy_fixture_energy"))
        XCTAssertNil(energy.editLabel)
        XCTAssertNil(energy.editDestination)
        XCTAssertEqual(energy.fields.map(\.label), [
            "Current Energy Phase", "Caloric Intake", "Activity Target", "Calibration Approach",
        ])
        XCTAssertEqual(energy.fields.first { $0.label == "Current Energy Phase" }?.value, "Bulk")
    }

    func testEnergyPhaseHistoryPreservesPhaseOneWhilePhaseTwoIsActive() throws {
        let store = makeStore()
        let energy = try XCTUnwrap(store.strategyDetail(strategyType: "energy", strategyId: "strategy_fixture_energy"))
        XCTAssertEqual(energy.energyPhaseHistory.count, 2)
        let phaseOne = try XCTUnwrap(energy.energyPhaseHistory.first { $0.phaseOrder == 1 })
        let phaseTwo = try XCTUnwrap(energy.energyPhaseHistory.first { $0.phaseOrder == 2 })
        XCTAssertFalse(phaseOne.isActive)
        XCTAssertTrue(phaseTwo.isActive)
        XCTAssertNotEqual(phaseOne.caloricIntake, phaseTwo.caloricIntake)
        XCTAssertNotEqual(phaseOne.activityTarget, phaseTwo.activityTarget)
    }

    func testEnergyPhaseHistoryReusesGoalsPhaseIdentity() async throws {
        let energy = try XCTUnwrap(makeStore().strategyDetail(strategyType: "energy", strategyId: "strategy_fixture_energy"))
        let detail = try await FixtureGoalsAPI().fetchGoalDetail(goalId: "goal_fixture_build_lean_mass")
        let goal = try XCTUnwrap(detail?.active)
        XCTAssertEqual(Set(energy.energyPhaseHistory.map(\.goalId)), [goal.id])
        XCTAssertEqual(Set(energy.energyPhaseHistory.map(\.id)), Set(goal.phases.map(\.id)))
        for snapshot in energy.energyPhaseHistory {
            let phase = try XCTUnwrap(goal.phases.first { $0.id == snapshot.id })
            XCTAssertEqual(snapshot.phaseOrder, phase.order)
            XCTAssertEqual(snapshot.isActive, phase.id == goal.activePhaseId && phase.status == .active)
        }
    }

    func testNonEnergyStrategyTypesCarryNoPhaseHistory() throws {
        let store = makeStore()
        for type in ["nutrition", "training", "briefings"] {
            let id = "strategy_fixture_\(type == "briefings" ? "coaching" : type)"
            let detail = try XCTUnwrap(store.strategyDetail(strategyType: type, strategyId: id))
            XCTAssertTrue(detail.energyPhaseHistory.isEmpty)
        }
    }

    // MARK: - Strategy detail: Nutrition / Training / Coaching Updates

    func testNutritionStrategyFieldsAndEditorAgree() throws {
        let store = makeStore()
        let nutrition = try XCTUnwrap(store.strategyDetail(strategyType: "nutrition", strategyId: "strategy_fixture_nutrition"))
        XCTAssertEqual(nutrition.editLabel, "Edit Strategy")
        XCTAssertEqual(nutrition.fields.map(\.label), ["Protein Target", "Carbohydrate Approach", "Fat Approach", "Macro Philosophy"])
        let editor = try XCTUnwrap(store.nutritionEditor(strategyId: "strategy_fixture_nutrition"))
        XCTAssertEqual(editor.proteinBasis, .bodyWeight)
        XCTAssertEqual(editor.carbohydrateStrategy, .balanced)
        XCTAssertEqual(editor.fatStrategy, .balanced)
    }

    func testTrainingStrategyMatchesDefaultWebFrequenciesAndFields() throws {
        let store = makeStore()
        let training = try XCTUnwrap(store.strategyDetail(strategyType: "training", strategyId: "strategy_fixture_training"))
        XCTAssertEqual(training.editLabel, "Edit Strategy")
        XCTAssertEqual(training.fields.map(\.label), ["Weekly Structure", "Training Focus", "Progression", "Current Phase"])
        XCTAssertEqual(training.fields.first { $0.label == "Current Phase" }?.value, "Lean Mass Build")
        let editor = try XCTUnwrap(store.trainingEditor(strategyId: "strategy_fixture_training"))
        // Matches TrainingProtocolBuilderService.js's DEFAULT_TRAINING_FREQUENCIES exactly.
        let byArea = Dictionary(uniqueKeysWithValues: editor.frequencies.map { ($0.area, $0.count) })
        XCTAssertEqual(byArea[.arms], 2)
        XCTAssertEqual(byArea[.core], 2)
        XCTAssertEqual(byArea[.lowerBody], 2)
        XCTAssertEqual(byArea[.back], 1)
        XCTAssertEqual(byArea[.chest], 1)
        XCTAssertEqual(byArea[.shoulders], 1)
        XCTAssertEqual(editor.totalWeeklySessions, 9)
        XCTAssertFalse(editor.priorities.isEmpty)
    }

    func testCoachingUpdatesDetailDoesNotClaimBriefingsOwnership() throws {
        let store = makeStore()
        let coaching = try XCTUnwrap(store.strategyDetail(strategyType: "briefings", strategyId: "strategy_fixture_coaching"))
        XCTAssertEqual(coaching.editLabel, "Edit Coaching Updates")
        XCTAssertEqual(coaching.fields.map(\.label), ["Midweek Calibration", "Weekly Synthesis", "Routine Daily Briefings", "Notifications", "Event Briefings"])
        XCTAssertEqual(coaching.fields.first { $0.label == "Event Briefings" }?.value, "Photo and DEXA remain active when eligible")
    }

    // MARK: - Protocols: Recovery / Peptide / Supplement domain roll-ups

    func testRecoveryDomainRollsUpActiveMethods() throws {
        let store = makeStore()
        let recovery = try XCTUnwrap(store.protocolDomain(protocolId: "protocol_fixture_recovery_foam_roll"))
        XCTAssertEqual(recovery.category, .recovery)
        XCTAssertEqual(recovery.methods.map(\.name), ["Foam Rolling"])
    }

    func testPeptideDomainListsBothActivePeptides() throws {
        let store = makeStore()
        let peptide = try XCTUnwrap(store.protocolDomain(protocolId: "protocol_fixture_peptide_retatrutide"))
        XCTAssertEqual(peptide.category, .peptide)
        XCTAssertEqual(Set(peptide.methods.map(\.name)), ["Retatrutide", "Tesamorelin"])
        // Both protocol ids resolve to the same rolled-up domain, matching
        // the web's category-keyed roll-up rather than a per-protocol page.
        let viaTesamorelin = try XCTUnwrap(store.protocolDomain(protocolId: "protocol_fixture_peptide_tesamorelin"))
        XCTAssertEqual(viaTesamorelin.methods.count, peptide.methods.count)
    }

    func testSupplementDomainListsActiveSupplements() throws {
        let store = makeStore()
        let supplement = try XCTUnwrap(store.protocolDomain(protocolId: "protocol_fixture_supplement_tongkat_ali"))
        XCTAssertEqual(supplement.category, .supplement)
        XCTAssertEqual(Set(supplement.methods.map(\.name)), ["Tongkat Ali", "Electrolytes"])
    }

    func testUnknownProtocolIdResolvesToNoDomain() throws {
        let store = makeStore()
        XCTAssertNil(store.protocolDomain(protocolId: "protocol_does_not_exist"))
    }

    // MARK: - Peptide execution / dosing editor

    func testRetatrutideDosingMatchesUpHoldDownPattern() throws {
        let store = makeStore()
        let execution = try XCTUnwrap(store.peptideExecution(protocolId: "protocol_fixture_peptide_retatrutide"))
        XCTAssertEqual(execution.state, .canonical)
        XCTAssertEqual(execution.dosing.pattern, .upHoldDown)
        XCTAssertTrue(execution.dosing.pattern.usesTarget)
        XCTAssertTrue(execution.dosing.pattern.usesStep)
        XCTAssertTrue(execution.dosing.pattern.usesHold)
        XCTAssertEqual(execution.timeline.count, 3)
        XCTAssertEqual(execution.timeline.filter { $0.status == "completed" }.count, 2)
    }

    func testTesamorelinDosingMatchesStayPattern() throws {
        let store = makeStore()
        let execution = try XCTUnwrap(store.peptideExecution(protocolId: "protocol_fixture_peptide_tesamorelin"))
        XCTAssertEqual(execution.state, .legacyCompatible)
        XCTAssertEqual(execution.dosing.pattern, .stay)
        XCTAssertFalse(execution.dosing.pattern.usesTarget)
        XCTAssertFalse(execution.dosing.pattern.usesStep)
    }

    func testPeptideDosingValidationRejectsZeroStartingDose() throws {
        let store = makeStore()
        var dosing = try XCTUnwrap(store.peptideExecution(protocolId: "protocol_fixture_peptide_tesamorelin")).dosing
        dosing.startingDoseAmount = 0
        XCTAssertNotNil(PeptideDosingValidation.error(model: dosing))
        let result = store.savePeptideDosing(protocolId: "protocol_fixture_peptide_tesamorelin", model: dosing)
        guard case .failure = result else { return XCTFail("Expected validation failure") }
    }

    func testPeptideDosingValidationRejectsInvalidDateWindow() throws {
        var dosing = try XCTUnwrap(makeStore().peptideExecution(protocolId: "protocol_fixture_peptide_tesamorelin")?.dosing)
        dosing.startDate = "not-a-date"
        XCTAssertEqual(PeptideDosingValidation.error(model: dosing), "Choose a valid dosing start date.")
        dosing.startDate = "2026-08-15"
        dosing.endDate = "2026-08-14"
        XCTAssertEqual(PeptideDosingValidation.error(model: dosing), "Choose an end date after the dosing start date.")
    }

    func testPeptideDosingSaveUpdatesExecutionAndDomainDose() throws {
        let store = makeStore()
        var dosing = try XCTUnwrap(store.peptideExecution(protocolId: "protocol_fixture_peptide_tesamorelin")).dosing
        dosing.startingDoseAmount = 3
        let result = store.savePeptideDosing(protocolId: "protocol_fixture_peptide_tesamorelin", model: dosing)
        guard case .success = result else { return XCTFail("Expected save to succeed") }
        XCTAssertEqual(store.peptideExecution(protocolId: "protocol_fixture_peptide_tesamorelin")?.dosing.startingDoseAmount, 3)
        let domain = try XCTUnwrap(store.protocolDomain(protocolId: "protocol_fixture_peptide_tesamorelin"))
        let method = try XCTUnwrap(domain.methods.first { $0.protocolId == "protocol_fixture_peptide_tesamorelin" })
        XCTAssertEqual(method.currentDose, "3 mg")
        XCTAssertEqual(store.peptideExecution(protocolId: "protocol_fixture_peptide_tesamorelin")?.timeline.last?.doseAmount, 3)
    }

    func testPeptideSupportSavePreservesScheduleDosingReminderAndNotes() throws {
        let store = makeStore()
        var execution = try XCTUnwrap(store.peptideExecution(protocolId: "protocol_fixture_peptide_retatrutide"))
        execution.supportSchedule.frequency = .specificDays
        execution.supportSchedule.daysOfWeek = [.monday, .thursday]
        execution.dosing.holdUnit = .days
        execution.dosing.decreaseUnit = .days
        execution.reminderPreference = .none
        execution.notes = "Updated execution context."
        guard case .success = store.savePeptideExecution(execution) else { return XCTFail("Expected save to succeed") }
        let saved = try XCTUnwrap(store.peptideExecution(protocolId: execution.protocolId))
        XCTAssertEqual(saved.supportSchedule.daysOfWeek, [.monday, .thursday])
        XCTAssertEqual(saved.dosing.holdUnit, .days)
        XCTAssertEqual(saved.dosing.decreaseUnit, .days)
        XCTAssertEqual(saved.reminderPreference, .none)
        XCTAssertEqual(saved.notes, "Updated execution context.")
    }

    func testCustomPeptidePatternPreservesLegacyTimelineWithoutStructuredDoseValidation() throws {
        var execution = try XCTUnwrap(makeStore().peptideExecution(protocolId: "protocol_fixture_peptide_tesamorelin"))
        execution.dosing.pattern = .custom
        execution.dosing.startingDoseAmount = 0
        execution.dosing.startingDoseUnit = ""
        XCTAssertNil(PeptideDosingValidation.error(model: execution.dosing))
        XCTAssertNil(PeptideDosingTimelineBuilder.build(from: execution.dosing))
    }

    func testStructuredPeptideTimelineRegeneratesThroughPeakHoldAndLanding() throws {
        let dosing = try XCTUnwrap(makeStore().peptideExecution(protocolId: "protocol_fixture_peptide_retatrutide")?.dosing)
        let timeline = try XCTUnwrap(PeptideDosingTimelineBuilder.build(from: dosing))
        XCTAssertEqual(timeline.first?.doseAmount, 2)
        XCTAssertEqual(timeline.last?.doseAmount, 2)
        XCTAssertTrue(timeline.contains { $0.doseAmount == 6 && $0.label.contains("Hold") })
        XCTAssertEqual(timeline.last?.status, "active")
    }

    // MARK: - Recovery support editor

    func testRecoverySupportValidationRequiresDaysForSpecificWeekdays() throws {
        let store = makeStore()
        var support = try XCTUnwrap(store.recoverySupport(executionId: "execution_fixture_foam_roll"))
        support.supportSchedule.frequency = .specificDays
        support.supportSchedule.daysOfWeek = []
        XCTAssertNotNil(RecoverySupportValidation.error(model: support))
        let result = store.saveRecoverySupport(support)
        guard case .failure = result else { return XCTFail("Expected validation failure") }
    }

    func testRecoverySupportSavePersistsCadenceChange() throws {
        let store = makeStore()
        var support = try XCTUnwrap(store.recoverySupport(executionId: "execution_fixture_foam_roll"))
        support.supportSchedule.frequency = .weekly
        support.supportSchedule.daysOfWeek = [.sunday]
        let result = store.saveRecoverySupport(support)
        guard case .success = result else { return XCTFail("Expected save to succeed") }
        XCTAssertEqual(store.recoverySupport(executionId: "execution_fixture_foam_roll")?.supportSchedule.frequency, .weekly)
        XCTAssertEqual(store.recoverySupport(executionId: "execution_fixture_foam_roll")?.supportSchedule.daysOfWeek, [.sunday])
    }

    // MARK: - Nutrition / Training / Coaching editor save + validation

    func testNutritionEditorSaveUpdatesStrategyDetailFields() throws {
        let store = makeStore()
        var editor = try XCTUnwrap(store.nutritionEditor(strategyId: "strategy_fixture_nutrition"))
        editor.carbohydrateStrategy = .performance
        editor.fatStrategy = .higherFat
        let result = store.saveNutrition(editor)
        guard case .success = result else { return XCTFail("Expected save to succeed") }
        let detail = try XCTUnwrap(store.strategyDetail(strategyType: "nutrition", strategyId: "strategy_fixture_nutrition"))
        XCTAssertEqual(detail.fields.first { $0.label == "Carbohydrate Approach" }?.value, "Performance")
        XCTAssertEqual(detail.fields.first { $0.label == "Fat Approach" }?.value, "Higher fat")
    }

    func testNutritionEditorValidationRejectsOutOfRangeFixedProtein() throws {
        var editor = NutritionStrategyEditorReadModel(
            strategyId: "strategy_fixture_nutrition", proteinBasis: .fixedGrams, proteinRatio: 1,
            fixedProteinGrams: 20, carbohydrateStrategy: .balanced, fatStrategy: .balanced
        )
        XCTAssertNotNil(NutritionStrategyValidation.error(model: editor))
        editor.fixedProteinGrams = 190
        XCTAssertNil(NutritionStrategyValidation.error(model: editor))
    }

    func testTrainingEditorValidationRequiresAtLeastOneWeeklySessionAndPriority() throws {
        var editor = try XCTUnwrap(makeStore().trainingEditor(strategyId: "strategy_fixture_training"))
        editor.frequencies = editor.frequencies.map { .init(area: $0.area, count: 0) }
        XCTAssertNotNil(TrainingStrategyValidation.error(model: editor))
        editor.frequencies[0].count = 2
        editor.priorities = []
        XCTAssertNotNil(TrainingStrategyValidation.error(model: editor))
    }

    func testTrainingEditorSaveUpdatesWeeklyStructureField() throws {
        let store = makeStore()
        var editor = try XCTUnwrap(store.trainingEditor(strategyId: "strategy_fixture_training"))
        editor.frequencies[0].count = editor.frequencies[0].count + 3
        let expectedTotal = editor.totalWeeklySessions
        let result = store.saveTraining(editor)
        guard case .success = result else { return XCTFail("Expected save to succeed") }
        let detail = try XCTUnwrap(store.strategyDetail(strategyType: "training", strategyId: "strategy_fixture_training"))
        XCTAssertEqual(detail.fields.first { $0.label == "Weekly Structure" }?.value, "\(expectedTotal) area sessions")
    }

    func testCoachingEditorSaveUpdatesNotificationField() throws {
        let store = makeStore()
        var editor = try XCTUnwrap(store.coachingEditor(strategyId: "strategy_fixture_coaching"))
        editor.notificationPreference = .availableWithoutNotification
        store.saveCoaching(editor)
        let detail = try XCTUnwrap(store.strategyDetail(strategyType: "briefings", strategyId: "strategy_fixture_coaching"))
        XCTAssertEqual(detail.fields.first { $0.label == "Notifications" }?.value, "Available without notification")
    }

    func testCoachingEditorPreservesAllReachableWebSchedules() throws {
        let store = makeStore()
        var editor = try XCTUnwrap(store.coachingEditor(strategyId: "strategy_fixture_coaching"))
        XCTAssertEqual(editor.midweek.localTime, "18:00")
        XCTAssertEqual(editor.weekly.localTime, "09:00")
        XCTAssertEqual(editor.monthly.dayOfMonth, 1)
        XCTAssertEqual(editor.photos.cadence, .everyTwoWeeks)
        XCTAssertEqual(Set(editor.dexa.reminderPreferences), Set(DexaReminderPreference.allCases))
        editor.monthly.enabled = false
        editor.photoEventBriefingEnabled = false
        guard case .success = store.saveCoaching(editor) else { return XCTFail("Expected save to succeed") }
        let saved = try XCTUnwrap(store.coachingEditor(strategyId: editor.strategyId))
        XCTAssertFalse(saved.monthly.enabled)
        XCTAssertFalse(saved.photoEventBriefingEnabled)
    }

    func testTrackingSupportSavePreservesRecurringSchedule() throws {
        let store = makeStore()
        var tracking = store.tracking
        tracking.supportSchedule.timing = .specific
        tracking.supportSchedule.specificTime = "07:15"
        tracking.reminderPreference = .none
        guard case .success = store.saveTracking(tracking) else { return XCTFail("Expected save to succeed") }
        XCTAssertEqual(store.tracking.supportSchedule.specificTime, "07:15")
        XCTAssertEqual(store.tracking.reminderPreference, .none)
    }

    func testOperatingPlanLocalDateAndTimeControlsRoundTripWithoutTimezoneShift() throws {
        let dateKey = "2026-10-31"
        let timeKey = "18:00"
        XCTAssertEqual(OperatingPlanDateValues.dateKey(from: OperatingPlanDateValues.date(from: dateKey)), dateKey)
        XCTAssertEqual(OperatingPlanDateValues.timeKey(from: OperatingPlanDateValues.time(from: timeKey)), timeKey)
    }

    // MARK: - Supplement strategy editor (create, edit, cancel-equivalent, lifecycle)

    func testSupplementCreateDefaultsAreEmptyAndActive() throws {
        let store = makeStore()
        let editor = store.supplementEditor(protocolId: nil)
        XCTAssertEqual(editor.mode, .create)
        XCTAssertNil(editor.protocolId)
        XCTAssertTrue(editor.name.isEmpty)
        XCTAssertFalse(editor.goalOptions.isEmpty)
        XCTAssertEqual(editor.initialStatus, "active")
    }

    func testSupplementValidationRequiresNamePurposeRoleAndGoal() throws {
        var editor = SupplementEditorReadModel(
            mode: .create, protocolId: nil, goalId: "", goalOptions: [], name: "", purpose: "", role: "", startDate: "2026-08-30", initialStatus: "active"
        )
        XCTAssertNotNil(SupplementStrategyValidation.error(model: editor))
        editor.name = "Creatine"
        editor.purpose = "Support strength"
        editor.role = "Daily"
        editor.goalId = "goal_fixture_build_lean_mass"
        XCTAssertNil(SupplementStrategyValidation.error(model: editor))
    }

    func testSupplementCreateAddsANewActiveMethodToTheDomainRollUp() throws {
        let store = makeStore()
        var editor = store.supplementEditor(protocolId: nil)
        editor.name = "Creatine"
        editor.purpose = "Support strength and recovery."
        editor.role = "Daily, with breakfast."
        let result = store.saveSupplement(editor)
        guard case .success(let newProtocolId) = result else { return XCTFail("Expected save to succeed") }
        let domain = try XCTUnwrap(store.protocolDomain(protocolId: newProtocolId))
        XCTAssertTrue(domain.methods.contains { $0.protocolId == newProtocolId && $0.name == "Creatine" })
        XCTAssertEqual(store.supplementStatus(protocolId: newProtocolId), "active")
        XCTAssertEqual(domain.methods.first { $0.protocolId == newProtocolId }?.editDestination, .operatingPlanSupplementSupport(protocolId: newProtocolId))
        XCTAssertNotNil(store.supplementSupport(protocolId: newProtocolId))
    }

    func testSupplementEditPreservesExistingProtocolIdentity() throws {
        let store = makeStore()
        var editor = store.supplementEditor(protocolId: "protocol_fixture_supplement_tongkat_ali")
        XCTAssertEqual(editor.mode, .edit)
        editor.purpose = "Updated purpose copy."
        let result = store.saveSupplement(editor)
        guard case .success(let protocolId) = result else { return XCTFail("Expected save to succeed") }
        XCTAssertEqual(protocolId, "protocol_fixture_supplement_tongkat_ali")
        let domain = try XCTUnwrap(store.protocolDomain(protocolId: protocolId))
        XCTAssertEqual(domain.methods.first { $0.protocolId == protocolId }?.purpose, "Updated purpose copy.")
    }

    func testSupplementCancelEquivalentLeavesStoreUnchanged() throws {
        let store = makeStore()
        let before = try XCTUnwrap(store.protocolDomain(protocolId: "protocol_fixture_supplement_electrolytes"))
        // "Cancel" in the sandbox editors is simply discarding the local
        // draft without calling save — there is nothing to assert on the
        // draft itself (it is view-local @State), so this asserts the
        // store-side invariant a cancel relies on: unrelated saves must not
        // perturb other protocols' state.
        _ = store.supplementEditor(protocolId: "protocol_fixture_supplement_electrolytes")
        let after = try XCTUnwrap(store.protocolDomain(protocolId: "protocol_fixture_supplement_electrolytes"))
        XCTAssertEqual(before, after)
    }

    func testSupplementLifecyclePauseRemovesEditActionAndRestoreReturnsIt() throws {
        let store = makeStore()
        let protocolId = "protocol_fixture_supplement_multivitamin"
        XCTAssertEqual(store.supplementStatus(protocolId: protocolId), "paused")
        XCTAssertEqual(store.lifecycleAction(protocolId: protocolId).label, "Restore")
        store.setSupplementPaused(protocolId: protocolId, paused: false)
        XCTAssertEqual(store.supplementStatus(protocolId: protocolId), "active")
        XCTAssertEqual(store.lifecycleAction(protocolId: protocolId).label, "Pause")
        store.setSupplementPaused(protocolId: protocolId, paused: true)
        XCTAssertEqual(store.supplementStatus(protocolId: protocolId), "paused")
    }

    func testSupplementSupportRemainsSeparateFromStrategyEditing() throws {
        let store = makeStore()
        let protocolId = "protocol_fixture_supplement_tongkat_ali"
        var support = try XCTUnwrap(store.supplementSupport(protocolId: protocolId))
        let strategyBefore = store.supplementEditor(protocolId: protocolId)
        support.doseAmount = "3"
        support.supportSchedule.timing = .evening
        guard case .success = store.saveSupplementSupport(support) else { return XCTFail("Expected save to succeed") }
        XCTAssertEqual(store.supplementSupport(protocolId: protocolId)?.doseAmount, "3")
        XCTAssertEqual(store.supplementEditor(protocolId: protocolId), strategyBefore)
    }

    // MARK: - Typed navigation destinations

    func testOperatingPlanDestinationsRoundTrip() throws {
        let destinations: [AppDestination] = [
            .operatingPlan,
            .operatingPlanStrategy(strategyType: "energy", strategyId: "strategy_fixture_energy"),
            .operatingPlanStrategyEdit(strategyType: "nutrition", strategyId: "strategy_fixture_nutrition"),
            .operatingPlanProtocolDomain(protocolId: "protocol_fixture_peptide_retatrutide"),
            .operatingPlanPeptideExecution(protocolId: "protocol_fixture_peptide_retatrutide"),
            .operatingPlanRecoverySupport(executionId: "execution_fixture_foam_roll"),
            .operatingPlanTracking,
            .operatingPlanTrackingSupport(executionId: "execution_morning_weigh_in"),
            .operatingPlanSupplementNew,
            .operatingPlanSupplementEdit(protocolId: "protocol_fixture_supplement_tongkat_ali"),
            .operatingPlanSupplementSupport(protocolId: "protocol_fixture_supplement_tongkat_ali"),
        ]
        for destination in destinations {
            let encoded = try JSONEncoder().encode(destination)
            XCTAssertEqual(try JSONDecoder().decode(AppDestination.self, from: encoded), destination)
        }
    }

    func testLandingDestinationsDecodeDirectlyFromTheBundledFixtureWireShape() throws {
        // Every destination embedded in OperatingPlanFixture.json uses the
        // real {id, parameters} wire shape (AppDestinationCoding) — this
        // guards against the fixture silently drifting into a native-only
        // ad hoc shape a live payload could not decode.
        let store = makeStore()
        let destinations = store.landing.sections.flatMap(\.items).compactMap(\.destination)
        for destination in destinations {
            let reencoded = try JSONEncoder().encode(destination)
            XCTAssertEqual(try JSONDecoder().decode(AppDestination.self, from: reencoded), destination)
        }
    }

    // MARK: - Natural prose capitalization

    /// Reuses `NaturalCapitalizationCheck` (`HomeReadModelTests.swift`) —
    /// the same systemic mid-sentence capitalization rule, exercised
    /// against every prose string Operating Plan's new presentation paths
    /// introduce, rather than a second, screen-local rule.
    func testStrategyDetailProseUsesNaturalMidSentenceCapitalization() throws {
        let store = makeStore()
        var prose: [String] = []
        for detail in ["energy", "nutrition", "training", "briefings"].compactMap({ type -> OperatingPlanStrategyDetailReadModel? in
            let id = "strategy_fixture_\(type == "briefings" ? "coaching" : type)"
            return store.strategyDetail(strategyType: type, strategyId: id)
        }) {
            prose.append(detail.purpose)
            // "Plan Type" and "Current Goal Phase" are title-style field
            // values (a plan/phase *name*, e.g. "Phase 2 Energy Strategy"),
            // not flowing prose — titles are legitimately proper-noun
            // capitalized and are not subject to this mid-sentence-prose
            // rule anywhere else in the codebase (Goals' own phase/goal
            // titles are never scanned by `NaturalCapitalizationCheck`
            // either).
            let titleFieldLabels: Set<String> = ["Plan Type", "Current Goal Phase"]
            prose.append(contentsOf: detail.fields.filter { !titleFieldLabels.contains($0.label) }.map(\.value))
            prose.append(contentsOf: detail.energyPhaseHistory.map(\.note))
        }
        for category: ProtocolCategory in [.recovery, .peptide, .supplement] {
            guard let representativeId = ["recovery": "protocol_fixture_recovery_foam_roll", "peptide": "protocol_fixture_peptide_retatrutide", "supplement": "protocol_fixture_supplement_tongkat_ali"][category.rawValue],
                  let domain = store.protocolDomain(protocolId: representativeId) else { continue }
            prose.append(domain.purpose)
            prose.append(contentsOf: domain.methods.map(\.purpose))
        }
        for sentence in prose where !sentence.isEmpty {
            XCTAssertTrue(
                NaturalCapitalizationCheck.violations(in: sentence).isEmpty,
                "Unnatural mid-sentence capitalization in: \"\(sentence)\""
            )
        }
    }

    func testFixtureUsesSyntheticIdentityAndNoDeveloperFacingProse() throws {
        let store = makeStore()
        XCTAssertTrue(store.landing.sections.flatMap(\.items).compactMap(\.destination).contains { destination in
            if case .operatingPlanStrategy(_, let strategyId) = destination { return strategyId.contains("fixture") }
            return false
        })
        var allCopy: [String] = store.landing.sections.flatMap { [$0.title, $0.subtitle] + $0.items.flatMap { [$0.title, $0.detail] } }
        if let energy = store.strategyDetail(strategyType: "energy", strategyId: "strategy_fixture_energy") {
            allCopy.append(energy.purpose)
            allCopy.append(contentsOf: energy.fields.map(\.value))
        }
        let renderedCopy = allCopy.joined(separator: " ")
        for forbidden in ["fixture", "synthetic", "canonical boundary", "device-only", "not sent to production"] {
            XCTAssertFalse(renderedCopy.localizedCaseInsensitiveContains(forbidden), "Developer-facing prose leaked into product copy: \"\(forbidden)\"")
        }
    }
}
